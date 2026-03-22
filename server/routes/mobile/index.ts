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

/**
 * POST /api/mobile/respond
 * Auth: mobileAuthMiddleware (resident JWT required)
 * Tenant scope: residentId from JWT; body residentId must match JWT claim.
 * Processes a resident's text message through the AI companion.
 */
router.post("/respond", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId: jwtResidentId, entityId: jwtEntityId } = req.mobileUser!;
    const { conversationId, message } = req.body;

    if (!conversationId || !message) {
      return res.status(400).json({ error: "Missing conversationId or message" });
    }

    const bodyResidentId = Number(req.body.residentId);
    if (bodyResidentId && bodyResidentId !== jwtResidentId) {
      return res.status(403).json({ error: "residentId does not match authenticated token" });
    }

    const resident = await storage.getResident(jwtResidentId);
    if (!resident) return res.status(404).json({ error: "Resident not found" });
    if (resident.entityId !== jwtEntityId) return res.status(403).json({ error: "Access denied" });

    const conv = await storage.getConversation(Number(conversationId));
    if (!conv || conv.residentId !== jwtResidentId) {
      return res.status(403).json({ error: "Conversation not found or access denied" });
    }

    await storage.createMessage({ conversationId: conv.id, role: "user", content: message });

    const pendingCheckIns = emergencyService.getPendingCheckIns();
    for (const pending of pendingCheckIns) {
      if (pending.residentId === jwtResidentId) {
        emergencyService.clearPendingCheckIn(pending.alertId);
        dailyLogger.info("mobile-api", `Cleared pending check-in (alert ${pending.alertId}) for resident ${jwtResidentId} due to response`);
      }
    }

    const allMessages = await storage.getMessages(conv.id);
    const history = allMessages.map(m => ({ role: m.role, content: m.content }));

    const activeScens = await storage.getActiveScenariosForResident(jwtResidentId);
    const activeScenario = activeScens.find(s => s.id === Number(req.body.scenarioId)) || activeScens[0];

    const result = await processResidentResponse(resident, activeScenario?.id || 0, message, history);

    await storage.createMessage({ conversationId: conv.id, role: "assistant", content: result.aiResponse });

    if (result.isResolved && activeScenario) {
      await storage.resolveActiveScenario(activeScenario.id, "resident_response");
      await storage.updateResidentStatus(jwtResidentId, "safe", new Date());
      broadcastToClients({ type: "scenario_resolved", data: { id: activeScenario.id, residentId: jwtResidentId } });
    } else if (result.shouldEscalate && activeScenario) {
      await storage.updateActiveScenario(activeScenario.id, { status: "staff_alerted" } as any);
      await storage.createAlert({
        entityId: resident.entityId,
        residentId: jwtResidentId,
        scenarioId: activeScenario.id,
        severity: "critical",
        title: `${resident.preferredName || resident.firstName} needs help`,
        message: `Resident indicated they may need assistance. Last message: "${message}"`,
      });
      broadcastToClients({ type: "alert", data: { residentId: jwtResidentId, severity: "critical" } });
    }

    res.json({ response: result.aiResponse, isResolved: result.isResolved, conversationId: conv.id });
  } catch (error) {
    log(`Mobile respond error: ${error}`, "mobile-api");
    res.status(500).json({ error: "Failed to process response" });
  }
});

/**
 * POST /api/mobile/respond-stream
 * Auth: mobileAuthMiddleware (resident JWT required)
 * Tenant scope: residentId from JWT; body residentId must match JWT claim.
 * Streams the AI companion response as server-sent events.
 */
