import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { storage } from "../storage";

const JWT_SECRET = process.env.SESSION_SECRET!;

export interface MobileAuthPayload {
  residentId: number;
  entityId: number;
  tokenId: number;
}

declare global {
  namespace Express {
    interface Request {
      mobileUser?: MobileAuthPayload;
      mobileAuth?: MobileAuthPayload;
    }
  }
}

export function signMobileToken(payload: MobileAuthPayload, expiresIn: string = "30d"): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyMobileToken(token: string): MobileAuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as MobileAuthPayload;
  } catch {
    return null;
  }
}

export async function mobileAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.slice(7);
  const payload = verifyMobileToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const dbToken = await storage.getMobileTokenByToken(token);
  if (!dbToken || !dbToken.isActive) {
    return res.status(401).json({ error: "Token has been revoked" });
  }

  if (
    dbToken.id !== payload.tokenId ||
    dbToken.residentId !== payload.residentId ||
    dbToken.entityId !== payload.entityId
  ) {
    return res.status(401).json({ error: "Token mismatch" });
  }

  if (new Date(dbToken.expiresAt) < new Date()) {
    await storage.deactivateMobileToken(dbToken.id);
    return res.status(401).json({ error: "Token has expired" });
  }

  await storage.updateMobileTokenLastUsed(dbToken.id);

  req.mobileUser = payload;
  req.mobileAuth = payload;
  next();
}
