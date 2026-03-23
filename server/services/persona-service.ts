import fs from "fs";
import path from "path";
import { getEntityPath } from "../tenant-folders";
import { dailyLogger } from "../daily-logger";
import type { Resident } from "@shared/schema";
import type { DigitalTwinBiography } from "./intake-service";

interface BiographyFile {
  residentId: number;
  entityId: number;
  generatedAt: string;
  biography: DigitalTwinBiography;
}

function loadBiographyFromFile(entityId: number, residentId: number): DigitalTwinBiography | null {
  try {
    const filePath = path.join(getEntityPath(entityId, "profiles"), `resident_${residentId}_biography.json`);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed: BiographyFile = JSON.parse(raw);
    return parsed.biography;
  } catch (err) {
    dailyLogger.warn("persona", `Failed to load biography file for entity=${entityId} resident=${residentId}: ${err}`);
    return null;
  }
}

function buildSystemPrompt(resident: Resident, biography: DigitalTwinBiography | null): string {
  const name = resident.preferredName || resident.firstName;
  const commDNA = biography?.communicationDNA;
  const personality = biography?.personalitySnapshot;
  const guidelines = biography?.interactionGuidelines;
  const milestones = biography?.lifeMilestones || [];
  const triggers = biography?.nostalgicTriggers || [];
  const profession = biography?.formerProfession;

  let prompt = `You are a warm, caring AI companion acting as a lifelong friend to ${name}. `;
  prompt += `You are part of the HeyGrand safety system at a senior living facility. `;
  prompt += `Your role is to have natural, comforting conversations that feel like talking with an old, trusted friend.\n\n`;

  prompt += `## Core Identity\n`;
  prompt += `- You are NOT a medical professional, therapist, or authority figure.\n`;
  prompt += `- You are a patient, empathetic friend who genuinely cares about ${name}.\n`;
  prompt += `- You remember details from past conversations and reference them naturally.\n`;
  prompt += `- You never rush, never judge, and always validate ${name}'s feelings.\n\n`;

  if (commDNA) {
    prompt += `## Communication Style (match this exactly)\n`;
    prompt += `- Preferred tone: ${commDNA.preferredTone}\n`;
    prompt += `- Vocabulary level: ${commDNA.vocabularyLevel}\n`;
    prompt += `- Conversation pace: ${commDNA.conversationPace}\n`;
    prompt += `- Humor style: ${commDNA.humorStyle}\n`;
    if (commDNA.phrasesTheyUse.length > 0) {
      prompt += `- Phrases ${name} uses (mirror these occasionally): ${commDNA.phrasesTheyUse.join(", ")}\n`;
    }
    if (commDNA.communicationWarnings.length > 0) {
      prompt += `- Communication warnings: ${commDNA.communicationWarnings.join("; ")}\n`;
    }
    prompt += `\n`;
  }

  if (personality) {
    prompt += `## Personality Understanding\n`;
    prompt += `- Social style: ${personality.socialStyle}\n`;
    prompt += `- Decision-making: ${personality.decisionMakingStyle}\n`;
    prompt += `- Under stress: ${personality.stressResponse}\n`;
    prompt += `- Motivated by: ${personality.motivators.join(", ")}\n`;
    prompt += `- Core values: ${personality.values.join(", ")}\n\n`;
  }

  if (profession) {
    prompt += `## Life Background\n`;
    prompt += `- Former profession: ${profession.title} in ${profession.industry} (${profession.yearsActive})\n`;
    prompt += `- Proudest achievement: ${profession.proudestAchievement}\n\n`;
  }

  if (milestones.length > 0) {
    prompt += `## Key Life Milestones (reference these naturally when relevant)\n`;
    for (const m of milestones) {
      prompt += `- ${m.event} (~${m.approximateYear}): ${m.emotionalSignificance}\n`;
    }
    prompt += `\n`;
  }

  if (triggers.length > 0) {
    prompt += `## Nostalgic Triggers (topics that bring joy)\n`;
    for (const t of triggers) {
      prompt += `- "${t.trigger}": ${t.context} — emotional response: ${t.emotionalResponse}\n`;
    }
    prompt += `\n`;
  }

  if (guidelines) {
    prompt += `## Interaction Guidelines\n`;
    prompt += `- Greeting style: ${guidelines.greetingStyle}\n`;
    if (guidelines.topicsToEncourage.length > 0) {
      prompt += `- Topics to encourage: ${guidelines.topicsToEncourage.join(", ")}\n`;
    }
    if (guidelines.topicsToAvoid.length > 0) {
      prompt += `- Topics to AVOID (never bring these up): ${guidelines.topicsToAvoid.join(", ")}\n`;
    }
    if (guidelines.comfortPhrases.length > 0) {
      prompt += `- Comfort phrases to use when ${name} seems upset: ${guidelines.comfortPhrases.join("; ")}\n`;
    }
    if (guidelines.escalationCues.length > 0) {
      prompt += `- Escalation cues (if you detect these, gently ask if they need help): ${guidelines.escalationCues.join(", ")}\n`;
    }
    prompt += `\n`;
  }

  if (resident.communicationStyle) {
    prompt += `## Additional Notes\n`;
    prompt += `- Communication style notes: ${resident.communicationStyle}\n\n`;
  }

  prompt += `## Response Rules\n`;
  prompt += `- Keep responses concise (2-4 sentences typically, unless ${name} wants a longer conversation).\n`;
  prompt += `- Use warm, natural language — not clinical or robotic.\n`;
  prompt += `- Ask gentle follow-up questions to keep the conversation going.\n`;
  prompt += `- If ${name} mentions feeling unwell, in pain, or distressed, acknowledge it compassionately and suggest they let staff know.\n`;
  prompt += `- Never diagnose, prescribe, or give medical advice.\n`;
  prompt += `- If ${name} seems confused or disoriented, respond calmly and redirect to a comforting topic.\n`;

  return prompt;
}

export const personaService = {
  generateSystemPrompt(resident: Resident, entityId: number): string {
    const biography = loadBiographyFromFile(entityId, resident.id);

    const dbPersona = resident.digitalTwinPersona as DigitalTwinBiography | null;
    const effectiveBiography = biography || dbPersona || null;

    const systemPrompt = buildSystemPrompt(resident, effectiveBiography);

    dailyLogger.info("persona", `Generated system prompt for resident ${resident.id}`, {
      entityId,
      residentId: resident.id,
      hasBiographyFile: !!biography,
      hasDbPersona: !!dbPersona,
      promptLength: systemPrompt.length,
    });

    return systemPrompt;
  },

  loadBiography(entityId: number, residentId: number): DigitalTwinBiography | null {
    return loadBiographyFromFile(entityId, residentId);
  },
};
