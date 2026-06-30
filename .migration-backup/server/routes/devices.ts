import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { log } from "../index";
import { dailyLogger } from "../daily-logger";
import { mobileAuthMiddleware } from "../middleware/mobile-auth";
import {
  pushEsp32ConfigUpdate,
  pushEsp32DiagnosticCommand,
  getEsp32Health,
} from "../services/esp32-speaker";

const DEVICE_HMAC_SECRET = process.env.DEVICE_HMAC_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (!DEVICE_HMAC_SECRET && IS_PRODUCTION) {
  // Hard-fail in production rather than serving unsigned device configs.
  throw new Error(
    "DEVICE_HMAC_SECRET is required in production — refusing to serve device configuration without integrity protection.",
  );
}

interface NormalizedSettings {
  sensitivity: number;
  detectionDistance: number;
  aiCheckInFrequency: number;
  activeHoursStart: string;
  activeHoursEnd: string;
}

const DEFAULTS: NormalizedSettings = {
  sensitivity: 50,
  detectionDistance: 400,
  aiCheckInFrequency: 60,
  activeHoursStart: "07:00",
  activeHoursEnd: "22:00",
};

function signPayload(payload: string): string | null {
  if (!DEVICE_HMAC_SECRET) return null;
  return (
    "sha256=" +
    crypto.createHmac("sha256", DEVICE_HMAC_SECRET).update(payload).digest("hex")
  );
}

function normalize(row: { sensitivity: number; detectionDistance: number; aiCheckInFrequency: number; activeHoursStart: string; activeHoursEnd: string } | undefined): NormalizedSettings {
  if (!row) return { ...DEFAULTS };
  return {
    sensitivity: row.sensitivity,
    detectionDistance: row.detectionDistance,
    aiCheckInFrequency: row.aiCheckInFrequency,
    activeHoursStart: row.activeHoursStart,
    activeHoursEnd: row.activeHoursEnd,
  };
}

/* =========================================================================
 * PUBLIC DEVICE-FACING ROUTER  (mounted at /api/devices)
 *   GET /api/devices/:mac/config
 *     - Authenticated by MAC lookup against the units table (same model as
 *       /api/esp32/sensor-data and /api/esp32/heartbeat).
 *     - Response body is JSON; the response also carries an HMAC-SHA256
 *       signature in the `X-Signature` header so the firmware can verify
 *       integrity end-to-end (defends against tampering by intermediaries).
 * ========================================================================= */
export const deviceConfigRouter = Router();

deviceConfigRouter.get("/:mac/config", async (req, res) => {
  try {
    const mac = req.params.mac;
    if (!mac) return res.status(400).json({ error: "Missing mac" });

    const unit = await storage.getUnitByEsp32Mac(mac);
    if (!unit) {
      return res.status(404).json({ error: "Device not registered" });
    }

    const stored = await storage.getDeviceSettingsByUnit(unit.id);
    const settings = normalize(stored);

    const payload = JSON.stringify({
      deviceMac: mac,
      unitId: unit.id,
      entityId: unit.entityId,
      issuedAt: Date.now(),
      settings,
    });

    const signature = signPayload(payload);
    if (!signature) {
      // Should be unreachable in production (boot guard above) but enforced
      // here too so dev errors surface loudly instead of silently degrading.
      dailyLogger.warn(
        "device-config",
        `DEVICE_HMAC_SECRET not configured — refusing to serve config for ${mac}.`,
      );
      return res.status(503).json({
        error: "Device config endpoint not configured",
        hint: "Set the DEVICE_HMAC_SECRET environment variable to enable signed device config.",
      });
    }
    res.setHeader("X-Signature", signature);
    res.setHeader("X-Signature-Alg", "HMAC-SHA256");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(payload);
  } catch (err: any) {
    log(`device config error: ${err}`, "devices");
    res.status(500).json({ error: "Failed to load device config" });
  }
});

/* =========================================================================
 * RESIDENT-AUTHED SETTINGS ROUTER  (mounted at /api/mobile/device-settings)
 *   GET  -> read the resident's unit's device settings
 *   PUT  -> upsert + push CONFIG_UPDATE over WS to the bound ESP32
 * ========================================================================= */
