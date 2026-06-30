import { storage } from "../storage";
import { dailyLogger } from "../daily-logger";
import { personaService } from "./persona-service";
import { GoogleGenAI } from "@google/genai";
import type { Resident, Alert } from "@shared/schema";

const ESCALATION_TIMEOUT_MS = 5 * 60 * 1000;

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

interface PendingCheckIn {
  alertId: number;
  entityId: number;
  residentId: number;
  conversationId: number;
  createdAt: number;
  escalated: boolean;
}

const pendingCheckIns: Map<number, PendingCheckIn> = new Map();

let escalationInterval: ReturnType<typeof setInterval> | null = null;
let broadcastFn: ((data: any) => void) | null = null;

async function generateCheckInMessage(resident: Resident, entityId: number, minutesInactive: number): Promise<string> {
  const name = resident.preferredName || resident.firstName;
  const ai = getAI();

  if (!ai) {
    return `${name}, I noticed you've been quiet for a little while. How are you doing? Just checking in to make sure everything is alright.`;
  }

  try {
    const systemPrompt = personaService.generateSystemPrompt(resident, entityId);

    const checkInInstruction = `${systemPrompt}

CURRENT SITUATION: ${name} has not had any detected motion for approximately ${minutesInactive} minutes. 
The safety system has triggered a gentle check-in. You must now proactively reach out to ${name}.

YOUR TASK: Generate a single warm, caring check-in message. 
- Do NOT be alarming or clinical. 
- Frame it as a friendly, natural "just thinking of you" moment.
- Reference something personal about them if possible (a hobby, interest, or memory).
- Gently ask if they are okay or need anything.
- Keep it to 2-3 sentences max.
- Do NOT mention sensors, monitoring, or safety systems.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: "Generate the proactive check-in message now." }] }],
      config: {
        systemInstruction: checkInInstruction,
        maxOutputTokens: 200,
        temperature: 0.8,
      },
    });

    return response.text || `${name}, I was just thinking about you. How are you doing? Is everything okay?`;
  } catch (err) {
    dailyLogger.error("emergency", `AI check-in generation failed: ${err}`);
    return `${name}, I was just thinking about you. How are you doing? Is everything okay?`;
  }
}

async function checkEscalations(): Promise<void> {
  const now = Date.now();

  for (const [alertId, checkIn] of pendingCheckIns.entries()) {
    if (checkIn.escalated) continue;

    const elapsed = now - checkIn.createdAt;
    if (elapsed < ESCALATION_TIMEOUT_MS) continue;

    try {
      const conversation = await storage.getConversation(checkIn.conversationId);
      if (!conversation || !conversation.isActive) {
        pendingCheckIns.delete(alertId);
        continue;
      }

      const messages = await storage.getMessages(checkIn.conversationId);
      const hasUserResponse = messages.some((m) => m.role === "user" && new Date(m.createdAt).getTime() > checkIn.createdAt);

      if (hasUserResponse) {
        dailyLogger.info("emergency", `Resident ${checkIn.residentId} responded to check-in, clearing pending escalation`, {
          alertId,
          conversationId: checkIn.conversationId,
        });
        pendingCheckIns.delete(alertId);
        continue;
      }

      checkIn.escalated = true;

      const resident = await storage.getResident(checkIn.residentId);
      const name = resident?.preferredName || resident?.firstName || "Resident";

      const escalationAlert = await storage.createAlert({
        entityId: checkIn.entityId,
        residentId: checkIn.residentId,
        severity: "critical",
        title: `HIGH PRIORITY: No response from ${name}`,
        message: `${name} (Room ${resident?.roomNumber || "N/A"}) did not respond to AI check-in within 5 minutes. Immediate staff intervention recommended. Original alert ID: ${alertId}.`,
      });

      await storage.updateResidentStatus(checkIn.residentId, "emergency");

      const escalationMsg = `${name}, I'm getting a little worried since I haven't heard back from you. A staff member will be coming to check on you shortly, just to make sure everything is okay.`;
      await storage.createMessage({
        conversationId: checkIn.conversationId,
        role: "assistant",
        content: escalationMsg,
      });

      if (broadcastFn) {
        broadcastFn({
          type: "high_priority_alert",
          data: {
            alert: escalationAlert,
            resident: { id: checkIn.residentId, name, roomNumber: resident?.roomNumber },
            originalAlertId: alertId,
            escalationReason: "no_response_5_minutes",
          },
        });
      }

      dailyLogger.warn("emergency", `HIGH PRIORITY ESCALATION for resident ${checkIn.residentId} - no response to check-in`, {
        entityId: checkIn.entityId,
        residentId: checkIn.residentId,
        alertId: escalationAlert.id,
        originalAlertId: alertId,
        minutesSinceCheckIn: Math.round(elapsed / 60000),
      });
    } catch (err) {
      dailyLogger.error("emergency", `Escalation check failed for alert ${alertId}: ${err}`);
    }
  }
}

export const emergencyService = {
  start(broadcast?: (data: any) => void): void {
    if (broadcast) broadcastFn = broadcast;

    if (!escalationInterval) {
      escalationInterval = setInterval(checkEscalations, 30 * 1000);
      dailyLogger.info("emergency", "Emergency escalation monitor started (checks every 30s)");
    }
  },

  stop(): void {
    if (escalationInterval) {
      clearInterval(escalationInterval);
      escalationInterval = null;
      dailyLogger.info("emergency", "Emergency escalation monitor stopped");
    }
  },

  async initiateProactiveCheckIn(
    entityId: number,
    residentId: number,
    alert: Alert,
    minutesInactive: number,
  ): Promise<{ conversationId: number; checkInMessage: string }> {
    const resident = await storage.getResident(residentId);
    if (!resident) throw new Error(`Resident ${residentId} not found`);

    const name = resident.preferredName || resident.firstName;

    const checkInMessage = await generateCheckInMessage(resident, entityId, minutesInactive);

    const conversation = await storage.createConversation({
      entityId,
      residentId,
      scenarioId: null,
      title: `Proactive Check-in: ${name} - ${new Date().toLocaleString()}`,
      isActive: true,
    });

    await storage.createMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: checkInMessage,
    });

    pendingCheckIns.set(alert.id, {
      alertId: alert.id,
      entityId,
      residentId,
      conversationId: conversation.id,
      createdAt: Date.now(),
      escalated: false,
    });

    dailyLogger.info("emergency", `Proactive AI check-in sent to resident ${residentId}`, {
      entityId,
      alertId: alert.id,
      conversationId: conversation.id,
      minutesInactive,
    });

    if (broadcastFn) {
      broadcastFn({
        type: "proactive_checkin",
        data: {
          conversationId: conversation.id,
          residentId,
          residentName: name,
          message: checkInMessage,
          alertId: alert.id,
        },
      });
    }

    return { conversationId: conversation.id, checkInMessage };
  },

  clearPendingCheckIn(alertId: number): void {
    if (pendingCheckIns.has(alertId)) {
      pendingCheckIns.delete(alertId);
      dailyLogger.info("emergency", `Pending check-in cleared for alert ${alertId}`);
    }
  },

  getPendingCheckIns(): PendingCheckIn[] {
    return Array.from(pendingCheckIns.values());
  },
};
