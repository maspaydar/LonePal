import { Router } from "express";
import { z } from "zod/v4";
import { storage } from "../storage";
import { log } from "../logger-util";
import { mobileAuthMiddleware } from "../middleware/mobile-auth";

// Monitoring hardware is retrofit and managed entirely by the resident's
// professional security company (ADT, Xfinity, Vivint, etc.). HeyGrand never
// talks to devices directly — providers push signed events to
// /api/v1/sensor-ingest. The only thing residents configure here are their
// HeyGrand check-in preferences (frequency and active hours).

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
 * RESIDENT-AUTHED SETTINGS ROUTER  (mounted at /api/mobile/device-settings)
 *   GET  -> read the resident's unit's check-in settings
 *   PUT  -> upsert the resident's unit's check-in settings
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

    res.json({
      unitId: unit.id,
      unitIdentifier: unit.unitIdentifier,
      settings,
      defaults: DEFAULTS,
    });
  } catch (err: any) {
    log(`device-settings GET error: ${err}`, "devices");
    res.status(500).json({ error: "Failed to load device settings" });
  }
});

const putSchema = z.object({
  sensitivity: z.number().int().min(0).max(100).optional(),
  detectionDistance: z.number().int().min(50).max(1000).optional(),
  aiCheckInFrequency: z.number().int().min(15).max(720),
  activeHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM"),
  activeHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM"),
});

residentDeviceSettingsRouter.put("/", mobileAuthMiddleware, async (req, res) => {
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

    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid settings", details: parsed.error.issues });
    }

    const existing = await storage.getDeviceSettingsByUnit(unit.id);
    const saved = await storage.upsertDeviceSettings({
      entityId: unit.entityId,
      unitId: unit.id,
      sensitivity: parsed.data.sensitivity ?? existing?.sensitivity ?? DEFAULTS.sensitivity,
      detectionDistance:
        parsed.data.detectionDistance ?? existing?.detectionDistance ?? DEFAULTS.detectionDistance,
      aiCheckInFrequency: parsed.data.aiCheckInFrequency,
      activeHoursStart: parsed.data.activeHoursStart,
      activeHoursEnd: parsed.data.activeHoursEnd,
    });

    log(
      `device-settings PUT residentId=${auth.residentId} unit=${unit.unitIdentifier}`,
      "devices",
    );

    res.json({
      settings: normalize(saved),
    });
  } catch (err: any) {
    log(`device-settings PUT error: ${err}`, "devices");
    res.status(500).json({ error: "Failed to save device settings" });
  }
});
