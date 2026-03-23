import crypto from "crypto";
import { storage } from "../storage";
import { dailyLogger } from "../daily-logger";
import { provisionEntityFolder, getEntityPath } from "../tenant-folders";
import { emergencyService } from "./emergency-service";
import fs from "fs";
import path from "path";

const ADT_WEBHOOK_SECRET = process.env.ADT_WEBHOOK_SECRET || "heyGrand-adt-default-secret";

interface AdtPayload {
  deviceId: string;
  eventType: string;
  timestamp?: string;
  sensorZone?: string;
  signalStrength?: number;
  [key: string]: any;
}

function verifyHmacSignature(payload: string, signature: string | undefined): boolean {
  if (!signature) {
    dailyLogger.warn("motion", "No HMAC signature provided in request");
    return false;
  }

  const expectedSig = crypto
    .createHmac("sha256", ADT_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  const sigValue = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sigValue, "hex"),
      Buffer.from(expectedSig, "hex"),
    );
  } catch {
    return false;
  }
}

function appendToActivityLog(entityId: number, residentId: number, event: any): void {
  try {
    provisionEntityFolder(entityId);
    const today = new Date().toISOString().split("T")[0];
    const logPath = path.join(getEntityPath(entityId, "activity"), `resident_${residentId}_${today}.jsonl`);
    const line = JSON.stringify({ ...event, loggedAt: new Date().toISOString() }) + "\n";
    fs.appendFileSync(logPath, line);
  } catch (err) {
    dailyLogger.warn("motion", `Failed to append activity log: ${err}`);
  }
}

export const motionService = {
  verifySignature(rawBody: string, signatureHeader: string | undefined): boolean {
    return verifyHmacSignature(rawBody, signatureHeader);
  },

  async processMotionEvent(entityId: number, residentId: number, payload: AdtPayload) {
    const { deviceId, eventType, timestamp: eventTs } = payload;

    dailyLogger.info("motion", `Processing ADT event for entity=${entityId} resident=${residentId}`, {
      deviceId,
      eventType,
    });

    const resident = await storage.getResident(residentId);
    if (!resident) {
      throw new Error(`Resident ${residentId} not found`);
    }
    if (resident.entityId !== entityId) {
      throw new Error(`Resident ${residentId} does not belong to entity ${entityId}`);
    }

    let sensor = deviceId ? await storage.getSensorByAdtId(deviceId) : undefined;

    const location = sensor?.location || payload.sensorZone || "unknown";

    const motionEvent = await storage.createMotionEvent({
      entityId,
      sensorId: sensor?.id || null,
      residentId,
      eventType,
      location,
      rawPayload: payload,
    });

    await storage.updateResidentStatus(residentId, "safe", new Date());

    const pendingCheckIns = emergencyService.getPendingCheckIns();
    for (const pending of pendingCheckIns) {
      if (pending.residentId === residentId) {
        emergencyService.clearPendingCheckIn(pending.alertId);
        dailyLogger.info("motion", `Cleared pending check-in (alert ${pending.alertId}) for resident ${residentId} due to motion detection`);
      }
    }

    appendToActivityLog(entityId, residentId, {
      type: "motion_detected",
      eventId: motionEvent.id,
      deviceId,
      eventType,
      location,
      residentId,
    });

    dailyLogger.info("motion", `Motion event ${motionEvent.id} recorded, lastSeen updated`, {
      entityId,
      residentId,
      location,
      eventType,
    });

    return motionEvent;
  },
};
