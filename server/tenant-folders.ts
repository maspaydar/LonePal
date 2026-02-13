import fs from "fs";
import path from "path";

const DATA_ROOT = path.join(process.cwd(), "data");

const ENTITY_SUBFOLDERS = ["profiles", "conversations", "activity"] as const;

export function ensureDataRoot(): void {
  if (!fs.existsSync(DATA_ROOT)) {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
  }
  const logsDir = path.join(DATA_ROOT, "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  const entitiesDir = path.join(DATA_ROOT, "entities");
  if (!fs.existsSync(entitiesDir)) {
    fs.mkdirSync(entitiesDir, { recursive: true });
  }
}

export function provisionEntityFolder(entityId: number | string): string {
  const entityDir = path.join(DATA_ROOT, "entities", String(entityId));
  if (!fs.existsSync(entityDir)) {
    fs.mkdirSync(entityDir, { recursive: true });
  }
  for (const sub of ENTITY_SUBFOLDERS) {
    const subDir = path.join(entityDir, sub);
    if (!fs.existsSync(subDir)) {
      fs.mkdirSync(subDir, { recursive: true });
    }
  }
  return entityDir;
}

export function getEntityPath(entityId: number | string, subfolder?: typeof ENTITY_SUBFOLDERS[number]): string {
  const base = path.join(DATA_ROOT, "entities", String(entityId));
  if (subfolder) return path.join(base, subfolder);
  return base;
}

export function entityFolderExists(entityId: number | string): boolean {
  return fs.existsSync(path.join(DATA_ROOT, "entities", String(entityId)));
}

export function getLogsPath(): string {
  return path.join(DATA_ROOT, "logs");
}

export { DATA_ROOT };
