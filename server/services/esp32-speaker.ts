import { storage } from "../storage";
import { generateAICheckIn } from "../ai-engine";
import { log } from "../index";
import { dailyLogger } from "../daily-logger";
import type { Resident, Unit } from "@shared/schema";
import { WebSocket } from "ws";

interface Esp32AudioCommand {
  type: "speak" | "listen";
  deviceMac: string;
  text?: string;
  audioUrl?: string;
  listenDurationMs?: number;
}

const connectedEsp32Devices = new Map<string, WebSocket>();

const esp32HealthStatus = new Map<string, {
  lastSuccess: Date | null;
  lastFailure: Date | null;
  consecutiveFailures: number;
}>();

const pendingEsp32ListenSessions = new Map<string, {
  speakerEventId: number;
  unitId: number;
  residentId: number;
  entityId: number;
  scenarioId?: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
  resolve: (result: { speakerEventId: number; responseText: string | null; timedOut: boolean }) => void;
}>();

export function registerEsp32Device(deviceMac: string, ws: WebSocket) {
  connectedEsp32Devices.set(deviceMac, ws);
  log(`ESP32 device registered: ${deviceMac}`, "esp32-speaker");

  ws.on("close", () => {
    connectedEsp32Devices.delete(deviceMac);
    log(`ESP32 device disconnected: ${deviceMac}`, "esp32-speaker");
  });

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "voice_response") {
        await handleEsp32VoiceResponse(deviceMac, msg.text || "");
      } else if (msg.type === "heartbeat") {
        recordEsp32Success(deviceMac);
      }
    } catch (err) {
      log(`ESP32 message parse error from ${deviceMac}: ${err}`, "esp32-speaker");
    }
  });
}

function isEsp32Connected(deviceMac: string): boolean {
  const ws = connectedEsp32Devices.get(deviceMac);
  return !!ws && ws.readyState === WebSocket.OPEN;
}

function isEsp32Healthy(deviceMac: string): boolean {
  const health = esp32HealthStatus.get(deviceMac);
  if (!health) return true;
  return health.consecutiveFailures < 3;
}

function recordEsp32Success(deviceMac: string) {
  esp32HealthStatus.set(deviceMac, {
    lastSuccess: new Date(),
    lastFailure: esp32HealthStatus.get(deviceMac)?.lastFailure || null,
    consecutiveFailures: 0,
  });
}

function recordEsp32Failure(deviceMac: string) {
  const existing = esp32HealthStatus.get(deviceMac);
  esp32HealthStatus.set(deviceMac, {
    lastSuccess: existing?.lastSuccess || null,
    lastFailure: new Date(),
    consecutiveFailures: (existing?.consecutiveFailures || 0) + 1,
  });
}

function sendToEsp32(command: Esp32AudioCommand): boolean {
  const ws = connectedEsp32Devices.get(command.deviceMac);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    recordEsp32Failure(command.deviceMac);
    return false;
  }

  try {
    ws.send(JSON.stringify(command));
    recordEsp32Success(command.deviceMac);
    log(`ESP32 command -> ${command.deviceMac}: ${command.type} "${command.text?.slice(0, 80) || ""}"`, "esp32-speaker");
    return true;
  } catch (error) {
    recordEsp32Failure(command.deviceMac);
    log(`ESP32 ${command.deviceMac} send failed: ${error}`, "esp32-speaker");
    return false;
  }
}

export async function pushEsp32CheckIn(
  resident: Resident,
  unit: Unit,
  checkInMessage: string,
  scenarioId?: number,
): Promise<{ success: boolean; speakerEventId: number }> {
  const deviceMac = unit.esp32DeviceMac;
  if (!deviceMac) {
    log(`No ESP32 device MAC for unit ${unit.unitIdentifier}`, "esp32-speaker");
    const event = await storage.createSpeakerEvent({
      entityId: unit.entityId,
      unitId: unit.id,
      residentId: resident.id,
      smartSpeakerId: "esp32-none",
      eventType: "check_in_push",
      message: checkInMessage,
      scenarioId: scenarioId || null,
      status: "no_device",
    });
    return { success: false, speakerEventId: event.id };
  }

  const event = await storage.createSpeakerEvent({
    entityId: unit.entityId,
    unitId: unit.id,
    residentId: resident.id,
    smartSpeakerId: `esp32:${deviceMac}`,
    eventType: "check_in_push",
    message: checkInMessage,
    scenarioId: scenarioId || null,
    status: "sent",
  });

  const success = sendToEsp32({
    type: "speak",
    deviceMac,
    text: checkInMessage,
  });

  if (!success) {
    await storage.updateSpeakerEvent(event.id, { status: "device_offline" });
    dailyLogger.warn("esp32-speaker", `ESP32 ${deviceMac} offline for unit ${unit.unitIdentifier}`, {
      entityId: unit.entityId,
      unitId: unit.id,
      residentId: resident.id,
    });
  }

  return { success, speakerEventId: event.id };
}

