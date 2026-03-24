import {
  type User, type InsertUser,
  type Entity, type InsertEntity,
  type Unit, type InsertUnit,
  type Resident, type InsertResident,
  type Sensor, type InsertSensor,
  type Esp32SensorData, type InsertEsp32SensorData,
  type MotionEvent, type InsertMotionEvent,
  type ScenarioConfig, type InsertScenarioConfig,
  type ActiveScenario, type InsertActiveScenario,
  type Alert, type InsertAlert,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  type CommunityBroadcast, type InsertCommunityBroadcast,
  type MobileToken, type InsertMobileToken,
  type SuperAdmin, type InsertSuperAdmin,
  type Facility, type InsertFacility,
  type FacilityHealthLog, type InsertFacilityHealthLog,
  type MaintenanceLog, type InsertMaintenanceLog,
  type UserPreferences, type InsertUserPreferences,
  type DevicePairingCode, type InsertDevicePairingCode,
  type SpeakerEvent, type InsertSpeakerEvent,
  type CentralLogEntry, type InsertCentralLogEntry,
  type RecoveryScript, type InsertRecoveryScript,
  type RecoveryExecutionLog, type InsertRecoveryExecutionLog,
  users, entities, residents, sensors, esp32SensorData, motionEvents, units,
  scenarioConfigs, activeScenarios, alerts, conversations, messages,
  communityBroadcasts, mobileTokens, superAdmins, facilities, facilityHealthLogs,
  maintenanceLogs, userPreferences, devicePairingCodes, speakerEvents,
  centralLogEntries, recoveryScripts, recoveryExecutionLogs,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, isNull, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsersByEntity(entityId: number): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;

  getEntities(): Promise<Entity[]>;
  getEntity(id: number): Promise<Entity | undefined>;
  createEntity(entity: InsertEntity): Promise<Entity>;
  updateEntity(id: number, data: Partial<InsertEntity>): Promise<Entity | undefined>;

  getUnits(entityId: number): Promise<Unit[]>;
  getUnit(id: number): Promise<Unit | undefined>;
  getUnitByIdentifier(entityId: number, unitIdentifier: string): Promise<Unit | undefined>;
  createUnit(unit: InsertUnit): Promise<Unit>;
  updateUnit(id: number, data: Partial<InsertUnit>): Promise<Unit | undefined>;
  deleteUnit(id: number): Promise<void>;
  getSensorsByUnit(unitId: number): Promise<Sensor[]>;
  getResidentByUnit(unitId: number): Promise<Resident | undefined>;

  getResidents(entityId: number): Promise<Resident[]>;
  getResident(id: number): Promise<Resident | undefined>;
  createResident(resident: InsertResident): Promise<Resident>;
  updateResident(id: number, data: Partial<InsertResident>): Promise<Resident | undefined>;
  updateResidentStatus(id: number, status: string, lastActivityAt?: Date): Promise<void>;

  getSensors(entityId: number): Promise<Sensor[]>;
  getSensor(id: number): Promise<Sensor | undefined>;
  getSensorByAdtId(adtDeviceId: string): Promise<Sensor | undefined>;
  getSensorByEsp32Mac(deviceMac: string): Promise<Sensor | undefined>;
  createSensor(sensor: InsertSensor): Promise<Sensor>;
  updateSensor(id: number, data: Partial<InsertSensor>): Promise<Sensor | undefined>;

  createEsp32SensorData(data: InsertEsp32SensorData): Promise<Esp32SensorData>;
  getEsp32SensorData(unitId: number, limit?: number): Promise<Esp32SensorData[]>;
  getLatestEsp32SensorData(unitId: number): Promise<Esp32SensorData | undefined>;

  getUnitByEsp32Mac(deviceMac: string): Promise<Unit | undefined>;

  createMotionEvent(event: InsertMotionEvent): Promise<MotionEvent>;
  getMotionEvents(entityId: number, limit?: number): Promise<MotionEvent[]>;
  getResidentMotionEvents(residentId: number, limit?: number): Promise<MotionEvent[]>;

  getScenarioConfigs(entityId: number): Promise<ScenarioConfig[]>;
  getScenarioConfig(id: number): Promise<ScenarioConfig | undefined>;
  getScenarioConfigsForResident(residentId: number, entityId: number): Promise<ScenarioConfig[]>;
  createScenarioConfig(config: InsertScenarioConfig): Promise<ScenarioConfig>;
  updateScenarioConfig(id: number, data: Partial<InsertScenarioConfig>): Promise<ScenarioConfig | undefined>;

  getActiveScenarios(entityId: number): Promise<ActiveScenario[]>;
  getActiveScenario(id: number): Promise<ActiveScenario | undefined>;
  getActiveScenariosForResident(residentId: number): Promise<ActiveScenario[]>;
  createActiveScenario(scenario: InsertActiveScenario): Promise<ActiveScenario>;
  updateActiveScenario(id: number, data: Partial<ActiveScenario>): Promise<ActiveScenario | undefined>;
  resolveActiveScenario(id: number, resolvedBy: string): Promise<void>;

  getAlerts(entityId: number, limit?: number): Promise<Alert[]>;
  getAlert(id: number): Promise<Alert | undefined>;
  getUnreadAlerts(entityId: number): Promise<Alert[]>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  acknowledgeAlert(id: number, acknowledgedBy: string): Promise<void>;
  markAlertRead(id: number): Promise<void>;

  getConversations(residentId: number): Promise<Conversation[]>;
  getConversation(id: number): Promise<Conversation | undefined>;
  createConversation(conv: InsertConversation): Promise<Conversation>;

  getMessages(conversationId: number): Promise<Message[]>;
  getRecentMessages(conversationId: number, limit?: number): Promise<Message[]>;
  createMessage(msg: InsertMessage): Promise<Message>;
  getActiveConversationForResident(entityId: number, residentId: number): Promise<Conversation | undefined>;

  getCommunityBroadcasts(entityId: number, limit?: number): Promise<CommunityBroadcast[]>;
  createCommunityBroadcast(broadcast: InsertCommunityBroadcast): Promise<CommunityBroadcast>;

  getLatestConversationMessages(residentId: number, limit?: number): Promise<Message[]>;

  getResidentByAnonymousUsername(entityId: number, username: string): Promise<Resident | undefined>;
  createMobileToken(token: InsertMobileToken): Promise<MobileToken>;
  getMobileTokenByToken(token: string): Promise<MobileToken | undefined>;
  updateMobileTokenLastUsed(id: number): Promise<void>;
  updateMobileTokenValue(id: number, token: string): Promise<void>;
  deactivateMobileToken(id: number): Promise<void>;
  getActiveMobileTokens(residentId: number): Promise<MobileToken[]>;

  seedDemoData(entityId: number): Promise<void>;

  getSuperAdminByEmail(email: string): Promise<SuperAdmin | undefined>;
  getSuperAdmin(id: number): Promise<SuperAdmin | undefined>;
  getAllSuperAdmins(): Promise<SuperAdmin[]>;
  createSuperAdmin(admin: InsertSuperAdmin): Promise<SuperAdmin>;
  updateSuperAdmin(id: number, data: Partial<SuperAdmin>): Promise<SuperAdmin | undefined>;

  getFacilities(): Promise<Facility[]>;
  getFacility(id: number): Promise<Facility | undefined>;
  getFacilityByFacilityId(facilityId: string): Promise<Facility | undefined>;
  getFacilityByContactEmail(email: string): Promise<Facility | undefined>;
  getFacilityByVerificationToken(token: string): Promise<Facility | undefined>;
  getFacilityByLinkedEntityId(entityId: number): Promise<Facility | undefined>;
  getExpiredTrialFacilities(): Promise<Facility[]>;
  createFacility(facility: InsertFacility): Promise<Facility>;
  updateFacility(id: number, data: Partial<Facility>): Promise<Facility | undefined>;
  deleteFacility(id: number): Promise<void>;

  createFacilityHealthLog(log: InsertFacilityHealthLog): Promise<FacilityHealthLog>;
  getFacilityHealthLogs(facilityId: number, limit?: number): Promise<FacilityHealthLog[]>;

  createMaintenanceLog(log: InsertMaintenanceLog): Promise<MaintenanceLog>;
  getMaintenanceLogs(facilityId: number, limit?: number): Promise<MaintenanceLog[]>;
  updateMaintenanceLog(id: number, data: Partial<MaintenanceLog>): Promise<MaintenanceLog | undefined>;

  getUserPreferences(residentId: number): Promise<UserPreferences | undefined>;
  upsertUserPreferences(prefs: InsertUserPreferences): Promise<UserPreferences>;

  createDevicePairingCode(code: InsertDevicePairingCode): Promise<DevicePairingCode>;
  getDevicePairingCode(code: string): Promise<DevicePairingCode | undefined>;
  getDevicePairingCodesForUnit(unitId: number): Promise<DevicePairingCode[]>;
  markPairingCodeUsed(id: number, residentId: number): Promise<void>;

  createSpeakerEvent(event: InsertSpeakerEvent): Promise<SpeakerEvent>;
  getSpeakerEvents(unitId: number, limit?: number): Promise<SpeakerEvent[]>;
  updateSpeakerEvent(id: number, data: Partial<SpeakerEvent>): Promise<SpeakerEvent | undefined>;

  createCentralLogEntry(entry: InsertCentralLogEntry): Promise<CentralLogEntry>;
  getCentralLogEntries(facilityId?: number, limit?: number): Promise<CentralLogEntry[]>;
  getCentralLogEntriesBySeverity(severity: string, limit?: number): Promise<CentralLogEntry[]>;

  getRecoveryScripts(): Promise<RecoveryScript[]>;
  getRecoveryScript(id: number): Promise<RecoveryScript | undefined>;
  createRecoveryScript(script: InsertRecoveryScript): Promise<RecoveryScript>;
  seedRecoveryScripts(): Promise<void>;

  createRecoveryExecutionLog(log: InsertRecoveryExecutionLog): Promise<RecoveryExecutionLog>;
  getRecoveryExecutionLogs(facilityId: number, limit?: number): Promise<RecoveryExecutionLog[]>;
  updateRecoveryExecutionLog(id: number, data: Partial<RecoveryExecutionLog>): Promise<RecoveryExecutionLog | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUsersByEntity(entityId: number): Promise<User[]> {
    return db.select().from(users).where(eq(users.entityId, entityId)).orderBy(users.fullName);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async getEntities(): Promise<Entity[]> {
    return db.select().from(entities).orderBy(entities.name);
  }

  async getEntity(id: number): Promise<Entity | undefined> {
    const [entity] = await db.select().from(entities).where(eq(entities.id, id));
    return entity;
  }

  async createEntity(entity: InsertEntity): Promise<Entity> {
    const [created] = await db.insert(entities).values(entity).returning();
    return created;
  }

  async updateEntity(id: number, data: Partial<InsertEntity>): Promise<Entity | undefined> {
    const [updated] = await db.update(entities).set(data).where(eq(entities.id, id)).returning();
    return updated;
  }

  async getUnits(entityId: number): Promise<Unit[]> {
    return db.select().from(units).where(eq(units.entityId, entityId)).orderBy(units.unitIdentifier);
  }

  async getUnit(id: number): Promise<Unit | undefined> {
    const [unit] = await db.select().from(units).where(eq(units.id, id));
    return unit;
  }

  async getUnitByIdentifier(entityId: number, unitIdentifier: string): Promise<Unit | undefined> {
    const [unit] = await db.select().from(units)
      .where(and(eq(units.entityId, entityId), eq(units.unitIdentifier, unitIdentifier)));
    return unit;
  }

  async createUnit(unit: InsertUnit): Promise<Unit> {
    const [created] = await db.insert(units).values(unit).returning();
    return created;
  }

  async updateUnit(id: number, data: Partial<InsertUnit>): Promise<Unit | undefined> {
    const [updated] = await db.update(units).set(data).where(eq(units.id, id)).returning();
    return updated;
  }

  async deleteUnit(id: number): Promise<void> {
    await db.update(residents).set({ unitId: null } as any).where(eq(residents.unitId, id));
    await db.update(sensors).set({ unitId: null } as any).where(eq(sensors.unitId, id));
    await db.delete(units).where(eq(units.id, id));
  }

  async getSensorsByUnit(unitId: number): Promise<Sensor[]> {
    return db.select().from(sensors).where(eq(sensors.unitId, unitId));
  }

  async getResidentByUnit(unitId: number): Promise<Resident | undefined> {
    const [resident] = await db.select().from(residents)
      .where(and(eq(residents.unitId, unitId), eq(residents.isActive, true)));
    return resident;
  }

  async getResidents(entityId: number): Promise<Resident[]> {
    return db.select().from(residents).where(eq(residents.entityId, entityId)).orderBy(residents.lastName);
  }

  async getResident(id: number): Promise<Resident | undefined> {
    const [resident] = await db.select().from(residents).where(eq(residents.id, id));
    return resident;
  }

  async createResident(resident: InsertResident): Promise<Resident> {
    const [created] = await db.insert(residents).values(resident).returning();
    return created;
  }

  async updateResident(id: number, data: Partial<InsertResident>): Promise<Resident | undefined> {
    const [updated] = await db.update(residents).set(data).where(eq(residents.id, id)).returning();
    return updated;
  }

  async updateResidentStatus(id: number, status: string, lastActivityAt?: Date): Promise<void> {
    const updateData: any = { status };
    if (lastActivityAt) updateData.lastActivityAt = lastActivityAt;
    await db.update(residents).set(updateData).where(eq(residents.id, id));
  }

  async getSensors(entityId: number): Promise<Sensor[]> {
    return db.select().from(sensors).where(eq(sensors.entityId, entityId));
  }

  async getSensor(id: number): Promise<Sensor | undefined> {
    const [sensor] = await db.select().from(sensors).where(eq(sensors.id, id));
    return sensor;
  }

  async getSensorByAdtId(adtDeviceId: string): Promise<Sensor | undefined> {
    const [sensor] = await db.select().from(sensors).where(eq(sensors.adtDeviceId, adtDeviceId));
    return sensor;
  }

  async createSensor(sensor: InsertSensor): Promise<Sensor> {
    const [created] = await db.insert(sensors).values(sensor).returning();
    return created;
  }

  async updateSensor(id: number, data: Partial<InsertSensor>): Promise<Sensor | undefined> {
    const [updated] = await db.update(sensors).set(data).where(eq(sensors.id, id)).returning();
    return updated;
  }

  async getSensorByEsp32Mac(deviceMac: string): Promise<Sensor | undefined> {
    const [sensor] = await db.select().from(sensors).where(eq(sensors.esp32DeviceMac, deviceMac));
    return sensor;
  }

  async createEsp32SensorData(data: InsertEsp32SensorData): Promise<Esp32SensorData> {
    const [created] = await db.insert(esp32SensorData).values(data).returning();
    return created;
  }

  async getEsp32SensorData(unitId: number, limit = 50): Promise<Esp32SensorData[]> {
    return db.select().from(esp32SensorData).where(eq(esp32SensorData.unitId, unitId)).orderBy(desc(esp32SensorData.createdAt)).limit(limit);
  }

  async getLatestEsp32SensorData(unitId: number): Promise<Esp32SensorData | undefined> {
    const [data] = await db.select().from(esp32SensorData).where(eq(esp32SensorData.unitId, unitId)).orderBy(desc(esp32SensorData.createdAt)).limit(1);
    return data;
  }

  async getUnitByEsp32Mac(deviceMac: string): Promise<Unit | undefined> {
    const [unit] = await db.select().from(units).where(eq(units.esp32DeviceMac, deviceMac));
    return unit;
  }

  async createMotionEvent(event: InsertMotionEvent): Promise<MotionEvent> {
    const [created] = await db.insert(motionEvents).values(event).returning();
    return created;
  }

  async getMotionEvents(entityId: number, limit = 50): Promise<MotionEvent[]> {
    return db.select().from(motionEvents).where(eq(motionEvents.entityId, entityId)).orderBy(desc(motionEvents.createdAt)).limit(limit);
  }

  async getResidentMotionEvents(residentId: number, limit = 50): Promise<MotionEvent[]> {
    return db.select().from(motionEvents).where(eq(motionEvents.residentId, residentId)).orderBy(desc(motionEvents.createdAt)).limit(limit);
  }

  async getScenarioConfigs(entityId: number): Promise<ScenarioConfig[]> {
    return db.select().from(scenarioConfigs).where(eq(scenarioConfigs.entityId, entityId));
  }

  async getScenarioConfig(id: number): Promise<ScenarioConfig | undefined> {
    const [config] = await db.select().from(scenarioConfigs).where(eq(scenarioConfigs.id, id));
    return config;
  }

  async getScenarioConfigsForResident(residentId: number, entityId: number): Promise<ScenarioConfig[]> {
    const residentSpecific = await db.select().from(scenarioConfigs)
      .where(and(eq(scenarioConfigs.residentId, residentId), eq(scenarioConfigs.isActive, true)));
    const entityWide = await db.select().from(scenarioConfigs)
      .where(and(eq(scenarioConfigs.entityId, entityId), isNull(scenarioConfigs.residentId), eq(scenarioConfigs.isActive, true)));
    const residentTypes = new Set(residentSpecific.map(c => c.scenarioType));
    const merged = [...residentSpecific];
    for (const config of entityWide) {
      if (!residentTypes.has(config.scenarioType)) merged.push(config);
    }
    return merged;
  }

  async createScenarioConfig(config: InsertScenarioConfig): Promise<ScenarioConfig> {
    const [created] = await db.insert(scenarioConfigs).values(config).returning();
    return created;
  }

  async updateScenarioConfig(id: number, data: Partial<InsertScenarioConfig>): Promise<ScenarioConfig | undefined> {
    const [updated] = await db.update(scenarioConfigs).set(data).where(eq(scenarioConfigs.id, id)).returning();
    return updated;
  }

  async getActiveScenarios(entityId: number): Promise<ActiveScenario[]> {
    return db.select().from(activeScenarios)
      .where(and(eq(activeScenarios.entityId, entityId), eq(activeScenarios.status, "active")))
      .orderBy(desc(activeScenarios.createdAt));
  }

  async getActiveScenario(id: number): Promise<ActiveScenario | undefined> {
    const [scenario] = await db.select().from(activeScenarios).where(eq(activeScenarios.id, id));
    return scenario;
  }

  async getActiveScenariosForResident(residentId: number): Promise<ActiveScenario[]> {
    return db.select().from(activeScenarios)
      .where(and(eq(activeScenarios.residentId, residentId), eq(activeScenarios.status, "active")));
  }

  async createActiveScenario(scenario: InsertActiveScenario): Promise<ActiveScenario> {
    const [created] = await db.insert(activeScenarios).values(scenario).returning();
    return created;
  }

  async updateActiveScenario(id: number, data: Partial<ActiveScenario>): Promise<ActiveScenario | undefined> {
    const [updated] = await db.update(activeScenarios).set(data as any).where(eq(activeScenarios.id, id)).returning();
    return updated;
  }

  async resolveActiveScenario(id: number, resolvedBy: string): Promise<void> {
    await db.update(activeScenarios).set({
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy,
    } as any).where(eq(activeScenarios.id, id));
  }

  async getAlerts(entityId: number, limit = 50): Promise<Alert[]> {
    return db.select().from(alerts).where(eq(alerts.entityId, entityId)).orderBy(desc(alerts.createdAt)).limit(limit);
  }

  async getAlert(id: number): Promise<Alert | undefined> {
    const [alert] = await db.select().from(alerts).where(eq(alerts.id, id));
    return alert;
  }

  async getUnreadAlerts(entityId: number): Promise<Alert[]> {
    return db.select().from(alerts)
      .where(and(eq(alerts.entityId, entityId), eq(alerts.isRead, false)))
      .orderBy(desc(alerts.createdAt));
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    const [created] = await db.insert(alerts).values(alert).returning();
    return created;
  }

  async acknowledgeAlert(id: number, acknowledgedBy: string): Promise<void> {
    await db.update(alerts).set({ isAcknowledged: true, acknowledgedBy, isRead: true }).where(eq(alerts.id, id));
  }

  async markAlertRead(id: number): Promise<void> {
    await db.update(alerts).set({ isRead: true }).where(eq(alerts.id, id));
  }

  async getConversations(residentId: number): Promise<Conversation[]> {
    return db.select().from(conversations).where(eq(conversations.residentId, residentId)).orderBy(desc(conversations.createdAt));
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conv;
  }

  async createConversation(conv: InsertConversation): Promise<Conversation> {
    const [created] = await db.insert(conversations).values(conv).returning();
    return created;
  }

  async getMessages(conversationId: number): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  }

  async getRecentMessages(conversationId: number, limit: number = 20): Promise<Message[]> {
    const result = await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return result.reverse();
  }

  async createMessage(msg: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(msg).returning();
    return created;
  }

  async getActiveConversationForResident(entityId: number, residentId: number): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations)
      .where(and(
        eq(conversations.entityId, entityId),
        eq(conversations.residentId, residentId),
        eq(conversations.isActive, true),
        isNull(conversations.scenarioId),
      ))
      .orderBy(desc(conversations.createdAt))
      .limit(1);
    return conv;
  }

  async seedDemoData(entityId: number): Promise<void> {
    const existingResidents = await this.getResidents(entityId);
    if (existingResidents.length > 0) return;

    const demoResidents = [
      {
        entityId,
        firstName: "Margaret",
        lastName: "Chen",
        dateOfBirth: "1942-03-15",
        roomNumber: "101",
        emergencyContact: "David Chen",
        emergencyPhone: "555-0101",
        preferredName: "Maggie",
        communicationStyle: "warm and chatty, loves talking about her garden",
        status: "safe",
        intakeInterviewData: { hobbies: ["gardening", "reading", "tea ceremonies"], personality: "outgoing", concerns: ["mobility"], familyNotes: "Daughter visits weekly" },
        digitalTwinPersona: { tone: "warm", topics: ["gardening", "family", "cooking"], avoidTopics: ["hospital stays"], greeting: "Hello Maggie dear, how are you feeling today?" },
      },
      {
        entityId,
        firstName: "Robert",
        lastName: "Williams",
        dateOfBirth: "1938-07-22",
        roomNumber: "205",
        emergencyContact: "Sarah Williams",
        emergencyPhone: "555-0205",
        preferredName: "Bob",
        communicationStyle: "direct and brief, ex-military, appreciates efficiency",
        status: "safe",
        intakeInterviewData: { hobbies: ["chess", "history documentaries", "woodworking"], personality: "reserved but friendly", concerns: ["balance"], familyNotes: "Son calls twice weekly" },
        digitalTwinPersona: { tone: "respectful and direct", topics: ["history", "sports", "woodworking"], avoidTopics: ["late wife"], greeting: "Good day Bob, checking in on you." },
      },
      {
        entityId,
        firstName: "Eleanor",
        lastName: "Patel",
        dateOfBirth: "1945-11-08",
        roomNumber: "310",
        emergencyContact: "Amit Patel",
        emergencyPhone: "555-0310",
        preferredName: "Ellie",
        communicationStyle: "gentle and thoughtful, enjoys deep conversations",
        status: "safe",
        intakeInterviewData: { hobbies: ["painting", "classical music", "bird watching"], personality: "introspective and creative", concerns: ["vision"], familyNotes: "Grandson visits on weekends" },
        digitalTwinPersona: { tone: "gentle and encouraging", topics: ["art", "nature", "music"], avoidTopics: ["driving"], greeting: "Hello Ellie, it's lovely to chat with you." },
      },
    ];

    for (const r of demoResidents) {
      await this.createResident(r as any);
    }

    const demoSensors = [
      { entityId, residentId: null, sensorType: "motion", location: "hallway_main", adtDeviceId: "ADT-HALL-001" },
      { entityId, residentId: null, sensorType: "motion", location: "common_room", adtDeviceId: "ADT-COM-001" },
      { entityId, residentId: null, sensorType: "motion", location: "dining_room", adtDeviceId: "ADT-DIN-001" },
    ];

    for (const s of demoSensors) {
      await this.createSensor(s as any);
    }

    const defaultScenarios: InsertScenarioConfig[] = [
      { entityId, scenarioType: "inactivity_gentle", label: "Gentle Check-in (Scenario A)", triggerMinutes: 10, escalationMinutes: 5, maxEscalations: 1, isActive: true },
      { entityId, scenarioType: "inactivity_urgent", label: "Urgent Non-Response (Scenario B)", triggerMinutes: 15, escalationMinutes: 3, maxEscalations: 3, isActive: true },
      { entityId, scenarioType: "fall_detected", label: "Fall Detection (Scenario C)", triggerMinutes: 1, escalationMinutes: 2, maxEscalations: 2, isActive: true },
      { entityId, scenarioType: "bathroom_extended", label: "Extended Bathroom Time", triggerMinutes: 20, escalationMinutes: 5, maxEscalations: 2, locations: ["bathroom", "washroom"], isActive: true },
      { entityId, scenarioType: "shower_extended", label: "Extended Shower Time", triggerMinutes: 30, escalationMinutes: 5, maxEscalations: 2, locations: ["shower", "bathroom"], isActive: true },
    ];

    for (const sc of defaultScenarios) {
      await this.createScenarioConfig(sc);
    }
  }

  async getCommunityBroadcasts(entityId: number, limit: number = 20): Promise<CommunityBroadcast[]> {
    return db.select().from(communityBroadcasts)
      .where(eq(communityBroadcasts.entityId, entityId))
      .orderBy(desc(communityBroadcasts.createdAt))
      .limit(limit);
  }

  async createCommunityBroadcast(broadcast: InsertCommunityBroadcast): Promise<CommunityBroadcast> {
    const [created] = await db.insert(communityBroadcasts).values(broadcast).returning();
    return created;
  }

  async getLatestConversationMessages(residentId: number, limit: number = 10): Promise<Message[]> {
    const latestConv = await db.select()
      .from(conversations)
      .where(and(eq(conversations.residentId, residentId), isNull(conversations.scenarioId)))
      .orderBy(desc(conversations.createdAt))
      .limit(1);

    if (latestConv.length === 0) return [];

    return db.select().from(messages)
      .where(eq(messages.conversationId, latestConv[0].id))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
  }

  async getResidentByAnonymousUsername(entityId: number, username: string): Promise<Resident | undefined> {
    const [resident] = await db.select().from(residents)
      .where(and(eq(residents.entityId, entityId), eq(residents.anonymousUsername, username)));
    return resident;
  }

  async createMobileToken(token: InsertMobileToken): Promise<MobileToken> {
    const [created] = await db.insert(mobileTokens).values(token).returning();
    return created;
  }

  async getMobileTokenByToken(token: string): Promise<MobileToken | undefined> {
    const [found] = await db.select().from(mobileTokens)
      .where(and(eq(mobileTokens.token, token), eq(mobileTokens.isActive, true)));
    return found;
  }

  async updateMobileTokenLastUsed(id: number): Promise<void> {
    await db.update(mobileTokens).set({ lastUsedAt: new Date() }).where(eq(mobileTokens.id, id));
  }

  async updateMobileTokenValue(id: number, token: string): Promise<void> {
    await db.update(mobileTokens).set({ token }).where(eq(mobileTokens.id, id));
  }

  async deactivateMobileToken(id: number): Promise<void> {
    await db.update(mobileTokens).set({ isActive: false }).where(eq(mobileTokens.id, id));
  }

  async getActiveMobileTokens(residentId: number): Promise<MobileToken[]> {
    return db.select().from(mobileTokens)
      .where(and(eq(mobileTokens.residentId, residentId), eq(mobileTokens.isActive, true)));
  }

  async getSuperAdminByEmail(email: string): Promise<SuperAdmin | undefined> {
    const [admin] = await db.select().from(superAdmins).where(eq(superAdmins.email, email));
    return admin;
  }

  async getSuperAdmin(id: number): Promise<SuperAdmin | undefined> {
    const [admin] = await db.select().from(superAdmins).where(eq(superAdmins.id, id));
    return admin;
  }

  async getAllSuperAdmins(): Promise<SuperAdmin[]> {
    return db.select().from(superAdmins).where(eq(superAdmins.isActive, true));
  }

  async createSuperAdmin(admin: InsertSuperAdmin): Promise<SuperAdmin> {
    const [created] = await db.insert(superAdmins).values(admin).returning();
    return created;
  }

  async updateSuperAdmin(id: number, data: Partial<SuperAdmin>): Promise<SuperAdmin | undefined> {
    const [updated] = await db.update(superAdmins).set(data as any).where(eq(superAdmins.id, id)).returning();
    return updated;
  }

  async getFacilities(): Promise<Facility[]> {
    return db.select().from(facilities).orderBy(facilities.name);
  }

  async getFacility(id: number): Promise<Facility | undefined> {
    const [facility] = await db.select().from(facilities).where(eq(facilities.id, id));
    return facility;
  }

  async getFacilityByFacilityId(facilityId: string): Promise<Facility | undefined> {
    const [facility] = await db.select().from(facilities).where(eq(facilities.facilityId, facilityId));
    return facility;
  }

  async getFacilityByContactEmail(email: string): Promise<Facility | undefined> {
    const [facility] = await db.select().from(facilities).where(eq(facilities.contactEmail, email));
    return facility;
  }

  async getFacilityByVerificationToken(token: string): Promise<Facility | undefined> {
    const [facility] = await db.select().from(facilities).where(eq(facilities.verificationToken, token));
    return facility;
  }

  async getFacilityByLinkedEntityId(entityId: number): Promise<Facility | undefined> {
    const [facility] = await db.select().from(facilities).where(eq(facilities.linkedEntityId, entityId));
    return facility;
  }

  async getExpiredTrialFacilities(): Promise<Facility[]> {
    return db.select().from(facilities).where(
      and(
        eq(facilities.subscriptionStatus, "trial"),
        sql`${facilities.trialEndsAt} < NOW()`
      )
    );
  }

  async createFacility(facility: InsertFacility): Promise<Facility> {
    const [created] = await db.insert(facilities).values(facility).returning();
    return created;
  }

  async updateFacility(id: number, data: Partial<Facility>): Promise<Facility | undefined> {
    const [updated] = await db.update(facilities).set(data as any).where(eq(facilities.id, id)).returning();
    return updated;
  }

  async deleteFacility(id: number): Promise<void> {
    await db.delete(facilities).where(eq(facilities.id, id));
  }

  async createFacilityHealthLog(healthLog: InsertFacilityHealthLog): Promise<FacilityHealthLog> {
    const [created] = await db.insert(facilityHealthLogs).values(healthLog).returning();
    return created;
  }

  async getFacilityHealthLogs(facilityId: number, limit: number = 50): Promise<FacilityHealthLog[]> {
    return db.select().from(facilityHealthLogs)
      .where(eq(facilityHealthLogs.facilityId, facilityId))
      .orderBy(desc(facilityHealthLogs.checkedAt))
      .limit(limit);
  }

  async createMaintenanceLog(log: InsertMaintenanceLog): Promise<MaintenanceLog> {
    const [created] = await db.insert(maintenanceLogs).values(log).returning();
    return created;
  }

  async getMaintenanceLogs(facilityId: number, limit: number = 50): Promise<MaintenanceLog[]> {
    return db.select().from(maintenanceLogs)
      .where(eq(maintenanceLogs.facilityId, facilityId))
      .orderBy(desc(maintenanceLogs.createdAt))
      .limit(limit);
  }

  async updateMaintenanceLog(id: number, data: Partial<MaintenanceLog>): Promise<MaintenanceLog | undefined> {
    const [updated] = await db.update(maintenanceLogs).set(data).where(eq(maintenanceLogs.id, id)).returning();
    return updated;
  }

  async getUserPreferences(residentId: number): Promise<UserPreferences | undefined> {
    const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.residentId, residentId));
    return prefs;
  }

  async upsertUserPreferences(prefs: InsertUserPreferences): Promise<UserPreferences> {
    const existing = await this.getUserPreferences(prefs.residentId);
    if (existing) {
      const [updated] = await db.update(userPreferences)
        .set({ ...prefs, updatedAt: new Date() })
        .where(eq(userPreferences.residentId, prefs.residentId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(userPreferences).values(prefs).returning();
    return created;
  }

  async createDevicePairingCode(code: InsertDevicePairingCode): Promise<DevicePairingCode> {
    const [created] = await db.insert(devicePairingCodes).values(code).returning();
    return created;
  }

  async getDevicePairingCode(code: string): Promise<DevicePairingCode | undefined> {
    const [found] = await db.select().from(devicePairingCodes).where(eq(devicePairingCodes.code, code));
    return found;
  }

  async getDevicePairingCodesForUnit(unitId: number): Promise<DevicePairingCode[]> {
    return db.select().from(devicePairingCodes)
      .where(eq(devicePairingCodes.unitId, unitId))
      .orderBy(desc(devicePairingCodes.createdAt));
  }

  async markPairingCodeUsed(id: number, residentId: number): Promise<void> {
    await db.update(devicePairingCodes)
      .set({ isUsed: true, usedByResidentId: residentId })
      .where(eq(devicePairingCodes.id, id));
  }

  async createSpeakerEvent(event: InsertSpeakerEvent): Promise<SpeakerEvent> {
    const [created] = await db.insert(speakerEvents).values(event).returning();
    return created;
  }

  async getSpeakerEvents(unitId: number, limit: number = 50): Promise<SpeakerEvent[]> {
    return db.select().from(speakerEvents)
      .where(eq(speakerEvents.unitId, unitId))
      .orderBy(desc(speakerEvents.createdAt))
      .limit(limit);
  }

  async updateSpeakerEvent(id: number, data: Partial<SpeakerEvent>): Promise<SpeakerEvent | undefined> {
    const [updated] = await db.update(speakerEvents).set(data).where(eq(speakerEvents.id, id)).returning();
    return updated;
  }

  async createCentralLogEntry(entry: InsertCentralLogEntry): Promise<CentralLogEntry> {
    const [created] = await db.insert(centralLogEntries).values(entry).returning();
    return created;
  }

  async getCentralLogEntries(facilityId?: number, limit: number = 100): Promise<CentralLogEntry[]> {
    if (facilityId) {
      return db.select().from(centralLogEntries)
        .where(eq(centralLogEntries.facilityId, facilityId))
        .orderBy(desc(centralLogEntries.createdAt))
        .limit(limit);
    }
    return db.select().from(centralLogEntries)
      .orderBy(desc(centralLogEntries.createdAt))
      .limit(limit);
  }

  async getCentralLogEntriesBySeverity(severity: string, limit: number = 100): Promise<CentralLogEntry[]> {
    return db.select().from(centralLogEntries)
      .where(eq(centralLogEntries.severity, severity as any))
      .orderBy(desc(centralLogEntries.createdAt))
      .limit(limit);
  }

  async getRecoveryScripts(): Promise<RecoveryScript[]> {
    return db.select().from(recoveryScripts).where(eq(recoveryScripts.isActive, true));
  }

  async getRecoveryScript(id: number): Promise<RecoveryScript | undefined> {
    const [script] = await db.select().from(recoveryScripts).where(eq(recoveryScripts.id, id));
    return script;
  }

  async createRecoveryScript(script: InsertRecoveryScript): Promise<RecoveryScript> {
    const [created] = await db.insert(recoveryScripts).values(script).returning();
    return created;
  }

  async seedRecoveryScripts(): Promise<void> {
    const existing = await db.select().from(recoveryScripts);
    if (existing.length > 0) return;

    const scripts: InsertRecoveryScript[] = [
      {
        name: "db_vacuum_analyze",
        description: "Run VACUUM ANALYZE on database tables to reclaim space and update statistics",
        scriptType: "database",
        commandSequence: ["vacuum_analyze"],
        isActive: true,
      },
      {
        name: "clear_stale_sessions",
        description: "Clear expired mobile tokens and stale WebSocket sessions",
        scriptType: "connectivity",
        commandSequence: ["clear_expired_tokens", "reset_ws_connections"],
        isActive: true,
      },
      {
        name: "reset_ai_engine",
        description: "Reset AI engine client, clear persona cache, and reinitialize Gemini connection",
        scriptType: "service",
        commandSequence: ["reset_ai_client", "clear_persona_cache"],
        isActive: true,
      },
      {
        name: "fix_sensor_sync",
        description: "Re-synchronize motion sensor assignments and clear stale sensor events",
        scriptType: "hardware",
        commandSequence: ["resync_sensors", "clear_stale_events"],
        isActive: true,
      },
      {
        name: "restart_inactivity_monitor",
        description: "Stop and restart the inactivity monitoring service to clear stuck scenarios",
        scriptType: "service",
        commandSequence: ["stop_inactivity_monitor", "clear_stuck_scenarios", "start_inactivity_monitor"],
        isActive: true,
      },
    ];

    for (const script of scripts) {
      await db.insert(recoveryScripts).values(script).onConflictDoNothing();
    }
  }

  async createRecoveryExecutionLog(log: InsertRecoveryExecutionLog): Promise<RecoveryExecutionLog> {
    const [created] = await db.insert(recoveryExecutionLogs).values(log).returning();
    return created;
  }

  async getRecoveryExecutionLogs(facilityId: number, limit: number = 50): Promise<RecoveryExecutionLog[]> {
    return db.select().from(recoveryExecutionLogs)
      .where(eq(recoveryExecutionLogs.facilityId, facilityId))
      .orderBy(desc(recoveryExecutionLogs.createdAt))
      .limit(limit);
  }

  async updateRecoveryExecutionLog(id: number, data: Partial<RecoveryExecutionLog>): Promise<RecoveryExecutionLog | undefined> {
    const [updated] = await db.update(recoveryExecutionLogs).set(data).where(eq(recoveryExecutionLogs.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
