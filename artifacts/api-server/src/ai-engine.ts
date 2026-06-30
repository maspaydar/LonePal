import { GoogleGenAI, Type } from "@google/genai";
import { storage } from "./storage";
import type { Resident, ScenarioConfig, ActiveScenario, UserPreferences, OnboardingProfile, ServiceProvider, ServiceProviderType } from "@workspace/db";
import { log } from "./logger-util";
import { decryptSecret } from "./crypto";

const DEFAULT_MODEL = "gemini-2.0-flash";

let _ai: GoogleGenAI | null = null;
const _entityAiClients = new Map<number, GoogleGenAI>();
// Per-entity model override, populated lazily by getAIForEntity so the matching
// getModelName(entityId) call can resolve the subscriber's chosen model.
const _entityModels = new Map<number, string>();

function getAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

// Resolves the AI client for an entity, honoring a subscriber-owned ("bring your
// own key") provider key when configured. Order of precedence:
//   1. entity.encryptedApiKey  (custom key, encrypted at rest — decrypted here)
//   2. entity.geminiApiKey     (legacy plaintext key, kept for back-compat)
//   3. global GEMINI_API_KEY   (platform default fallback)
// Clients are cached per entity; clearEntityAiClient() must be called whenever an
// entity's key or model changes so the next call rebuilds from fresh config.
async function getAIForEntity(entityId: number): Promise<GoogleGenAI | null> {
  const entity = await storage.getEntity(entityId);

  // Track the per-entity model override (or clear a stale one) for getModelName.
  if (entity?.aiModelOverride) {
    _entityModels.set(entityId, entity.aiModelOverride);
  } else {
    _entityModels.delete(entityId);
  }

  let customKey: string | null = null;
  if (entity?.encryptedApiKey) {
    try {
      customKey = decryptSecret(entity.encryptedApiKey);
    } catch (error) {
      // Never fall back to another tenant's key; on decrypt failure we drop to
      // the global key and log, rather than throwing mid-request.
      log(
        `Failed to decrypt custom AI key for entity ${entityId}; using global fallback: ${error}`,
        "ai-engine",
      );
      customKey = null;
    }
  } else if (entity?.geminiApiKey) {
    customKey = entity.geminiApiKey;
  }

  if (customKey) {
    if (!_entityAiClients.has(entityId)) {
      _entityAiClients.set(entityId, new GoogleGenAI({ apiKey: customKey }));
    }
    return _entityAiClients.get(entityId)!;
  }
  return getAI();
}

export function clearEntityAiClient(entityId: number): void {
  _entityAiClients.delete(entityId);
  _entityModels.delete(entityId);
}

// Returns the model for a given entity: the subscriber's override when set,
// otherwise the platform default. Callers pass the same entityId they used for
// getAIForEntity so the cached override is honored.
function getModelName(entityId?: number): string {
  if (entityId != null) {
    const override = _entityModels.get(entityId);
    if (override) return override;
  }
  return DEFAULT_MODEL;
}

// Validates a candidate provider API key by instantiating a throwaway, isolated
// client and issuing a minimal generation ("ping"). Returns ok:false with a
// human-readable reason on any failure (invalid key, rate limit, network, etc.)
// so config routes can reject bad keys before persisting them.
export async function pingGeminiKey(
  apiKey: string,
  model?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = new GoogleGenAI({ apiKey });
    await client.models.generateContent({
      model: model || DEFAULT_MODEL,
      contents: "ping",
      config: { maxOutputTokens: 1, temperature: 0 },
    });
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || "Unknown error validating API key" };
  }
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
      model: getModelName(resident.entityId),
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
      model: getModelName(resident.entityId),
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
      model: getModelName(resident.entityId),
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
      model: getModelName(resident.entityId),
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
      model: getModelName(entityId),
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
      model: getModelName(resident.entityId),
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
      model: getModelName(resident.entityId),
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

// ---------------------------------------------------------------------------
// Training Agent — Super-Admin Certification Specialist
//
// A strict, thorough, supportive examiner that interviews a service provider
// (one question at a time) and evaluates whether they understand HeyGrand's
// care-compliance standards. State for the interview lives in the provider's
// `training_progress` JSON field; the caller persists the returned `progress`.
// ---------------------------------------------------------------------------

