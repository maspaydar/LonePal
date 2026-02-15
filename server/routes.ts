import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from "ws";
import { generateAICheckIn, processResidentResponse, streamCompanionResponse, transcribeAudio, buildConversationContext, clearEntityAiClient } from "./ai-engine";
import { insertEntitySchema, insertUnitSchema, insertResidentSchema, insertSensorSchema, insertScenarioConfigSchema, insertCommunityBroadcastSchema, mobileLoginSchema } from "@shared/schema";
import { log } from "./index";
import { provisionEntityFolder } from "./tenant-folders";
import { dailyLogger } from "./daily-logger";
import { registryService } from "./services/registry-service";
import { intakeService } from "./services/intake-service";
import { chatService } from "./services/chat-service";
import { motionService } from "./services/motion-service";
import { inactivityMonitor } from "./services/inactivity-monitor";
import { emergencyService } from "./services/emergency-service";
import { GoogleGenAI } from "@google/genai";
import bcrypt from "bcryptjs";
import { mobileAuthMiddleware, signMobileToken } from "./middleware/mobile-auth";
import superAdminRouter from "./routes/super-admin";
import maintenanceRouter from "./routes/maintenance";

let wss: WebSocketServer;
let _insightsAI: GoogleGenAI | null = null;
const _entityInsightsAI = new Map<number, GoogleGenAI>();

function getAIForInsights(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!_insightsAI) {
    _insightsAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _insightsAI;
}

async function getAIForInsightsEntity(entityId: number): Promise<GoogleGenAI | null> {
  const entity = await storage.getEntity(entityId);
  if (entity?.geminiApiKey) {
    if (!_entityInsightsAI.has(entityId)) {
      _entityInsightsAI.set(entityId, new GoogleGenAI({ apiKey: entity.geminiApiKey }));
    }
    return _entityInsightsAI.get(entityId)!;
  }
  return getAIForInsights();
}