export const residentDeviceSettingsRouter = Router();

residentDeviceSettingsRouter.get("/", mobileAuthMiddleware, async (req, res) => {
  try {
    const auth = req.mobileAuth!;
    const resident = await storage.getResident(auth.residentId);
    if (!resident || resident.entityId !== auth.entityId) {
      return res.status(404).json({ error: "Resident not found" });
    }
    if (!resident.unitId) {
      return res.status(409).json({ error: "Not assigned to a unit yet" });
    }
    const unit = await storage.getUnit(resident.unitId);
    if (!unit || unit.entityId !== auth.entityId) {
      return res.status(404).json({ error: "Unit not found" });
    }

    const stored = await storage.getDeviceSettingsByUnit(unit.id);
    const settings = normalize(stored);

    const health = unit.esp32DeviceMac ? getEsp32Health(unit.esp32DeviceMac) : null;

    res.json({
      unitId: unit.id,
      unitIdentifier: unit.unitIdentifier,
      deviceMac: unit.esp32DeviceMac,
      device: {
        connected: health?.connected ?? false,
        healthy: health?.healthy ?? false,
        lastHeartbeat: unit.esp32LastHeartbeat,
        firmwareVersion: unit.esp32FirmwareVersion,
        signalStrength: unit.esp32SignalStrength,
      },
      settings,
      defaults: DEFAULTS,
    });
  } catch (err: any) {
    log(`device-settings GET error: ${err}`, "devices");
    res.status(500).json({ error: "Failed to load device settings" });
  }
});

const updateSchema = z.object({
  sensitivity: z.number().int().min(0).max(100),
  detectionDistance: z.number().int().min(50).max(600),
  aiCheckInFrequency: z.number().int().min(15).max(720),
  activeHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM"),
  activeHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM"),
});

residentDeviceSettingsRouter.put("/", mobileAuthMiddleware, async (req, res) => {
  try {
    const auth = req.mobileAuth!;
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid settings", details: parsed.error.issues });
    }

    const resident = await storage.getResident(auth.residentId);
    if (!resident || resident.entityId !== auth.entityId) {
      return res.status(404).json({ error: "Resident not found" });
    }
    if (!resident.unitId) {
      return res.status(409).json({ error: "Not assigned to a unit yet" });
    }
    const unit = await storage.getUnit(resident.unitId);
    if (!unit || unit.entityId !== auth.entityId) {
      return res.status(404).json({ error: "Unit not found" });
    }

    const saved = await storage.upsertDeviceSettings({
      entityId: unit.entityId,
      unitId: unit.id,
      deviceMac: unit.esp32DeviceMac || null,
      ...parsed.data,
    });

    let pushedToDevice = false;
    if (unit.esp32DeviceMac) {
      pushedToDevice = pushEsp32ConfigUpdate(unit.esp32DeviceMac, {
        sensitivity: saved.sensitivity,
        detectionDistance: saved.detectionDistance,
        aiCheckInFrequency: saved.aiCheckInFrequency,
        activeHoursStart: saved.activeHoursStart,
        activeHoursEnd: saved.activeHoursEnd,
      });
    }

    log(
      `device-settings PUT residentId=${auth.residentId} unit=${unit.unitIdentifier} pushed=${pushedToDevice}`,
      "devices",
    );

    res.json({
      settings: normalize(saved),
      pushedToDevice,
      deviceMac: unit.esp32DeviceMac,
    });
  } catch (err: any) {
    log(`device-settings PUT error: ${err}`, "devices");
    res.status(500).json({ error: "Failed to save device settings" });
  }
});

/* Optional remote-diagnostic helper — not exposed to residents. */
export function executeDiagnosticCommand(
  deviceMac: string,
  action: string,
  args: Record<string, any> = {},
): boolean {
  if (!DEVICE_HMAC_SECRET) {
    dailyLogger.warn(
      "device-config",
      "Refusing to send diagnostic command — DEVICE_HMAC_SECRET not configured.",
    );
    return false;
  }
  return pushEsp32DiagnosticCommand(deviceMac, { action, args }, DEVICE_HMAC_SECRET);
}