export interface TrainingTopicProgress {
  /** Stable key from the rubric (e.g. "sensor_positioning"). */
  topic: string;
  /** Human-readable label for the topic. */
  label: string;
  /** True once the examiner has meaningfully assessed this topic. */
  covered: boolean;
  /** 0-100 competency score for this topic. */
  score: number;
  /** Examiner's running notes on the provider's answers. */
  notes: string;
}

export interface TrainingProgress {
  providerType: ServiceProviderType;
  topics: TrainingTopicProgress[];
  /** Rubric key the examiner is currently probing, if any. */
  currentTopic: string | null;
  /** Number of examiner questions asked so far. */
  questionsAsked: number;
  /** 0-100 average competency across all rubric topics. */
  overallScore: number;
  understandingLevel: "not_started" | "developing" | "proficient" | "mastered";
  /** Safety / compliance concerns the examiner flagged for super-admin review. */
  redFlags: string[];
  /** Deterministically computed: all topics covered, all >= pass, no red flags. */
  readyForCertification: boolean;
  updatedAt: string;
}

export interface TrainingTurnResult {
  /** The examiner's next message to the provider (one question at a time). */
  reply: string;
  /** Updated interview state — caller persists this to `serviceProviders.trainingProgress`. */
  progress: TrainingProgress;
}

const TRAINING_PASS_SCORE = 70;

interface TrainingRubric {
  label: string;
  topics: { key: string; label: string }[];
  focus: string;
}

const TRAINING_RUBRICS: Record<ServiceProviderType, TrainingRubric> = {
  integration_sp: {
    label: "Integration Service Provider",
    topics: [
      { key: "sensor_positioning", label: "Safety-critical sensor positioning" },
      { key: "hardware_testing", label: "Hardware testing protocols" },
      { key: "blind_spot_avoidance", label: "Avoiding blind spots in senior rooms" },
    ],
    focus:
      "This provider installs ADT and motion-detector hardware and prepares facility environments. " +
      "Probe how they position sensors so falls, bathrooms, and bedsides are never left unmonitored; " +
      "how they verify each device with end-to-end testing before sign-off; and how they survey a room " +
      "to eliminate blind spots. Treat any answer that could leave a senior unmonitored as a safety failure.",
  },
  agent_sp: {
    label: "Agent Service Provider",
    topics: [
      { key: "ethical_boundaries", label: "Ethical boundaries with residents" },
      { key: "vulnerable_seniors", label: "Managing vulnerable and at-risk seniors" },
      { key: "tone_verbosity", label: "Managing tone and verbosity preferences" },
      { key: "safety_red_flags", label: "Recognizing and escalating safety red flags" },
    ],
    focus:
      "This provider configures resident companion agents and runs onboarding interviews. " +
      "Probe their ethical boundaries (no medical advice, no manipulation, respecting consent and privacy); " +
      "how they handle vulnerable, confused, or distressed seniors with patience and dignity; how they tune " +
      "tone and verbosity to a resident's preferences; and whether they can spot safety red flags " +
      "(mentions of pain, falls, self-harm, abuse) and escalate them. Treat a missed red flag as a critical failure.",
  },
};

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function initTrainingProgress(type: ServiceProviderType): TrainingProgress {
  const rubric = TRAINING_RUBRICS[type];
  return {
    providerType: type,
    topics: rubric.topics.map((t) => ({ topic: t.key, label: t.label, covered: false, score: 0, notes: "" })),
    currentTopic: null,
    questionsAsked: 0,
    overallScore: 0,
    understandingLevel: "not_started",
    redFlags: [],
    readyForCertification: false,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Coerce whatever is stored in `serviceProviders.trainingProgress` (which may be
 * null, stale, or from a different provider type) into a well-formed
 * TrainingProgress for the provider's current type.
 */
function normalizePriorProgress(raw: unknown, type: ServiceProviderType): TrainingProgress {
  const base = initTrainingProgress(type);
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.topics)) {
      base.topics = base.topics.map((t) => {
        const prev = (r.topics as any[]).find((x) => x && x.topic === t.topic);
        if (!prev) return t;
        return {
          ...t,
          covered: prev.covered === true,
          score: clampScore(prev.score),
          notes: typeof prev.notes === "string" ? prev.notes : "",
        };
      });
    }
    if (Number.isFinite(Number(r.questionsAsked))) {
      base.questionsAsked = Math.max(0, Math.round(Number(r.questionsAsked)));
    }
    if (Array.isArray(r.redFlags)) {
      base.redFlags = (r.redFlags as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    }
  }
  base.overallScore = Math.round(base.topics.reduce((s, t) => s + t.score, 0) / base.topics.length);
  return base;
}

