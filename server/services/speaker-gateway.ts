import { storage } from "../storage";
import { generateAICheckIn } from "../ai-engine";
import { log } from "../index";
import { dailyLogger } from "../daily-logger";
import type { Resident, Unit } from "@shared/schema";
import { pushEsp32CheckIn, activateEsp32ListenMode, getEsp32Health } from "./esp32-speaker";

interface SpeakerCommand {
  speakerId: string;
  action: "speak" | "listen";
  text?: string;
  listenDurationMs?: number;
}

interface ListenModeResult {
  speakerEventId: number;
  responseText: string | null;
  timedOut: boolean;
}

const pendingListenSessions = new Map<string, {
  speakerEventId: number;
  unitId: number;
  residentId: number;
  entityId: number;
  scenarioId?: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
  resolve: (result: ListenModeResult) => void;
}>();

const speakerHealthStatus = new Map<string, {
  lastSuccess: Date | null;
  lastFailure: Date | null;
  consecutiveFailures: number;
}>();

function isQuietHours(residentId: number, quietStart: string | null, quietEnd: string | null): boolean {
  if (!quietStart || !quietEnd) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = quietStart.split(":").map(Number);
  const [endH, endM] = quietEnd.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function isSpeakerHealthy(speakerId: string): boolean {
  const health = speakerHealthStatus.get(speakerId);
  if (!health) return true;
  return health.consecutiveFailures < 3;
}

function recordSpeakerSuccess(speakerId: string) {
  speakerHealthStatus.set(speakerId, {
    lastSuccess: new Date(),
    lastFailure: speakerHealthStatus.get(speakerId)?.lastFailure || null,
    consecutiveFailures: 0,
  });
}

function recordSpeakerFailure(speakerId: string) {
  const existing = speakerHealthStatus.get(speakerId);
  speakerHealthStatus.set(speakerId, {
    lastSuccess: existing?.lastSuccess || null,
    lastFailure: new Date(),
    consecutiveFailures: (existing?.consecutiveFailures || 0) + 1,
  });
}

async function sendToSpeaker(command: SpeakerCommand): Promise<boolean> {
  try {
    log(`Speaker command -> ${command.speakerId}: ${command.action} "${command.text?.slice(0, 80) || ""}"`, "speaker-gateway");
    dailyLogger.info("speaker-gateway", `Sent ${command.action} to ${command.speakerId}`, {
      speakerId: command.speakerId,
      action: command.action,
      textLength: command.text?.length || 0,
    });

    recordSpeakerSuccess(command.speakerId);
    return true;
  } catch (error) {
    log(`Speaker ${command.speakerId} unreachable: ${error}`, "speaker-gateway");
    recordSpeakerFailure(command.speakerId);
    return false;
  }
}

async function failoverToMobileApp(
  resident: Resident,
  unit: Unit,
  checkInMessage: string,
  scenarioId?: number,
  broadcastFn?: (data: any) => void
): Promise<{ fallbackUsed: boolean; conversationId?: number }> {
  const tokens = await storage.getActiveMobileTokens(resident.id);
  if (!tokens || tokens.length === 0) {
    log(`No mobile app sessions for resident ${resident.id} — failover not possible`, "speaker-gateway");
    dailyLogger.warn("speaker-gateway", `Failover failed: no mobile sessions for resident ${resident.id}`, {
      residentId: resident.id,
      unitId: unit.id,
    });
    return { fallbackUsed: false };
  }

  let conversation = await storage.getActiveConversationForResident(unit.entityId, resident.id);
  if (!conversation) {
    conversation = await storage.createConversation({
      entityId: unit.entityId,
      residentId: resident.id,
      title: `Safety Check-In - ${new Date().toLocaleString()}`,
      isActive: true,
      scenarioId: scenarioId || undefined,
    });
  }

  await storage.createMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: checkInMessage,
  });

  await storage.createSpeakerEvent({
    entityId: unit.entityId,
    unitId: unit.id,
    residentId: resident.id,
    smartSpeakerId: unit.smartSpeakerId || "none",
    eventType: "failover_mobile",
    message: `Speaker offline — check-in routed to mobile app. ConversationId: ${conversation.id}`,
    scenarioId: scenarioId || null,
    status: "sent",
  });

  if (broadcastFn) {
    broadcastFn({
      type: "check_in_push",
      data: {
        residentId: resident.id,
        entityId: unit.entityId,
        conversationId: conversation.id,
        message: checkInMessage,
        failover: true,
        source: "mobile_failover",
      },
    });
  }

  log(`Failover: check-in routed to mobile app for resident ${resident.id} (conv ${conversation.id})`, "speaker-gateway");
  dailyLogger.info("speaker-gateway", `Failover to mobile for resident ${resident.id}`, {
    residentId: resident.id,
    unitId: unit.id,
    conversationId: conversation.id,
  });

  return { fallbackUsed: true, conversationId: conversation.id };
}

let _broadcastFn: ((data: any) => void) | null = null;

export function setSpeakerBroadcastFn(fn: (data: any) => void) {
  _broadcastFn = fn;
}

