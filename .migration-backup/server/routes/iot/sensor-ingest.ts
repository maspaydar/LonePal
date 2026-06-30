import { Router } from "express";
import { storage } from "../../storage";
import { log } from "../../index";
import { dailyLogger } from "../../daily-logger";
import { provisionEntityFolder, getEntityPath } from "../../tenant-folders";
import { z } from "zod";
import fs from "fs";
import path from "path";

const router = Router();

const ACTIVE_WINDOW_THRESHOLD_MS = 10 * 60 * 1000;

// ─── Xfinity placeholder ───────────────────────────────────────────────────────
/**
 * process_xfinity_motion
 *
 * Placeholder for the Rogers Xfinity API integration.
 * Replace the body of this function once the Xfinity API spec is confirmed.
 * Expected to receive the raw inbound webhook payload and return a result
 * indicating whether the event was handled and any relevant metadata.
 */
async function process_xfinity_motion(
  payload: Record<string, any>
): Promise<{ handled: boolean; message: string; raw?: Record<string, any> }> {
  dailyLogger.info(
    "sensor-ingest",
    "Xfinity motion payload received — placeholder active, no processing performed",
    { payload }
  );

  // TODO: Implement Rogers Xfinity API integration.
  // 1. Authenticate with the Xfinity API using credentials from env vars.
  // 2. Parse the incoming payload to extract device ID, zone, motion state, and timestamp.
  // 3. Resolve entityId and residentId from the Xfinity device registry.
  // 4. Call storage.createMotionEvent(...) and storage.updateResidentStatus(...).
  // 5. Return { handled: true, ... } once implemented.

  return {
    handled: false,
    message: "Xfinity processing not yet implemented. Payload logged.",
    raw: payload,
  };
}

// ─── Branch schemas ────────────────────────────────────────────────────────────

const esp32IngestSchema = z.object({
  esp32_id: z.string().min(1),
  presence_detected: z.boolean().optional(),
  distance: z.number().int().optional(),
  movement_energy: z.number().int().optional(),
  stationary_energy: z.number().int().optional(),
  is_stationary: z.boolean().optional(),
  firmware_version: z.string().optional(),
  signal_strength: z.number().int().optional(),
  ip_address: z.string().optional(),
});

const adtIngestSchema = z.object({
  deviceId: z.string().optional(),
  status: z.enum(["alarm", "stay"]),
  zone: z.string().optional(),
  residentId: z.number().int().optional(),
  entityId: z.number().int().optional(),
  timestamp: z.string().optional(),
});

// ─── Inactivity flag helper ────────────────────────────────────────────────────

async function checkAndFlagInactivity(
  residentId: number,
  entityId: number,
  motionDetected: boolean
): Promise<void> {
  if (motionDetected) return;

  const resident = await storage.getResident(residentId);
  if (!resident || !resident.lastActivityAt) return;
  if (["alert", "checking", "emergency"].includes(resident.status)) return;

  const elapsed = Date.now() - new Date(resident.lastActivityAt).getTime();
  if (elapsed < ACTIVE_WINDOW_THRESHOLD_MS) return;

  const minutesInactive = Math.round(elapsed / 60000);
  const name = resident.preferredName || resident.firstName;

  await storage.updateResidentStatus(residentId, "alert");

  await storage.createAlert({
    entityId,
    residentId,
    severity: minutesInactive >= 20 ? "critical" : "warning",
    title: `Inactivity Flag: ${name}`,
    message: `No motion detected via sensor-ingest for ${minutesInactive} minutes during active window. Last activity: ${new Date(resident.lastActivityAt).toLocaleTimeString()}.`,
  });

  dailyLogger.warn(
    "sensor-ingest",
    `Inactivity flag set for resident ${residentId} (${minutesInactive} min inactive)`,
    { entityId, residentId }
  );
}

// ─── Unified ingest endpoint ───────────────────────────────────────────────────

/**
 * POST /api/v1/sensor-ingest
 *
 * Unified hardware listener that accepts payloads from three security hardware types
 * and routes each to the appropriate processing branch.
 *
 * Branch routing logic:
 *   - ESP32 branch  : payload contains `esp32_id`                    → processes mmWave presence / CSI data
 *   - ADT branch    : payload contains `status: "alarm" | "stay"`    → logs event to resident activity file
 *   - Xfinity branch: all other payloads                             → forwarded to process_xfinity_motion()
 *
 * Inactivity flag:
 *   After any branch completes, if no motion was detected for a resident whose
 *   lastActivityAt exceeds the active-window threshold, the resident's status is set
 *   to "alert" and an alert record is written — visible on the Facility Dashboard.
 */
