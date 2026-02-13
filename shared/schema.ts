import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, boolean, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "staff"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default("staff"),
  entityId: integer("entity_id"),
  fullName: text("full_name").notNull(),
});

export const entities = pgTable("entities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("facility"),
  address: text("address"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const residents = pgTable("residents", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: text("date_of_birth"),
  roomNumber: text("room_number"),
  emergencyContact: text("emergency_contact"),
  emergencyPhone: text("emergency_phone"),
  medicalNotes: text("medical_notes"),
  intakeInterviewData: jsonb("intake_interview_data"),
  digitalTwinPersona: jsonb("digital_twin_persona"),
  preferredName: text("preferred_name"),
  communicationStyle: text("communication_style"),
  isActive: boolean("is_active").notNull().default(true),
  lastActivityAt: timestamp("last_activity_at"),
  status: text("status").notNull().default("safe"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const sensors = pgTable("sensors", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  residentId: integer("resident_id"),
  sensorType: text("sensor_type").notNull().default("motion"),
  location: text("location").notNull(),
  adtDeviceId: text("adt_device_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const motionEvents = pgTable("motion_events", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  sensorId: integer("sensor_id").notNull(),
  residentId: integer("resident_id"),
  eventType: text("event_type").notNull(),
  location: text("location").notNull(),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const scenarioTypeEnum = pgEnum("scenario_type", ["inactivity_gentle", "inactivity_urgent", "fall_detected", "bathroom_extended", "shower_extended", "custom"]);
export const scenarioStatusEnum = pgEnum("scenario_status", ["active", "resolved", "escalated", "staff_alerted"]);

export const scenarioConfigs = pgTable("scenario_configs", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  residentId: integer("resident_id"),
  scenarioType: scenarioTypeEnum("scenario_type").notNull(),
  label: text("label").notNull(),
  triggerMinutes: integer("trigger_minutes").notNull().default(10),
  escalationMinutes: integer("escalation_minutes").notNull().default(5),
  maxEscalations: integer("max_escalations").notNull().default(3),
  locations: text("locations").array(),
  aiPromptOverride: text("ai_prompt_override"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const activeScenarios = pgTable("active_scenarios", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  residentId: integer("resident_id").notNull(),
  scenarioConfigId: integer("scenario_config_id").notNull(),
  scenarioType: scenarioTypeEnum("scenario_type").notNull(),
  status: scenarioStatusEnum("status").notNull().default("active"),
  escalationLevel: integer("escalation_level").notNull().default(0),
  triggerLocation: text("trigger_location"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const alertSeverityEnum = pgEnum("alert_severity", ["info", "warning", "critical", "emergency"]);

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  residentId: integer("resident_id"),
  scenarioId: integer("scenario_id"),
  severity: alertSeverityEnum("severity").notNull().default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  isAcknowledged: boolean("is_acknowledged").notNull().default(false),
  acknowledgedBy: text("acknowledged_by"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  residentId: integer("resident_id").notNull(),
  scenarioId: integer("scenario_id"),
  title: text("title").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertEntitySchema = createInsertSchema(entities).omit({ id: true, createdAt: true });
export const insertResidentSchema = createInsertSchema(residents).omit({ id: true, createdAt: true, lastActivityAt: true });
export const insertSensorSchema = createInsertSchema(sensors).omit({ id: true, createdAt: true });
export const insertMotionEventSchema = createInsertSchema(motionEvents).omit({ id: true, createdAt: true });
export const insertScenarioConfigSchema = createInsertSchema(scenarioConfigs).omit({ id: true, createdAt: true });
export const insertActiveScenarioSchema = createInsertSchema(activeScenarios).omit({ id: true, createdAt: true });
export const insertAlertSchema = createInsertSchema(alerts).omit({ id: true, createdAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Resident = typeof residents.$inferSelect;
export type InsertResident = z.infer<typeof insertResidentSchema>;
export type Sensor = typeof sensors.$inferSelect;
export type InsertSensor = z.infer<typeof insertSensorSchema>;
export type MotionEvent = typeof motionEvents.$inferSelect;
export type InsertMotionEvent = z.infer<typeof insertMotionEventSchema>;
export type ScenarioConfig = typeof scenarioConfigs.$inferSelect;
export type InsertScenarioConfig = z.infer<typeof insertScenarioConfigSchema>;
export type ActiveScenario = typeof activeScenarios.$inferSelect;
export type InsertActiveScenario = z.infer<typeof insertActiveScenarioSchema>;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
