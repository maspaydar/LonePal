import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from "ws";
import { generateAICheckIn, processResidentResponse } from "./ai-engine";
import { insertEntitySchema, insertResidentSchema, insertSensorSchema, insertScenarioConfigSchema } from "@shared/schema";
import { log } from "./index";

let wss: WebSocketServer;

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
    res.status(201).json(entity);
  });

  app.patch("/api/entities/:id", async (req, res) => {
    const updated = await storage.updateEntity(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Entity not found" });
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

      const motionEvent = await storage.createMotionEvent({
        entityId: sensor.entityId,
        sensorId: sensor.id,
        residentId: sensor.residentId,
        eventType,
        location: sensor.location,
        rawPayload: req.body,
      });

      if (sensor.residentId) {
        await storage.updateResidentStatus(sensor.residentId, "safe", new Date());
      }

      broadcastToClients({
        type: "motion_event",
        data: motionEvent,
      });

      log(`ADT event: ${eventType} from ${deviceId} at ${sensor.location}`, "webhook");
      res.json({ received: true, eventId: motionEvent.id });
    } catch (error) {
      log(`Webhook error: ${error}`, "webhook");
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
      residents: residentsList,
      alerts: alertsList,
      scenarios: activeScens,
    });
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

    await storage.seedDemoData(entity.id);
    res.json({ success: true, entityId: entity.id });
  });

  return httpServer;
}