export async function activateEsp32ListenMode(
  unit: Unit,
  residentId: number,
  speakerEventId: number,
  scenarioId?: number,
  durationMs: number = 10000
): Promise<{ speakerEventId: number; responseText: string | null; timedOut: boolean }> {
  const deviceMac = unit.esp32DeviceMac;
  if (!deviceMac) {
    throw new Error(`No ESP32 device MAC for unit ${unit.unitIdentifier}`);
  }

  const listenEvent = await storage.createSpeakerEvent({
    entityId: unit.entityId,
    unitId: unit.id,
    residentId,
    smartSpeakerId: `esp32:${deviceMac}`,
    eventType: "listen_mode",
    message: `Listening for ${durationMs / 1000}s after check-in event #${speakerEventId}`,
    scenarioId: scenarioId || null,
    status: "listening",
  });

  sendToEsp32({
    type: "listen",
    deviceMac,
    listenDurationMs: durationMs,
  });

  return new Promise((resolve) => {
    const timeoutHandle = setTimeout(async () => {
      pendingEsp32ListenSessions.delete(deviceMac);
      await storage.updateSpeakerEvent(listenEvent.id, { status: "timed_out" });
      await storage.createSpeakerEvent({
        entityId: unit.entityId,
        unitId: unit.id,
        residentId,
        smartSpeakerId: `esp32:${deviceMac}`,
        eventType: "timeout",
        message: `No response received within ${durationMs / 1000}s`,
        scenarioId: scenarioId || null,
        status: "completed",
      });
      log(`ESP32 listen mode timed out for ${unit.unitIdentifier}`, "esp32-speaker");
      resolve({ speakerEventId: listenEvent.id, responseText: null, timedOut: true });
    }, durationMs);

    pendingEsp32ListenSessions.set(deviceMac, {
      speakerEventId: listenEvent.id,
      unitId: unit.id,
      residentId,
      entityId: unit.entityId,
      scenarioId,
      timeoutHandle,
      resolve,
    });
  });
}

async function handleEsp32VoiceResponse(deviceMac: string, responseText: string) {
  const session = pendingEsp32ListenSessions.get(deviceMac);
  if (!session) {
    log(`No active listen session for ESP32 ${deviceMac}`, "esp32-speaker");
    return;
  }

  clearTimeout(session.timeoutHandle);
  pendingEsp32ListenSessions.delete(deviceMac);

  await storage.updateSpeakerEvent(session.speakerEventId, {
    status: "response_received",
    responseText,
  });

  const responseEvent = await storage.createSpeakerEvent({
    entityId: session.entityId,
    unitId: session.unitId,
    residentId: session.residentId,
    smartSpeakerId: `esp32:${deviceMac}`,
    eventType: "response_received",
    message: responseText,
    scenarioId: session.scenarioId || null,
    status: "completed",
  });

  log(`ESP32 voice response from ${deviceMac}: "${responseText.slice(0, 80)}"`, "esp32-speaker");
  dailyLogger.info("esp32-speaker", `Voice response from ESP32 ${deviceMac}`, {
    deviceMac,
    responseLength: responseText.length,
    unitId: session.unitId,
    residentId: session.residentId,
  });

  session.resolve({
    speakerEventId: responseEvent.id,
    responseText,
    timedOut: false,
  });
}

export function getEsp32Health(deviceMac: string): {
  healthy: boolean;
  connected: boolean;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  consecutiveFailures: number;
} {
  const health = esp32HealthStatus.get(deviceMac);
  const connected = isEsp32Connected(deviceMac);
  if (!health) return { healthy: true, connected, lastSuccess: null, lastFailure: null, consecutiveFailures: 0 };
  return { healthy: health.consecutiveFailures < 3, connected, ...health };
}

export function getConnectedEsp32Devices(): string[] {
  return Array.from(connectedEsp32Devices.keys()).filter(mac => {
    const ws = connectedEsp32Devices.get(mac);
    return ws && ws.readyState === WebSocket.OPEN;
  });
}
