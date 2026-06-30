import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { getEntityPath, provisionEntityFolder } from "../tenant-folders";
import { dailyLogger } from "../daily-logger";
import { storage } from "../storage";

export interface DigitalTwinBiography {
  lifeMilestones: {
    event: string;
    approximateYear: string;
    emotionalSignificance: string;
  }[];
  formerProfession: {
    title: string;
    industry: string;
    yearsActive: string;
    keySkills: string[];
    proudestAchievement: string;
  };
  communicationDNA: {
    preferredTone: string;
    vocabularyLevel: string;
    conversationPace: string;
    humorStyle: string;
    topicsTheyInitiate: string[];
    phrasesTheyUse: string[];
    communicationWarnings: string[];
  };
  nostalgicTriggers: {
    trigger: string;
    context: string;
    emotionalResponse: string;
  }[];
  personalitySnapshot: {
    socialStyle: string;
    decisionMakingStyle: string;
    stressResponse: string;
    motivators: string[];
    values: string[];
  };
  interactionGuidelines: {
    greetingStyle: string;
    topicsToAvoid: string[];
    topicsToEncourage: string[];
    escalationCues: string[];
    comfortPhrases: string[];
  };
}

const BIOGRAPHY_PROMPT = `You are an expert geriatric care psychologist and AI persona designer. 
You are processing a transcript from a 2-hour intake interview with a senior resident at an assisted living facility.

Your job is to extract a structured "Digital Twin Biography" that will power an AI companion persona for this resident.

Analyze the transcript carefully and produce a JSON object with EXACTLY this structure:

{
  "lifeMilestones": [
    { "event": "description of key life event", "approximateYear": "year or decade", "emotionalSignificance": "why this matters to them" }
  ],
  "formerProfession": {
    "title": "their job title or role",
    "industry": "field they worked in",
    "yearsActive": "approximate years",
    "keySkills": ["skill1", "skill2"],
    "proudestAchievement": "what they are most proud of professionally"
  },
  "communicationDNA": {
    "preferredTone": "warm/formal/casual/direct etc",
    "vocabularyLevel": "simple/moderate/sophisticated",
    "conversationPace": "slow/moderate/quick",
    "humorStyle": "dry/playful/none/sarcastic etc",
    "topicsTheyInitiate": ["topic1", "topic2"],
    "phrasesTheyUse": ["phrase1", "phrase2"],
    "communicationWarnings": ["things to be careful about in conversation"]
  },
  "nostalgicTriggers": [
    { "trigger": "specific memory or topic", "context": "background on why", "emotionalResponse": "positive/bittersweet/avoid" }
  ],
  "personalitySnapshot": {
    "socialStyle": "introvert/extrovert/ambivert",
    "decisionMakingStyle": "description",
    "stressResponse": "how they handle stress",
    "motivators": ["what drives them"],
    "values": ["core values"]
  },
  "interactionGuidelines": {
    "greetingStyle": "how to greet them",
    "topicsToAvoid": ["sensitive topics"],
    "topicsToEncourage": ["topics that light them up"],
    "escalationCues": ["phrases or behaviors that indicate distress"],
    "comfortPhrases": ["things that calm or reassure them"]
  }
}

IMPORTANT RULES:
- Extract ONLY what is supported by the transcript. Do not invent details.
- If information is not available for a field, use reasonable defaults or mark as "not disclosed".
- Life milestones should be ordered chronologically.
- Communication DNA should capture how they ACTUALLY speak, not how you think they should.
- Nostalgic triggers are critical for the AI companion to build rapport.
- Return ONLY the JSON object, no markdown fencing, no explanation.`;

