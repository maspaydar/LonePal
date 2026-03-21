import { Router } from "express";
import { storage } from "../../storage";
import bcrypt from "bcryptjs";
import { mobileAuthMiddleware, signMobileToken } from "../../middleware/mobile-auth";
import { mobileLoginSchema, insertUserPreferencesSchema } from "@shared/schema";
import { emergencyService } from "../../services/emergency-service";
import { processResidentResponse, streamCompanionResponse, transcribeAudio, buildConversationContext } from "../../ai-engine";
import { broadcastToClients } from "../../ws-broadcast";
import { log } from "../../index";
import { dailyLogger } from "../../daily-logger";

const router = Router();

router.post("/respond", async (req, res) => {
  try {
    const { residentId, conversationId, message } = req.body;

    if (!residentId || !conversationId || !message) {
      return res.status(400).json({ error: "Missing residentId, conversationId, or message" });
    }

    const resident = await storage.getResident(residentId);
    if (!resident) return res.status(404).json({ error: "Resident not found" });

    await storage.createMessage({ conversationId, role: "user", content: message });

    const pendingCheckIns = emergencyService.getPendingCheckIns();
    for (const pending of pendingCheckIns) {
      if (pending.residentId === residentId) {
        emergencyService.clearPendingCheckIn(pending.alertId);
        dailyLogger.info("mobile-api", `Cleared pending check-in (alert ${pending.alertId}) for resident ${residentId} due to response`);
      }
    }

    const allMessages = await storage.getMessages(conversationId);
    const history = allMessages.map(m => ({ role: m.role, content: m.content }));

    const activeScens = await storage.getActiveScenariosForResident(residentId);
    const activeScenario = activeScens.find(s => s.id === Number(req.body.scenarioId)) || activeScens[0];

    const result = await processResidentResponse(resident, activeScenario?.id || 0, message, history);

    await storage.createMessage({ conversationId, role: "assistant", content: result.aiResponse });

    if (result.isResolved && activeScenario) {
      await storage.resolveActiveScenario(activeScenario.id, "resident_response");
      await storage.updateResidentStatus(residentId, "safe", new Date());
      broadcastToClients({ type: "scenario_resolved", data: { id: activeScenario.id, residentId } });
    } else if (result.shouldEscalate && activeScenario) {
      await storage.updateActiveScenario(activeScenario.id, { status: "staff_alerted" } as any);
      await storage.createAlert({
        entityId: resident.entityId,
        residentId,
        scenarioId: activeScenario.id,
        severity: "critical",
        title: `${resident.preferredName || resident.firstName} needs help`,
        message: `Resident indicated they may need assistance. Last message: "${message}"`,
      });
      broadcastToClients({ type: "alert", data: { residentId, severity: "critical" } });
    }

    res.json({ response: result.aiResponse, isResolved: result.isResolved, conversationId });
  } catch (error) {
    log(`Mobile respond error: ${error}`, "mobile-api");
    res.status(500).json({ error: "Failed to process response" });
  }
});

router.post("/respond-stream", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId, conversationId, message, audioBase64, audioMimeType } = req.body;

    if (!residentId || !conversationId) {
      return res.status(400).json({ error: "Missing residentId or conversationId" });
    }

    let userMessage = message;

    if (audioBase64 && !userMessage) {
      try {
        const resident = await storage.getResident(residentId);
        userMessage = await transcribeAudio(audioBase64, audioMimeType || "audio/m4a", resident?.entityId);
      } catch (err) {
        return res.status(400).json({ error: "Could not understand audio. Please try again." });
      }
    }

    if (!userMessage) {
      return res.status(400).json({ error: "No message or audio provided" });
    }

    const resident = await storage.getResident(residentId);
    if (!resident) return res.status(404).json({ error: "Resident not found" });

    await storage.createMessage({ conversationId, role: "user", content: userMessage });

    const pendingCheckIns = emergencyService.getPendingCheckIns();
    for (const pending of pendingCheckIns) {
      if (pending.residentId === residentId) {
        emergencyService.clearPendingCheckIn(pending.alertId);
        dailyLogger.info("mobile-api", `Cleared pending check-in (alert ${pending.alertId}) for resident ${residentId} due to voice response`);
      }
    }

    const allMessages = await storage.getMessages(conversationId);
    const rawHistory = allMessages.map(m => ({ role: m.role, content: m.content }));
    const history = buildConversationContext(rawHistory);

    const activeScens = await storage.getActiveScenariosForResident(residentId);
    const activeScenario = activeScens.find(s => s.id === Number(req.body.scenarioId)) || activeScens[0];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    res.write(`data: ${JSON.stringify({ type: "transcription", text: userMessage })}\n\n`);

    const result = await streamCompanionResponse(
      resident,
      userMessage,
      history,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`);
      }
    );

    await storage.createMessage({ conversationId, role: "assistant", content: result.fullResponse });

    if (result.shouldEscalate && activeScenario) {
      await storage.updateActiveScenario(activeScenario.id, { status: "staff_alerted" } as any);
      await storage.createAlert({
        entityId: resident.entityId,
        residentId,
        scenarioId: activeScenario.id,
        severity: "critical",
        title: `${resident.preferredName || resident.firstName} needs help`,
        message: `Resident indicated they may need assistance via voice. Last message: "${userMessage}"`,
      });
      broadcastToClients({ type: "alert", data: { residentId, severity: "critical" } });
    } else if (result.isResolved && activeScenario) {
      await storage.resolveActiveScenario(activeScenario.id, "resident_response");
      await storage.updateResidentStatus(residentId, "safe", new Date());
      broadcastToClients({ type: "scenario_resolved", data: { id: activeScenario.id, residentId } });
    }

    res.write(`data: ${JSON.stringify({ type: "done", isResolved: result.isResolved, conversationId })}\n\n`);
    res.end();
  } catch (error) {
    log(`Mobile stream respond error: ${error}`, "mobile-api");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process response" });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Something went wrong" })}\n\n`);
      res.end();
    }
  }
});