function summarizeProgressForPrompt(p: TrainingProgress): string {
  const lines = p.topics.map(
    (t) =>
      `- ${t.label}: ${t.covered ? `assessed (score ${t.score}/100)` : "NOT yet assessed"}${t.notes ? ` — ${t.notes}` : ""}`,
  );
  return [
    `Questions asked so far: ${p.questionsAsked}`,
    `Topic coverage:`,
    lines.join("\n"),
    p.redFlags.length ? `Red flags already noted: ${p.redFlags.join("; ")}` : "No red flags noted yet.",
  ].join("\n");
}

function buildTrainingSystemInstruction(provider: ServiceProvider): string {
  const rubric = TRAINING_RUBRICS[provider.type];
  const curriculum = rubric.topics.map((t) => `- ${t.label} (key: ${t.key})`).join("\n");
  return `You are the HeyGrand Super-Admin Certification Specialist — a strict, thorough, yet supportive examiner who certifies the service providers that operate the HeyGrand senior-care platform. Your job is to make sure no senior is ever put at risk by an under-qualified provider, so you hold a high bar while staying encouraging and constructive.

You are interviewing ${provider.name}, who is being certified as a ${rubric.label}.

${rubric.focus}

CURRICULUM YOU MUST COVER (assess every topic before recommending certification):
${curriculum}

HOW YOU CONDUCT THE INTERVIEW:
- Ask EXACTLY ONE question at a time. Never bundle multiple questions into a single turn.
- Work through the curriculum one topic at a time. Probe a topic until you can fairly score it, then move on.
- Be specific and scenario-based ("A senior's bed is against a wall the motion sensor can't see — what do you do?"). Avoid vague trivia.
- After the provider answers, briefly acknowledge what was right or wrong (1-2 sentences) before asking your next question. Be supportive, never demeaning.
- If an answer reveals a safety or compliance gap, probe deeper rather than letting it slide. A wrong answer on a safety-critical point must lower that topic's score.
- Hold the HeyGrand care-compliance bar: dignity, privacy, consent, no medical advice, and always escalating genuine safety concerns to staff.
- When every topic is assessed and the provider has demonstrated solid understanding, congratulate them and tell them they are ready for certification review. Do not certify them yourself — a super-admin makes the final call.

SCORING (you fill in the structured fields each turn):
- For each curriculum topic, set covered=true once you've genuinely assessed it, give a 0-100 score reflecting demonstrated competency, and keep concise notes.
- A topic passes at ${TRAINING_PASS_SCORE}/100 or above. Be honest — do not inflate scores.
- Add to redFlags any answer that shows a serious safety, ethical, or compliance problem (e.g. willing to give medical advice, would leave an area unmonitored, would ignore a mention of a fall).

Always return the structured JSON: your conversational reply plus the updated per-topic assessment.`;
}

const trainingResponseSchema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    currentTopic: { type: Type.STRING },
    topics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          covered: { type: Type.BOOLEAN },
          score: { type: Type.NUMBER },
          notes: { type: Type.STRING },
        },
        required: ["topic", "covered", "score", "notes"],
      },
    },
    redFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["reply", "topics"],
};

/**
 * Merge the model's per-turn assessment into the prior progress, then compute
 * aggregates (overall score, understanding level, certification readiness)
 * deterministically rather than trusting the model with the final verdict.
 */