function getPlaceholderBiography(transcript: string): DigitalTwinBiography {
  const words = transcript.split(/\s+/);
  const nameMatch = transcript.match(/(?:my name is|I'm|I am)\s+(\w+)/i);
  const name = nameMatch ? nameMatch[1] : "Resident";

  return {
    lifeMilestones: [
      { event: "Details to be extracted from full AI processing", approximateYear: "N/A", emotionalSignificance: "Pending AI analysis" },
    ],
    formerProfession: {
      title: "Not yet processed",
      industry: "Pending",
      yearsActive: "Pending",
      keySkills: ["To be determined"],
      proudestAchievement: "Pending AI analysis",
    },
    communicationDNA: {
      preferredTone: "warm",
      vocabularyLevel: "moderate",
      conversationPace: "moderate",
      humorStyle: "gentle",
      topicsTheyInitiate: ["general conversation"],
      phrasesTheyUse: [],
      communicationWarnings: ["Transcript processed without AI - review required"],
    },
    nostalgicTriggers: [],
    personalitySnapshot: {
      socialStyle: "ambivert",
      decisionMakingStyle: "thoughtful",
      stressResponse: "seeks reassurance",
      motivators: ["connection", "comfort"],
      values: ["family", "independence"],
    },
    interactionGuidelines: {
      greetingStyle: `Hello ${name}, how are you today?`,
      topicsToAvoid: [],
      topicsToEncourage: ["daily activities", "memories"],
      escalationCues: ["silence", "confusion", "distress"],
      comfortPhrases: ["You're doing great", "Take your time"],
    },
  };
}

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

export const intakeService = {
  async buildDigitalTwin(transcript: string, entityId?: number, residentId?: number): Promise<DigitalTwinBiography> {
    dailyLogger.info("intake", "Starting Digital Twin biography build", {
      transcriptLength: transcript.length,
      entityId,
      residentId,
    });

    let biography: DigitalTwinBiography;

    const aiClient = getAI();
    if (!aiClient) {
      dailyLogger.warn("intake", "GEMINI_API_KEY not set, using placeholder biography");
      biography = getPlaceholderBiography(transcript);
    } else {
      try {
        const response = await aiClient.models.generateContent({
          model: "gemini-1.5-flash",
          contents: [
            {
              role: "user",
              parts: [{ text: `${BIOGRAPHY_PROMPT}\n\n--- BEGIN TRANSCRIPT ---\n${transcript}\n--- END TRANSCRIPT ---` }],
            },
          ],
          config: {
            maxOutputTokens: 4096,
            temperature: 0.3,
          },
        });

        const text = response.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          dailyLogger.error("intake", "AI response did not contain valid JSON", { responsePreview: text.substring(0, 200) });
          biography = getPlaceholderBiography(transcript);
        } else {
          biography = JSON.parse(jsonMatch[0]) as DigitalTwinBiography;
          dailyLogger.info("intake", "Successfully parsed AI-generated biography", {
            milestones: biography.lifeMilestones?.length || 0,
            triggers: biography.nostalgicTriggers?.length || 0,
          });
        }
      } catch (error) {
        dailyLogger.error("intake", `AI processing failed: ${error}`);
        biography = getPlaceholderBiography(transcript);
      }
    }

    if (entityId && residentId) {
      await this.persistBiography(entityId, residentId, biography);
    }

    if (residentId) {
      try {
        const resident = await storage.getResident(residentId);
        if (resident) {
          const persona = {
            tone: biography.communicationDNA.preferredTone,
            topics: biography.communicationDNA.topicsTheyInitiate,
            avoidTopics: biography.interactionGuidelines.topicsToAvoid,
            greeting: biography.interactionGuidelines.greetingStyle,
          };
          await storage.updateResident(residentId, {
            digitalTwinPersona: persona,
            intakeInterviewData: biography as any,
          });
          dailyLogger.info("intake", `Updated resident ${residentId} with Digital Twin persona`, { residentId });
        }
      } catch (error) {
        dailyLogger.error("intake", `Failed to update resident record: ${error}`, { residentId });
      }
    }

    return biography;
  },

  async persistBiography(entityId: number, residentId: number, biography: DigitalTwinBiography): Promise<string> {
    provisionEntityFolder(entityId);
    const profilesDir = getEntityPath(entityId, "profiles");
    const filename = `resident_${residentId}_biography.json`;
    const filePath = path.join(profilesDir, filename);

    const fileContent = {
      residentId,
      entityId,
      generatedAt: new Date().toISOString(),
      biography,
    };

    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2), "utf-8");
    dailyLogger.info("intake", `Biography persisted to ${filePath}`, { entityId, residentId });
    return filePath;
  },

  async loadBiography(entityId: number, residentId: number): Promise<DigitalTwinBiography | null> {
    const profilesDir = getEntityPath(entityId, "profiles");
    const filePath = path.join(profilesDir, `resident_${residentId}_biography.json`);

    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      return parsed.biography as DigitalTwinBiography;
    } catch {
      return null;
    }
  },
};
