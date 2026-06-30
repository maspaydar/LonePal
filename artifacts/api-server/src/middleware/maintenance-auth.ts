import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

function getMaintenanceSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not configured");
  return secret;
}

export function signMaintenanceRequest(payload: Record<string, any>): { signature: string; timestamp: number } {
  const timestamp = Date.now();
  const body = JSON.stringify({ ...payload, timestamp });
  const signature = crypto
    .createHmac("sha256", getMaintenanceSecret())
    .update(body)
    .digest("hex");
  return { signature, timestamp };
}

export function verifyMaintenanceSignature(req: Request, res: Response, next: NextFunction) {
  try {
    const signature = req.headers["x-maintenance-signature"] as string;
    const timestampStr = req.headers["x-maintenance-timestamp"] as string;

    if (!signature || !timestampStr) {
      return res.status(401).json({ error: "Missing maintenance signature or timestamp" });
    }

    const timestamp = parseInt(timestampStr, 10);
    const now = Date.now();
    const maxAge = 5 * 60 * 1000;
    if (isNaN(timestamp) || Math.abs(now - timestamp) > maxAge) {
      return res.status(401).json({ error: "Request timestamp expired or invalid" });
    }

    const body = JSON.stringify({ ...req.body, timestamp });
    const expectedSignature = crypto
      .createHmac("sha256", getMaintenanceSecret())
      .update(body)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return res.status(401).json({ error: "Invalid maintenance signature" });
    }

    next();
  } catch {
    res.status(500).json({ error: "Maintenance auth failed" });
  }
}
