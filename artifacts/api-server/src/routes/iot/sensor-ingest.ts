import { Router } from "express";
import { storage } from "../../storage";
import { log } from "../../logger-util";
import { dailyLogger } from "../../daily-logger";
import { provisionEntityFolder, getEntityPath } from "../../tenant-folders";
import { motionService } from "../../services/motion-service";
import { z } from "zod/v4";
import fs from "fs";
import path from "path";

// This endpoint receives events from professional security companies (ADT, Xfinity,
// Vivint, etc. — provider-neutral) that retrofit sensors into a resident's home.
// Every inbound webhook must carry an HMAC-SHA256 signature over the raw request
// body, keyed on SENSOR_WEBHOOK_SECRET (legacy name ADT_WEBHOOK_SECRET is still
// honored). There is deliberately no "allow when unset" bypass: in production we
// refuse to start without the secret; in development the endpoint fails closed
// with 503 so the rest of the server stays usable.
const WEBHOOK_SECRET =
  process.env.SENSOR_WEBHOOK_SECRET || process.env.ADT_WEBHOOK_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (!WEBHOOK_SECRET && IS_PRODUCTION) {
  throw new Error(
    "SENSOR_WEBHOOK_SECRET is not configured. POST /api/v1/sensor-ingest requires it to " +
      "verify inbound security-provider webhook signatures. Set SENSOR_WEBHOOK_SECRET (and " +
      "configure the same value with the security provider) before starting the server. " +
      "Refusing to start rather than expose an unauthenticated ingest endpoint.",
  );
}
if (!WEBHOOK_SECRET) {
  dailyLogger.warn(
    "sensor-ingest",
    "SENSOR_WEBHOOK_SECRET is not configured — /api/v1/sensor-ingest will reject all requests with 503 until it is set.",
  );
}

const router = Router();

const ACTIVE_WINDOW_THRESHOLD_MS = 10 * 60 * 1000;

