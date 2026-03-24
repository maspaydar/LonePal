import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { storage } from "../storage";

const COMPANY_TOKEN_TYPE = "company" as const;
const VALID_ROLES = new Set(["admin", "manager", "staff"]);

export interface CompanyUserJwtPayload {
  tokenType: "company";
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

export function signCompanyToken(
  payload: Omit<CompanyUserJwtPayload, "tokenType">,
  expiresIn = "8h"
): string {
  return jwt.sign({ ...payload, tokenType: COMPANY_TOKEN_TYPE }, getSecret(), { expiresIn });
}

function isCompanyPayload(decoded: unknown): decoded is CompanyUserJwtPayload {
  if (!decoded || typeof decoded !== "object") return false;
  const p = decoded as Record<string, unknown>;
  return (
    p.tokenType === COMPANY_TOKEN_TYPE &&
    typeof p.userId === "string" &&
    typeof p.entityId === "number" &&
    typeof p.role === "string" &&
    VALID_ROLES.has(p.role as string)
  );
}

export function verifyCompanyToken(token: string): CompanyUserJwtPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    return isCompanyPayload(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function extractEntityIdFromPath(path: string): number | null {
  const match = path.match(/\/api\/entities\/(\d+)\//);
  return match ? Number(match[1]) : null;
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

  storage.getFacilityByLinkedEntityId(payload.entityId).then((facility) => {
    if (!facility) {
      return next();
    }

    const status = facility.subscriptionStatus;

    if (status === "paused" || status === "cancelled") {
      return res.status(402).json({
        error: "subscription_required",
        subscriptionStatus: status,
        message:
          status === "paused"
            ? "Your subscription has expired. Please contact support to renew."
            : "Your subscription has been cancelled. Please contact support.",
      });
    }

    if (status === "trial") {
      const trialEndsAt = facility.trialEndsAt ? new Date(facility.trialEndsAt) : null;
      if (trialEndsAt && trialEndsAt < new Date()) {
        storage.updateFacility(facility.id, { subscriptionStatus: "paused" }).catch((err) => {
          console.error("[company-auth] Failed to auto-pause expired trial:", err);
        });
        return res.status(402).json({
          error: "trial_expired",
          subscriptionStatus: "paused",
          message: "Your free trial has expired. Please contact support to subscribe.",
        });
      }
    }

    next();
  }).catch((err) => {
    console.error("[company-auth] Subscription status check failed:", err);
    next();
  });
}

export function requireCompanyAuthBasic(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.substring(7);
  const payload = verifyCompanyToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.companyUser = payload;
  next();
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
