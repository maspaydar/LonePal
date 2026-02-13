import fs from "fs";
import path from "path";
import { getLogsPath, ensureDataRoot } from "./tenant-folders";

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function getDateStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getTimestamp(): string {
  return new Date().toISOString();
}

function getDailyLogPath(): string {
  return path.join(getLogsPath(), `echopath-${getDateStamp()}.log`);
}

function writeLogEntry(level: LogLevel, source: string, message: string, meta?: Record<string, any>): void {
  try {
    const logPath = getDailyLogPath();
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const entry = {
      timestamp: getTimestamp(),
      level,
      source,
      message,
      ...(meta ? { meta } : {}),
    };
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(logPath, line, "utf-8");
  } catch {
    // Silently fail if file logging is unavailable
  }
}

export const dailyLogger = {
  info(source: string, message: string, meta?: Record<string, any>) {
    writeLogEntry("INFO", source, message, meta);
  },
  warn(source: string, message: string, meta?: Record<string, any>) {
    writeLogEntry("WARN", source, message, meta);
  },
  error(source: string, message: string, meta?: Record<string, any>) {
    writeLogEntry("ERROR", source, message, meta);
  },
  debug(source: string, message: string, meta?: Record<string, any>) {
    writeLogEntry("DEBUG", source, message, meta);
  },
  init() {
    ensureDataRoot();
    writeLogEntry("INFO", "system", "EchoPath daily logger initialized");
  },
};
