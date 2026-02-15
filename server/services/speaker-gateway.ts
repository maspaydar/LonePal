import { storage } from "../storage";
import { generateAICheckIn } from "../ai-engine";
import { log } from "../index";
import { dailyLogger } from "../daily-logger";
import type { Resident, Unit } from "@shared/schema";

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

async function sendToSpeaker(command: SpeakerCommand): Promise<boolean> {
  log(`Speaker command -> ${command.speakerId}: ${command.action} "${command.text?.slice(0, 80) || ""}"`, "speaker-gateway");
  dailyLogger.info("speaker-gateway", `Sent ${command.action} to ${command.speakerId}`, {
    speakerId: command.speakerId,
    action: command.action,
    textLength: command.text?.length || 0,
  });
  return true;
}

export async function pushCheckIn(
  resident: Resident,
  unit: Unit,
  scenarioType: string,
  escalationLevel: number,
  scenarioId?: number,
  triggerLocation?: string | null,
  conversationHistory?: { role: string; content: string }[]
): Promise<{ speakerEventId: number; message: string; skippedQuietHours: boolean }> {
  if (!unit.smartSpeakerId) {
    log(`No smart speaker configured for unit ${unit.unitIdentifier}`, "speaker-gateway");
    throw new Error(`No smart speaker configured for unit ${unit.unitIdentifier}`);
  }

  const prefs = await storage.getUserPreferences(resident.id);
  if (prefs && isQuietHours(resident.id, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    log(`Quiet hours active for resident ${resident.id}, skipping audio push`, "speaker-gateway");
    const event = await storage.createSpeakerEvent({
      entityId: unit.entityId,
      unitId: unit.id,
      residentId: resident.id,
      smartSpeakerId: unit.smartSpeakerId,
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

  await sendToSpeaker({
    speakerId: unit.smartSpeakerId,
    action: "speak",
    text: checkInMessage,
  });

  dailyLogger.info("speaker-gateway", `Check-in pushed to ${unit.unitIdentifier} for ${resident.preferredName || resident.firstName}`, {
    entityId: unit.entityId,
    unitId: unit.id,
    residentId: resident.id,
    speakerEventId: event.id,
    scenarioType,
    escalationLevel,
  });

  return { speakerEventId: event.id, message: checkInMessage, skippedQuietHours: false };
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

  const listenResult = await activateListenMode(
    unit, resident.id, checkInResult.speakerEventId, scenarioId, 10000
  );

  return {
    checkInMessage: checkInResult.message,
    speakerEventId: checkInResult.speakerEventId,
    listenResult,
    skippedQuietHours: false,
  };
}

export function getActiveSessions(): { speakerId: string; unitId: number; residentId: number }[] {
  const sessions: { speakerId: string; unitId: number; residentId: number }[] = [];
  pendingListenSessions.forEach((session, speakerId) => {
    sessions.push({ speakerId, unitId: session.unitId, residentId: session.residentId });
  });
  return sessions;
}
