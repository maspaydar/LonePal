import { GoogleGenAI, Type } from "@google/genai";
import { storage } from "./storage";
import type { Resident, ScenarioConfig, ActiveScenario, UserPreferences, OnboardingProfile } from "@workspace/db";
import { log } from "./logger-util";

let _ai: GoogleGenAI | null = null;
const _entityAiClients = new Map<number, GoogleGenAI>();

function getAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

async function getAIForEntity(entityId: number): Promise<GoogleGenAI | null> {
  const entity = await storage.getEntity(entityId);
  if (entity?.geminiApiKey) {
    if (!_entityAiClients.has(entityId)) {
      _entityAiClients.set(entityId, new GoogleGenAI({ apiKey: entity.geminiApiKey }));
    }
    return _entityAiClients.get(entityId)!;
  }
  return getAI();
}

export function clearEntityAiClient(entityId: number): void {
  _entityAiClients.delete(entityId);
}

function getModelName() {
  return "gemini-2.0-flash";
}

const personaCache = new Map<number, { prompt: string; cachedAt: number }>();
const PERSONA_CACHE_TTL = 10 * 60 * 1000;

async function getCachedPersonaPrompt(resident: Resident): Promise<string> {
  const cached = personaCache.get(resident.id);
  if (cached && Date.now() - cached.cachedAt < PERSONA_CACHE_TTL) {
    return cached.prompt;
  }
  const prefs = await storage.getUserPreferences(resident.id);
  const prompt = buildPersonaPrompt(resident, prefs);
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

function getVerbosityInstruction(verbosity: string): string {
  switch (verbosity) {
    case "short": return "Keep responses very brief (1-2 sentences). Be concise and to the point.";
    case "long": return "Give detailed, thorough responses (4-6 sentences). Elaborate and engage in depth.";
    default: return "Keep responses moderate in length (2-3 sentences). Be warm but concise.";
  }
}

function getToneInstruction(tone: string): string {
  switch (tone) {
    case "professional": return "Use a professional, respectful tone. Be clear and composed.";
    case "friendly": return "Use a casual, friendly tone. Be upbeat and conversational.";
    case "calm": return "Use a calm, soothing tone. Speak gently and reassuringly.";
    default: return "Use a nurturing, warm tone. Be caring and supportive like a trusted friend.";
  }
}

function buildPersonaPrompt(resident: Resident, prefs?: UserPreferences | null): string {
  const persona = resident.digitalTwinPersona as any;
  const intake = resident.intakeInterviewData as any;
  const onboarding = resident.onboardingProfile as OnboardingProfile | null;
  const name = resident.preferredName || resident.firstName;

  let prompt = `You are a caring AI companion for ${name}, a senior resident. `;

  if (prefs) {
    prompt += `${getVerbosityInstruction(prefs.aiVerbosity)} `;
    prompt += `${getToneInstruction(prefs.preferredVoiceTone)} `;
  }

  // Onboarding profile is the resident/family-authored source of truth gathered
  // during intake. It defines who the companion should feel like, what it knows
  // about the resident, the memories it can lean on, and the topics it must
  // never raise — so it shapes the persona ahead of legacy persona/intake data.
  if (onboarding) {
    if (onboarding.companionName) {
      const rel = onboarding.relationshipType ? ` (${name}'s ${onboarding.relationshipType})` : "";
      prompt += `Speak as ${onboarding.companionName}${rel} — warm and familiar, the way that person would talk with ${name}. `;
    }
    if (onboarding.aboutResident) {
      prompt += `About ${name}: ${onboarding.aboutResident}. `;
    }
    if (onboarding.coreMemories?.length) {
      prompt += `Cherished memories to reference naturally when it feels right: ${onboarding.coreMemories.join("; ")}. `;
    }
    if (onboarding.boundaries?.length) {
      prompt += `Never bring up these topics: ${onboarding.boundaries.join(", ")}. `;
    }
  }

  if (resident.communicationStyle) {
    prompt += `Their communication style: ${resident.communicationStyle}. `;
  }

  if (persona) {
    if (persona.tone && !prefs) prompt += `Speak in a ${persona.tone} tone. `;
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
  try {
    const aiClient = await getAIForEntity(resident.entityId);
    if (!aiClient) {
      log("No Gemini API key set (global or entity-level), returning placeholder response", "ai-engine");
      return getPlaceholderResponse(resident, scenarioType, escalationLevel);
    }

    const personaPrompt = await getCachedPersonaPrompt(resident);
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

// ---------------------------------------------------------------------------
// Dual-Agent architecture
//
// Every resident message runs two isolated operations:
//   - Agent 1 (Companion): produces ONLY a warm conversational reply. It never
//     emits analysis, JSON, ratings, or safety tags.
//   - Agent 2 (Monitor): a silent analyst that never speaks to the resident. It
//     returns a structured verdict (safety, mood, risk) used by staff systems.
// ---------------------------------------------------------------------------

export interface MonitorVerdict {
  safe: boolean;
  needsHelp: boolean;
  riskLevel: "none" | "low" | "medium" | "high";
  mood: string;
  moodScore: number;
  summary: string;
}

const DEFAULT_VERDICT: MonitorVerdict = {
  safe: true,
  needsHelp: false,
  riskLevel: "none",
  mood: "Neutral",
  moodScore: 3,
  summary: "",
};

// When the Monitor cannot produce a real assessment (model error or unparseable
// output), we must NOT silently assume the resident is fine. Flag for staff
// review so a genuine emergency is never suppressed by an AI outage.
const INDETERMINATE_VERDICT: MonitorVerdict = {
  safe: true,
  needsHelp: true,
  riskLevel: "medium",
  mood: "Unable to assess",
  moodScore: 3,
  summary: "Automated safety check could not assess this message; flagging for staff review.",
};

// Defense-in-depth: even though the Companion is instructed never to emit
// analysis, strip any leaked safety tags / JSON / fenced blocks before the text
// reaches the resident.
function stripCompanionArtifacts(text: string): string {
  let out = text;
  const markerIdx = out.search(/```|SAFETY_CHECK/i);
  if (markerIdx >= 0) out = out.slice(0, markerIdx);
  out = out.replace(/\{[\s\S]*"(?:safe|needsHelp|riskLevel|moodScore|mood|summary)"[\s\S]*\}\s*$/i, "");
  return out.trim();
}

function buildCompanionSystemInstruction(personaPrompt: string, name: string, voice: boolean): string {
  return `${personaPrompt}

You are ${name}'s warm, caring AI companion${voice ? ", speaking with them through a voice interface on their phone" : ""}.
Talk to ${name} like a trusted friend. Be warm, natural, and genuinely interested in them.
${voice ? "Keep responses conversational and concise (2-4 sentences). Do not use emojis, markdown, or special formatting — your words will be read aloud.\n" : "Keep responses warm and concise (2-4 sentences).\n"}GUARDRAILS:
- You ONLY have a friendly conversation. NEVER output analysis, ratings, scores, JSON, labels, or safety tags of any kind — just talk to ${name}.
- Never use clinical or diagnostic language. You are a companion, not a nurse or doctor.
- Do not give medical advice or diagnoses.
- If ${name} mentions pain, a fall, or needing help, respond with genuine warmth and concern and gently reassure them that staff will be notified — caring, never alarming.`;
}

/**
 * Agent 1 (Companion) — synchronous. Returns ONLY the spoken reply.
 */
export async function generateCompanionReply(
  resident: Resident,
  userMessage: string,
  conversationHistory: { role: string; content: string }[]
): Promise<string> {
  const name = resident.preferredName || resident.firstName;
  const aiClient = await getAIForEntity(resident.entityId);
  if (!aiClient) {
    return `Thank you for responding, ${name}. I'm glad to hear from you!`;
  }

  const personaPrompt = await getCachedPersonaPrompt(resident);
  const systemInstruction = buildCompanionSystemInstruction(personaPrompt, name, false);

  const contents: any[] = [];
  for (const msg of buildConversationContext(conversationHistory)) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  try {
    const response = await aiClient.models.generateContent({
      model: getModelName(),
      contents,
      config: { systemInstruction, maxOutputTokens: 300, temperature: 0.7 },
    });
    return stripCompanionArtifacts(response.text || "") || `Thank you for responding, ${name}.`;
  } catch (error) {
    log(`Companion reply error: ${error}`, "ai-engine");
    return `Thank you for responding, ${name}. A staff member will follow up with you.`;
  }
}

function parseMonitorVerdict(text: string): MonitorVerdict | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const p = JSON.parse(match[0]);
    const riskLevel = ["none", "low", "medium", "high"].includes(p.riskLevel) ? p.riskLevel : "none";
    let moodScore = Number(p.moodScore);
    if (!Number.isFinite(moodScore)) moodScore = 3;
    moodScore = Math.min(5, Math.max(1, Math.round(moodScore)));
    return {
      safe: p.safe !== false,
      needsHelp: p.needsHelp === true,
      riskLevel: riskLevel as MonitorVerdict["riskLevel"],
      mood: typeof p.mood === "string" && p.mood.trim() ? p.mood.trim() : "Neutral",
      moodScore,
      summary: typeof p.summary === "string" ? p.summary.trim() : "",
    };
  } catch {
    return null;
  }
}

/**
 * Agent 2 (Monitor) — silent analytical agent. Never speaks to the resident.
 * Returns a structured verdict. Falls back safely on parse failure or no key.
 */
export async function runMonitorAgent(
  resident: Resident,
  userMessage: string,
  conversationHistory: { role: string; content: string }[]
): Promise<MonitorVerdict> {
  const name = resident.preferredName || resident.firstName;
  const aiClient = await getAIForEntity(resident.entityId);
  if (!aiClient) {
    return { ...DEFAULT_VERDICT };
  }

  const ctx = buildConversationContext(conversationHistory);
  const recentContext = ctx
    .map(m => `${m.role === "assistant" ? "Companion" : "Resident"}: ${m.content}`)
    .join("\n");

  const systemInstruction = `You are a SILENT safety-monitoring analyst for a senior-care facility. You NEVER speak to the resident and NEVER produce conversational text. You only assess ${name}'s wellbeing and output a single structured JSON assessment. You are analysis-only.`;

  const analysisPrompt = `Recent conversation context:
${recentContext || "(no prior context)"}

The resident (${name}) just said: "${userMessage}"

Assess their current state. Any response — even a sad or negative one — means they are conscious and responsive (safe=true). Set "needsHelp" to true ONLY if they mention pain, a fall, being unable to move, a medical emergency, or explicitly ask for help.

Return ONLY a JSON object with this exact shape:
{
  "safe": true,
  "needsHelp": false,
  "riskLevel": "none",
  "mood": "<one short phrase, max 8 words>",
  "moodScore": 3,
  "summary": "<one sentence about their state, max 20 words>"
}
riskLevel must be one of: "none", "low", "medium", "high". moodScore is 1-5 (1=very concerning, 5=happy/engaged).`;

  try {
    const response = await aiClient.models.generateContent({
      model: getModelName(),
      contents: [{ role: "user", parts: [{ text: analysisPrompt }] }],
      config: {
        systemInstruction,
        maxOutputTokens: 250,
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });
    const verdict = parseMonitorVerdict(response.text || "");
    // Unparseable output is a Monitor failure, not an "all clear" — escalate.
    return verdict || { ...INDETERMINATE_VERDICT };
  } catch (error) {
    log(`Monitor agent error: ${error}`, "ai-engine");
    // A model/transport failure must not silently suppress a real emergency.
    return { ...INDETERMINATE_VERDICT };
  }
}

/**
 * Convenience composition used by the web conversation endpoint: runs the
 * Companion and Monitor in parallel and maps the verdict to the legacy shape.
 */
export async function processResidentResponse(
  resident: Resident,
  scenarioId: number,
  userMessage: string,
  conversationHistory: { role: string; content: string }[]
): Promise<{ aiResponse: string; isResolved: boolean; shouldEscalate: boolean; verdict: MonitorVerdict }> {
  const [aiResponse, verdict] = await Promise.all([
    generateCompanionReply(resident, userMessage, conversationHistory),
    runMonitorAgent(resident, userMessage, conversationHistory),
  ]);
  return {
    aiResponse,
    isResolved: verdict.safe && !verdict.needsHelp,
    shouldEscalate: verdict.needsHelp,
    verdict,
  };
}

/**
 * Agent 1 (Companion) — streaming. Emits ONLY the spoken reply. Safety analysis
 * is handled separately by the Monitor agent, so nothing analytical leaks here.
 */
export async function streamCompanionResponse(
  resident: Resident,
  userMessage: string,
  conversationHistory: { role: string; content: string }[],
  onChunk: (text: string) => void
): Promise<{ fullResponse: string }> {
  const name = resident.preferredName || resident.firstName;
  const aiClient = await getAIForEntity(resident.entityId);
  if (!aiClient) {
    const fallback = `Thank you for responding, ${name}. I'm glad to hear from you!`;
    onChunk(fallback);
    return { fullResponse: fallback };
  }

  const personaPrompt = await getCachedPersonaPrompt(resident);
  const systemInstruction = buildCompanionSystemInstruction(personaPrompt, name, true);

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
    let emitted = "";
    for await (const chunk of stream) {
      const text = chunk.text || "";
      if (!text) continue;
      fullResponse += text;
      // Stream only the sanitized portion; once an analysis marker appears we
      // stop emitting so nothing analytical is ever read aloud to the resident.
      const sanitized = stripCompanionArtifacts(fullResponse);
      if (sanitized.length > emitted.length) {
        onChunk(sanitized.slice(emitted.length));
        emitted = sanitized;
      }
    }

    return { fullResponse: emitted || stripCompanionArtifacts(fullResponse) };
  } catch (error) {
    log(`Stream error: ${error}`, "ai-engine");
    const fallback = `I'm sorry ${name}, I'm having trouble connecting right now. Please try again in a moment.`;
    onChunk(fallback);
    return { fullResponse: fallback };
  }
}

export async function transcribeAudio(audioBase64: string, mimeType: string = "audio/webm", entityId?: number): Promise<string> {
  const aiClient = entityId ? await getAIForEntity(entityId) : getAI();
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

const ONBOARDING_TOPICS_ORDER = [
  "childhood",
  "family",
  "career",
  "education",
  "hobbies",
  "travel",
  "relationships",
  "milestones",
];

const TOPIC_OPENERS: Record<string, string> = {
  childhood: "Tell me about where you grew up. What was your hometown like when you were a child?",
  family:    "I'd love to hear about your family. Who were some of the most important people in your life growing up?",
  career:    "What kind of work did you do over the years? Was there a job or role you felt especially proud of?",
  education: "Did you have any teachers or schools that really shaped who you are?",
  hobbies:   "What did you love to do in your free time? Any hobbies or passions you kept coming back to?",
  travel:    "Have you traveled anywhere that left a big impression on you — somewhere that really stuck with you?",
  relationships: "Are there friendships or relationships from your past that you think about fondly?",
  milestones: "What are some of the moments in your life you're most proud of — big or small?",
};

function getNextOnboardingTopic(coveredTopics: string[]): string | null {
  for (const topic of ONBOARDING_TOPICS_ORDER) {
    if (!coveredTopics.includes(topic)) return topic;
  }
  return null;
}

export async function generateOnboardingResponse(
  resident: Resident,
  userMessage: string | null,
  conversationHistory: { role: string; content: string }[],
  coveredTopics: string[]
): Promise<{ aiResponse: string; memoryTopic: string | null; memorySummary: string | null; isComplete: boolean }> {
  const name = resident.preferredName || resident.firstName;
  const aiClient = await getAIForEntity(resident.entityId);

  const nextTopic = getNextOnboardingTopic(coveredTopics);
  const isComplete = !nextTopic;

  if (!userMessage) {
    const opener = nextTopic ? TOPIC_OPENERS[nextTopic] : `Thank you for sharing so much with me, ${name}. I treasure every story you've told me.`;
    return { aiResponse: opener, memoryTopic: null, memorySummary: null, isComplete };
  }

  if (!aiClient) {
    const fallbackReply = nextTopic
      ? `Thank you for sharing that, ${name}. ${TOPIC_OPENERS[nextTopic]}`
      : `That means so much to hear, ${name}. Thank you for trusting me with your memories.`;
    return {
      aiResponse: fallbackReply,
      memoryTopic: coveredTopics.length > 0 ? null : "other",
      memorySummary: userMessage,
      isComplete,
    };
  }

  const systemInstruction = `You are playing the warm, loving role of a grandchild speaking with your grandparent, ${name}.
Your goal is to gently draw out their life memories through natural, caring conversation.
You have a patient, curious, and affectionate personality. You are never clinical or formal.
You speak simply and warmly — never rush ${name}, and always validate what they share.
Do not mention technology, AI, or that you are a computer program.`;

  const analysisPrompt = `${systemInstruction}

${name} just said: "${userMessage}"

Topics already covered in this conversation: ${coveredTopics.length > 0 ? coveredTopics.join(", ") : "none yet"}.
${nextTopic ? `The next topic to gently explore is: "${nextTopic}".` : "All topics have been covered."}

Please do two things:
1. Respond warmly to what ${name} just shared (2-3 sentences). Acknowledge their story with genuine curiosity.
${nextTopic ? `2. Then naturally transition by asking the opener question for "${nextTopic}" (one gentle question).` : "2. Thank them warmly for sharing all their wonderful memories — this is the end of onboarding."}

Also, in a separate JSON block at the very end of your response (after "---JSON---"), output exactly this structure:
{
  "memorySummary": "<a 1-2 sentence summary of what ${name} shared>",
  "memoryTopic": "${nextTopic ? coveredTopics[coveredTopics.length] || "other" : "other"}"
}

The memoryTopic must be one of: childhood, career, family, education, hobbies, travel, relationships, milestones, other.
The memoryTopic should describe the content of what ${name} JUST said (not the next question).`;

  try {
    const contents = conversationHistory.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    contents.push({ role: "user", parts: [{ text: userMessage }] });

    const response = await aiClient.models.generateContent({
      model: getModelName(),
      contents,
      config: {
        systemInstruction: analysisPrompt,
        maxOutputTokens: 400,
        temperature: 0.75,
      },
    });

    const raw = response.text || "";
    const jsonSplit = raw.split("---JSON---");
    const aiResponse = jsonSplit[0].trim();
    let memoryTopic: string | null = null;
    let memorySummary: string | null = null;

    if (jsonSplit[1]) {
      try {
        const parsed = JSON.parse(jsonSplit[1].trim());
        memoryTopic = parsed.memoryTopic || "other";
        memorySummary = parsed.memorySummary || userMessage;
      } catch {
        memoryTopic = "other";
        memorySummary = userMessage;
      }
    } else {
      memoryTopic = "other";
      memorySummary = userMessage;
    }

    return { aiResponse, memoryTopic, memorySummary, isComplete };
  } catch (error) {
    log(`Onboarding AI error: ${error}`, "ai-engine");
    const fallback = nextTopic
      ? `That's really lovely, ${name}. ${TOPIC_OPENERS[nextTopic]}`
      : `I'm so glad you shared that with me, ${name}. Thank you.`;
    return { aiResponse: fallback, memoryTopic: "other", memorySummary: userMessage, isComplete };
  }
}

// ---------------------------------------------------------------------------
// Onboarding Intake Agent
// ---------------------------------------------------------------------------
// A specialized, single-purpose agent that runs INSTEAD of the Dual-Agent
// (Companion + Monitor) flow while a resident's onboarding is not yet complete.
// It wears a warm, professional "intake specialist" persona and gathers four
// things — one question at a time — into the resident's OnboardingProfile:
//   1. Who they are                         -> aboutResident
//   2. Who the AI should emulate (e.g.       -> companionName (+ relationshipType)
//      "Grandson Leo")
//   3. 3-4 key family memories               -> coreMemories
//   4. Topics to avoid                       -> boundaries

export interface IntakeResult {
  aiResponse: string;
  profile: OnboardingProfile;
  isComplete: boolean;
}

const INTAKE_MIN_MEMORIES = 3;

/**
 * Returns the next still-missing intake field in priority order, or null when
 * the profile has everything we need. This is the authoritative completion
 * gate — never trust the model alone to decide when intake is done.
 */
function getNextIntakeField(p: OnboardingProfile): keyof OnboardingProfile | null {
  if (!p.aboutResident || !p.aboutResident.trim()) return "aboutResident";
  if (!p.companionName || !p.companionName.trim()) return "companionName";
  if (!p.coreMemories || p.coreMemories.filter(m => m && m.trim()).length < INTAKE_MIN_MEMORIES) return "coreMemories";
  // `boundaries` is complete once it is DEFINED — including an empty array,
  // which is the valid "no topics to avoid" answer. It stays undefined (not [])
  // until the resident has actually responded to the boundaries question.
  if (p.boundaries === undefined) return "boundaries";
  return null;
}

const NONE_LIKE = /^(no|none|nope|nothing|n\/a|na|not really|nothing comes to mind)\.?$/i;

const INTAKE_FIELD_GOALS: Record<string, string> = {
  aboutResident:
    "Learn who the resident is — their name and a little about who they are (where they're from, family, what fills their days). Store this in `aboutResident`.",
  companionName:
    "Learn who they'd like their AI companion to feel like — the relationship (e.g. grandson, daughter, old friend) and that person's name (e.g. \"Grandson Leo\"). Store the person's name in `companionName` and the relationship in `relationshipType`.",
  coreMemories:
    `Collect ${INTAKE_MIN_MEMORIES}-4 cherished family memories, one at a time. Append each new memory to the \`coreMemories\` array.`,
  boundaries:
    "Find out if there are any topics the companion should never bring up. Store each as an item in the `boundaries` array (use an empty array if they say there are none).",
};

function normalizeIntakeProfile(merged: any, current: OnboardingProfile, boundariesProvided: boolean): OnboardingProfile {
  const result: OnboardingProfile = { ...current };
  if (typeof merged?.aboutResident === "string" && merged.aboutResident.trim()) {
    result.aboutResident = merged.aboutResident.trim();
  }
  if (typeof merged?.relationshipType === "string" && merged.relationshipType.trim()) {
    result.relationshipType = merged.relationshipType.trim();
  }
  if (typeof merged?.companionName === "string" && merged.companionName.trim()) {
    result.companionName = merged.companionName.trim();
  }
  if (Array.isArray(merged?.coreMemories)) {
    const cleaned = merged.coreMemories.map((m: any) => String(m).trim()).filter((m: string) => m.length > 0);
    if (cleaned.length > 0) result.coreMemories = cleaned;
  }
  // Only record boundaries when the resident has actually answered the boundaries
  // question this turn. The model echoes the full profile shape (incl. an empty
  // `boundaries` array) every turn, so without this gate the empty echo would
  // prematurely mark onboarding complete before boundaries is ever asked. An
  // empty array here is the valid "no topics to avoid" answer.
  if (boundariesProvided) {
    result.boundaries = Array.isArray(merged?.boundaries)
      ? merged.boundaries.map((b: any) => String(b).trim()).filter((b: string) => b.length > 0)
      : [];
  }
  return result;
}

/**
 * Onboarding Intake Agent. Bypasses the Companion/Monitor Dual-Agent flow.
 * Given the conversation so far and the profile gathered to date, it merges the
 * resident's latest answer into the profile and asks the single next question.
 * Completion is decided server-side via getNextIntakeField, not by the model.
 */
export async function generateIntakeResponse(
  resident: Resident,
  userMessage: string | null,
  conversationHistory: { role: string; content: string }[],
  currentProfile: OnboardingProfile
): Promise<IntakeResult> {
  const name = resident.preferredName || resident.firstName;
  const aiClient = await getAIForEntity(resident.entityId);

  const profile: OnboardingProfile = { ...currentProfile };
  const nextField = getNextIntakeField(profile);

  // Opening turn (no message yet): warm intro + first question, no model needed.
  if (!userMessage) {
    const opener = `Hello ${name}, it's so nice to meet you. I'm here to help set up a companion who will check in on you and keep you company. To start, I'd love to get to know you a little — could you tell me your name and a bit about yourself?`;
    return { aiResponse: opener, profile, isComplete: false };
  }

  // No AI configured for this facility: deterministic fallback that still
  // advances the intake by recording the raw answer where it belongs.
  if (!aiClient) {
    const fallbackProfile = applyFallbackAnswer(profile, nextField, userMessage);
    const stillMissing = getNextIntakeField(fallbackProfile);
    const reply = fallbackQuestion(name, stillMissing);
    return { aiResponse: reply, profile: fallbackProfile, isComplete: stillMissing === null };
  }

  const systemInstruction = `You are a warm, professional onboarding intake specialist for HeyGrand, a companion-care service for older adults. You are speaking with ${name}.
Your manner is calm, patient, kind, and respectful — like an attentive care coordinator. You are NOT role-playing as a family member yet; you are the friendly person setting up their companion.
Rules:
- Ask only ONE question per turn. Keep replies short (2-3 warm sentences max).
- Acknowledge what ${name} just shared before asking the next question.
- Never rush, never sound clinical, and never mention AI, computers, JSON, or that this is data collection.
- If an answer is vague, you may gently ask a brief follow-up for the SAME field rather than moving on.`;

  const goal = nextField
    ? INTAKE_FIELD_GOALS[nextField]
    : "All required information is gathered. Warmly thank them and let them know their companion is ready.";

  const prompt = `Here is what we have gathered so far about ${name} (fields may be empty):
${JSON.stringify(profile, null, 2)}

${name} just said: "${userMessage}"

Your task right now: ${goal}

First, merge anything useful from ${name}'s latest message into the profile fields.
${nextField ? `Then ask the single next question to make progress on the goal above.` : `Then give a warm closing message — do not ask another question.`}

Respond ONLY with a JSON object of this exact shape:
{
  "reply": "<your warm spoken reply to ${name} — acknowledgement + ${nextField ? "one question" : "closing message"}>",
  "boundariesProvided": false,
  "profile": {
    "aboutResident": "<string or empty>",
    "relationshipType": "<string or empty>",
    "companionName": "<string or empty>",
    "coreMemories": ["<memory>", "..."],
    "boundaries": ["<topic to avoid>", "..."]
  }
}
Set "boundariesProvided" to true ONLY on the turn where ${name} has just answered the question about which topics to avoid (use an empty boundaries array if they say there are none). On every other turn it MUST be false.
The profile you return MUST preserve everything already gathered and add the new information. Do not drop existing memories or fields.`;

  try {
    const contents: any[] = conversationHistory.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    contents.push({ role: "user", parts: [{ text: prompt }] });

    const response = await aiClient.models.generateContent({
      model: getModelName(),
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 500,
        temperature: 0.6,
        responseMimeType: "application/json",
        // Gemini Structured Outputs: the model is constrained to this exact
        // shape so we can reliably read back the merged profile and decide
        // server-side (via getNextIntakeField) when all four intake pieces are
        // gathered. boundariesProvided flags the single turn where the resident
        // has just answered the "topics to avoid" question.
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            boundariesProvided: { type: Type.BOOLEAN },
            profile: {
              type: Type.OBJECT,
              properties: {
                aboutResident: { type: Type.STRING },
                relationshipType: { type: Type.STRING },
                companionName: { type: Type.STRING },
                coreMemories: { type: Type.ARRAY, items: { type: Type.STRING } },
                boundaries: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["aboutResident", "relationshipType", "companionName", "coreMemories", "boundaries"],
            },
          },
          required: ["reply", "boundariesProvided", "profile"],
        },
      },
    });

    const raw = response.text || "";
    const match = raw.match(/\{[\s\S]*\}/);
    let reply = "";
    let mergedProfile = profile;
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (typeof parsed.reply === "string") reply = parsed.reply.trim();
      // Trust the explicit signal, but also treat a none-like answer while the
      // boundaries question is the active goal as a valid "no boundaries".
      const boundariesProvided =
        parsed.boundariesProvided === true ||
        (nextField === "boundaries" && NONE_LIKE.test(userMessage.trim()));
      mergedProfile = normalizeIntakeProfile(parsed.profile, profile, boundariesProvided);
    }

    const stillMissing = getNextIntakeField(mergedProfile);
    const isComplete = stillMissing === null;

    if (!reply) {
      reply = isComplete
        ? `Thank you so much, ${name}. Your companion is all set up and ready whenever you'd like to chat.`
        : fallbackQuestion(name, stillMissing);
    }

    return { aiResponse: reply, profile: mergedProfile, isComplete };
  } catch (error) {
    log(`Intake agent error: ${error}`, "ai-engine");
    const fallbackProfile = applyFallbackAnswer(profile, nextField, userMessage);
    const stillMissing = getNextIntakeField(fallbackProfile);
    return {
      aiResponse: fallbackQuestion(name, stillMissing),
      profile: fallbackProfile,
      isComplete: stillMissing === null,
    };
  }
}

