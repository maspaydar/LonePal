import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { storage } from "../storage";
import { personaService } from "./persona-service";
import { getEntityPath, provisionEntityFolder } from "../tenant-folders";
import { dailyLogger } from "../daily-logger";
import type { Conversation, Message } from "@shared/schema";

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

interface ChatResult {
  conversationId: number;
  userMessage: Message;
  assistantMessage: Message;
  response: string;
}

function formatHistoryForGemini(messages: Message[]): { role: string; parts: { text: string }[] }[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

function getConversationFilePath(entityId: number, residentId: number, conversationId: number): string {
  return path.join(getEntityPath(entityId, "conversations"), `resident_${residentId}_conv_${conversationId}.json`);
}

function persistConversationToFile(
  entityId: number,
  residentId: number,
  conversationId: number,
  messages: Message[],
): void {
  try {
    provisionEntityFolder(entityId);
    const filePath = getConversationFilePath(entityId, residentId, conversationId);
    const data = {
      conversationId,
      residentId,
      entityId,
      lastUpdated: new Date().toISOString(),
      messageCount: messages.length,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.createdAt,
      })),
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    dailyLogger.warn("chat", `Failed to persist conversation file: ${err}`);
  }
}

async function generateFallbackResponse(residentName: string, userMessage: string): Promise<string> {
  const greetings = ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"];
  const isGreeting = greetings.some((g) => userMessage.toLowerCase().startsWith(g));

  if (isGreeting) {
    return `Hello ${residentName}! It's so good to hear from you. How are you doing today?`;
  }
  return `That's really interesting, ${residentName}. I'd love to hear more about that. What else is on your mind today?`;
}

export const chatService = {
  async chat(entityId: number, residentId: number, userMessage: string): Promise<ChatResult> {
    const resident = await storage.getResident(residentId);
    if (!resident) {
      throw new Error(`Resident ${residentId} not found`);
    }
    if (resident.entityId !== entityId) {
      throw new Error(`Resident ${residentId} does not belong to entity ${entityId}`);
    }

    const systemPrompt = personaService.generateSystemPrompt(resident, entityId);

    let conversation = await storage.getActiveConversationForResident(entityId, residentId);
    if (!conversation) {
      const name = resident.preferredName || resident.firstName;
      conversation = await storage.createConversation({
        entityId,
        residentId,
        title: `Companion Chat with ${name}`,
        isActive: true,
      });
      dailyLogger.info("chat", `Created new conversation ${conversation.id} for resident ${residentId}`, { entityId });
    }

    const recentMessages = await storage.getRecentMessages(conversation.id, 20);

    const savedUserMsg = await storage.createMessage({
      conversationId: conversation.id,
      role: "user",
      content: userMessage,
    });

    let responseText: string;
    const ai = getAI();

    if (ai) {
      try {
        const history = formatHistoryForGemini(recentMessages);

        const chat = ai.chats.create({
          model: "gemini-2.0-flash",
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.8,
            maxOutputTokens: 500,
          },
          history,
        });

        const result = await chat.sendMessage({ message: userMessage });
        responseText = result.text || "I'm here for you. Could you tell me a bit more?";

        dailyLogger.info("chat", `Gemini response generated for resident ${residentId}`, {
          entityId,
          conversationId: conversation.id,
          responseLength: responseText.length,
        });
      } catch (err) {
        dailyLogger.error("chat", `Gemini call failed, using fallback: ${err}`);
        const name = resident.preferredName || resident.firstName;
        responseText = await generateFallbackResponse(name, userMessage);
      }
    } else {
      dailyLogger.info("chat", "No GEMINI_API_KEY set, using fallback response");
      const name = resident.preferredName || resident.firstName;
      responseText = await generateFallbackResponse(name, userMessage);
    }

    const savedAssistantMsg = await storage.createMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: responseText,
    });

    const allMessages = await storage.getMessages(conversation.id);
    persistConversationToFile(entityId, residentId, conversation.id, allMessages);

    return {
      conversationId: conversation.id,
      userMessage: savedUserMsg,
      assistantMessage: savedAssistantMsg,
      response: responseText,
    };
  },

  async getConversationHistory(entityId: number, residentId: number): Promise<{
    conversation: Conversation | null;
    messages: Message[];
  }> {
    const conversation = await storage.getActiveConversationForResident(entityId, residentId);
    if (!conversation) {
      return { conversation: null, messages: [] };
    }
    const messages = await storage.getMessages(conversation.id);
    return { conversation, messages };
  },
};