function applyTrainingAssessment(
  prior: TrainingProgress,
  raw: any,
  type: ServiceProviderType,
): TrainingProgress {
  const rubric = TRAINING_RUBRICS[type];
  const incoming = new Map<string, any>(
    Array.isArray(raw?.topics) ? raw.topics.filter((t: any) => t && typeof t.topic === "string").map((t: any) => [t.topic, t]) : [],
  );

  const topics: TrainingTopicProgress[] = rubric.topics.map((rt) => {
    const prev = prior.topics.find((p) => p.topic === rt.key);
    const inc = incoming.get(rt.key);
    let covered = prev?.covered ?? false;
    let score = prev?.score ?? 0;
    let notes = prev?.notes ?? "";
    if (inc) {
      if (typeof inc.covered === "boolean") covered = inc.covered;
      if (inc.score !== undefined && inc.score !== null) score = clampScore(inc.score);
      if (typeof inc.notes === "string" && inc.notes.trim()) notes = inc.notes.trim();
    }
    return { topic: rt.key, label: rt.label, covered, score, notes };
  });

  const newFlags = Array.isArray(raw?.redFlags)
    ? (raw.redFlags as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
    : [];
  const redFlags = Array.from(new Set([...prior.redFlags, ...newFlags]));

  const overallScore = Math.round(topics.reduce((s, t) => s + t.score, 0) / topics.length);
  const allCovered = topics.every((t) => t.covered);
  const allPass = topics.every((t) => t.score >= TRAINING_PASS_SCORE);
  const readyForCertification = allCovered && allPass && redFlags.length === 0;
  const questionsAsked = prior.questionsAsked + 1;

  let understandingLevel: TrainingProgress["understandingLevel"];
  if (overallScore >= 85 && allCovered) understandingLevel = "mastered";
  else if (overallScore >= TRAINING_PASS_SCORE) understandingLevel = "proficient";
  else understandingLevel = "developing";

  const currentTopic =
    typeof raw?.currentTopic === "string" && rubric.topics.some((t) => t.key === raw.currentTopic)
      ? raw.currentTopic
      : topics.find((t) => !t.covered)?.topic ?? null;

  return {
    providerType: type,
    topics,
    currentTopic,
    questionsAsked,
    overallScore,
    understandingLevel,
    redFlags,
    readyForCertification,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Training Agent turn. Given a service provider, their latest message, and the
 * conversation history, returns the examiner's next question plus the updated
 * interview progress. The caller is responsible for persisting `progress` to
 * `serviceProviders.trainingProgress` and appending both turns to `training_logs`.
 *
 * `history` roles map: "training_agent" -> model, anything else -> user.
 */
export async function generateTrainingResponse(
  provider: ServiceProvider,
  message: string,
  history: { role: string; content: string }[],
): Promise<TrainingTurnResult> {
  const prior = normalizePriorProgress(provider.trainingProgress, provider.type);
  const aiClient = await getAIForEntity(provider.entityId);

  if (!aiClient) {
    log("No Gemini API key set (global or entity-level); Training Agent unavailable", "ai-engine");
    return {
      reply:
        "The certification system is temporarily unavailable. Please try again shortly, and we'll pick up right where we left off.",
      progress: { ...prior, updatedAt: new Date().toISOString() },
    };
  }

  const systemInstruction = buildTrainingSystemInstruction(provider);

  const contents: any[] = [];
  for (const msg of buildConversationContext(history)) {
    contents.push({
      role: msg.role === "training_agent" || msg.role === "assistant" || msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  // Anchor the model to the current rubric state so it stays consistent across turns.
  const progressNote = `[Examiner progress so far — keep scoring consistent with this]\n${summarizeProgressForPrompt(prior)}`;
  const trimmedMessage = message.trim();
  const turnText = trimmedMessage
    ? `${progressNote}\n\nThe provider just said: "${trimmedMessage}"\n\nAcknowledge their answer, update your assessment, and ask your next single question (or conclude if every topic is assessed).`
    : `${progressNote}\n\nThis is the start of the interview. Greet ${provider.name}, briefly explain how the certification works, and ask your first single question.`;
  contents.push({ role: "user", parts: [{ text: turnText }] });

  try {
    const response = await aiClient.models.generateContent({
      model: getModelName(provider.entityId),
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 600,
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: trainingResponseSchema,
      },
    });

    let raw: any = null;
    try {
      const match = (response.text || "").match(/\{[\s\S]*\}/);
      raw = match ? JSON.parse(match[0]) : null;
    } catch (parseErr) {
      log(`Training Agent parse error: ${parseErr}`, "ai-engine");
    }

    // An unparseable response is a model failure — treat it like a transport
    // error and leave progress untouched so we never advance or corrupt the
    // assessment on garbage output.
    if (!raw || typeof raw !== "object") {
      return {
        reply: "I had trouble processing that. Could you repeat or expand on your last answer?",
        progress: { ...prior, updatedAt: new Date().toISOString() },
      };
    }

    const progress = applyTrainingAssessment(prior, raw, provider.type);
    const reply =
      typeof raw?.reply === "string" && raw.reply.trim()
        ? raw.reply.trim()
        : "Thank you. Could you walk me through that in a bit more detail?";

    return { reply, progress };
  } catch (error) {
    log(`Training Agent error: ${error}`, "ai-engine");
    // On model/transport failure, do not advance the assessment — let the
    // provider retry without losing or corrupting their progress.
    return {
      reply:
        "I ran into a problem on my end. Let's try that again — could you repeat or expand on your last answer?",
      progress: { ...prior, updatedAt: new Date().toISOString() },
    };
  }
}

// ---------------------------------------------------------------------------
// Automated certification evaluation loop
//
// A silent, analysis-only second pass (mirrors the Companion/Monitor split):
// after each training interaction it grades the full interview against the
// provider's rubric and emits a structured verdict. When the verdict is a
// confident pass, the orchestrator promotes the provider 'in_training' ->
// 'certified' in the database and hands back a congratulatory message.
// ---------------------------------------------------------------------------

export interface TrainingEvaluation {
  /** Rubric milestones the provider has clearly demonstrated. */
  criteria_met: string[];
  /** 0-100 overall competence score from the silent evaluator. */
  score_out_of_100: number;
  /** Evaluator's recommendation. Honored only with the safety guards below. */
  certified: boolean;
  /** One-paragraph rationale, surfaced to the provider on certification. */
  feedback_summary: string;
}

// Score the silent evaluator must meet (in addition to certified=true) before
// we auto-promote. Deliberately above the per-topic pass bar — certification is
// a higher bar than "passing a question".
const CERTIFICATION_SCORE_THRESHOLD = 85;

// When the evaluator cannot run (no key, parse failure, transport error) we must
// NEVER auto-certify. Default to a non-certifying verdict so a failure can only
// ever defer certification, never grant it.
const DEFAULT_EVALUATION: TrainingEvaluation = {
  criteria_met: [],
  score_out_of_100: 0,
  certified: false,
  feedback_summary: "Automated competence evaluation is unavailable; certification deferred for manual review.",
};

const trainingEvaluationSchema = {
  type: Type.OBJECT,
  properties: {
    criteria_met: { type: Type.ARRAY, items: { type: Type.STRING } },
    score_out_of_100: { type: Type.NUMBER },
    certified: { type: Type.BOOLEAN },
    feedback_summary: { type: Type.STRING },
  },
  required: ["criteria_met", "score_out_of_100", "certified", "feedback_summary"],
};

function parseTrainingEvaluation(text: string): TrainingEvaluation | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const p = JSON.parse(match[0]);
    const criteria_met = Array.isArray(p.criteria_met)
      ? (p.criteria_met as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
      : [];
    return {
      criteria_met,
      score_out_of_100: clampScore(p.score_out_of_100),
      certified: p.certified === true,
      feedback_summary: typeof p.feedback_summary === "string" ? p.feedback_summary.trim() : "",
    };
  } catch {
    return null;
  }
}

/**
 * Silent background grader. Reviews the full interview transcript against the
 * provider's rubric and returns a structured competence verdict. Never speaks to
 * the provider and never certifies on failure (always falls back to
 * DEFAULT_EVALUATION). Entity-scoped via provider.entityId.
 */
export async function evaluateTrainingCompetence(
  provider: ServiceProvider,
  history: { role: string; content: string }[],
): Promise<TrainingEvaluation> {
  const aiClient = await getAIForEntity(provider.entityId);
  if (!aiClient) {
    log("No Gemini API key set (global or entity-level); certification evaluation deferred", "ai-engine");
    return { ...DEFAULT_EVALUATION };
  }

  const rubric = TRAINING_RUBRICS[provider.type];
  const transcript = buildConversationContext(history)
    .map((m) => `${m.role === "training_agent" || m.role === "assistant" || m.role === "model" ? "Examiner" : "Provider"}: ${m.content}`)
    .join("\n");
  const criteriaList = rubric.topics.map((t) => `- ${t.label}`).join("\n");

  const systemInstruction = `You are a SILENT certification evaluator for the HeyGrand senior-care platform. You NEVER speak to the provider and NEVER produce conversational text — you only output a single structured JSON judgment. You decide whether ${provider.name}, a ${rubric.label}, has demonstrated the competence required to be certified. ${rubric.focus} Hold a strict, safety-first bar: in senior care, an under-qualified provider can put vulnerable people at risk. You are analysis-only.`;

  const prompt = `Required competence criteria for a ${rubric.label}:
${criteriaList}

Full interview transcript:
${transcript || "(no conversation yet)"}

Grade the provider against EVERY required criterion based only on what they actually demonstrated in the transcript. Return ONLY a JSON object with this exact shape:
{
  "criteria_met": ["<labels of criteria the provider has clearly demonstrated>"],
  "score_out_of_100": <integer 0-100 overall competence>,
  "certified": <boolean>,
  "feedback_summary": "<2-3 sentence summary of their readiness and any gaps>"
}
Set "certified" to true ONLY if the provider has clearly demonstrated EVERY required criterion, the overall score is high (85 or above), and there are no unaddressed safety or compliance red flags. When in doubt, do not certify.`;

  try {
    const response = await aiClient.models.generateContent({
      model: getModelName(provider.entityId),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        maxOutputTokens: 400,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: trainingEvaluationSchema,
      },
    });
    // Unparseable output is an evaluator failure, not a pass — defer certification.
    return parseTrainingEvaluation(response.text || "") || { ...DEFAULT_EVALUATION };
  } catch (error) {
    log(`Certification evaluation error: ${error}`, "ai-engine");
    return { ...DEFAULT_EVALUATION };
  }
}

function buildCertificationMessage(provider: ServiceProvider, evaluation: TrainingEvaluation): string {
  const rubric = TRAINING_RUBRICS[provider.type];
  const feedback = evaluation.feedback_summary ? ` ${evaluation.feedback_summary}` : "";
  return `Congratulations, ${provider.name} — you've successfully demonstrated competence as a ${rubric.label}, scoring ${evaluation.score_out_of_100}/100.${feedback} I've forwarded your credentials to the HeyGrand Super-Admin for final environment activation. You'll be cleared to begin as soon as they complete the activation. Wonderful work — the seniors in our care will be in excellent hands with you.`;
}

export interface TrainingInteractionResult {
  /** Message to send the provider — the examiner's next question, or the congratulatory note on certification. */
  reply: string;
  /** Updated interview state — caller persists this to serviceProviders.trainingProgress. */
  progress: TrainingProgress;
  /** Structured verdict from the silent background evaluator. */
  evaluation: TrainingEvaluation;
  /** True when this interaction promoted the provider to 'certified' in the DB. */
  certified: boolean;
}

/**
 * Orchestrates one full training interaction: runs the conversational Training
 * Agent and the silent certification evaluator in parallel, and — when the
 * evaluator returns a confident, high-scoring pass with no outstanding red flags
 * and the provider is currently 'in_training' — auto-promotes them to
 * 'certified' in the database (entity-scoped) and returns a congratulatory
 * message instead of the next question.
 *
 * The status transition is the only DB write performed here; the caller still
 * persists `progress` and appends both turns to training_logs.
 */
export async function runTrainingInteraction(
  provider: ServiceProvider,
  message: string,
  history: { role: string; content: string }[],
): Promise<TrainingInteractionResult> {
  // Evaluate over the transcript INCLUDING the provider's latest message.
  const trimmed = message.trim();
  const evalHistory = trimmed ? [...history, { role: "service_provider", content: trimmed }] : history;

  const [turn, evaluation] = await Promise.all([
    generateTrainingResponse(provider, message, history),
    evaluateTrainingCompetence(provider, evalHistory),
  ]);

  // Auto-certify only when the silent evaluator is confident, the score clears
  // the certification bar, and no safety red flags remain. We do a fast in-memory
  // pre-check on the passed-in status to avoid an unnecessary write, but the
  // authoritative gate is the atomic conditional update below.
  const noRedFlags = turn.progress.redFlags.length === 0;
  const evaluatorPasses =
    evaluation.certified && evaluation.score_out_of_100 >= CERTIFICATION_SCORE_THRESHOLD && noRedFlags;

  let certified = false;
  let reply = turn.reply;

  if (evaluatorPasses && provider.status === "in_training") {
    try {
      // Atomic transition: only flips 'in_training' -> 'certified'. If the row is
      // no longer in_training (concurrent call or stale object), nothing updates
      // and we fall through to the normal training reply — never re-certifying or
      // clobbering a later status like 'approved'.
      const updated = await storage.updateServiceProviderStatusIfCurrent(
        provider.entityId,
        provider.id,
        "in_training",
        "certified",
      );
      certified = !!updated;
    } catch (error) {
      log(`Training certification status update failed: ${error}`, "ai-engine");
    }
    if (certified) {
      reply = buildCertificationMessage(provider, evaluation);
    }
  }

  return { reply, progress: turn.progress, evaluation, certified };
}