function broadcastToClients(data: any) {
  if (!wss) return;
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws) => {
    log("WebSocket client connected", "ws");
    ws.on("close", () => log("WebSocket client disconnected", "ws"));
  });

  app.use("/api/super-admin", superAdminRouter);
  app.use("/api/maintenance", maintenanceRouter);

  app.get("/api/health", async (_req, res) => {
    try {
      const allEntities = await storage.getEntities();
      let totalResidents = 0;
      for (const entity of allEntities) {
        const residents = await storage.getResidents(entity.id);
        totalResidents += residents.filter(r => r.isActive).length;
      }
      res.json({
        status: "healthy",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        activeUsers: totalResidents,
        entities: allEntities.length,
      });
    } catch {
      res.status(503).json({ status: "unhealthy" });
    }
  });

  app.post("/api/super-admin/receive-config", async (req, res) => {
    try {
      const configSecret = req.headers["x-config-secret"] as string;
      if (!configSecret || configSecret !== process.env.SESSION_SECRET) {
        return res.status(401).json({ error: "Invalid config secret" });
      }
      const { facilityId, config } = req.body;
      if (!facilityId || !config) {
        return res.status(400).json({ error: "facilityId and config required" });
      }
      log(`Received config push for facility ${facilityId}`, "super-admin");
      res.json({ received: true, facilityId });
    } catch {
      res.status(500).json({ error: "Failed to receive config" });
    }
  });

  // --- Entity routes ---
  app.get("/api/entities", async (_req, res) => {
    const result = await storage.getEntities();
    res.json(result);
  });

  app.get("/api/entities/:id", async (req, res) => {
    const entity = await storage.getEntity(Number(req.params.id));
    if (!entity) return res.status(404).json({ error: "Entity not found" });
    res.json(entity);
  });

  app.post("/api/entities", async (req, res) => {
    const parsed = insertEntitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const entity = await storage.createEntity(parsed.data);
    provisionEntityFolder(entity.id);
    dailyLogger.info("entities", `Created entity ${entity.id}: ${entity.name}`, { entityId: entity.id });
    res.status(201).json(entity);
  });

  app.patch("/api/entities/:id", async (req, res) => {
    const entityId = Number(req.params.id);
    const updated = await storage.updateEntity(entityId, req.body);
    if (!updated) return res.status(404).json({ error: "Entity not found" });
    if (req.body.geminiApiKey !== undefined) {
      clearEntityAiClient(entityId);
      _entityInsightsAI.delete(entityId);
    }
    res.json(updated);
  });

  // --- Resident routes ---
  app.get("/api/entities/:entityId/residents", async (req, res) => {
    const result = await storage.getResidents(Number(req.params.entityId));
    res.json(result);
  });

  app.get("/api/residents/:id", async (req, res) => {
    const resident = await storage.getResident(Number(req.params.id));
    if (!resident) return res.status(404).json({ error: "Resident not found" });
    res.json(resident);
  });

  app.post("/api/entities/:entityId/residents", async (req, res) => {
    const data = { ...req.body, entityId: Number(req.params.entityId) };
    const parsed = insertResidentSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const resident = await storage.createResident(parsed.data);
    res.status(201).json(resident);
  });

  app.patch("/api/residents/:id", async (req, res) => {
    const updated = await storage.updateResident(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Resident not found" });
    res.json(updated);
  });

  // --- Sensor routes ---
  app.get("/api/entities/:entityId/sensors", async (req, res) => {
    const result = await storage.getSensors(Number(req.params.entityId));
    res.json(result);
  });

  app.post("/api/entities/:entityId/sensors", async (req, res) => {
    const data = { ...req.body, entityId: Number(req.params.entityId) };
    const parsed = insertSensorSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const sensor = await storage.createSensor(parsed.data);
    res.status(201).json(sensor);
  });

  app.patch("/api/sensors/:id", async (req, res) => {
    const updated = await storage.updateSensor(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Sensor not found" });
    res.json(updated);
  });

  // --- Motion Events ---
  app.get("/api/entities/:entityId/motion-events", async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await storage.getMotionEvents(Number(req.params.entityId), limit);
    res.json(result);
  });

  app.get("/api/residents/:id/motion-events", async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await storage.getResidentMotionEvents(Number(req.params.id), limit);
    res.json(result);
  });

  // --- ADT Webhook ---
  app.post("/api/webhook/adt", async (req, res) => {
    try {
      const { deviceId, eventType, timestamp: eventTs, ...rest } = req.body;

      if (!deviceId || !eventType) {
        return res.status(400).json({ error: "Missing deviceId or eventType" });
      }

      const sensor = await storage.getSensorByAdtId(deviceId);
      if (!sensor) {
        log(`Unknown ADT device: ${deviceId}`, "webhook");
        return res.status(404).json({ error: "Unknown sensor device" });
      }

      let residentId = sensor.residentId;
      if (!residentId && sensor.unitId) {
        const unitResident = await storage.getResidentByUnit(sensor.unitId);
        if (unitResident) residentId = unitResident.id;
      }

      const motionEvent = await storage.createMotionEvent({
        entityId: sensor.entityId,
        sensorId: sensor.id,
        residentId,
        eventType,
        location: sensor.location,
        rawPayload: req.body,
      });

      if (residentId) {
        await storage.updateResidentStatus(residentId, "safe", new Date());
      }

      broadcastToClients({
        type: "motion_event",
        data: motionEvent,
      });

      log(`ADT event: ${eventType} from ${deviceId} at ${sensor.location} (unit=${sensor.unitId || 'none'})`, "webhook");
      res.json({ received: true, eventId: motionEvent.id });
    } catch (error) {
      log(`Webhook error: ${error}`, "webhook");
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // --- Safety ADT Webhook (per-entity, per-resident with HMAC) ---
  app.post("/api/safety/adt-webhook/:entityId/:userId", async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const residentId = Number(req.params.userId);

      if (isNaN(entityId) || isNaN(residentId)) {
        return res.status(400).json({ error: "Invalid entityId or userId" });
      }

      const rawBody = (req as any).rawBody;
      const signature = req.headers["x-adt-signature"] as string | undefined;

      if (!motionService.verifySignature(rawBody?.toString() || JSON.stringify(req.body), signature)) {
        dailyLogger.warn("safety-webhook", `HMAC verification failed for entity=${entityId} resident=${residentId}`, {
          hasSignature: !!signature,
        });
        return res.status(401).json({ error: "Invalid signature" });
      }

      const { deviceId, eventType } = req.body;
      if (!eventType) {
        return res.status(400).json({ error: "Missing eventType in payload" });
      }

      const entity = await storage.getEntity(entityId);
      if (!entity) {
        return res.status(404).json({ error: `Entity ${entityId} not found` });
      }

      const motionEvent = await motionService.processMotionEvent(entityId, residentId, {
        deviceId: deviceId || "unknown",
        eventType,
        ...req.body,
      });

      broadcastToClients({
        type: "motion_event",
        data: motionEvent,
      });

      res.json({ received: true, eventId: motionEvent.id });
    } catch (error: any) {
      if (error.message?.includes("not found") || error.message?.includes("does not belong")) {
        return res.status(404).json({ error: error.message });
      }
      dailyLogger.error("safety-webhook", `Safety webhook failed: ${error}`);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // --- Scenario Config routes ---
  app.get("/api/entities/:entityId/scenario-configs", async (req, res) => {
    const result = await storage.getScenarioConfigs(Number(req.params.entityId));
    res.json(result);
  });

  app.post("/api/entities/:entityId/scenario-configs", async (req, res) => {
    const data = { ...req.body, entityId: Number(req.params.entityId) };
    const parsed = insertScenarioConfigSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const config = await storage.createScenarioConfig(parsed.data);
    res.status(201).json(config);
  });

  app.patch("/api/scenario-configs/:id", async (req, res) => {
    const updated = await storage.updateScenarioConfig(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Config not found" });
    res.json(updated);
  });

  // --- Active Scenarios ---
  app.get("/api/entities/:entityId/active-scenarios", async (req, res) => {
    const result = await storage.getActiveScenarios(Number(req.params.entityId));
    res.json(result);
  });

  app.post("/api/scenarios/:id/resolve", async (req, res) => {
    const { resolvedBy } = req.body;
    await storage.resolveActiveScenario(Number(req.params.id), resolvedBy || "staff");
    const scenario = await storage.getActiveScenario(Number(req.params.id));
    if (scenario) {
      await storage.updateResidentStatus(scenario.residentId, "safe");
    }
    broadcastToClients({ type: "scenario_resolved", data: { id: Number(req.params.id) } });
    res.json({ resolved: true });
  });

  // --- Alerts ---
  app.get("/api/entities/:entityId/alerts", async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await storage.getAlerts(Number(req.params.entityId), limit);
    res.json(result);
  });

  app.get("/api/entities/:entityId/alerts/unread", async (req, res) => {
    const result = await storage.getUnreadAlerts(Number(req.params.entityId));
    res.json(result);
  });

  app.post("/api/alerts/:id/acknowledge", async (req, res) => {
    await storage.acknowledgeAlert(Number(req.params.id), req.body.acknowledgedBy || "staff");
    res.json({ acknowledged: true });
  });

  app.post("/api/alerts/:id/read", async (req, res) => {
    await storage.markAlertRead(Number(req.params.id));
    res.json({ read: true });
  });

  // --- Conversations & Messages ---
  app.get("/api/residents/:residentId/conversations", async (req, res) => {
    const result = await storage.getConversations(Number(req.params.residentId));
    res.json(result);
  });

  app.get("/api/conversations/:id", async (req, res) => {
    const conv = await storage.getConversation(Number(req.params.id));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    const msgs = await storage.getMessages(conv.id);
    res.json({ ...conv, messages: msgs });
  });

  app.get("/api/conversations/:id/messages", async (req, res) => {
    const msgs = await storage.getMessages(Number(req.params.id));
    res.json(msgs);
  });

  // --- Mobile API: Senior-facing companion ---
  app.post("/api/mobile/respond", async (req, res) => {
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

      res.json({
        response: result.aiResponse,
        isResolved: result.isResolved,
        conversationId,
      });
    } catch (error) {
      log(`Mobile respond error: ${error}`, "mobile-api");
      res.status(500).json({ error: "Failed to process response" });
    }
  });

  app.post("/api/mobile/respond-stream", mobileAuthMiddleware, async (req, res) => {
    try {
      const { residentId, conversationId, message, audioBase64, audioMimeType } = req.body;

      if (!residentId || !conversationId) {
        return res.status(400).json({ error: "Missing residentId or conversationId" });
      }

      let userMessage = message;

      if (audioBase64 && !userMessage) {
        try {
          userMessage = await transcribeAudio(audioBase64, audioMimeType || "audio/m4a", entityId);
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

  app.get("/api/mobile/resident/:id/status", async (req, res) => {
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

  // --- Trigger scenario manually (for testing) ---
  app.post("/api/trigger-scenario", async (req, res) => {
    try {
      const { residentId, scenarioType, location } = req.body;

      const resident = await storage.getResident(residentId);
      if (!resident) return res.status(404).json({ error: "Resident not found" });

      const configs = await storage.getScenarioConfigsForResident(residentId, resident.entityId);
      const config = configs.find(c => c.scenarioType === scenarioType);
      if (!config) return res.status(404).json({ error: "No matching scenario config" });

      const activeScenario = await storage.createActiveScenario({
        entityId: resident.entityId,
        residentId,
        scenarioConfigId: config.id,
        scenarioType: config.scenarioType,
        status: "active",
        escalationLevel: 0,
        triggerLocation: location || null,
      });

      const aiMessage = await generateAICheckIn(resident, scenarioType, 0, location);

      const conversation = await storage.createConversation({
        entityId: resident.entityId,
        residentId,
        scenarioId: activeScenario.id,
        title: `${config.label} - ${new Date().toLocaleString()}`,
        isActive: true,
      });

      await storage.createMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: aiMessage,
      });

      await storage.updateResidentStatus(residentId, "checking");

      const alert = await storage.createAlert({
        entityId: resident.entityId,
        residentId,
        scenarioId: activeScenario.id,
        severity: scenarioType === "fall_detected" ? "emergency" : scenarioType === "inactivity_urgent" ? "warning" : "info",
        title: `${config.label} triggered for ${resident.preferredName || resident.firstName}`,
        message: `AI check-in initiated. ${location ? `Location: ${location}` : ""}`,
      });

      broadcastToClients({
        type: "scenario_triggered",
        data: { scenario: activeScenario, alert, conversation, aiMessage },
      });

      res.json({
        scenario: activeScenario,
        conversation,
        aiMessage,
        alert,
      });
    } catch (error) {
      log(`Trigger scenario error: ${error}`, "api");
      res.status(500).json({ error: "Failed to trigger scenario" });
    }
  });

  // --- Dashboard stats ---
  app.get("/api/entities/:entityId/dashboard", async (req, res) => {
    const entityId = Number(req.params.entityId);
    const [residentsList, alertsList, activeScens, sensorsList, events] = await Promise.all([
      storage.getResidents(entityId),
      storage.getUnreadAlerts(entityId),
      storage.getActiveScenarios(entityId),
      storage.getSensors(entityId),
      storage.getMotionEvents(entityId, 20),
    ]);

    const safe = residentsList.filter(r => r.status === "safe").length;
    const checking = residentsList.filter(r => r.status === "checking").length;
    const alert = residentsList.filter(r => r.status === "alert").length;

    res.json({
      totalResidents: residentsList.length,
      safeResidents: safe,
      checkingResidents: checking,
      alertResidents: alert,
      unreadAlerts: alertsList.length,
      activeScenarios: activeScens.length,
      totalSensors: sensorsList.length,
      recentEvents: events,
      residents: residentsList.map(({ mobilePin, ...r }) => r),
      alerts: alertsList,
      scenarios: activeScens,
    });
  });

  // --- Admin: Entity & User Management ---
  app.post("/api/admin/entities", async (req, res) => {
    try {
      const { name, type, address, contactPhone, contactEmail } = req.body;
      if (!name) return res.status(400).json({ error: "Entity name is required" });
      const entity = await registryService.createEntity({ name, type, address, contactPhone, contactEmail });
      res.status(201).json(entity);
    } catch (error) {
      dailyLogger.error("admin", `Failed to create entity: ${error}`);
      res.status(500).json({ error: "Failed to create entity" });
    }
  });

  app.post("/api/admin/:entityId/users", async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const { firstName, lastName, dateOfBirth, roomNumber, emergencyContact, emergencyPhone, medicalNotes, preferredName, communicationStyle, intakeInterviewData, digitalTwinPersona } = req.body;
      if (!firstName || !lastName) return res.status(400).json({ error: "firstName and lastName are required" });
      const user = await registryService.addUser(entityId, {
        firstName, lastName, dateOfBirth, roomNumber, emergencyContact, emergencyPhone,
        medicalNotes, preferredName, communicationStyle, intakeInterviewData, digitalTwinPersona,
      });
      res.status(201).json(user);
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      dailyLogger.error("admin", `Failed to add user: ${error}`);
      res.status(500).json({ error: "Failed to add user" });
    }
  });

  app.get("/api/admin/:entityId/users", async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const users = await registryService.listUsers(entityId);
      res.json(users);
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      dailyLogger.error("admin", `Failed to list users: ${error}`);
      res.status(500).json({ error: "Failed to list users" });
    }
  });

  // --- Unit Management API ---
  app.get("/api/entities/:entityId/units", async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const unitList = await storage.getUnits(entityId);
      const enriched = await Promise.all(unitList.map(async (unit) => {
        const unitSensors = await storage.getSensorsByUnit(unit.id);
        const resident = await storage.getResidentByUnit(unit.id);
        return { ...unit, sensors: unitSensors, resident: resident || null };
      }));
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch units" });
    }
  });

  app.post("/api/entities/:entityId/units", async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const parsed = insertUnitSchema.parse({ ...req.body, entityId });

      const existing = await storage.getUnitByIdentifier(entityId, parsed.unitIdentifier);
      if (existing) return res.status(409).json({ error: `Unit ${parsed.unitIdentifier} already exists` });

      const unit = await storage.createUnit(parsed);
      res.status(201).json(unit);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to create unit" });
    }
  });

  app.put("/api/entities/:entityId/units/:unitId", async (req, res) => {
    try {
      const { unitIdentifier, label, smartSpeakerId, floor, isActive } = req.body;
      const updated = await storage.updateUnit(Number(req.params.unitId), { unitIdentifier, label, smartSpeakerId, floor, isActive });
      if (!updated) return res.status(404).json({ error: "Unit not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update unit" });
    }
  });

  app.delete("/api/entities/:entityId/units/:unitId", async (req, res) => {
    try {
      await storage.deleteUnit(Number(req.params.unitId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete unit" });
    }
  });

  app.post("/api/entities/:entityId/units/:unitId/assign-resident", async (req, res) => {
    try {
      const unitId = Number(req.params.unitId);
      const { residentId } = req.body;
      if (!residentId) return res.status(400).json({ error: "residentId is required" });

      const unit = await storage.getUnit(unitId);
      if (!unit) return res.status(404).json({ error: "Unit not found" });

      const updated = await storage.updateResident(residentId, { unitId });
      if (!updated) return res.status(404).json({ error: "Resident not found" });

      const unitSensors = await storage.getSensorsByUnit(unitId);
      for (const sensor of unitSensors) {
        await storage.updateSensor(sensor.id, { residentId });
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to assign resident" });
    }
  });

  app.post("/api/entities/:entityId/units/:unitId/assign-sensor", async (req, res) => {
    try {
      const unitId = Number(req.params.unitId);
      const { sensorId } = req.body;
      if (!sensorId) return res.status(400).json({ error: "sensorId is required" });

      const unit = await storage.getUnit(unitId);
      if (!unit) return res.status(404).json({ error: "Unit not found" });

      const resident = await storage.getResidentByUnit(unitId);
      const updateData: any = { unitId };
      if (resident) updateData.residentId = resident.id;

      const updated = await storage.updateSensor(sensorId, updateData);
      if (!updated) return res.status(404).json({ error: "Sensor not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to assign sensor" });
    }
  });

  app.post("/api/entities/:entityId/units/:unitId/unassign-sensor", async (req, res) => {
    try {
      const { sensorId } = req.body;
      if (!sensorId) return res.status(400).json({ error: "sensorId is required" });
      const updated = await storage.updateSensor(sensorId, { unitId: null, residentId: null } as any);
      if (!updated) return res.status(404).json({ error: "Sensor not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to unassign sensor" });
    }
  });

  // --- Chat API ---
  app.post("/api/chat/:entityId/:userId", async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const residentId = Number(req.params.userId);

      if (isNaN(entityId) || isNaN(residentId)) {
        return res.status(400).json({ error: "Invalid entityId or userId" });
      }

      const { message } = req.body;

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ error: "A non-empty 'message' string is required" });
      }

      const entity = await storage.getEntity(entityId);
      if (!entity) {
        return res.status(404).json({ error: `Entity ${entityId} not found` });
      }

      const result = await chatService.chat(entityId, residentId, message.trim());

      res.json({
        conversationId: result.conversationId,
        response: result.response,
        messageId: result.assistantMessage.id,
        timestamp: result.assistantMessage.createdAt,
      });
    } catch (error: any) {
      if (error.message?.includes("not found") || error.message?.includes("does not belong")) {
        return res.status(404).json({ error: error.message });
      }
      dailyLogger.error("chat-route", `Chat failed: ${error}`);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  app.get("/api/chat/:entityId/:userId/history", async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const residentId = Number(req.params.userId);

      const result = await chatService.getConversationHistory(entityId, residentId);
      res.json(result);
    } catch (error) {
      dailyLogger.error("chat-route", `History fetch failed: ${error}`);
      res.status(500).json({ error: "Failed to fetch conversation history" });
    }
  });

  // --- Test: Intake Interview Processing ---
  app.post("/api/test/ingest", async (req, res) => {
    try {
      const { transcript, entityId, residentId } = req.body;
      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ error: "A 'transcript' string is required" });
      }
      if (transcript.length < 50) {
        return res.status(400).json({ error: "Transcript must be at least 50 characters for meaningful analysis" });
      }

      const biography = await intakeService.buildDigitalTwin(
        transcript,
        entityId ? Number(entityId) : undefined,
        residentId ? Number(residentId) : undefined,
      );

      res.json({
        success: true,
        biography,
        persistedToEntity: entityId ? Number(entityId) : null,
        linkedToResident: residentId ? Number(residentId) : null,
      });
    } catch (error) {
      dailyLogger.error("test-ingest", `Intake processing failed: ${error}`);
      res.status(500).json({ error: "Failed to process intake transcript" });
    }
  });

  // --- AI Mood Insights ---
  app.get("/api/entities/:entityId/ai-insights", async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const residentsList = await storage.getResidents(entityId);

      const insights = await Promise.all(
        residentsList.map(async (resident) => {
          const recentMsgs = await storage.getLatestConversationMessages(resident.id, 6);
          const userMsgs = recentMsgs.filter(m => m.role === "user");

          let mood = "No recent conversations";
          let moodScore = 0;

          if (userMsgs.length > 0) {
            const combined = userMsgs.map(m => m.content).join(" ");
            const ai = await getAIForInsightsEntity(entityId);

            if (ai) {
              try {
                const result = await ai.models.generateContent({
                  model: "gemini-1.5-flash",
                  contents: `Analyze the following messages from a senior living resident and provide a brief one-sentence mood assessment (max 15 words). Also rate their emotional wellbeing from 1-5 (1=very concerning, 5=happy/engaged). Return ONLY a JSON object with "mood" (string) and "score" (number).\n\nMessages:\n${combined}`,
                });
                const text = result.text?.trim() || "";
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  mood = parsed.mood || mood;
                  moodScore = parsed.score || 3;
                }
              } catch {
                mood = userMsgs.length > 0 ? "Recently active in conversation" : mood;
                moodScore = 3;
              }
            } else {
              const lower = combined.toLowerCase();
              if (lower.includes("lonely") || lower.includes("sad") || lower.includes("miss")) {
                mood = "May be feeling lonely today";
                moodScore = 2;
              } else if (lower.includes("happy") || lower.includes("great") || lower.includes("wonderful")) {
                mood = "Appears to be in good spirits";
                moodScore = 4;
              } else if (lower.includes("pain") || lower.includes("hurt") || lower.includes("help")) {
                mood = "Mentioned discomfort - may need attention";
                moodScore = 2;
              } else {
                mood = "Recently active in conversation";
                moodScore = 3;
              }
            }
          }

          return {
            residentId: resident.id,
            name: resident.preferredName || resident.firstName,
            lastName: resident.lastName,
            roomNumber: resident.roomNumber,
            status: resident.status,
            mood,
            moodScore,
            lastActivity: resident.lastActivityAt,
            messageCount: userMsgs.length,
          };
        })
      );

      res.json(insights);
    } catch (error) {
      dailyLogger.error("ai-insights", `Failed to generate insights: ${error}`);
      res.status(500).json({ error: "Failed to generate AI insights" });
    }
  });

  // --- Community Broadcasts ---
  app.get("/api/entities/:entityId/broadcasts", async (req, res) => {
    const entityId = Number(req.params.entityId);
    const broadcasts = await storage.getCommunityBroadcasts(entityId);
    res.json(broadcasts);
  });

  app.post("/api/entities/:entityId/broadcasts", async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const data = {
        ...req.body,
        entityId,
        senderName: req.body.senderName?.trim() || "Facility Admin",
        message: req.body.message?.trim() || "",
      };

      const parsed = insertCommunityBroadcastSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      if (parsed.data.message.length === 0) {
        return res.status(400).json({ error: "A non-empty 'message' is required" });
      }

      const broadcast = await storage.createCommunityBroadcast(parsed.data);

      const residentsList = await storage.getResidents(entityId);
      for (const resident of residentsList) {
        if (!resident.isActive) continue;

        let conv = await storage.getActiveConversationForResident(entityId, resident.id);
        if (!conv) {
          conv = await storage.createConversation({
            entityId,
            residentId: resident.id,
            title: `Companion Chat with ${resident.preferredName || resident.firstName}`,
            isActive: true,
          });
        }

        const name = resident.preferredName || resident.firstName;
        const announcementMsg = `Hey ${name}, here's an announcement from the facility: "${parsed.data.message}" - Enjoy your day!`;

        await storage.createMessage({
          conversationId: conv.id,
          role: "assistant",
          content: announcementMsg,
        });
      }

      broadcastToClients({ type: "community_broadcast", data: broadcast });

      dailyLogger.info("broadcast", `Community broadcast sent to ${residentsList.length} residents`, { entityId });
      res.status(201).json(broadcast);
    } catch (error: any) {
      log(`Broadcast error: ${error?.stack || error}`, "broadcast");
      dailyLogger.error("broadcast", `Failed to send broadcast: ${error}`);
      res.status(500).json({ error: "Failed to send community broadcast" });
    }
  });

  // ===================== MOBILE API GATEWAY =====================

  app.post("/api/mobile/login", async (req, res) => {
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

  app.post("/api/mobile/logout", mobileAuthMiddleware, async (req, res) => {
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

  app.get("/api/mobile/sync/:entityId/:userId", mobileAuthMiddleware, async (req, res) => {
    try {
      const entityId = parseInt(req.params.entityId);
      const userId = parseInt(req.params.userId);

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
        lastAIMessage: lastAIMessage ? {
          id: lastAIMessage.id,
          content: lastAIMessage.content,
          createdAt: lastAIMessage.createdAt,
        } : null,
        safetyStatus: {
          current: resident.status,
          activeScenarios: activeScenarios.length,
          hasActiveAlert: activeScenarios.some(s => s.status === "active" || s.status === "escalated"),
        },
        announcements: broadcasts.map(b => ({
          id: b.id,
          senderName: b.senderName,
          message: b.message,
          createdAt: b.createdAt,
        })),
      });
    } catch (error: any) {
      log(`Mobile sync error: ${error?.stack || error}`, "mobile");
      res.status(500).json({ error: "Sync failed" });
    }
  });

  app.get("/api/mobile/profile", mobileAuthMiddleware, async (req, res) => {
    try {
      const { residentId, entityId } = req.mobileAuth!;
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

  app.post("/api/mobile/conversation", mobileAuthMiddleware, async (req, res) => {
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

  // --- Seed demo data ---
  app.post("/api/seed", async (req, res) => {
    let allEntities = await storage.getEntities();
    let entity;
    if (allEntities.length === 0) {
      entity = await storage.createEntity({
        name: "Sunrise Senior Living",
        type: "facility",
        address: "123 Care Avenue, Healthtown, CA 90210",
        contactPhone: "555-0100",
        contactEmail: "admin@sunrise-senior.com",
      });
    } else {
      entity = allEntities[0];
    }

    provisionEntityFolder(entity.id);
    await storage.seedDemoData(entity.id);
    dailyLogger.info("seed", `Demo data seeded for entity ${entity.id}`, { entityId: entity.id });
    res.json({ success: true, entityId: entity.id });
  });

  emergencyService.start(broadcastToClients);
  inactivityMonitor.start(broadcastToClients);

  return httpServer;
}
