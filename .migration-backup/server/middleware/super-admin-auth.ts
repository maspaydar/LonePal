import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL: SESSION_SECRET environment variable is required for Super-Admin auth");
}

export interface SuperAdminJwtPayload {
  superAdminId: number;
  email: string;
  twoFactorVerified: boolean;
}

declare global {
  namespace Express {
    interface Request {
      superAdmin?: SuperAdminJwtPayload;
    }
  }
}

function getSecret(): string {
  if (!JWT_SECRET) throw new Error("SESSION_SECRET not configured");
  return JWT_SECRET;
}

export function signSuperAdminToken(payload: SuperAdminJwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "8h" });
}

export function signPending2FAToken(superAdminId: number, email: string): string {
  return jwt.sign(
    { superAdminId, email, twoFactorVerified: false, pending2FA: true },
    getSecret(),
    { expiresIn: "5m" }
  );
}

export function superAdminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, getSecret()) as SuperAdminJwtPayload & { pending2FA?: boolean };

    if (decoded.pending2FA || !decoded.twoFactorVerified) {
      return res.status(403).json({ error: "Two-factor authentication required" });
    }

    req.superAdmin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
