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
  return "gemini-1.5-flash";
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
    const personaPrompt = buildPersonaPrompt(resident);
    const scenarioPrompt = getScenarioPrompt(scenarioType, escalationLevel, resident, triggerLocation);

    const systemInstruction = `${personaPrompt}\n\nCurrent situation: ${scenarioPrompt}\n\nIMPORTANT: Keep your response concise (2-3 sentences max). Be natural and human-like. Do not use clinical language.`;

    const contents: any[] = [];

    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
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
    const personaPrompt = buildPersonaPrompt(resident);

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

    const response = await aiClient.models.generateContent({
      model: getModelName(),
      contents: [{ role: "user", parts: [{ text: analysisPrompt }] }],
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
      // JSON parsing failed, fall through
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