/** Records a raw answer into the field currently being asked, for use when the model is unavailable. */
function applyFallbackAnswer(
  profile: OnboardingProfile,
  field: keyof OnboardingProfile | null,
  answer: string
): OnboardingProfile {
  const next: OnboardingProfile = { ...profile };
  const value = answer.trim();
  if (!field || !value) return next;
  if (field === "aboutResident") next.aboutResident = value;
  else if (field === "companionName") next.companionName = value;
  else if (field === "coreMemories") next.coreMemories = [...(next.coreMemories || []), value];
  else if (field === "boundaries") {
    // A none-like answer means "no topics to avoid" → empty (but defined) array.
    next.boundaries = NONE_LIKE.test(value) ? [] : [...(next.boundaries || []), value];
  }
  return next;
}

/** Deterministic question copy used as a safety net when the model fails or is unconfigured. */
function fallbackQuestion(name: string, field: keyof OnboardingProfile | null): string {
  switch (field) {
    case "aboutResident":
      return `Thank you, ${name}. Could you tell me a little about yourself — your name and a bit about who you are?`;
    case "companionName":
      return `Lovely. Who would you like your companion to feel like — for example a grandson named Leo, a daughter, or an old friend? What's their name?`;
    case "coreMemories":
      return `That's wonderful. Could you share a cherished family memory with me?`;
    case "boundaries":
      return `Thank you for sharing. Lastly, are there any topics you'd prefer your companion never bring up?`;
    default:
      return `Thank you so much, ${name}. Your companion is all set up and ready whenever you'd like to chat.`;
  }
}