router.post("/respond-stream", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId: jwtResidentId, entityId: jwtEntityId } = req.mobileUser!;
    const { conversationId, message, audioBase64, audioMimeType } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: "Missing conversationId" });
    }

    const bodyResidentId = Number(req.body.residentId);
    if (bodyResidentId && bodyResidentId !== jwtResidentId) {
      return res.status(403).json({ error: "residentId does not match authenticated token" });
    }

    let userMessage = message;

    if (audioBase64 && !userMessage) {
      try {
        const resident = await storage.getResident(jwtResidentId);
        userMessage = await transcribeAudio(audioBase64, audioMimeType || "audio/m4a", resident?.entityId);
      } catch (err) {
        return res.status(400).json({ error: "Could not understand audio. Please try again." });
      }
    }

    if (!userMessage) {
      return res.status(400).json({ error: "No message or audio provided" });
    }

    const resident = await storage.getResident(jwtResidentId);
    if (!resident) return res.status(404).json({ error: "Resident not found" });
    if (resident.entityId !== jwtEntityId) return res.status(403).json({ error: "Access denied" });

    const conv = await storage.getConversation(Number(conversationId));
    if (!conv || conv.residentId !== jwtResidentId) {
      return res.status(403).json({ error: "Conversation not found or access denied" });
    }

    await storage.createMessage({ conversationId: conv.id, role: "user", content: userMessage });

    const pendingCheckIns = emergencyService.getPendingCheckIns();
    for (const pending of pendingCheckIns) {
      if (pending.residentId === jwtResidentId) {
        emergencyService.clearPendingCheckIn(pending.alertId);
        dailyLogger.info("mobile-api", `Cleared pending check-in (alert ${pending.alertId}) for resident ${jwtResidentId} due to voice response`);
      }
    }

    const allMessages = await storage.getMessages(conv.id);
    const rawHistory = allMessages.map(m => ({ role: m.role, content: m.content }));
    const history = buildConversationContext(rawHistory);

    const activeScens = await storage.getActiveScenariosForResident(jwtResidentId);
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

    await storage.createMessage({ conversationId: conv.id, role: "assistant", content: result.fullResponse });

    if (result.shouldEscalate && activeScenario) {
      await storage.updateActiveScenario(activeScenario.id, { status: "staff_alerted" } as any);
      await storage.createAlert({
        entityId: resident.entityId,
        residentId: jwtResidentId,
        scenarioId: activeScenario.id,
        severity: "critical",
        title: `${resident.preferredName || resident.firstName} needs help`,
        message: `Resident indicated they may need assistance via voice. Last message: "${userMessage}"`,
      });
      broadcastToClients({ type: "alert", data: { residentId: jwtResidentId, severity: "critical" } });
    } else if (result.isResolved && activeScenario) {
      await storage.resolveActiveScenario(activeScenario.id, "resident_response");
      await storage.updateResidentStatus(jwtResidentId, "safe", new Date());
      broadcastToClients({ type: "scenario_resolved", data: { id: activeScenario.id, residentId: jwtResidentId } });
    }

    res.write(`data: ${JSON.stringify({ type: "done", isResolved: result.isResolved, conversationId: conv.id })}\n\n`);
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

/**
 * GET /api/mobile/resident/:id/status
 * Auth: mobileAuthMiddleware (resident JWT required)
 * Tenant scope: :id must match the residentId in the JWT — residents can only query their own status.
 */
