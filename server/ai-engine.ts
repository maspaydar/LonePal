import { GoogleGenAI } from "@google/genai";
import { storage } from "./storage";
import type { Resident, ScenarioConfig, ActiveScenario } from "@shared/schema";
import { log } from "./index";

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

function getModelName() {
  return "gemini-2.0-flash";
}

const personaCache = new Map<number, { prompt: string; cachedAt: number }>();
const PERSONA_CACHE_TTL = 10 * 60 * 1000;

function getCachedPersonaPrompt(resident: Resident): string {
  const cached = personaCache.get(resident.id);
  if (cached && Date.now() - cached.cachedAt < PERSONA_CACHE_TTL) {
    return cached.prompt;
  }
  const prompt = buildPersonaPrompt(resident);
  personaCache.set(resident.id, { prompt, cachedAt: Date.now() });
  return prompt;
}

export function invalidatePersonaCache(residentId: number): void {
  personaCache.delete(residentId);
}

export function clearPersonaCache(): void {
  personaCache.clear();
}

export function resetClient(): void {
  _ai = null;
}

function buildPersonaPrompt(resident: Resident): string {
  const persona = resident.digitalTwinPersona as any;
  const intake = resident.intakeInterviewData as any;
  const name = resident.preferredName || resident.firstName;

  let prompt = `You are a caring AI companion for ${name}, a senior resident. `;

  if (resident.communicationStyle) {
    prompt += `Their communication style: ${resident.communicationStyle}. `;
  }

  if (persona) {
    if (persona.tone) prompt += `Speak in a ${persona.tone} tone. `;
    if (persona.topics?.length) prompt += `Topics they enjoy: ${persona.topics.join(", ")}. `;
    if (persona.avoidTopics?.length) prompt += `Avoid mentioning: ${persona.avoidTopics.join(", ")}. `;
  }

  if (intake) {
    if (intake.hobbies?.length) prompt += `Their hobbies include: ${intake.hobbies.join(", ")}. `;
    if (intake.personality) prompt += `Personality: ${intake.personality}. `;
    if (intake.familyNotes) prompt += `Family context: ${intake.familyNotes}. `;
  }

  return prompt;
}

export function buildConversationContext(
  allMessages: { role: string; content: string }[]
): { role: string; content: string }[] {
  const MAX_RECENT = 20;
  const SUMMARIZE_THRESHOLD = 30;

  if (allMessages.length <= MAX_RECENT) {
    return allMessages;
  }

  if (allMessages.length > SUMMARIZE_THRESHOLD) {
    const olderMessages = allMessages.slice(0, allMessages.length - MAX_RECENT);
    const recentMessages = allMessages.slice(-MAX_RECENT);

    const summaryParts: string[] = [];
    for (const msg of olderMessages) {
      const speaker = msg.role === "user" ? "Resident" : "Companion";
      summaryParts.push(`${speaker}: ${msg.content.slice(0, 100)}`);
    }

    const summaryText = `[Earlier conversation summary - ${olderMessages.length} messages]\n` +
      summaryParts.slice(-10).join("\n") +
      (olderMessages.length > 10 ? `\n...and ${olderMessages.length - 10} earlier messages` : "");

    return [
      { role: "user", content: summaryText },
      { role: "assistant", content: "I remember our earlier conversation. Let's continue." },
      ...recentMessages,
    ];
  }

  return allMessages.slice(-MAX_RECENT);
}

function getScenarioPrompt(scenarioType: string, escalationLevel: number, resident: Resident, triggerLocation?: string | null): string {
  const name = resident.preferredName || resident.firstName;

  switch (scenarioType) {
    case "inactivity_gentle":
      return `${name} has been sitting still for a while without moving. This is a gentle check-in (Scenario A). 
        Ask them warmly how they're doing and if they'd like to chat. Keep it casual and friendly. 
        If they respond positively OR negatively, they are safe - acknowledge their response warmly.
        Do NOT be alarming. This is just a friendly check-in.`;

    case "inactivity_urgent":
      if (escalationLevel === 0) {
        return `${name} has not responded to a previous gentle check-in (Scenario B, initial contact). 
          Be more direct but still caring. Ask clearly if they are okay and if they need any help. 
          Let them know you're here for them and ask them to respond.`;
      } else if (escalationLevel === 1) {
        return `${name} has still not responded after multiple attempts (Scenario B, escalation ${escalationLevel}). 
          Be more urgent. Express concern directly. Ask them to please respond even with a simple "yes" or "no". 
          Mention that if they don't respond, staff will be notified for their safety.`;
      } else {
        return `${name} has not responded to several check-in attempts (Scenario B, high escalation ${escalationLevel}). 
          This is serious. Send a final urgent message saying that staff is being alerted for their safety. 
          Be compassionate but clear about the urgency.`;
      }

    case "fall_detected":
      return `A potential fall has been detected for ${name}${triggerLocation ? ` in the ${triggerLocation}` : ""} (Scenario C - Fall). 
        This is urgent. Ask immediately if they are hurt or need help. 
        Keep the message short, clear, and direct. Ask them to respond right away.
        If no response is received, staff will be immediately notified.`;

    case "bathroom_extended":
      if (escalationLevel === 0) {
        return `${name} has been in the ${triggerLocation || "bathroom"} for an extended time (Scenario C - Bathroom). 
          Gently ask if everything is okay and if they need any assistance. 
          Be discreet and respectful of their privacy.`;
      } else {
        return `${name} has been in the ${triggerLocation || "bathroom"} for a concerning amount of time (Scenario C - Bathroom, escalation ${escalationLevel}). 
          Express concern more directly. Ask if they need help or if they've had a fall. 
          Mention that a staff member may check on them.`;
      }

    case "shower_extended":
      if (escalationLevel === 0) {
        return `${name} has been in the shower for longer than usual (Scenario C - Shower). 
          Gently check if they are alright. Be brief and respectful.`;
      } else {
        return `${name} has been in the shower for a worrying amount of time (Scenario C - Shower, escalation ${escalationLevel}). 
          Urgently ask if they need help. This could be a safety issue. 
          Let them know staff will be alerted if there's no response.`;
      }

    default:
      return `Check in on ${name} and ask how they are doing. Be friendly and caring.`;
  }
}

