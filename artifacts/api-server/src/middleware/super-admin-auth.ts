import { Request, Response, NextFunction } from "express";
import { extractBearerToken, signJwt, verifyJwt } from "../lib/jwt";

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

export function signSuperAdminToken(payload: SuperAdminJwtPayload): string {
  return signJwt(payload, "8h");
}

export function signPending2FAToken(superAdminId: number, email: string): string {
  return signJwt(
    { superAdminId, email, twoFactorVerified: false, pending2FA: true },
    "5m"
  );
}

export function superAdminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const decoded = verifyJwt<SuperAdminJwtPayload & { pending2FA?: boolean }>(token);
  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // 2FA is mandatory for every super-admin route, not just login: a token that
  // has not completed 2FA (pending2FA) or lacks the verified flag is rejected.
  if (decoded.pending2FA || !decoded.twoFactorVerified) {
    return res.status(403).json({ error: "Two-factor authentication required" });
  }

  req.superAdmin = decoded;
  next();
}
