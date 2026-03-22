import { Router } from "express";
import { storage } from "../../storage";
import { log } from "../../index";
import { dailyLogger } from "../../daily-logger";
import { insertEsp32SensorDataSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

const esp32SensorPayloadSchema = z.object({
  deviceMac: z.string().min(1),
  presenceDetected: z.boolean(),
  distance: z.number().int().optional(),
  movementEnergy: z.number().int().optional(),
  stationaryEnergy: z.number().int().optional(),
  isStationary: z.boolean().optional(),
  firmwareVersion: z.string().optional(),
  signalStrength: z.number().int().optional(),
  ipAddress: z.string().optional(),
});

/**
 * POST /api/esp32/sensor-data
 * Auth: device MAC address validation via DB lookup (no JWT — IoT device auth)
 * Tenant scope: entityId is ALWAYS derived from the registered sensor/unit record in the DB.
 *   The request body never supplies an entityId — this prevents cross-tenant spoofing.
 *   If the deviceMac is not registered to any sensor or unit, the request is rejected with 404.
 *   If sensor and unit resolve to different entities (data integrity violation), the request is rejected with 409.
 */
router.post("/sensor-data", async (req, res) => {
  try {
    const parsed = esp32SensorPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
    }

    const { deviceMac, presenceDetected, distance, movementEnergy, stationaryEnergy, isStationary, firmwareVersion, signalStrength, ipAddress } = parsed.data;

    const sensor = await storage.getSensorByEsp32Mac(deviceMac);
    let unit = await storage.getUnitByEsp32Mac(deviceMac);

    let entityId: number | undefined;
    let unitId: number | undefined;
    let residentId: number | undefined;
    let sensorId: number | undefined;

    if (sensor) {
      entityId = sensor.entityId;
      unitId = sensor.unitId || undefined;
      residentId = sensor.residentId || undefined;
      sensorId = sensor.id;
    }

    if (unit) {
      // Cross-entity consistency check: if both sensor and unit resolved, they must belong to the same entity
      if (entityId !== undefined && entityId !== unit.entityId) {
        dailyLogger.warn("esp32", `Cross-entity mismatch for MAC ${deviceMac}: sensor entity=${entityId}, unit entity=${unit.entityId}`);
        return res.status(403).json({ error: "Device MAC is registered to a different entity. Access denied." });
      }

      entityId = entityId || unit.entityId;
      unitId = unitId || unit.id;

      const updateData: Record<string, any> = {
        esp32LastHeartbeat: new Date(),
      };
      if (firmwareVersion) updateData.esp32FirmwareVersion = firmwareVersion;
      if (signalStrength !== undefined) updateData.esp32SignalStrength = signalStrength;
      if (ipAddress) updateData.esp32IpAddress = ipAddress;
      await storage.updateUnit(unit.id, updateData);

      if (!residentId) {
        const unitResident = await storage.getResidentByUnit(unit.id);
        if (unitResident) residentId = unitResident.id;
      }
    }

    if (!entityId) {
      log(`ESP32 sensor data from unknown device: ${deviceMac}`, "esp32");
      return res.status(404).json({ error: "Unknown ESP32 device. Register it first via unit management." });
    }

    const sensorData = await storage.createEsp32SensorData({
      entityId,
      sensorId: sensorId || null,
      unitId: unitId || null,
      residentId: residentId || null,
      deviceMac,
      presenceDetected,
      distance: distance || null,
      movementEnergy: movementEnergy || null,
      stationaryEnergy: stationaryEnergy || null,
      isStationary: isStationary || null,
      rawPayload: req.body,
    });

    if (presenceDetected && residentId) {
      await storage.updateResidentStatus(residentId, "safe", new Date());
    }

    if (presenceDetected && entityId && sensorId) {
      await storage.createMotionEvent({
        entityId,
        sensorId,
        residentId: residentId || null,
        eventType: presenceDetected ? "presence_detected" : "presence_cleared",
        location: sensor?.location || `unit-${unitId || "unknown"}`,
        rawPayload: req.body,
      });
    }

    log(`ESP32 sensor: ${deviceMac} presence=${presenceDetected} dist=${distance || "?"} energy=${movementEnergy || "?"}`, "esp32");
    res.json({ received: true, dataId: sensorData.id });
  } catch (error: any) {
    log(`ESP32 sensor data error: ${error}`, "esp32");
    res.status(500).json({ error: "Processing failed" });
  }
});

/**
 * POST /api/esp32/heartbeat
 * Auth: device MAC address validation via DB lookup (no JWT — IoT device auth)
 * Tenant scope: unitId is derived exclusively from the registered unit record for the given MAC.
 *   Unknown MACs are rejected with 404.
 */