router.post("/", async (req, res) => {
  const body = req.body as Record<string, any>;

  try {
    // ── ESP32 branch ────────────────────────────────────────────────────────────
    if ("esp32_id" in body) {
      const parsed = esp32IngestSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({
          branch: "esp32",
          error: "Invalid payload",
          details: parsed.error.issues,
        });
      }

      const {
        esp32_id: deviceMac,
        presence_detected: presenceDetected = false,
        distance,
        movement_energy: movementEnergy,
        stationary_energy: stationaryEnergy,
        is_stationary: isStationary,
        firmware_version: firmwareVersion,
        signal_strength: signalStrength,
        ip_address: ipAddress,
      } = parsed.data;

      const sensor = await storage.getSensorByEsp32Mac(deviceMac);
      const unit = await storage.getUnitByEsp32Mac(deviceMac);

      let entityId: number | undefined;
      let unitId: number | undefined;
      let residentId: number | undefined;
      let sensorId: number | undefined;

      if (sensor) {
        entityId = sensor.entityId;
        unitId = sensor.unitId ?? undefined;
        residentId = sensor.residentId ?? undefined;
        sensorId = sensor.id;
      }

      if (unit) {
        if (entityId !== undefined && entityId !== unit.entityId) {
          dailyLogger.warn(
            "sensor-ingest",
            `ESP32 cross-entity mismatch: MAC=${deviceMac} sensor entity=${entityId} unit entity=${unit.entityId}`
          );
          return res.status(403).json({
            branch: "esp32",
            error: "Device MAC is registered to a different entity. Access denied.",
          });
        }

        entityId = entityId ?? unit.entityId;
        unitId = unitId ?? unit.id;

        const heartbeatUpdate: Record<string, any> = { esp32LastHeartbeat: new Date() };
        if (firmwareVersion) heartbeatUpdate.esp32FirmwareVersion = firmwareVersion;
        if (signalStrength !== undefined) heartbeatUpdate.esp32SignalStrength = signalStrength;
        if (ipAddress) heartbeatUpdate.esp32IpAddress = ipAddress;
        await storage.updateUnit(unit.id, heartbeatUpdate);

        if (!residentId) {
          const unitResident = await storage.getResidentByUnit(unit.id);
          if (unitResident) residentId = unitResident.id;
        }
      }

      if (!entityId) {
        return res.status(404).json({
          branch: "esp32",
          error: "Unknown ESP32 device. Register it first via unit management.",
        });
      }

      const sensorData = await storage.createEsp32SensorData({
        entityId,
        sensorId: sensorId ?? null,
        unitId: unitId ?? null,
        residentId: residentId ?? null,
        deviceMac,
        presenceDetected,
        distance: distance ?? null,
        movementEnergy: movementEnergy ?? null,
        stationaryEnergy: stationaryEnergy ?? null,
        isStationary: isStationary ?? null,
        rawPayload: body,
      });

      if (presenceDetected && residentId) {
        await storage.updateResidentStatus(residentId, "safe", new Date());
      }

      if (presenceDetected && sensorId) {
        await storage.createMotionEvent({
          entityId,
          sensorId,
          residentId: residentId ?? null,
          eventType: "presence_detected",
          location: sensor?.location ?? `unit-${unitId ?? "unknown"}`,
          rawPayload: body,
        });
      }

      if (residentId) {
        await checkAndFlagInactivity(residentId, entityId, presenceDetected);
      }

      log(`[sensor-ingest/esp32] ${deviceMac} presence=${presenceDetected}`, "sensor-ingest");
      return res.json({ branch: "esp32", received: true, dataId: sensorData.id });
    }

    // ── ADT branch ──────────────────────────────────────────────────────────────
    if ("status" in body && (body.status === "alarm" || body.status === "stay")) {
      const parsed = adtIngestSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({
          branch: "adt",
          error: "Invalid payload",
          details: parsed.error.issues,
        });
      }

      const {
        deviceId,
        status,
        zone,
        residentId: bodyResidentId,
        entityId: bodyEntityId,
        timestamp,
      } = parsed.data;

      const sensor = deviceId ? await storage.getSensorByAdtId(deviceId) : undefined;

      const entityId: number | undefined = bodyEntityId ?? sensor?.entityId;
      const residentId: number | undefined =
        bodyResidentId ?? (sensor?.residentId ?? undefined);

      if (!entityId) {
        return res.status(400).json({
          branch: "adt",
          error:
            "Cannot resolve entityId. Provide entityId in the payload or register the ADT deviceId.",
        });
      }

      if (residentId) {
        const location = sensor?.location ?? zone ?? "unknown";

        await storage.createMotionEvent({
          entityId,
          sensorId: sensor?.id ?? null,
          residentId,
          eventType: `adt_${status}`,
          location,
          rawPayload: body,
        });

        await storage.updateResidentStatus(residentId, "safe", new Date());

        try {
          provisionEntityFolder(entityId);
          const today = new Date().toISOString().split("T")[0];
          const logPath = path.join(
            getEntityPath(entityId, "activity"),
            `resident_${residentId}_${today}.jsonl`
          );
          fs.appendFileSync(
            logPath,
            JSON.stringify({
              type: "adt_event",
              status,
              deviceId: deviceId ?? null,
              zone: zone ?? null,
              timestamp: timestamp ?? new Date().toISOString(),
              loggedAt: new Date().toISOString(),
            }) + "\n"
          );
        } catch (logErr) {
          dailyLogger.warn("sensor-ingest", `ADT activity log write failed: ${logErr}`);
        }

        // "alarm" = sensor triggered = motion present; "stay" = system armed, no active motion
        const motionDetected = status === "alarm";
        await checkAndFlagInactivity(residentId, entityId, motionDetected);
      }

      dailyLogger.info(
        "sensor-ingest",
        `ADT event received: status=${status} device=${deviceId ?? "n/a"}`,
        { entityId, residentId, status }
      );

      return res.json({
        branch: "adt",
        received: true,
        status,
        residentId: residentId ?? null,
      });
    }

    // ── Xfinity branch ──────────────────────────────────────────────────────────
    const xfinityResult = await process_xfinity_motion(body);
    log(`[sensor-ingest/xfinity] placeholder triggered`, "sensor-ingest");
    return res.json({ branch: "xfinity", ...xfinityResult });
  } catch (err: any) {
    log(`[sensor-ingest] unhandled error: ${err}`, "sensor-ingest");
    dailyLogger.warn("sensor-ingest", `Unhandled error: ${err?.message}`, { body });
    return res.status(500).json({ error: "Sensor ingest processing failed" });
  }
});

export default router;
