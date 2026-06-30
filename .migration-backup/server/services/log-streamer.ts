import { storage } from "../storage";
import { log } from "../index";
import { dailyLogger } from "../daily-logger";

type LogSeverity = "info" | "warning" | "error" | "critical";

interface LogStreamEntry {
  severity: LogSeverity;
  source: string;
  message: string;
  metadata?: Record<string, any>;
}

let currentFacilityId: number | null = null;

export function setStreamingFacilityId(facilityId: number) {
  currentFacilityId = facilityId;
}

export async function streamLogEntry(entry: LogStreamEntry): Promise<void> {
  if (!currentFacilityId) return;

  try {
    await storage.createCentralLogEntry({
      facilityId: currentFacilityId,
      severity: entry.severity,
      source: entry.source,
      message: entry.message,
      metadata: entry.metadata || null,
    });
  } catch (err: any) {
    console.error(`[log-streamer] Failed to stream log entry: ${err.message}`);
  }
}

export async function streamCriticalError(source: string, message: string, metadata?: Record<string, any>): Promise<void> {
  await streamLogEntry({ severity: "critical", source, message, metadata });
}

export async function streamSafetyAlert(source: string, message: string, metadata?: Record<string, any>): Promise<void> {
  await streamLogEntry({ severity: "error", source, message, metadata });
}

export async function streamWarning(source: string, message: string, metadata?: Record<string, any>): Promise<void> {
  await streamLogEntry({ severity: "warning", source, message, metadata });
}

export async function streamInfo(source: string, message: string, metadata?: Record<string, any>): Promise<void> {
  await streamLogEntry({ severity: "info", source, message, metadata });
}

export function hookIntoAlertSystem() {
  const originalCreateAlert = storage.createAlert.bind(storage);
  (storage as any).createAlert = async function(alert: any) {
    const result = await originalCreateAlert(alert);

    const severityMap: Record<string, LogSeverity> = {
      critical: "critical",
      emergency: "critical",
      warning: "warning",
      info: "info",
    };

    const logSeverity = severityMap[alert.severity] || "warning";
    await streamLogEntry({
      severity: logSeverity,
      source: "safety-alert",
      message: `[${alert.severity?.toUpperCase()}] ${alert.title}: ${alert.message}`,
      metadata: {
        alertId: result.id,
        entityId: alert.entityId,
        residentId: alert.residentId,
        scenarioId: alert.scenarioId,
        severity: alert.severity,
      },
    });

    return result;
  };

  log("Log streamer hooked into alert system", "log-streamer");
}

export function hookIntoScenarioSystem() {
  const originalCreateScenario = storage.createActiveScenario.bind(storage);
  (storage as any).createActiveScenario = async function(scenario: any) {
    const result = await originalCreateScenario(scenario);

    await streamLogEntry({
      severity: "warning",
      source: "scenario-trigger",
      message: `Scenario triggered: ${scenario.scenarioType} for resident ${scenario.residentId}`,
      metadata: {
        scenarioId: result.id,
        entityId: scenario.entityId,
        residentId: scenario.residentId,
        scenarioType: scenario.scenarioType,
        escalationLevel: scenario.escalationLevel,
        triggerLocation: scenario.triggerLocation,
      },
    });

    return result;
  };

  log("Log streamer hooked into scenario system", "log-streamer");
}

export function initLogStreamer(facilityId: number) {
  setStreamingFacilityId(facilityId);
  hookIntoAlertSystem();
  hookIntoScenarioSystem();
  log(`Log streamer initialized for facility ${facilityId}`, "log-streamer");
  dailyLogger.info("log-streamer", `Centralized log streaming initialized for facility ${facilityId}`);
}
