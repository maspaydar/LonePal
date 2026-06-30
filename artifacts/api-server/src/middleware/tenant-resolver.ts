import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { provisionEntityFolder, entityFolderExists } from "../tenant-folders";
import { dailyLogger } from "../daily-logger";

declare global {
  namespace Express {
    interface Request {
      entityId?: number;
      tenantPath?: string;
    }
  }
}

const TENANT_EXEMPT_PATHS = [
  "/api/seed",
  "/api/entities",
  "/api/webhook/adt",
];

function isExemptPath(path: string, method: string): boolean {
  if (path === "/api/entities" && method === "GET") return true;
  if (path === "/api/entities" && method === "POST") return true;
  if (path === "/api/seed") return true;
  if (path === "/api/webhook/adt") return true;
  if (path.startsWith("/api/admin")) return true;
  if (path.startsWith("/api/test")) return true;
  if (path.startsWith("/api/chat")) return true;
  if (path.startsWith("/api/safety")) return true;
  return false;
}

export async function tenantResolver(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (isExemptPath(req.path, req.method)) {
    next();
    return;
  }

  const entityIdHeader = req.headers["x-entity-id"];
  const entityIdFromPath = req.params?.entityId;

  const rawEntityId = entityIdHeader || entityIdFromPath;

  if (!rawEntityId) {
    const entityMatch = req.path.match(/\/api\/entities\/(\d+)/);
    if (entityMatch) {
      const pathEntityId = Number(entityMatch[1]);
      if (!isNaN(pathEntityId) && pathEntityId > 0) {
        await resolveAndAttach(req, res, next, pathEntityId);
        return;
      }
    }
    next();
    return;
  }

  const entityId = Number(rawEntityId);
  if (isNaN(entityId) || entityId <= 0) {
    res.status(400).json({ error: "Invalid entity ID" });
    return;
  }

  await resolveAndAttach(req, res, next, entityId);
}

async function resolveAndAttach(req: Request, res: Response, next: NextFunction, entityId: number): Promise<void> {
  try {
    const entity = await storage.getEntity(entityId);
    if (!entity) {
      res.status(404).json({ error: `Entity ${entityId} not found` });
      return;
    }

    const entityIdFromPath = req.path.match(/\/api\/entities\/(\d+)/);
    if (entityIdFromPath) {
      const pathId = Number(entityIdFromPath[1]);
      if (pathId !== entityId && req.headers["x-entity-id"]) {
        dailyLogger.warn("tenant-resolver", `Entity mismatch: header=${entityId}, path=${pathId}`, { entityId, pathId });
        res.status(403).json({ error: "Entity ID mismatch between header and request path" });
        return;
      }
    }

    if (!entityFolderExists(entityId)) {
      provisionEntityFolder(entityId);
      dailyLogger.info("tenant-resolver", `Provisioned data folders for entity ${entityId}`, { entityId, entityName: entity.name });
    }

    req.entityId = entityId;
    req.tenantPath = provisionEntityFolder(entityId);

    dailyLogger.debug("tenant-resolver", `Request routed to entity ${entityId}`, {
      entityId,
      method: req.method,
      path: req.path,
    });

    next();
  } catch (error) {
    dailyLogger.error("tenant-resolver", `Failed to resolve tenant: ${error}`, { entityId });
    res.status(500).json({ error: "Tenant resolution failed" });
  }
}