// ─── Payload schema ────────────────────────────────────────────────────────────
// Provider-neutral event shape. Any security company's webhook adapter maps its
// native payload into this schema before (or when) posting to us.
const providerIngestSchema = z.object({
  deviceId: z.string().optional(),
  provider: z.string().optional(),
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

// ─── Rejection logging ─────────────────────────────────────────────────────────
/**
 * Records a rejected ingest request so operators can spot legitimate provider traffic
 * being blocked (e.g. after a secret rotation) and roll back quickly. The
 * secret/signature is never logged. Central-log writes are only attempted for
 * post-signature-verification rejections (where `entityId` is trusted); pre-auth 401s
 * go to the daily log only to avoid touching the DB with attacker-controlled input.
 */
async function logIngestRejection(
  reason: string,
  detail: {
    hasSignature: boolean;
    deviceId?: string;
    claimedEntityId?: number;
    claimedResidentId?: number;
  },
  toCentralLog: boolean
): Promise<void> {
  const message = `Security-provider sensor-ingest request rejected: ${reason}`;
  dailyLogger.warn("sensor-ingest", message, { reason, ...detail });

  if (toCentralLog && detail.claimedEntityId !== undefined) {
    try {
      await storage.createCentralLogEntry({
        facilityId: detail.claimedEntityId,
        severity: "warning",
        source: "sensor-ingest",
        message,
        metadata: {
          reason,
          deviceId: detail.deviceId ?? null,
          residentId: detail.claimedResidentId ?? null,
          hasSignature: detail.hasSignature,
        },
      });
    } catch (err) {
      dailyLogger.warn("sensor-ingest", `Failed to write ingest rejection to central log: ${err}`);
    }
  }
}

// ─── Ingest endpoint ───────────────────────────────────────────────────────────

/**
 * POST /api/v1/sensor-ingest
 *
 * Signed webhook listener for retrofit security-provider sensor events (ADT,
 * Xfinity, Vivint, or any other professional monitoring company).
 *
 * Security model:
 *   1. HMAC-SHA256 signature over the raw request body (header `x-provider-signature`,
 *      legacy `x-adt-signature` also accepted) verified BEFORE any storage access.
 *   2. A registered provider device (matched by deviceId) is authoritative for
 *      entity resolution; a contradicting body entityId is rejected.
 *   3. The resolved resident must belong to the claimed entity before any write.
 *
 * Inactivity flag:
 *   After processing, if no motion was detected for a resident whose lastActivityAt
 *   exceeds the active-window threshold, the resident's status is set to "alert"
 *   and an alert record is written — visible on the Facility Dashboard.
 */
router.post("/", async (req, res) => {
  const body = req.body as Record<string, any>;

  try {
    if (!WEBHOOK_SECRET) {
      return res.status(503).json({
        error:
          "Sensor ingest is not configured. Set SENSOR_WEBHOOK_SECRET to enable signed provider webhooks.",
      });
    }

    // (1) The request must be provably from the configured security provider.
    // Verify the HMAC signature over the raw request body BEFORE any storage access.
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const signature = (req.headers["x-provider-signature"] ??
      req.headers["x-adt-signature"]) as string | undefined;
    const signedPayload = rawBody?.toString() ?? JSON.stringify(body);

    if (!motionService.verifySignature(signedPayload, signature)) {
      await logIngestRejection(
        "invalid_signature",
        {
          hasSignature: !!signature,
          deviceId: typeof body.deviceId === "string" ? body.deviceId : undefined,
          claimedEntityId: typeof body.entityId === "number" ? body.entityId : undefined,
          claimedResidentId: typeof body.residentId === "number" ? body.residentId : undefined,
        },
        false
      );
      return res.status(401).json({ error: "Invalid or missing signature" });
    }

    const parsed = providerIngestSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid payload",
        details: parsed.error.issues,
      });
    }

    const {
      deviceId,
      provider,
      status,
      zone,
      residentId: bodyResidentId,
      entityId: bodyEntityId,
      timestamp,
    } = parsed.data;

    // (2) Resolve entity/resident. A registered provider device (matched by deviceId)
    // is authoritative. The signed body may also supply entityId/residentId, but a
    // body entityId that contradicts the device's registered entity is rejected.
    const sensor = deviceId ? await storage.getSensorByProviderDeviceId(deviceId) : undefined;

    if (sensor && bodyEntityId !== undefined && sensor.entityId !== bodyEntityId) {
      await logIngestRejection(
        "device_entity_mismatch",
        {
          hasSignature: true,
          deviceId,
          claimedEntityId: bodyEntityId,
          claimedResidentId: bodyResidentId,
        },
        true
      );
      return res.status(403).json({
        error: "Device is registered to a different entity. Access denied.",
      });
    }

    const entityId: number | undefined = sensor?.entityId ?? bodyEntityId;
    const residentId: number | undefined = sensor?.residentId ?? bodyResidentId;

    if (!entityId) {
      return res.status(400).json({
        error:
          "Cannot resolve entityId. Provide entityId in the payload or register the provider deviceId.",
      });
    }

    // (3) Cross-entity ownership: the resolved resident must belong to the claimed
    // entity before anything is written.
    if (residentId) {
      const resident = await storage.getResident(residentId);
      if (!resident) {
        return res.status(404).json({ error: `Resident ${residentId} not found` });
      }
      if (resident.entityId !== entityId) {
        await logIngestRejection(
          "resident_entity_mismatch",
          {
            hasSignature: true,
            deviceId,
            claimedEntityId: entityId,
            claimedResidentId: residentId,
          },
          true
        );
        return res.status(403).json({
          error: "Resident does not belong to the claimed entity. Access denied.",
        });
      }
    }

    // (4) Verified and correctly scoped — safe to write.
    if (residentId) {
      const location = sensor?.location ?? zone ?? "unknown";

      await storage.createMotionEvent({
        entityId,
        sensorId: sensor?.id ?? null,
        residentId,
        eventType: `provider_${status}`,
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
            type: "provider_event",
            provider: provider ?? sensor?.securityProvider ?? null,
            status,
            deviceId: deviceId ?? null,
            zone: zone ?? null,
            timestamp: timestamp ?? new Date().toISOString(),
            loggedAt: new Date().toISOString(),
          }) + "\n"
        );
      } catch (logErr) {
        dailyLogger.warn("sensor-ingest", `Provider activity log write failed: ${logErr}`);
      }

      // "alarm" = sensor triggered = motion present; "stay" = system armed, no active motion
      const motionDetected = status === "alarm";
      await checkAndFlagInactivity(residentId, entityId, motionDetected);
    }

    dailyLogger.info(
      "sensor-ingest",
      `Provider event received: provider=${provider ?? "n/a"} status=${status} device=${deviceId ?? "n/a"}`,
      { entityId, residentId, status }
    );

    log(`[sensor-ingest] ${provider ?? "provider"} status=${status}`, "sensor-ingest");

    return res.json({
      received: true,
      status,
      residentId: residentId ?? null,
    });
  } catch (err: any) {
    log(`[sensor-ingest] unhandled error: ${err}`, "sensor-ingest");
    dailyLogger.warn("sensor-ingest", `Unhandled error: ${err?.message}`, { body });
    return res.status(500).json({ error: "Sensor ingest processing failed" });
  }
});

export default router;
