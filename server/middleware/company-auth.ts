import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface CompanyUserJwtPayload {
  userId: string;
  entityId: number;
  role: "admin" | "manager" | "staff";
}

declare global {
  namespace Express {
    interface Request {
      companyUser?: CompanyUserJwtPayload;
    }
  }
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not configured");
  return secret;
}

export function signCompanyToken(payload: CompanyUserJwtPayload, expiresIn = "8h"): string {
  return jwt.sign(payload, getSecret(), { expiresIn });
}

export function verifyCompanyToken(token: string): CompanyUserJwtPayload | null {
  try {
    return jwt.verify(token, getSecret()) as CompanyUserJwtPayload;
  } catch {
    return null;
  }
}

export function requireCompanyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.substring(7);
  const payload = verifyCompanyToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const routeEntityId = req.params.entityId
    ? Number(req.params.entityId)
    : extractEntityIdFromPath(req.path);

  if (routeEntityId !== null && !isNaN(routeEntityId)) {
    if (payload.entityId !== routeEntityId) {
      return res.status(403).json({ error: "Access denied: you do not belong to this entity" });
    }
  }

  req.companyUser = payload;
  next();
}

function extractEntityIdFromPath(path: string): number | null {
  const match = path.match(/\/api\/entities\/(\d+)\//);
  return match ? Number(match[1]) : null;
}

export function requireCompanyAdmin(req: Request, res: Response, next: NextFunction) {
  requireCompanyAuth(req, res, () => {
    if (req.companyUser?.role !== "admin") {
      return res.status(403).json({ error: "Admin role required" });
    }
    next();
  });
}

export function requireCompanyManager(req: Request, res: Response, next: NextFunction) {
  requireCompanyAuth(req, res, () => {
    const role = req.companyUser?.role;
    if (role !== "admin" && role !== "manager") {
      return res.status(403).json({ error: "Manager or Admin role required" });
    }
    next();
  });
}