router.get("/resident/:id/status", async (req, res) => {
  const resident = await storage.getResident(Number(req.params.id));
  if (!resident) return res.status(404).json({ error: "Resident not found" });

  const activeScens = await storage.getActiveScenariosForResident(resident.id);
  const convs = await storage.getConversations(resident.id);
  const activeConv = convs.find(c => c.isActive);

  res.json({
    status: resident.status,
    activeScenario: activeScens[0] || null,
    activeConversation: activeConv || null,
    name: resident.preferredName || resident.firstName,
  });
});

router.post("/login", async (req, res) => {
  try {
    const parsed = mobileLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid login data", details: parsed.error.flatten() });
    }

    const { anonymousUsername, pin, entityId } = parsed.data;

    const resident = await storage.getResidentByAnonymousUsername(entityId, anonymousUsername);
    if (!resident) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!resident.mobilePin) {
      const hashedPin = await bcrypt.hash(pin, 10);
      await storage.updateResident(resident.id, { mobilePin: hashedPin } as any);
    } else {
      const pinValid = await bcrypt.compare(pin, resident.mobilePin);
      if (!pinValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const placeholderToken = `pending-${Date.now()}`;
    const dbToken = await storage.createMobileToken({
      residentId: resident.id,
      entityId,
      token: placeholderToken,
      isActive: true,
      expiresAt,
    });

    const tokenPayload = { residentId: resident.id, entityId, tokenId: dbToken.id };
    const jwtToken = signMobileToken(tokenPayload, "30d");

    await storage.updateMobileTokenValue(dbToken.id, jwtToken);

    log(`Mobile login: ${resident.anonymousUsername} (entity ${entityId})`, "mobile");
    dailyLogger.info("mobile", `Resident ${resident.anonymousUsername} logged in via mobile`, { entityId });

    res.json({
      token: jwtToken,
      expiresAt: expiresAt.toISOString(),
      resident: {
        id: resident.id,
        anonymousUsername: resident.anonymousUsername,
        preferredName: resident.preferredName || resident.firstName,
        entityId: resident.entityId,
        status: resident.status,
      },
    });
  } catch (error: any) {
    log(`Mobile login error: ${error?.stack || error}`, "mobile");
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", mobileAuthMiddleware, async (req, res) => {
  try {
    const token = req.headers.authorization!.slice(7);
    const dbToken = await storage.getMobileTokenByToken(token);
    if (dbToken) {
      await storage.deactivateMobileToken(dbToken.id);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Logout failed" });
  }
});

router.get("/sync/:entityId/:userId", mobileAuthMiddleware, async (req, res) => {
  try {
    const entityId = parseInt(req.params.entityId as string);
    const userId = parseInt(req.params.userId as string);

    if (req.mobileAuth!.residentId !== userId || req.mobileAuth!.entityId !== entityId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const resident = await storage.getResident(userId);
    if (!resident || resident.entityId !== entityId) {
      return res.status(404).json({ error: "Resident not found" });
    }

    const recentMessages = await storage.getLatestConversationMessages(userId, 1);
    const lastAIMessage = recentMessages.find(m => m.role === "assistant") || null;
    const broadcasts = await storage.getCommunityBroadcasts(entityId, 5);
    const activeScenarios = await storage.getActiveScenariosForResident(userId);

    res.json({
      syncedAt: new Date().toISOString(),
      resident: {
        id: resident.id,
        anonymousUsername: resident.anonymousUsername,
        preferredName: resident.preferredName || resident.firstName,
        status: resident.status,
        lastActivityAt: resident.lastActivityAt,
      },
      lastAIMessage: lastAIMessage ? { id: lastAIMessage.id, content: lastAIMessage.content, createdAt: lastAIMessage.createdAt } : null,
      safetyStatus: {
        current: resident.status,
        activeScenarios: activeScenarios.length,
        hasActiveAlert: activeScenarios.some(s => s.status === "active" || s.status === "escalated"),
      },
      announcements: broadcasts.map(b => ({ id: b.id, senderName: b.senderName, message: b.message, createdAt: b.createdAt })),
    });
  } catch (error: any) {
    log(`Mobile sync error: ${error?.stack || error}`, "mobile");
    res.status(500).json({ error: "Sync failed" });
  }
});

router.get("/profile", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId } = req.mobileAuth!;
    const resident = await storage.getResident(residentId);
    if (!resident) {
      return res.status(404).json({ error: "Resident not found" });
    }
    res.json({
      id: resident.id,
      anonymousUsername: resident.anonymousUsername,
      preferredName: resident.preferredName || resident.firstName,
      roomNumber: resident.roomNumber,
      status: resident.status,
      entityId: resident.entityId,
      lastActivityAt: resident.lastActivityAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to load profile" });
  }
});

router.post("/conversation", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId, entityId } = req.mobileAuth!;
    const resident = await storage.getResident(residentId);
    if (!resident || resident.entityId !== entityId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existing = await storage.getConversations(residentId);
    const activeConv = existing.find(c => c.isActive && !c.scenarioId);
    if (activeConv) {
      return res.json(activeConv);
    }

    const conversation = await storage.createConversation({
      entityId,
      residentId,
      title: `Companion Chat - ${new Date().toLocaleString()}`,
      isActive: true,
    });
    res.json(conversation);
  } catch (error) {
    log(`Mobile create conversation error: ${error}`, "mobile");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

router.get("/preferences", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId } = req.mobileAuth!;
    const prefs = await storage.getUserPreferences(residentId);
    if (!prefs) {
      return res.json({
        residentId,
        aiVerbosity: "medium",
        quietHoursStart: null,
        quietHoursEnd: null,
        preferredVoiceTone: "nurturing",
      });
    }
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

router.post("/preferences", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId, entityId } = req.mobileAuth!;
    const { aiVerbosity, quietHoursStart, quietHoursEnd, preferredVoiceTone } = req.body;

    const parsed = insertUserPreferencesSchema.parse({
      residentId,
      entityId,
      aiVerbosity: aiVerbosity || "medium",
      quietHoursStart: quietHoursStart || null,
      quietHoursEnd: quietHoursEnd || null,
      preferredVoiceTone: preferredVoiceTone || "nurturing",
    });

    const prefs = await storage.upsertUserPreferences(parsed);
    dailyLogger.info("mobile", `Preferences updated for resident ${residentId}`, { residentId, entityId });
    res.json(prefs);
  } catch (error: any) {
    if (error.name === "ZodError") return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: "Failed to save preferences" });
  }
});

router.post("/pair", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId, entityId } = req.mobileAuth!;
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Pairing code is required" });

    const pairingCode = await storage.getDevicePairingCode(code.toUpperCase());
    if (!pairingCode) return res.status(404).json({ error: "Invalid pairing code" });
    if (pairingCode.isUsed) return res.status(400).json({ error: "Pairing code already used" });
    if (new Date(pairingCode.expiresAt) < new Date()) return res.status(400).json({ error: "Pairing code expired" });
    if (pairingCode.entityId !== entityId) return res.status(403).json({ error: "Pairing code belongs to a different facility" });

    await storage.markPairingCodeUsed(pairingCode.id, residentId);
    await storage.updateResident(residentId, { unitId: pairingCode.unitId });

    const unit = await storage.getUnit(pairingCode.unitId);
    dailyLogger.info("pairing", `Resident ${residentId} paired to unit ${unit?.unitIdentifier}`, { residentId, entityId, unitId: pairingCode.unitId });

    res.json({
      paired: true,
      unitId: pairingCode.unitId,
      unitIdentifier: unit?.unitIdentifier,
      smartSpeakerId: unit?.smartSpeakerId,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to pair device" });
  }
});

export default router;