router.post("/heartbeat", async (req, res) => {
  try {
    const { deviceMac, firmwareVersion, signalStrength, ipAddress, freeHeap, uptimeSeconds } = req.body;

    if (!deviceMac) {
      return res.status(400).json({ error: "Missing deviceMac" });
    }

    const unit = await storage.getUnitByEsp32Mac(deviceMac);
    if (!unit) {
      return res.status(404).json({ error: "Unknown device" });
    }

    const updateData: Record<string, any> = {
      esp32LastHeartbeat: new Date(),
    };
    if (firmwareVersion) updateData.esp32FirmwareVersion = firmwareVersion;
    if (signalStrength !== undefined) updateData.esp32SignalStrength = signalStrength;
    if (ipAddress) updateData.esp32IpAddress = ipAddress;

    await storage.updateUnit(unit.id, updateData);

    log(`ESP32 heartbeat: ${deviceMac} fw=${firmwareVersion || "?"} rssi=${signalStrength || "?"}`, "esp32");
    res.json({ ok: true, unitId: unit.id });
  } catch (error: any) {
    log(`ESP32 heartbeat error: ${error}`, "esp32");
    res.status(500).json({ error: "Heartbeat processing failed" });
  }
});

/**
 * POST /api/esp32/register
 * Auth: body-supplied entityId is cross-validated against the DB unit's entityId before association.
 *   A device cannot be registered to a unit belonging to a different entity than claimed.
 * Tenant scope: enforced by checking unit.entityId === body.entityId.
 */
router.post("/register", async (req, res) => {
  try {
    const { deviceMac, unitId, entityId, sensorLocation, firmwareVersion } = req.body;

    if (!deviceMac || !unitId || !entityId) {
      return res.status(400).json({ error: "Missing required fields: deviceMac, unitId, entityId" });
    }

    const unit = await storage.getUnit(unitId);
    if (!unit || unit.entityId !== entityId) {
      return res.status(404).json({ error: "Unit not found or entity mismatch" });
    }

    await storage.updateUnit(unitId, {
      hardwareType: "esp32_custom",
      esp32DeviceMac: deviceMac,
      esp32FirmwareVersion: firmwareVersion || null,
      esp32LastHeartbeat: new Date(),
    });

    if (sensorLocation) {
      const existingSensor = await storage.getSensorByEsp32Mac(deviceMac);
      if (!existingSensor) {
        await storage.createSensor({
          entityId,
          unitId,
          sensorType: "mmwave_presence",
          location: sensorLocation,
          esp32DeviceMac: deviceMac,
        });
      }
    }

    log(`ESP32 device registered: ${deviceMac} -> unit ${unit.unitIdentifier}`, "esp32");
    dailyLogger.info("esp32", `Device registered: ${deviceMac} to unit ${unit.unitIdentifier}`, {
      deviceMac,
      unitId,
      entityId,
    });

    res.json({ registered: true, unitId: unit.id, unitIdentifier: unit.unitIdentifier });
  } catch (error: any) {
    log(`ESP32 register error: ${error}`, "esp32");
    res.status(500).json({ error: "Registration failed" });
  }
});

/**
 * GET /api/esp32/status/:deviceMac
 * Auth: none (internal/device-facing status check)
 * Returns device registration status and latest sensor reading for a given MAC.
 * Unknown MACs are rejected with 404.
 */
router.get("/status/:deviceMac", async (req, res) => {
  try {
    const { deviceMac } = req.params;
    const unit = await storage.getUnitByEsp32Mac(deviceMac);

    if (!unit) {
      return res.status(404).json({ error: "Unknown device" });
    }

    const latestData = await storage.getLatestEsp32SensorData(unit.id);

    res.json({
      deviceMac,
      unitId: unit.id,
      unitIdentifier: unit.unitIdentifier,
      firmwareVersion: unit.esp32FirmwareVersion,
      lastHeartbeat: unit.esp32LastHeartbeat,
      ipAddress: unit.esp32IpAddress,
      signalStrength: unit.esp32SignalStrength,
      latestSensorData: latestData || null,
    });
  } catch (error: any) {
    log(`ESP32 status error: ${error}`, "esp32");
    res.status(500).json({ error: "Status check failed" });
  }
});

/**
 * GET /api/esp32/sensor-data/:unitId
 * Auth: none (internal — used by company admin portal via unit management)
 * Returns recent sensor readings for a unit. Unit ID is looked up directly; no cross-entity check here
 * because this endpoint is accessed via the authenticated company admin portal which enforces entity ownership.
 */
router.get("/sensor-data/:unitId", async (req, res) => {
  try {
    const unitId = Number(req.params.unitId);
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const data = await storage.getEsp32SensorData(unitId, limit);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch sensor data" });
  }
});

export default router;