export async function generateAICheckIn(
  resident: Resident,
  scenarioType: string,
  escalationLevel: number,
  triggerLocation?: string | null,
  conversationHistory?: { role: string; content: string }[]
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    log("GEMINI_API_KEY not set, returning placeholder response", "ai-engine");
    return getPlaceholderResponse(resident, scenarioType, escalationLevel);
  }

  try {
    const personaPrompt = getCachedPersonaPrompt(resident);
    const scenarioPrompt = getScenarioPrompt(scenarioType, escalationLevel, resident, triggerLocation);

    const systemInstruction = `${personaPrompt}\n\nCurrent situation: ${scenarioPrompt}\n\nIMPORTANT: Keep your response concise (2-3 sentences max). Be natural and human-like. Do not use clinical language.`;

    const contents: any[] = [];

    if (conversationHistory && conversationHistory.length > 0) {
      const ctx = buildConversationContext(conversationHistory);
      for (const msg of ctx) {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }

    contents.push({
      role: "user",
      parts: [{ text: "Please generate the check-in message for this scenario." }],
    });

    const aiClient = getAI();
    if (!aiClient) return getPlaceholderResponse(resident, scenarioType, escalationLevel);

    const response = await aiClient.models.generateContent({
      model: getModelName(),
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 200,
        temperature: 0.7,
      },
    });

    return response.text || getPlaceholderResponse(resident, scenarioType, escalationLevel);
  } catch (error) {
    log(`AI generation error: ${error}`, "ai-engine");
    return getPlaceholderResponse(resident, scenarioType, escalationLevel);
  }
}

export async function processResidentResponse(
  resident: Resident,
  scenarioId: number,
  userMessage: string,
  conversationHistory: { role: string; content: string }[]
): Promise<{ aiResponse: string; isResolved: boolean; shouldEscalate: boolean }> {
  if (!process.env.GEMINI_API_KEY) {
    return {
      aiResponse: `Thank you for responding, ${resident.preferredName || resident.firstName}. I'm glad to hear from you!`,
      isResolved: true,
      shouldEscalate: false,
    };
  }

  try {
    const personaPrompt = getCachedPersonaPrompt(resident);
    const ctx = buildConversationContext(conversationHistory);

    const analysisPrompt = `${personaPrompt}

You are analyzing a response from ${resident.preferredName || resident.firstName} during a safety check-in.
Their message: "${userMessage}"

Based on their response, determine:
1. Are they safe and conscious? (any response, even negative mood, means they are conscious and responsive)
2. Do they seem to need immediate help? (mentions of pain, falling, can't move, etc.)
3. Provide a warm, appropriate response.

Respond in this exact JSON format:
{"safe": true/false, "needsHelp": true/false, "response": "your caring response here"}`;

    const aiClient = getAI();
    if (!aiClient) {
      return {
        aiResponse: `Thank you for responding, ${resident.preferredName || resident.firstName}. I'm glad to hear from you!`,
        isResolved: true,
        shouldEscalate: false,
      };
    }

    const contents: any[] = [];
    for (const msg of ctx) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
    contents.push({ role: "user", parts: [{ text: analysisPrompt }] });

    const response = await aiClient.models.generateContent({
      model: getModelName(),
      contents,
      config: { maxOutputTokens: 300, temperature: 0.3 },
    });

    const text = response.text || "";
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          aiResponse: parsed.response || `Thank you for responding, ${resident.preferredName || resident.firstName}.`,
          isResolved: parsed.safe && !parsed.needsHelp,
          shouldEscalate: parsed.needsHelp === true,
        };
      }
    } catch {
    }

    return {
      aiResponse: text || `Thank you for responding, ${resident.preferredName || resident.firstName}.`,
      isResolved: true,
      shouldEscalate: false,
    };
  } catch (error) {
    log(`AI response processing error: ${error}`, "ai-engine");
    return {
      aiResponse: `Thank you for responding, ${resident.preferredName || resident.firstName}. A staff member will follow up with you.`,
      isResolved: false,
      shouldEscalate: true,
    };
  }
}