router.get("/resident/:id/status", mobileAuthMiddleware, async (req, res) => {
  const { residentId: jwtResidentId, entityId: jwtEntityId } = req.mobileUser!;
  const requestedId = Number(req.params.id);

  if (requestedId !== jwtResidentId) {
    return res.status(403).json({ error: "Access denied" });
  }

  const resident = await storage.getResident(jwtResidentId);
  if (!resident || resident.entityId !== jwtEntityId) {
    return res.status(404).json({ error: "Resident not found" });
  }

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

/**
 * POST /api/mobile/login
 * Auth: none (public — issues a mobile JWT on successful PIN verification)
 * Validates entityId, anonymous username, and PIN. Returns a 30-day JWT token.
 */
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

/**
 * POST /api/mobile/logout
 * Auth: mobileAuthMiddleware (resident JWT required)
 * Revokes the current mobile token in the database.
 */
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

/**
 * GET /api/mobile/sync/:entityId/:userId
 * Auth: mobileAuthMiddleware (resident JWT required)
 * Tenant scope: entityId and userId in URL must match JWT claims exactly.
 * Returns resident data, last AI message, safety status, and announcements.
 */
router.get("/sync/:entityId/:userId", mobileAuthMiddleware, async (req, res) => {
  try {
    const entityId = parseInt(req.params.entityId as string);
    const userId = parseInt(req.params.userId as string);

    if (req.mobileUser!.residentId !== userId || req.mobileUser!.entityId !== entityId) {
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

/**
 * GET /api/mobile/me
 * Auth: mobileAuthMiddleware (resident JWT required)
 * Tenant scope: all data scoped to the residentId and entityId from the JWT.
 * Returns the authenticated resident's full profile, unit info, sensor pairing status,
 * and preferences — useful for the mobile app's home/bootstrap screen.
 */
router.get("/me", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId, entityId } = req.mobileUser!;

    const resident = await storage.getResident(residentId);
    if (!resident || resident.entityId !== entityId) {
      return res.status(404).json({ error: "Resident not found" });
    }

    let unit: { id: number; unitIdentifier: string; label: string | null; floor: string | null; hardwareType: string; smartSpeakerId: string | null; esp32DeviceMac: string | null } | null = null;
    let sensors: { id: number; sensorType: string; location: string; isActive: boolean }[] = [];
    let isPaired = false;

    if (resident.unitId) {
      const unitData = await storage.getUnit(resident.unitId);
      if (unitData && unitData.entityId === entityId) {
        unit = {
          id: unitData.id,
          unitIdentifier: unitData.unitIdentifier,
          label: unitData.label,
          floor: unitData.floor,
          hardwareType: unitData.hardwareType,
          smartSpeakerId: unitData.smartSpeakerId,
          esp32DeviceMac: unitData.esp32DeviceMac,
        };
        isPaired = true;
        const unitSensors = await storage.getSensorsByUnit(unitData.id);
        sensors = unitSensors.map(s => ({
          id: s.id,
          sensorType: s.sensorType,
          location: s.location,
          isActive: s.isActive,
        }));
      }
    }

    const preferences = await storage.getUserPreferences(residentId);

    res.json({
      resident: {
        id: resident.id,
        anonymousUsername: resident.anonymousUsername,
        preferredName: resident.preferredName || resident.firstName,
        firstName: resident.firstName,
        lastName: resident.lastName,
        roomNumber: resident.roomNumber,
        status: resident.status,
        entityId: resident.entityId,
        lastActivityAt: resident.lastActivityAt,
      },
      unit,
      isPaired,
      sensors,
      preferences: preferences || {
        aiVerbosity: "medium",
        quietHoursStart: null,
        quietHoursEnd: null,
        preferredVoiceTone: "nurturing",
      },
    });
  } catch (error: any) {
    log(`Mobile /me error: ${error}`, "mobile-api");
    res.status(500).json({ error: "Failed to load profile" });
  }
});

/**
 * GET /api/mobile/profile
 * Auth: mobileAuthMiddleware (resident JWT required)
 * Tenant scope: residentId from JWT.
 * Returns basic resident profile. Use GET /me for full profile with unit and preferences.
 */
router.get("/profile", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId, entityId } = req.mobileUser!;
    const resident = await storage.getResident(residentId);
    if (!resident || resident.entityId !== entityId) {
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

/**
 * POST /api/mobile/conversation
 * Auth: mobileAuthMiddleware (resident JWT required)
 * Tenant scope: residentId and entityId from JWT; resident's entityId verified against JWT.
 * Returns existing active conversation or creates a new one.
 */
router.post("/conversation", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId, entityId } = req.mobileUser!;
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

/**
 * GET /api/mobile/preferences
 * Auth: mobileAuthMiddleware (resident JWT required)
 * Tenant scope: residentId from JWT.
 */
router.get("/preferences", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId } = req.mobileUser!;
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

/**
 * POST /api/mobile/preferences
 * Auth: mobileAuthMiddleware (resident JWT required)
 * Tenant scope: residentId and entityId from JWT — body values are ignored in favor of JWT claims.
 */
router.post("/preferences", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId, entityId } = req.mobileUser!;
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

/**
 * POST /api/mobile/pair
 * Auth: mobileAuthMiddleware (resident JWT required)
 * Tenant scope: pairing code's entityId must match JWT entityId — prevents cross-tenant pairing.
 */
router.post("/pair", mobileAuthMiddleware, async (req, res) => {
  try {
    const { residentId, entityId } = req.mobileUser!;
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
