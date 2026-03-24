import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer } from "ws";
import { setWss, broadcastToClients } from "./ws-broadcast";
import { generateAICheckIn, clearEntityAiClient } from "./ai-engine";
import { insertEntitySchema, insertUnitSchema, insertResidentSchema, insertSensorSchema, insertScenarioConfigSchema, insertCommunityBroadcastSchema } from "@shared/schema";
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
import { requireCompanyAuth, requireCompanyAdmin } from "./middleware/company-auth";
import { superAdminAuthMiddleware } from "./middleware/super-admin-auth";
import superAdminRouter from "./routes/super-admin/index";
import maintenanceRouter from "./routes/maintenance";
import esp32Router from "./routes/iot/index";
import companyRouter from "./routes/company/index";
import mobileRouter from "./routes/mobile/index";
import registrationRouter from "./routes/registration";
import { WebhookHandlers } from "./webhookHandlers";
import { getUncachableStripeClient } from "./stripeClient";
import { pushCheckIn, activateListenMode, handleSpeakerResponse, pushCheckInWithListenMode, getActiveSessions, setSpeakerBroadcastFn, getSpeakerHealth } from "./services/speaker-gateway";
import { registerEsp32Device, getEsp32Health, getConnectedEsp32Devices } from "./services/esp32-speaker";
import { initLogStreamer, streamInfo } from "./services/log-streamer";
import crypto from "crypto";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  setWss(wss);
  wss.on("connection", (ws) => {
    log("WebSocket client connected", "ws");
    ws.on("close", () => log("WebSocket client disconnected", "ws"));
  });

  const esp32Wss = new WebSocketServer({ server: httpServer, path: "/ws/esp32" });
  esp32Wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const deviceMac = url.searchParams.get("mac");
    if (deviceMac) {
      registerEsp32Device(deviceMac, ws);
      log(`ESP32 WebSocket connected: ${deviceMac}`, "esp32-ws");
    } else {
      log("ESP32 WebSocket connected without MAC address", "esp32-ws");
      ws.close(1008, "Missing mac parameter");
    }
  });

  app.use("/api/super-admin", superAdminRouter);
  app.use("/api/maintenance", maintenanceRouter);
  app.use("/api/esp32", esp32Router);
  app.use("/api/company", companyRouter);
  app.use("/api/mobile", mobileRouter);
  app.use("/api", registrationRouter);

  async function handleStripeWebhook(req: any, res: any) {
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).json({ error: "Missing stripe-signature" });

    const sig = Array.isArray(signature) ? signature[0] : signature;
    const rawBody = req.rawBody as Buffer | undefined;

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ error: "Raw body not available" });
    }

    try {
      await WebhookHandlers.processWebhook(rawBody, sig);

      const event = JSON.parse(rawBody.toString());
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const facilityId = session.metadata?.facilityId;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        if (facilityId && customerId && subscriptionId) {
          const stripeClient = await getUncachableStripeClient();
          const sub = await stripeClient.subscriptions.retrieve(subscriptionId as string);
          await storage.updateFacility(Number(facilityId), {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            subscriptionStatus: "active",
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
          });
          log(`Stripe checkout completed: facility=${facilityId} sub=${subscriptionId}`, "stripe");
        }
      } else if (event.type === "customer.subscription.deleted") {
        const sub = event.data.object;
        const facility = await storage.getFacilityByStripeCustomerId(sub.customer);
        if (facility) {
          await storage.updateFacility(facility.id, { subscriptionStatus: "paused", stripeSubscriptionId: null as any });
          log(`Stripe subscription deleted/paused: facility=${facility.id}`, "stripe");
        }
      } else if (event.type === "customer.subscription.updated") {
        const sub = event.data.object;
        const facility = await storage.getFacilityByStripeCustomerId(sub.customer);
        if (facility) {
          const status = sub.status === "active" ? "active" : sub.status === "past_due" || sub.status === "canceled" ? "paused" : facility.subscriptionStatus;
          const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined;
          await storage.updateFacility(facility.id, {
            subscriptionStatus: status as any,
            ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
          });
          log(`Stripe subscription updated: facility=${facility.id} status=${status}`, "stripe");
        }
      } else if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object;
        const facility = await storage.getFacilityByStripeCustomerId(invoice.customer);
        if (facility) {
          await storage.updateFacility(facility.id, { subscriptionStatus: "paused" });
          log(`Stripe payment failed: facility=${facility.id}`, "stripe");
        }
      } else if (event.type === "invoice.paid") {
        const invoice = event.data.object;
        const facility = await storage.getFacilityByStripeCustomerId(invoice.customer);
        if (facility) {
          await storage.updateFacility(facility.id, {
            subscriptionStatus: "active",
            lastPaymentAt: new Date(invoice.status_transitions?.paid_at ? invoice.status_transitions.paid_at * 1000 : Date.now()),
          });
          log(`Stripe invoice paid: facility=${facility.id} amount=${invoice.amount_paid}`, "stripe");
        }
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      log(`Stripe webhook error: ${error.message}`, "stripe");
      res.status(400).json({ error: "Webhook processing failed" });
    }
  }

  app.post("/api/webhooks/stripe", handleStripeWebhook);
  app.post("/api/stripe/webhook", handleStripeWebhook);

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

  app.get("/api/heartbeat", async (_req, res) => {
    try {
      const allEntities = await storage.getEntities();
      const heartbeatData = [];

      for (const entity of allEntities) {
        const entityUnits = await storage.getUnits(entity.id);
        const unitStatuses = [];

        for (const unit of entityUnits) {
          const unitSensors = await storage.getSensorsByUnit(unit.id);
          const resident = await storage.getResidentByUnit(unit.id);
          const speakerHealth = unit.smartSpeakerId ? getSpeakerHealth(unit.smartSpeakerId) : null;
          const esp32Health = unit.esp32DeviceMac ? getEsp32Health(unit.esp32DeviceMac) : null;

          unitStatuses.push({
            unitId: unit.id,
            unitIdentifier: unit.unitIdentifier,
            floor: unit.floor,
            label: unit.label,
            hardwareType: unit.hardwareType,
            residentAssigned: !!resident,
            residentName: resident ? `${resident.firstName} ${resident.lastName}` : null,
            residentStatus: resident?.status || null,
            smartSpeaker: unit.hardwareType === "adt_google" ? {
              id: unit.smartSpeakerId || null,
              healthy: speakerHealth?.healthy ?? null,
              consecutiveFailures: speakerHealth?.consecutiveFailures ?? 0,
            } : null,
            esp32Device: unit.hardwareType === "esp32_custom" ? {
              deviceMac: unit.esp32DeviceMac || null,
              firmwareVersion: unit.esp32FirmwareVersion || null,
              lastHeartbeat: unit.esp32LastHeartbeat || null,
              ipAddress: unit.esp32IpAddress || null,
              signalStrength: unit.esp32SignalStrength || null,
              connected: esp32Health?.connected ?? false,
              healthy: esp32Health?.healthy ?? false,
            } : null,
            motionSensors: unitSensors.map(s => ({
              id: s.id,
              location: s.location,
              adtDeviceId: s.adtDeviceId,
              esp32DeviceMac: s.esp32DeviceMac,
              sensorType: s.sensorType,
              isActive: s.isActive,
            })),
            sensorsActive: unitSensors.filter(s => s.isActive).length,
            sensorsTotal: unitSensors.length,
          });
        }

        heartbeatData.push({
          entityId: entity.id,
          entityName: entity.name,
          units: unitStatuses,
          totalUnits: entityUnits.length,
          activeUnits: entityUnits.filter(u => u.isActive).length,
        });
      }

      res.json({
        status: "online",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        entities: heartbeatData,
      });
    } catch (err: any) {
      res.status(503).json({ status: "error", error: err.message });
    }
  });

  const initEntity = await storage.getEntity(1);
  if (initEntity) {
    initLogStreamer(1);
  }
  await storage.seedRecoveryScripts();
  streamInfo("system", "HeyGrand server started");

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

  app.use((req, res, next) => {
    if (/^\/api\/entities\/\d+\//.test(req.path)) {
      return requireCompanyAuth(req, res, next);
    }
    next();
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

  app.post("/api/entities", superAdminAuthMiddleware, async (req, res) => {
    const parsed = insertEntitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const entity = await storage.createEntity(parsed.data);
    provisionEntityFolder(entity.id);
    dailyLogger.info("entities", `Created entity ${entity.id}: ${entity.name}`, { entityId: entity.id });

    const baseUsername = entity.name.toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 20) + "_admin";
    let defaultUsername = baseUsername;
    let suffix = 2;
    while (await storage.getUserByUsername(defaultUsername)) {
      defaultUsername = `${baseUsername}${suffix++}`;
    }
    const defaultPassword = crypto.randomBytes(8).toString("hex");
    const hashedPassword = await bcrypt.hash(defaultPassword, 12);
    await storage.createUser({
      username: defaultUsername,
      password: hashedPassword,
      fullName: `${entity.name} Admin`,
      role: "admin",
      entityId: entity.id,
    });
    dailyLogger.info("entities", `Created default admin user '${defaultUsername}' for entity ${entity.id}`, { entityId: entity.id });

    res.status(201).json({
      ...entity,
      defaultAdminCredentials: {
        username: defaultUsername,
        password: defaultPassword,
        note: "Save these credentials — the password will not be shown again",
      },
    });
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
  app.get("/api/entities/:entityId/residents", requireCompanyAuth, async (req, res) => {
    const result = await storage.getResidents(Number(req.params.entityId));
    res.json(result);
  });

  app.get("/api/entities/:entityId/residents/:id", requireCompanyAuth, async (req, res) => {
    const entityId = Number(req.params.entityId);
    if (req.companyUser!.entityId !== entityId) return res.status(403).json({ error: "Access denied" });
    const resident = await storage.getResident(Number(req.params.id));
    if (!resident) return res.status(404).json({ error: "Resident not found" });
    if (resident.entityId !== entityId) return res.status(403).json({ error: "Access denied" });
    res.json(resident);
  });

  app.get("/api/entities/:entityId/residents/:id/conversations", requireCompanyAuth, async (req, res) => {
    const entityId = Number(req.params.entityId);
    if (req.companyUser!.entityId !== entityId) return res.status(403).json({ error: "Access denied" });
    const resident = await storage.getResident(Number(req.params.id));
    if (!resident) return res.status(404).json({ error: "Resident not found" });
    if (resident.entityId !== entityId) return res.status(403).json({ error: "Access denied" });
    const result = await storage.getConversations(Number(req.params.id));
    res.json(result);
  });

  app.get("/api/entities/:entityId/residents/:id/motion-events", requireCompanyAuth, async (req, res) => {
    const entityId = Number(req.params.entityId);
    if (req.companyUser!.entityId !== entityId) return res.status(403).json({ error: "Access denied" });
    const resident = await storage.getResident(Number(req.params.id));
    if (!resident) return res.status(404).json({ error: "Resident not found" });
    if (resident.entityId !== entityId) return res.status(403).json({ error: "Access denied" });
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await storage.getResidentMotionEvents(Number(req.params.id), limit);
    res.json(result);
  });

  app.get("/api/residents/:id", requireCompanyAuth, async (req, res) => {
    const resident = await storage.getResident(Number(req.params.id));
    if (!resident) return res.status(404).json({ error: "Resident not found" });
    if (resident.entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });
    res.json(resident);
  });

  app.post("/api/entities/:entityId/residents", requireCompanyAuth, async (req, res) => {
    const data = { ...req.body, entityId: Number(req.params.entityId) };
    const parsed = insertResidentSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const resident = await storage.createResident(parsed.data);
    res.status(201).json(resident);
  });

  app.patch("/api/residents/:id", requireCompanyAuth, async (req, res) => {
    const existing = await storage.getResident(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: "Resident not found" });
    if (existing.entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });
    const updated = await storage.updateResident(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Resident not found" });
    res.json(updated);
  });

  // --- Sensor routes ---
  app.get("/api/entities/:entityId/sensors", requireCompanyAuth, async (req, res) => {
    const result = await storage.getSensors(Number(req.params.entityId));
    res.json(result);
  });

  app.post("/api/entities/:entityId/sensors", requireCompanyAuth, async (req, res) => {
    const data = { ...req.body, entityId: Number(req.params.entityId) };
    const parsed = insertSensorSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const sensor = await storage.createSensor(parsed.data);
    res.status(201).json(sensor);
  });

  app.patch("/api/sensors/:id", requireCompanyAuth, async (req, res) => {
    const existing = await storage.getSensor(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: "Sensor not found" });
    if (existing.entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });
    const updated = await storage.updateSensor(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Sensor not found" });
    res.json(updated);
  });

  // --- Motion Events ---
  app.get("/api/entities/:entityId/motion-events", requireCompanyAuth, async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await storage.getMotionEvents(Number(req.params.entityId), limit);
    res.json(result);
  });

  app.get("/api/residents/:id/motion-events", requireCompanyAuth, async (req, res) => {
    const resident = await storage.getResident(Number(req.params.id));
    if (!resident) return res.status(404).json({ error: "Resident not found" });
    if (resident.entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });
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
  app.get("/api/entities/:entityId/scenario-configs", requireCompanyAuth, async (req, res) => {
    const result = await storage.getScenarioConfigs(Number(req.params.entityId));
    res.json(result);
  });

  app.post("/api/entities/:entityId/scenario-configs", requireCompanyAuth, async (req, res) => {
    const data = { ...req.body, entityId: Number(req.params.entityId) };
    const parsed = insertScenarioConfigSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const config = await storage.createScenarioConfig(parsed.data);
    res.status(201).json(config);
  });

  app.patch("/api/scenario-configs/:id", requireCompanyAuth, async (req, res) => {
    const existing = await storage.getScenarioConfig(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: "Config not found" });
    if (existing.entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });
    const updated = await storage.updateScenarioConfig(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Config not found" });
    res.json(updated);
  });

  // --- Active Scenarios ---
  app.get("/api/entities/:entityId/active-scenarios", requireCompanyAuth, async (req, res) => {
    const result = await storage.getActiveScenarios(Number(req.params.entityId));
    res.json(result);
  });

  app.post("/api/scenarios/:id/resolve", requireCompanyAuth, async (req, res) => {
    const scenario = await storage.getActiveScenario(Number(req.params.id));
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });
    if (scenario.entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });
    const { resolvedBy } = req.body;
    await storage.resolveActiveScenario(Number(req.params.id), resolvedBy || "staff");
    await storage.updateResidentStatus(scenario.residentId, "safe");
    broadcastToClients({ type: "scenario_resolved", data: { id: Number(req.params.id) } });
    res.json({ resolved: true });
  });

  // --- Alerts ---
  app.get("/api/entities/:entityId/alerts", requireCompanyAuth, async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await storage.getAlerts(Number(req.params.entityId), limit);
    res.json(result);
  });

  app.get("/api/entities/:entityId/alerts/unread", requireCompanyAuth, async (req, res) => {
    const result = await storage.getUnreadAlerts(Number(req.params.entityId));
    res.json(result);
  });

  app.post("/api/alerts/:id/acknowledge", requireCompanyAuth, async (req, res) => {
    const alert = await storage.getAlert(Number(req.params.id));
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    if (alert.entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });
    await storage.acknowledgeAlert(Number(req.params.id), req.body.acknowledgedBy || "staff");
    res.json({ acknowledged: true });
  });

  app.post("/api/alerts/:id/read", requireCompanyAuth, async (req, res) => {
    const alert = await storage.getAlert(Number(req.params.id));
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    if (alert.entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });
    await storage.markAlertRead(Number(req.params.id));
    res.json({ read: true });
  });

  // --- Conversations & Messages ---
  app.get("/api/residents/:residentId/conversations", requireCompanyAuth, async (req, res) => {
    const resident = await storage.getResident(Number(req.params.residentId));
    if (!resident) return res.status(404).json({ error: "Resident not found" });
    if (resident.entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });
    const result = await storage.getConversations(Number(req.params.residentId));
    res.json(result);
  });

  app.get("/api/entities/:entityId/conversations/:id", requireCompanyAuth, async (req, res) => {
    const entityId = Number(req.params.entityId);
    if (req.companyUser!.entityId !== entityId) return res.status(403).json({ error: "Access denied" });
    const conv = await storage.getConversation(Number(req.params.id));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    const resident = await storage.getResident(conv.residentId);
    if (!resident || resident.entityId !== entityId) return res.status(403).json({ error: "Access denied" });
    const msgs = await storage.getMessages(conv.id);
    res.json({ ...conv, messages: msgs });
  });

  app.get("/api/conversations/:id", requireCompanyAuth, async (req, res) => {
    const conv = await storage.getConversation(Number(req.params.id));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    const resident = await storage.getResident(conv.residentId);
    if (!resident || resident.entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });
    const msgs = await storage.getMessages(conv.id);
    res.json({ ...conv, messages: msgs });
  });

  app.get("/api/conversations/:id/messages", requireCompanyAuth, async (req, res) => {
    const conv = await storage.getConversation(Number(req.params.id));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    const resident = await storage.getResident(conv.residentId);
    if (!resident || resident.entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });
    const msgs = await storage.getMessages(Number(req.params.id));
    res.json(msgs);
  });

  // Company admin sends a message into a conversation (used by conversation-detail page)
  app.post("/api/entities/:entityId/conversations/:id/messages", requireCompanyAuth, async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      if (req.companyUser!.entityId !== entityId) return res.status(403).json({ error: "Access denied" });

      const conv = await storage.getConversation(Number(req.params.id));
      if (!conv) return res.status(404).json({ error: "Conversation not found" });

      const resident = await storage.getResident(conv.residentId);
      if (!resident || resident.entityId !== entityId) return res.status(403).json({ error: "Access denied" });

      const { message } = req.body;
      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "message is required" });
      }

      await storage.createMessage({ conversationId: conv.id, role: "user", content: message.trim() });

      const allMessages = await storage.getMessages(conv.id);
      const history = allMessages.map(m => ({ role: m.role, content: m.content }));
      const activeScens = await storage.getActiveScenariosForResident(resident.id);
      const activeScenario = activeScens[0];

      const { processResidentResponse } = await import("./ai-engine");
      const result = await processResidentResponse(resident, activeScenario?.id || 0, message.trim(), history);

      await storage.createMessage({ conversationId: conv.id, role: "assistant", content: result.aiResponse });

      const updatedMsgs = await storage.getMessages(conv.id);
      res.json({ response: result.aiResponse, isResolved: result.isResolved, messages: updatedMsgs });
    } catch (error: any) {
      log(`Company conversation message error: ${error}`, "company-api");
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // --- Trigger scenario manually (for testing) ---
  app.post("/api/trigger-scenario", requireCompanyAuth, async (req, res) => {
    try {
      const { residentId, scenarioType, location } = req.body;

      const resident = await storage.getResident(residentId);
      if (!resident) return res.status(404).json({ error: "Resident not found" });
      if (resident.entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });

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
  app.get("/api/entities/:entityId/dashboard", requireCompanyAuth, async (req, res) => {
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
  app.get("/api/entities/:entityId/units", requireCompanyAuth, async (req, res) => {
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

  app.post("/api/entities/:entityId/units", requireCompanyAuth, async (req, res) => {
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
      const entityId = Number(req.params.entityId);
      const unitId = Number(req.params.unitId);
      const existing = await storage.getUnit(unitId);
      if (!existing || existing.entityId !== entityId) return res.status(404).json({ error: "Unit not found" });
      const { unitIdentifier, label, smartSpeakerId, floor, isActive, hardwareType, esp32DeviceMac } = req.body;
      const updated = await storage.updateUnit(unitId, {
        unitIdentifier, label, smartSpeakerId, floor, isActive, hardwareType, esp32DeviceMac,
      });
      if (!updated) return res.status(404).json({ error: "Unit not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update unit" });
    }
  });

  app.delete("/api/entities/:entityId/units/:unitId", requireCompanyAuth, async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const unitId = Number(req.params.unitId);
      const existing = await storage.getUnit(unitId);
      if (!existing || existing.entityId !== entityId) return res.status(404).json({ error: "Unit not found" });
      await storage.deleteUnit(unitId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete unit" });
    }
  });

  app.post("/api/entities/:entityId/units/:unitId/assign-resident", requireCompanyAuth, async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const unitId = Number(req.params.unitId);
      const { residentId } = req.body;
      if (!residentId) return res.status(400).json({ error: "residentId is required" });

      const unit = await storage.getUnit(unitId);
      if (!unit || unit.entityId !== entityId) return res.status(404).json({ error: "Unit not found" });

      const resident = await storage.getResident(residentId);
      if (!resident || resident.entityId !== entityId) return res.status(403).json({ error: "Resident does not belong to this entity" });

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

  app.post("/api/entities/:entityId/units/:unitId/assign-sensor", requireCompanyAuth, async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const unitId = Number(req.params.unitId);
      const { sensorId } = req.body;
      if (!sensorId) return res.status(400).json({ error: "sensorId is required" });

      const unit = await storage.getUnit(unitId);
      if (!unit || unit.entityId !== entityId) return res.status(404).json({ error: "Unit not found" });

      const sensor = await storage.getSensor(sensorId);
      if (!sensor || sensor.entityId !== entityId) return res.status(403).json({ error: "Sensor does not belong to this entity" });

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

  app.post("/api/entities/:entityId/units/:unitId/unassign-sensor", requireCompanyAuth, async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const unitId = Number(req.params.unitId);
      const { sensorId } = req.body;
      if (!sensorId) return res.status(400).json({ error: "sensorId is required" });

      const unit = await storage.getUnit(unitId);
      if (!unit || unit.entityId !== entityId) return res.status(404).json({ error: "Unit not found" });

      const sensor = await storage.getSensor(sensorId);
      if (!sensor || sensor.entityId !== entityId) return res.status(403).json({ error: "Sensor does not belong to this entity" });

      const updated = await storage.updateSensor(sensorId, { unitId: null, residentId: null } as any);
      if (!updated) return res.status(404).json({ error: "Sensor not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to unassign sensor" });
    }
  });

  // --- Chat API ---
  app.post("/api/chat/:entityId/:userId", requireCompanyAuth, async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const residentId = Number(req.params.userId);

      if (isNaN(entityId) || isNaN(residentId)) {
        return res.status(400).json({ error: "Invalid entityId or userId" });
      }
      if (entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });

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

  app.get("/api/chat/:entityId/:userId/history", requireCompanyAuth, async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const residentId = Number(req.params.userId);

      if (entityId !== req.companyUser!.entityId) return res.status(403).json({ error: "Access denied" });
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
  app.get("/api/entities/:entityId/ai-insights", requireCompanyAuth, async (req, res) => {
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
  app.get("/api/entities/:entityId/broadcasts", requireCompanyAuth, async (req, res) => {
    const entityId = Number(req.params.entityId);
    const broadcasts = await storage.getCommunityBroadcasts(entityId);
    res.json(broadcasts);
  });

  app.post("/api/entities/:entityId/broadcasts", requireCompanyAuth, async (req, res) => {
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

  // --- Smart Speaker Gateway ---
  app.post("/api/entities/:entityId/units/:unitId/speaker/check-in", requireCompanyAuth, async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const unitId = Number(req.params.unitId);
      const { scenarioType, escalationLevel, scenarioId, triggerLocation, withListenMode } = req.body;

      const unit = await storage.getUnit(unitId);
      if (!unit || unit.entityId !== entityId) return res.status(404).json({ error: "Unit not found" });
      if (!unit.smartSpeakerId) return res.status(400).json({ error: "No smart speaker configured for this unit" });

      const resident = await storage.getResidentByUnit(unitId);
      if (!resident) return res.status(400).json({ error: "No resident assigned to this unit" });

      if (withListenMode) {
        const result = await pushCheckInWithListenMode(
          resident, unit,
          scenarioType || "inactivity_gentle",
          escalationLevel || 0,
          scenarioId, triggerLocation
        );
        res.json(result);
      } else {
        const result = await pushCheckIn(
          resident, unit,
          scenarioType || "inactivity_gentle",
          escalationLevel || 0,
          scenarioId, triggerLocation
        );
        res.json(result);
      }
    } catch (error: any) {
      log(`Speaker check-in error: ${error}`, "speaker-gateway");
      res.status(500).json({ error: error.message || "Failed to push check-in" });
    }
  });

  app.post("/api/speaker/webhook/response", async (req, res) => {
    try {
      const { speakerId, responseText } = req.body;
      if (!speakerId || !responseText) {
        return res.status(400).json({ error: "speakerId and responseText are required" });
      }
      const result = await handleSpeakerResponse(speakerId, responseText);
      res.json(result);
    } catch (error: any) {
      log(`Speaker webhook error: ${error}`, "speaker-gateway");
      res.status(500).json({ error: "Failed to process speaker response" });
    }
  });

  app.get("/api/entities/:entityId/units/:unitId/speaker/events", requireCompanyAuth, async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const unitId = Number(req.params.unitId);
      const unit = await storage.getUnit(unitId);
      if (!unit || unit.entityId !== entityId) return res.status(404).json({ error: "Unit not found" });
      const limit = Number(req.query.limit) || 20;
      const events = await storage.getSpeakerEvents(unitId, limit);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch speaker events" });
    }
  });

  app.get("/api/speaker/sessions", requireCompanyAuth, async (req, res) => {
    res.json(getActiveSessions(req.companyUser!.entityId));
  });

  app.get("/api/speaker/health/:speakerId", requireCompanyAuth, async (req, res) => {
    const speakerId = req.params.speakerId as string;
    const entityId = req.companyUser!.entityId;
    let unit = await storage.getUnitByEsp32Mac(speakerId);
    if (!unit) {
      const entityUnits = await storage.getUnits(entityId);
      unit = entityUnits.find(u => u.smartSpeakerId === speakerId) as typeof unit;
    }
    if (!unit || unit.entityId !== entityId) {
      return res.status(403).json({ error: "Access denied" });
    }
    const health = getSpeakerHealth(speakerId);
    res.json(health);
  });

  // --- Device Pairing ---
  app.post("/api/entities/:entityId/units/:unitId/pairing-code", requireCompanyAuth, async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const unitId = Number(req.params.unitId);

      const unit = await storage.getUnit(unitId);
      if (!unit || unit.entityId !== entityId) return res.status(404).json({ error: "Unit not found" });

      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const pairingCode = await storage.createDevicePairingCode({
        code,
        unitId,
        entityId,
        isUsed: false,
        usedByResidentId: null,
        expiresAt,
      });

      dailyLogger.info("pairing", `Generated pairing code for unit ${unit.unitIdentifier}`, { entityId, unitId, code });
      res.status(201).json(pairingCode);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate pairing code" });
    }
  });

  app.get("/api/entities/:entityId/units/:unitId/pairing-codes", requireCompanyAuth, async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const unitId = Number(req.params.unitId);
      const unit = await storage.getUnit(unitId);
      if (!unit || unit.entityId !== entityId) return res.status(404).json({ error: "Unit not found" });
      const codes = await storage.getDevicePairingCodesForUnit(unitId);
      res.json(codes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pairing codes" });
    }
  });

  // --- Tenant Isolation Verification ---
  app.get("/api/test/isolation/:entityId", async (req, res) => {
    try {
      const entityId = Number(req.params.entityId);
      const entity = await storage.getEntity(entityId);
      if (!entity) return res.status(404).json({ error: "Entity not found" });

      const allEntities = await storage.getEntities();
      const otherEntities = allEntities.filter(e => e.id !== entityId);

      const checks: { check: string; status: "pass" | "fail"; details?: string }[] = [];

      const residents = await storage.getResidents(entityId);
      const residentEntityIds = new Set(residents.map(r => r.entityId));
      const residentIsolated = residents.length === 0 || (residentEntityIds.size === 1 && residentEntityIds.has(entityId));
      checks.push({
        check: "resident_isolation",
        status: residentIsolated ? "pass" : "fail",
        details: `${residents.length} residents, all scoped to entity ${entityId}`,
      });

      const sensors = await storage.getSensors(entityId);
      const sensorEntityIds = new Set(sensors.map(s => s.entityId));
      const sensorIsolated = sensors.length === 0 || (sensorEntityIds.size === 1 && sensorEntityIds.has(entityId));
      checks.push({
        check: "sensor_isolation",
        status: sensorIsolated ? "pass" : "fail",
        details: `${sensors.length} sensors, all scoped to entity ${entityId}`,
      });

      for (const other of otherEntities) {
        const otherResidents = await storage.getResidents(other.id);
        const crossLeak = otherResidents.some(r => r.entityId === entityId);
        if (crossLeak) {
          checks.push({
            check: `cross_entity_leak_${other.id}`,
            status: "fail",
            details: `Entity ${other.id} contains residents belonging to entity ${entityId}`,
          });
        }
      }

      const hasGeminiKey = !!entity.geminiApiKey;
      checks.push({
        check: "api_key_isolation",
        status: hasGeminiKey ? "pass" : "warn",
        details: hasGeminiKey ? "Entity has its own Gemini API key (fully isolated)" : "Uses global fallback key (shared — not fully isolated)",
      });

      const failCount = checks.filter(c => c.status === "fail").length;

      res.json({
        entityId,
        entityName: entity.name,
        isolated: failCount === 0,
        checks,
        checkedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: "Isolation check failed" });
    }
  });

  // --- Hardware Test Utility ---
  app.get("/api/test/unit/:unitId", async (req, res) => {
    try {
      const unitId = Number(req.params.unitId);
      const unit = await storage.getUnit(unitId);
      if (!unit) return res.status(404).json({ error: "Unit not found" });

      const results: {
        unitId: number;
        unitIdentifier: string;
        entityId: number;
        tests: {
          component: string;
          status: "pass" | "fail" | "warn" | "skip";
          message: string;
          details?: any;
        }[];
        overallStatus: "pass" | "partial" | "fail";
        testedAt: string;
      } = {
        unitId: unit.id,
        unitIdentifier: unit.unitIdentifier,
        entityId: unit.entityId,
        tests: [],
        overallStatus: "pass",
        testedAt: new Date().toISOString(),
      };

      const resident = await storage.getResidentByUnit(unitId);
      if (resident) {
        results.tests.push({
          component: "resident_assignment",
          status: "pass",
          message: `Resident assigned: ${resident.preferredName || resident.firstName} ${resident.lastName}`,
          details: { residentId: resident.id, status: resident.status },
        });
      } else {
        results.tests.push({
          component: "resident_assignment",
          status: "fail",
          message: "No resident assigned to this unit",
        });
      }

      const sensors = await storage.getSensorsByUnit(unitId);
      if (sensors && sensors.length > 0) {
        for (const sensor of sensors) {
          const lastEvents = await storage.getResidentMotionEvents(sensor.residentId || 0, 1);
          const hasRecentActivity = lastEvents.length > 0;
          results.tests.push({
            component: "motion_sensor",
            status: sensor.isActive ? "pass" : "warn",
            message: sensor.isActive
              ? `Sensor ${sensor.adtDeviceId || sensor.location} is active${hasRecentActivity ? " with recent events" : ""}`
              : `Sensor ${sensor.adtDeviceId || sensor.location} is inactive`,
            details: {
              sensorId: sensor.id,
              adtDeviceId: sensor.adtDeviceId,
              location: sensor.location,
              isActive: sensor.isActive,
              lastEventDetected: hasRecentActivity,
            },
          });
        }
      } else {
        results.tests.push({
          component: "motion_sensor",
          status: "fail",
          message: "No motion sensors assigned to this unit",
        });
      }

      if (unit.smartSpeakerId) {
        let speakerReachable = false;
        try {
          const recentEvents = await storage.getSpeakerEvents(unitId, 5);
          const hasRecentSpeakerActivity = recentEvents.length > 0;
          const lastEvent = recentEvents[0];

          speakerReachable = true;
          results.tests.push({
            component: "smart_speaker",
            status: "pass",
            message: `Speaker ${unit.smartSpeakerId} is configured${hasRecentSpeakerActivity ? ` (last event: ${lastEvent?.eventType})` : ""}`,
            details: {
              speakerId: unit.smartSpeakerId,
              recentEventCount: recentEvents.length,
              lastEventType: lastEvent?.eventType || null,
              lastEventStatus: lastEvent?.status || null,
              lastEventTime: lastEvent?.createdAt || null,
            },
          });
        } catch {
          results.tests.push({
            component: "smart_speaker",
            status: "warn",
            message: `Speaker ${unit.smartSpeakerId} configured but could not verify status`,
          });
        }

        if (resident && speakerReachable) {
          const prefs = await storage.getUserPreferences(resident.id);
          const inQuietHours = prefs?.quietHoursStart && prefs?.quietHoursEnd;
          results.tests.push({
            component: "speaker_check_in_ready",
            status: "pass",
            message: `Check-in pipeline ready${inQuietHours ? " (quiet hours may apply)" : ""}`,
            details: {
              quietHoursConfigured: !!inQuietHours,
              quietHoursStart: prefs?.quietHoursStart || null,
              quietHoursEnd: prefs?.quietHoursEnd || null,
            },
          });
        }
      } else {
        results.tests.push({
          component: "smart_speaker",
          status: "skip",
          message: "No smart speaker configured for this unit",
        });
      }

      if (resident) {
        const tokens = await storage.getActiveMobileTokens(resident.id);
        if (tokens && tokens.length > 0) {
          results.tests.push({
            component: "mobile_app",
            status: "pass",
            message: `Mobile app connected (${tokens.length} active session${tokens.length > 1 ? "s" : ""})`,
            details: { activeTokens: tokens.length },
          });
        } else {
          results.tests.push({
            component: "mobile_app",
            status: "warn",
            message: "No active mobile app sessions — resident has not paired/logged in",
          });
        }

        const conversations = await storage.getConversations(resident.id);
        const activeConv = conversations.find((c: any) => c.isActive);
        results.tests.push({
          component: "ai_companion",
          status: "pass",
          message: activeConv
            ? `Active conversation exists (ID: ${activeConv.id})`
            : `AI companion ready (${conversations.length} past conversations)`,
          details: {
            totalConversations: conversations.length,
            hasActiveConversation: !!activeConv,
          },
        });
      }

      if (!unit.smartSpeakerId && resident) {
        results.tests.push({
          component: "failover_check",
          status: "pass",
          message: "No speaker configured — check-ins will route to mobile app only",
        });
      } else if (unit.smartSpeakerId && resident) {
        const tokens = await storage.getActiveMobileTokens(resident.id);
        const hasMobileApp = tokens && tokens.length > 0;
        results.tests.push({
          component: "failover_check",
          status: hasMobileApp ? "pass" : "warn",
          message: hasMobileApp
            ? "Failover ready: if speaker is offline, check-ins will route to mobile app"
            : "Warning: no mobile app session — failover to mobile not available if speaker goes offline",
        });
      }

      const failCount = results.tests.filter((t) => t.status === "fail").length;
      const warnCount = results.tests.filter((t) => t.status === "warn").length;
      if (failCount > 0) results.overallStatus = "fail";
      else if (warnCount > 0) results.overallStatus = "partial";
      else results.overallStatus = "pass";

      dailyLogger.info("hardware-test", `Unit ${unit.unitIdentifier} test: ${results.overallStatus}`, {
        unitId,
        overallStatus: results.overallStatus,
        passCount: results.tests.filter((t) => t.status === "pass").length,
        failCount,
        warnCount,
      });

      res.json(results);
    } catch (error: any) {
      log(`Hardware test error: ${error}`, "test");
      res.status(500).json({ error: "Hardware test failed" });
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

  setSpeakerBroadcastFn(broadcastToClients);
  emergencyService.start(broadcastToClients);
  inactivityMonitor.start(broadcastToClients);

  return httpServer;
}