export async function streamCompanionResponse(
  resident: Resident,
  userMessage: string,
  conversationHistory: { role: string; content: string }[],
  onChunk: (text: string) => void
): Promise<{ fullResponse: string; isResolved: boolean; shouldEscalate: boolean }> {
  const aiClient = getAI();
  if (!aiClient) {
    const fallback = `Thank you for responding, ${resident.preferredName || resident.firstName}. I'm glad to hear from you!`;
    onChunk(fallback);
    return { fullResponse: fallback, isResolved: true, shouldEscalate: false };
  }

  const personaPrompt = getCachedPersonaPrompt(resident);
  const name = resident.preferredName || resident.firstName;

  const systemInstruction = `${personaPrompt}

You are having a friendly voice conversation with ${name}. They are speaking to you through a voice interface on their phone.
Keep your responses conversational, warm, and concise (2-4 sentences). Speak naturally as if talking to a friend.
Do not use emojis, markdown, or special formatting - this will be read aloud.
If they mention pain, falling, or needing help, express concern and let them know staff will be notified.

IMPORTANT: First respond naturally, then on a NEW LINE add a JSON safety assessment:
SAFETY_CHECK: {"safe": true/false, "needsHelp": true/false}`;

  const contents: any[] = [];
  for (const msg of conversationHistory) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  try {
    const stream = await aiClient.models.generateContentStream({
      model: getModelName(),
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 300,
        temperature: 0.7,
      },
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      const text = chunk.text || "";
      if (text) {
        fullResponse += text;
        const safetyIdx = fullResponse.indexOf("SAFETY_CHECK:");
        if (safetyIdx === -1) {
          onChunk(text);
        } else {
          const beforeSafety = text.split("SAFETY_CHECK:")[0];
          if (beforeSafety) onChunk(beforeSafety);
        }
      }
    }

    let isResolved = true;
    let shouldEscalate = false;
    const safetyMatch = fullResponse.match(/SAFETY_CHECK:\s*(\{[\s\S]*?\})/);
    if (safetyMatch) {
      try {
        const safety = JSON.parse(safetyMatch[1]);
        isResolved = safety.safe !== false;
        shouldEscalate = safety.needsHelp === true;
      } catch {}
      fullResponse = fullResponse.replace(/\n?SAFETY_CHECK:[\s\S]*$/, "").trim();
    }

    return { fullResponse, isResolved, shouldEscalate };
  } catch (error) {
    log(`Stream error: ${error}`, "ai-engine");
    const fallback = `I'm sorry ${name}, I'm having trouble connecting right now. Please try again in a moment.`;
    onChunk(fallback);
    return { fullResponse: fallback, isResolved: true, shouldEscalate: false };
  }
}

export async function transcribeAudio(audioBase64: string, mimeType: string = "audio/webm"): Promise<string> {
  const aiClient = getAI();
  if (!aiClient) {
    throw new Error("AI not available for transcription");
  }

  try {
    const response = await aiClient.models.generateContent({
      model: getModelName(),
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            {
              text: "Transcribe this audio exactly as spoken. Return ONLY the transcription text, nothing else. If the audio is unclear or empty, respond with [unclear].",
            },
          ],
        },
      ],
      config: { maxOutputTokens: 500, temperature: 0.1 },
    });

    const text = (response.text || "").trim();
    if (!text || text === "[unclear]") {
      throw new Error("Could not transcribe audio");
    }
    return text;
  } catch (error) {
    log(`Transcription error: ${error}`, "ai-engine");
    throw error;
  }
}

function getPlaceholderResponse(resident: Resident, scenarioType: string, escalationLevel: number): string {
  const name = resident.preferredName || resident.firstName;

  switch (scenarioType) {
    case "inactivity_gentle":
      return `Hello ${name}, I noticed you've been resting for a bit. How are you feeling? Would you like to have a chat?`;
    case "inactivity_urgent":
      if (escalationLevel <= 1) return `${name}, I'm checking in on you. Could you please let me know if you're alright?`;
      return `${name}, I'm concerned because I haven't heard from you. Staff will be checking on you shortly for your safety.`;
    case "fall_detected":
      return `${name}, are you okay? It seems like there may have been a fall. Please respond if you can hear me.`;
    case "bathroom_extended":
      return `${name}, I hope everything is alright. You've been in the bathroom for a while. Do you need any assistance?`;
    case "shower_extended":
      return `${name}, just checking in. You've been in the shower for a while. Is everything okay?`;
    default:
      return `Hello ${name}, how are you doing today?`;
  }
}