export async function pushCheckIn(
  resident: Resident,
  unit: Unit,
  scenarioType: string,
  escalationLevel: number,
  scenarioId?: number,
  triggerLocation?: string | null,
  conversationHistory?: { role: string; content: string }[]
): Promise<{ speakerEventId: number; message: string; skippedQuietHours: boolean; failoverUsed?: boolean; failoverConversationId?: number }> {
  const prefs = await storage.getUserPreferences(resident.id);
  if (prefs && isQuietHours(resident.id, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    log(`Quiet hours active for resident ${resident.id}, skipping audio push`, "speaker-gateway");
    const speakerId = unit.smartSpeakerId || "none";
    const event = await storage.createSpeakerEvent({
      entityId: unit.entityId,
      unitId: unit.id,
      residentId: resident.id,
      smartSpeakerId: speakerId,
      eventType: "check_in_push",
      message: "[Skipped - quiet hours active]",
      scenarioId: scenarioId || null,
      status: "skipped_quiet_hours",
    });
    return { speakerEventId: event.id, message: "", skippedQuietHours: true };
  }

  const checkInMessage = await generateAICheckIn(
    resident,
    scenarioType,
    escalationLevel,
    triggerLocation,
    conversationHistory
  );

  if (unit.hardwareType === "esp32_custom") {
    const esp32Result = await pushEsp32CheckIn(resident, unit, checkInMessage, scenarioId);
    if (!esp32Result.success) {
      log(`ESP32 speaker offline for unit ${unit.unitIdentifier}, using mobile failover`, "speaker-gateway");
      const failover = await failoverToMobileApp(resident, unit, checkInMessage, scenarioId, _broadcastFn || undefined);
      return {
        speakerEventId: esp32Result.speakerEventId,
        message: checkInMessage,
        skippedQuietHours: false,
        failoverUsed: true,
        failoverConversationId: failover.conversationId,
      };
    }
    return { speakerEventId: esp32Result.speakerEventId, message: checkInMessage, skippedQuietHours: false, failoverUsed: false };
  }

  if (!unit.smartSpeakerId || !isSpeakerHealthy(unit.smartSpeakerId)) {
    const reason = !unit.smartSpeakerId ? "no speaker configured" : "speaker unhealthy";
    log(`${reason} for unit ${unit.unitIdentifier}, using mobile failover`, "speaker-gateway");

    const event = await storage.createSpeakerEvent({
      entityId: unit.entityId,
      unitId: unit.id,
      residentId: resident.id,
      smartSpeakerId: unit.smartSpeakerId || "none",
      eventType: "check_in_push",
      message: checkInMessage,
      scenarioId: scenarioId || null,
      status: "failover_mobile",
    });

    const failover = await failoverToMobileApp(resident, unit, checkInMessage, scenarioId, _broadcastFn || undefined);

    return {
      speakerEventId: event.id,
      message: checkInMessage,
      skippedQuietHours: false,
      failoverUsed: true,
      failoverConversationId: failover.conversationId,
    };
  }

  const event = await storage.createSpeakerEvent({
    entityId: unit.entityId,
    unitId: unit.id,
    residentId: resident.id,
    smartSpeakerId: unit.smartSpeakerId,
    eventType: "check_in_push",
    message: checkInMessage,
    scenarioId: scenarioId || null,
    status: "sent",
  });

  const speakerSuccess = await sendToSpeaker({
    speakerId: unit.smartSpeakerId,
    action: "speak",
    text: checkInMessage,
  });

  if (!speakerSuccess) {
    await storage.updateSpeakerEvent(event.id, { status: "speaker_offline" });

    const failover = await failoverToMobileApp(resident, unit, checkInMessage, scenarioId, _broadcastFn || undefined);

    dailyLogger.warn("speaker-gateway", `Speaker ${unit.smartSpeakerId} offline, failover to mobile for ${unit.unitIdentifier}`, {
      entityId: unit.entityId,
      unitId: unit.id,
      residentId: resident.id,
      speakerEventId: event.id,
    });

    return {
      speakerEventId: event.id,
      message: checkInMessage,
      skippedQuietHours: false,
      failoverUsed: true,
      failoverConversationId: failover.conversationId,
    };
  }

  dailyLogger.info("speaker-gateway", `Check-in pushed to ${unit.unitIdentifier} for ${resident.preferredName || resident.firstName}`, {
    entityId: unit.entityId,
    unitId: unit.id,
    residentId: resident.id,
    speakerEventId: event.id,
    scenarioType,
    escalationLevel,
  });

  return { speakerEventId: event.id, message: checkInMessage, skippedQuietHours: false, failoverUsed: false };
}

export async function activateListenMode(
  unit: Unit,
  residentId: number,
  speakerEventId: number,
  scenarioId?: number,
  durationMs: number = 10000
): Promise<ListenModeResult> {
  if (!unit.smartSpeakerId) {
    throw new Error(`No smart speaker for unit ${unit.unitIdentifier}`);
  }

  const listenEvent = await storage.createSpeakerEvent({
    entityId: unit.entityId,
    unitId: unit.id,
    residentId,
    smartSpeakerId: unit.smartSpeakerId,
    eventType: "listen_mode",
    message: `Listening for ${durationMs / 1000}s after check-in event #${speakerEventId}`,
    scenarioId: scenarioId || null,
    status: "listening",
  });

  await sendToSpeaker({
    speakerId: unit.smartSpeakerId,
    action: "listen",
    listenDurationMs: durationMs,
  });

  return new Promise<ListenModeResult>((resolve) => {
    const timeoutHandle = setTimeout(async () => {
      pendingListenSessions.delete(unit.smartSpeakerId!);

      await storage.updateSpeakerEvent(listenEvent.id, { status: "timed_out" });
      await storage.createSpeakerEvent({
        entityId: unit.entityId,
        unitId: unit.id,
        residentId,
        smartSpeakerId: unit.smartSpeakerId!,
        eventType: "timeout",
        message: `No response received within ${durationMs / 1000}s`,
        scenarioId: scenarioId || null,
        status: "completed",
      });

      log(`Listen mode timed out for ${unit.unitIdentifier}`, "speaker-gateway");
      resolve({ speakerEventId: listenEvent.id, responseText: null, timedOut: true });
    }, durationMs);

    pendingListenSessions.set(unit.smartSpeakerId!, {
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

export async function handleSpeakerResponse(speakerId: string, responseText: string): Promise<{
  processed: boolean;
  speakerEventId?: number;
}> {
  const session = pendingListenSessions.get(speakerId);
  if (!session) {
    log(`No active listen session for speaker ${speakerId}`, "speaker-gateway");
    return { processed: false };
  }

  clearTimeout(session.timeoutHandle);
  pendingListenSessions.delete(speakerId);

  await storage.updateSpeakerEvent(session.speakerEventId, {
    status: "response_received",
    responseText,
  });

  const responseEvent = await storage.createSpeakerEvent({
    entityId: session.entityId,
    unitId: session.unitId,
    residentId: session.residentId,
    smartSpeakerId: speakerId,
    eventType: "response_received",
    message: responseText,
    scenarioId: session.scenarioId || null,
    status: "completed",
  });

  log(`Voice response received from speaker ${speakerId}: "${responseText.slice(0, 80)}"`, "speaker-gateway");
  dailyLogger.info("speaker-gateway", `Voice response from ${speakerId}`, {
    speakerId,
    responseLength: responseText.length,
    unitId: session.unitId,
    residentId: session.residentId,
  });

  session.resolve({
    speakerEventId: responseEvent.id,
    responseText,
    timedOut: false,
  });

  return { processed: true, speakerEventId: responseEvent.id };
}

export async function pushCheckInWithListenMode(
  resident: Resident,
  unit: Unit,
  scenarioType: string,
  escalationLevel: number,
  scenarioId?: number,
  triggerLocation?: string | null,
  conversationHistory?: { role: string; content: string }[]
): Promise<{
  checkInMessage: string;
  speakerEventId: number;
  listenResult: ListenModeResult | null;
  skippedQuietHours: boolean;
  failoverUsed?: boolean;
}> {
  const checkInResult = await pushCheckIn(
    resident, unit, scenarioType, escalationLevel, scenarioId, triggerLocation, conversationHistory
  );

  if (checkInResult.skippedQuietHours) {
    return {
      checkInMessage: "",
      speakerEventId: checkInResult.speakerEventId,
      listenResult: null,
      skippedQuietHours: true,
    };
  }

  if (checkInResult.failoverUsed) {
    return {
      checkInMessage: checkInResult.message,
      speakerEventId: checkInResult.speakerEventId,
      listenResult: null,
      skippedQuietHours: false,
      failoverUsed: true,
    };
  }

  let listenResult: ListenModeResult;
  if (unit.hardwareType === "esp32_custom") {
    listenResult = await activateEsp32ListenMode(unit, resident.id, checkInResult.speakerEventId, scenarioId, 10000);
  } else {
    listenResult = await activateListenMode(unit, resident.id, checkInResult.speakerEventId, scenarioId, 10000);
  }

  return {
    checkInMessage: checkInResult.message,
    speakerEventId: checkInResult.speakerEventId,
    listenResult,
    skippedQuietHours: false,
    failoverUsed: false,
  };
}

export function getActiveSessions(entityId?: number): { speakerId: string; unitId: number; residentId: number; entityId: number }[] {
  const sessions: { speakerId: string; unitId: number; residentId: number; entityId: number }[] = [];
  pendingListenSessions.forEach((session, speakerId) => {
    if (entityId === undefined || session.entityId === entityId) {
      sessions.push({ speakerId, unitId: session.unitId, residentId: session.residentId, entityId: session.entityId });
    }
  });
  return sessions;
}

export function getSpeakerHealth(speakerId: string): {
  healthy: boolean;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  consecutiveFailures: number;
} {
  const health = speakerHealthStatus.get(speakerId);
  if (!health) return { healthy: true, lastSuccess: null, lastFailure: null, consecutiveFailures: 0 };
  return { healthy: health.consecutiveFailures < 3, ...health };
}
