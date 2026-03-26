#!/usr/bin/env tsx
/**
 * HeyGrand Demo Data Seed Script
 *
 * Clears all existing app data and creates a complete, realistic demo dataset
 * covering every SaaS feature: residents, sensors, alerts, memories,
 * conversations, motion events, scenario configs, community broadcasts,
 * and subscription/billing state.
 *
 * Run: npx tsx scripts/seed-demo-data.ts
 * Credentials after seeding:
 *   Staff login  → sarah.admin / Demo@2026  (admin)
 *                → james.manager / Demo@2026 (manager)
 *                → lisa.staff / Demo@2026   (staff)
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcryptjs";
import { sql, eq } from "drizzle-orm";
import * as schema from "../shared/schema";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

// ─── helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function hoursAgo(n: number) {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d;
}
function minutesAgo(n: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() - n);
  return d;
}

async function hash(pw: string) {
  return bcrypt.hash(pw, 12);
}

// ─── clear ──────────────────────────────────────────────────────────────────

async function clearAll() {
  console.log("🗑️  Clearing existing data...");
  await db.execute(sql`DELETE FROM messages`);
  await db.execute(sql`DELETE FROM conversations`);
  await db.execute(sql`DELETE FROM motion_events`);
  await db.execute(sql`DELETE FROM active_scenarios`);
  await db.execute(sql`DELETE FROM alerts`);
  await db.execute(sql`DELETE FROM speaker_events`);
  await db.execute(sql`DELETE FROM esp32_sensor_data`);
  await db.execute(sql`DELETE FROM sensors`);
  await db.execute(sql`DELETE FROM scenario_configs`);
  await db.execute(sql`DELETE FROM community_broadcasts`);
  await db.execute(sql`DELETE FROM memories`);
  await db.execute(sql`DELETE FROM user_preferences`);
  await db.execute(sql`DELETE FROM mobile_tokens`);
  await db.execute(sql`DELETE FROM device_pairing_codes`);
  await db.execute(sql`DELETE FROM residents`);
  await db.execute(sql`DELETE FROM units`);
  await db.execute(sql`DELETE FROM users`);
  await db.execute(sql`DELETE FROM facilities`);
  await db.execute(sql`DELETE FROM entities`);
  console.log("   ✓ All tables cleared");
}

// ─── seed ───────────────────────────────────────────────────────────────────

async function seed() {
  // ── 1. Entity ───────────────────────────────────────────────────────────
  console.log("\n🏢 Creating facility entity...");
  const [entity] = await db.insert(schema.entities).values({
    name: "Sunrise Senior Living",
    type: "facility",
    address: "4821 Meadow Creek Drive, Austin, TX 78701",
    contactPhone: "(512) 555-0100",
    contactEmail: "admin@sunrisesenior.com",
    isActive: true,
  }).returning();
  console.log(`   ✓ Entity: "${entity.name}" (ID ${entity.id})`);

  // ── 2. Facility (billing/subscription record) ────────────────────────────
  console.log("🏥 Creating facility subscription record...");
  const [facility] = await db.insert(schema.facilities).values({
    facilityId: "FAC-SUNRISE-001",
    name: "Sunrise Senior Living",
    address: "4821 Meadow Creek Drive, Austin, TX 78701",
    contactName: "Sarah Mitchell",
    contactEmail: "sarah@sunrisesenior.com",
    contactPhone: "(512) 555-0101",
    emailVerified: true,
    subscriptionStatus: "active",
    trialEndsAt: null,
    linkedEntityId: entity.id,
    status: "active",
    activeResidents: 5,
    uptimePercent: 99,
  }).returning();
  console.log(`   ✓ Facility: "${facility.name}" — subscription: ${facility.subscriptionStatus}`);

  // ── 3. Staff users ──────────────────────────────────────────────────────
  console.log("👤 Creating staff users...");
  const [userAdmin, userManager, userStaff] = await Promise.all([
    db.insert(schema.users).values({
      username: "sarah.admin",
      password: await hash("Demo@2026"),
      fullName: "Sarah Mitchell",
      role: "admin",
      entityId: entity.id,
    }).returning().then(r => r[0]),
    db.insert(schema.users).values({
      username: "james.manager",
      password: await hash("Demo@2026"),
      fullName: "James Carter",
      role: "manager",
      entityId: entity.id,
    }).returning().then(r => r[0]),
    db.insert(schema.users).values({
      username: "lisa.staff",
      password: await hash("Demo@2026"),
      fullName: "Lisa Park",
      role: "staff",
      entityId: entity.id,
    }).returning().then(r => r[0]),
  ]);
  console.log(`   ✓ 3 staff users (sarah.admin, james.manager, lisa.staff) — password: Demo@2026`);

  // ── 4. Units ────────────────────────────────────────────────────────────
  console.log("🚪 Creating room units...");
  const unitDefs = [
    { entityId: entity.id, unitIdentifier: "Room-101", label: "Room 101", floor: "1", hardwareType: "adt_google" as const, smartSpeakerId: "google-hub-room-101" },
    { entityId: entity.id, unitIdentifier: "Room-205", label: "Room 205", floor: "2", hardwareType: "adt_google" as const, smartSpeakerId: "google-hub-room-205" },
    { entityId: entity.id, unitIdentifier: "Room-310", label: "Room 310", floor: "3", hardwareType: "adt_google" as const, smartSpeakerId: "google-hub-room-310" },
    { entityId: entity.id, unitIdentifier: "Room-412", label: "Room 412", floor: "4", hardwareType: "esp32_custom" as const, esp32DeviceMac: "AA:BB:CC:DD:EE:01", esp32FirmwareVersion: "v2.1.4", esp32IpAddress: "192.168.1.41" },
    { entityId: entity.id, unitIdentifier: "Room-118", label: "Room 118", floor: "1", hardwareType: "esp32_custom" as const, esp32DeviceMac: "AA:BB:CC:DD:EE:02", esp32FirmwareVersion: "v2.1.4", esp32IpAddress: "192.168.1.18" },
  ];
  const units = await Promise.all(unitDefs.map(u => db.insert(schema.units).values(u).returning().then(r => r[0])));
  const [unit101, unit205, unit310, unit412, unit118] = units;
  console.log(`   ✓ 5 units (Rooms 101, 205, 310, 412, 118)`);

  // ── 5. Residents ────────────────────────────────────────────────────────
  console.log("🧓 Creating residents...");
  const residentDefs = [
    {
      entityId: entity.id, unitId: unit101.id,
      firstName: "Margaret", lastName: "Chen", preferredName: "Maggie",
      dateOfBirth: "1942-03-15", roomNumber: "101",
      emergencyContact: "David Chen (Son)", emergencyPhone: "(512) 555-0201",
      communicationStyle: "Warm and chatty; loves talking about her garden, grandchildren, and favourite recipes. Responds well to cheerful greetings.",
      mobilePin: "1942",
      status: "safe", isActive: true, lastActivityAt: minutesAgo(18),
      intakeInterviewData: { hobbies: ["gardening", "reading", "tea ceremonies", "knitting"], personality: "outgoing and nurturing", concerns: ["mild arthritis in left knee"], familyNotes: "Son David visits every Sunday. Three grandchildren aged 7–14." },
      digitalTwinPersona: { tone: "warm", topics: ["gardening", "family", "cooking", "grandchildren"], avoidTopics: ["late husband", "hospital stays"], greeting: "Good morning Maggie, how's your garden doing today?" },
      anonymousUsername: "maggie_c",
    },
    {
      entityId: entity.id, unitId: unit205.id,
      firstName: "Robert", lastName: "Williams", preferredName: "Bob",
      dateOfBirth: "1938-07-22", roomNumber: "205",
      emergencyContact: "Sarah Williams (Daughter)", emergencyPhone: "(512) 555-0202",
      communicationStyle: "Direct and brief. Ex-Navy officer; appreciates efficiency and precision. Dislikes small talk.",
      mobilePin: "1938",
      status: "checking", isActive: true, lastActivityAt: hoursAgo(1),
      intakeInterviewData: { hobbies: ["chess", "history documentaries", "woodworking", "crossword puzzles"], personality: "reserved but friendly once comfortable", concerns: ["balance issues", "mild hearing loss"], familyNotes: "Daughter Sarah calls twice weekly. Very proud of his Navy career." },
      digitalTwinPersona: { tone: "respectful and direct", topics: ["history", "sports", "woodworking", "Navy stories"], avoidTopics: ["late wife Carol", "retirement"], greeting: "Good day Bob, checking in on you." },
      anonymousUsername: "bob_w",
    },
    {
      entityId: entity.id, unitId: unit310.id,
      firstName: "Eleanor", lastName: "Patel", preferredName: "Ellie",
      dateOfBirth: "1945-11-08", roomNumber: "310",
      emergencyContact: "Amit Patel (Son)", emergencyPhone: "(512) 555-0203",
      communicationStyle: "Gentle and thoughtful. Former art teacher; enjoys deep conversations about beauty and meaning. Needs extra patience.",
      mobilePin: "1945",
      status: "alert", isActive: true, lastActivityAt: hoursAgo(3),
      intakeInterviewData: { hobbies: ["watercolour painting", "classical music", "bird watching", "poetry"], personality: "introspective and deeply creative", concerns: ["macular degeneration", "low energy afternoons"], familyNotes: "Grandson Rohan visits weekends. Still receives letters from former students." },
      digitalTwinPersona: { tone: "gentle and encouraging", topics: ["art", "nature", "music", "poetry"], avoidTopics: ["driving", "vision deterioration"], greeting: "Hello Ellie, it's lovely to chat with you today." },
      anonymousUsername: "ellie_p",
    },
    {
      entityId: entity.id, unitId: unit412.id,
      firstName: "Dorothy", lastName: "Harris", preferredName: "Dot",
      dateOfBirth: "1940-06-30", roomNumber: "412",
      emergencyContact: "Michael Harris (Son)", emergencyPhone: "(512) 555-0204",
      communicationStyle: "Cheerful and talkative. Retired schoolteacher; loves quiz questions, puns, and hearing about staff's families.",
      mobilePin: "1940",
      status: "safe", isActive: true, lastActivityAt: minutesAgo(42),
      intakeInterviewData: { hobbies: ["crossword puzzles", "bingo", "genealogy research", "word games"], personality: "outgoing, loves to laugh", concerns: ["type 2 diabetes management", "occasional confusion in evenings"], familyNotes: "Son Michael and daughter-in-law Janet visit fortnightly. Six grandchildren." },
      digitalTwinPersona: { tone: "playful and encouraging", topics: ["trivia", "family stories", "word games", "teaching memories"], avoidTopics: ["finances"], greeting: "Good morning Dot, ready for your daily trivia challenge?" },
      anonymousUsername: "dot_h",
    },
    {
      entityId: entity.id, unitId: unit118.id,
      firstName: "Franklin", lastName: "Thompson", preferredName: "Frank",
      dateOfBirth: "1936-09-14", roomNumber: "118",
      emergencyContact: "Karen Thompson (Daughter)", emergencyPhone: "(512) 555-0205",
      communicationStyle: "Analytical and detail-oriented. Retired aerospace engineer; enjoys technical conversations and problem-solving.",
      mobilePin: "1936",
      status: "safe", isActive: true, lastActivityAt: minutesAgo(55),
      intakeInterviewData: { hobbies: ["model aircraft", "astronomy", "sudoku", "reading technical journals"], personality: "quiet and thoughtful, warms up with shared interests", concerns: ["early-stage Parkinson's tremor", "sleep disruption"], familyNotes: "Daughter Karen lives in Houston, visits monthly. Formerly worked on Saturn V programme." },
      digitalTwinPersona: { tone: "analytical and respectful", topics: ["engineering", "space history", "astronomy", "problem-solving"], avoidTopics: ["tremors", "driving"], greeting: "Good day Frank, what's on the engineering mind today?" },
      anonymousUsername: "frank_t",
    },
  ];
  const residents = await Promise.all(
    residentDefs.map(r => db.insert(schema.residents).values(r as any).returning().then(rows => rows[0]))
  );
  const [rMaggie, rBob, rEllie, rDot, rFrank] = residents;
  console.log(`   ✓ 5 residents (Maggie=safe, Bob=checking, Ellie=alert, Dot=safe, Frank=safe)`);

  // ── 6. Sensors ──────────────────────────────────────────────────────────
  console.log("📡 Creating sensors...");
  const sensorDefs = [
    { entityId: entity.id, unitId: unit101.id, residentId: rMaggie.id, sensorType: "motion", location: "Bedroom", adtDeviceId: "ADT-BED-101" },
    { entityId: entity.id, unitId: unit101.id, residentId: rMaggie.id, sensorType: "motion", location: "Bathroom", adtDeviceId: "ADT-BATH-101" },
    { entityId: entity.id, unitId: unit205.id, residentId: rBob.id,   sensorType: "motion", location: "Bedroom", adtDeviceId: "ADT-BED-205" },
    { entityId: entity.id, unitId: unit205.id, residentId: rBob.id,   sensorType: "motion", location: "Living Room", adtDeviceId: "ADT-LVG-205" },
    { entityId: entity.id, unitId: unit310.id, residentId: rEllie.id, sensorType: "motion", location: "Bedroom", adtDeviceId: "ADT-BED-310" },
    { entityId: entity.id, unitId: unit310.id, residentId: rEllie.id, sensorType: "motion", location: "Hallway", adtDeviceId: "ADT-HALL-310" },
    { entityId: entity.id, unitId: unit412.id, residentId: rDot.id,   sensorType: "motion", location: "Bedroom", esp32DeviceMac: "AA:BB:CC:DD:EE:41" },
    { entityId: entity.id, unitId: unit412.id, residentId: rDot.id,   sensorType: "motion", location: "Bathroom", esp32DeviceMac: "AA:BB:CC:DD:EE:42" },
    { entityId: entity.id, unitId: unit118.id, residentId: rFrank.id, sensorType: "motion", location: "Study",   esp32DeviceMac: "AA:BB:CC:DD:EE:18" },
    { entityId: entity.id, unitId: unit118.id, residentId: rFrank.id, sensorType: "motion", location: "Bedroom", esp32DeviceMac: "AA:BB:CC:DD:EE:19" },
  ];
  await Promise.all(sensorDefs.map(s => db.insert(schema.sensors).values(s as any)));
  console.log(`   ✓ 10 sensors across 5 rooms`);

  // ── 7. Scenario configs ─────────────────────────────────────────────────
  console.log("⚙️  Creating scenario configs...");
  const scenarioDefs: schema.InsertScenarioConfig[] = [
    { entityId: entity.id, scenarioType: "inactivity_gentle", label: "Gentle Check-in (30 min)", triggerMinutes: 30, escalationMinutes: 10, maxEscalations: 2, isActive: true },
    { entityId: entity.id, scenarioType: "inactivity_urgent", label: "Urgent Non-Response (90 min)", triggerMinutes: 90, escalationMinutes: 15, maxEscalations: 3, isActive: true },
    { entityId: entity.id, scenarioType: "fall_detected", label: "Fall Detection Response", triggerMinutes: 1, escalationMinutes: 3, maxEscalations: 2, isActive: true },
    { entityId: entity.id, scenarioType: "bathroom_extended", label: "Extended Bathroom Time (25 min)", triggerMinutes: 25, escalationMinutes: 5, maxEscalations: 2, locations: ["bathroom", "washroom"], isActive: true },
    { entityId: entity.id, scenarioType: "shower_extended", label: "Extended Shower Time (35 min)", triggerMinutes: 35, escalationMinutes: 5, maxEscalations: 2, locations: ["shower", "bathroom"], isActive: true },
  ];
  const scenarioConfigs = await Promise.all(
    scenarioDefs.map(sc => db.insert(schema.scenarioConfigs).values(sc).returning().then(r => r[0]))
  );
  console.log(`   ✓ 5 scenario configs`);

  // ── 8. Motion events (historical) ───────────────────────────────────────
  console.log("🏃 Creating motion event history...");
  const sensors = await db.select().from(schema.sensors).where(eq(schema.sensors.entityId, entity.id));
  const sensorByResident = (rid: number) => sensors.filter(s => s.residentId === rid);

  const motionEvents: schema.InsertMotionEvent[] = [];
  const residentMotionSchedule = [
    { r: rMaggie, gap: 25, count: 30 },
    { r: rDot,   gap: 35, count: 25 },
    { r: rFrank, gap: 40, count: 22 },
  ];
  for (const { r, gap, count } of residentMotionSchedule) {
    const sens = sensorByResident(r.id);
    if (!sens.length) continue;
    for (let i = 0; i < count; i++) {
      const s = sens[i % sens.length];
      motionEvents.push({
        entityId: entity.id,
        sensorId: s.id,
        residentId: r.id,
        eventType: "motion_detected",
        location: s.location,
        rawPayload: { source: s.adtDeviceId || s.esp32DeviceMac, strength: Math.floor(Math.random() * 40) + 60 },
        createdAt: minutesAgo(gap * (count - i)),
      } as any);
    }
  }
  // Bob — last motion 1h ago (explains "checking" status)
  const bobSensors = sensorByResident(rBob.id);
  for (let i = 0; i < 8; i++) {
    const s = bobSensors[i % bobSensors.length];
    motionEvents.push({
      entityId: entity.id, sensorId: s.id, residentId: rBob.id,
      eventType: "motion_detected", location: s.location,
      rawPayload: { source: s.adtDeviceId },
      createdAt: minutesAgo(60 + i * 15),
    } as any);
  }
  // Ellie — last motion 3h ago (explains "alert" status)
  const ellieSensors = sensorByResident(rEllie.id);
  for (let i = 0; i < 6; i++) {
    const s = ellieSensors[i % ellieSensors.length];
    motionEvents.push({
      entityId: entity.id, sensorId: s.id, residentId: rEllie.id,
      eventType: "motion_detected", location: s.location,
      rawPayload: { source: s.adtDeviceId },
      createdAt: minutesAgo(180 + i * 20),
    } as any);
  }
  await Promise.all(motionEvents.map(e => db.insert(schema.motionEvents).values(e)));
  console.log(`   ✓ ${motionEvents.length} motion events`);

  // ── 9. Active scenarios ──────────────────────────────────────────────────
  console.log("🚨 Creating active scenarios...");
  const [scenGentleCheck, scenUrgent] = scenarioConfigs;
  const [activeBob] = await db.insert(schema.activeScenarios).values({
    entityId: entity.id, residentId: rBob.id,
    scenarioConfigId: scenGentleCheck.id,
    scenarioType: "inactivity_gentle",
    status: "active",
    escalationLevel: 1,
    triggerLocation: "Bedroom",
    createdAt: hoursAgo(1),
  } as any).returning();
  const [activeEllie] = await db.insert(schema.activeScenarios).values({
    entityId: entity.id, residentId: rEllie.id,
    scenarioConfigId: scenUrgent.id,
    scenarioType: "inactivity_urgent",
    status: "staff_alerted",
    escalationLevel: 2,
    triggerLocation: "Bedroom",
    createdAt: hoursAgo(3),
  } as any).returning();
  console.log(`   ✓ 2 active scenarios (Bob: active check-in, Ellie: staff alerted)`);

  // ── 10. Alerts ──────────────────────────────────────────────────────────
  console.log("🔔 Creating alerts...");
  const alertDefs = [
    // Current / unacknowledged
    {
      entityId: entity.id, residentId: rEllie.id, scenarioId: activeEllie.id,
      severity: "emergency" as const, title: "Ellie Patel — No Motion for 3+ Hours",
      message: "Eleanor Patel (Room 310) has had no detected motion for over 3 hours. Immediate welfare check recommended.",
      isRead: false, isAcknowledged: false,
      createdAt: hoursAgo(3),
    },
    {
      entityId: entity.id, residentId: rBob.id, scenarioId: activeBob.id,
      severity: "warning" as const, title: "Bob Williams — Inactivity Check-in Pending",
      message: "Robert Williams (Room 205) has not responded to the 60-minute check-in. Gentle follow-up may be needed.",
      isRead: false, isAcknowledged: false,
      createdAt: hoursAgo(1),
    },
    // Read but not acknowledged
    {
      entityId: entity.id, residentId: rFrank.id,
      severity: "info" as const, title: "Frank Thompson — Extended Bathroom Time",
      message: "Franklin Thompson (Room 118) spent 28 minutes in the bathroom this morning, above the 25-minute threshold. Checked in — resident reported he was fine.",
      isRead: true, isAcknowledged: false,
      createdAt: daysAgo(1),
    },
    // Fully acknowledged historical alerts
    {
      entityId: entity.id, residentId: rMaggie.id,
      severity: "warning" as const, title: "Maggie Chen — Evening Inactivity",
      message: "Margaret Chen (Room 101) triggered a gentle check-in at 8:45 PM. She had fallen asleep early. Scenario resolved.",
      isRead: true, isAcknowledged: true, acknowledgedBy: "lisa.staff",
      createdAt: daysAgo(3),
    },
    {
      entityId: entity.id, residentId: rDot.id,
      severity: "critical" as const, title: "Dot Harris — No Motion After Dinner",
      message: "Dorothy Harris (Room 412) had no motion detected for 2 hours following dinner. Staff performed wellness check — resident had fallen asleep in armchair.",
      isRead: true, isAcknowledged: true, acknowledgedBy: "james.manager",
      createdAt: daysAgo(5),
    },
    {
      entityId: entity.id, residentId: rBob.id,
      severity: "info" as const, title: "Bob Williams — Sensor Reconnected",
      message: "ADT-BED-205 briefly went offline and reconnected. No safety concern — appears to be a temporary connectivity issue.",
      isRead: true, isAcknowledged: true, acknowledgedBy: "sarah.admin",
      createdAt: daysAgo(7),
    },
    {
      entityId: entity.id, residentId: rEllie.id,
      severity: "warning" as const, title: "Ellie Patel — Late Evening Activity",
      message: "Eleanor Patel (Room 310) was detected moving at 2:14 AM. Check-in message sent — she reported she couldn't sleep and was listening to music.",
      isRead: true, isAcknowledged: true, acknowledgedBy: "lisa.staff",
      createdAt: daysAgo(10),
    },
  ];
  await Promise.all(alertDefs.map(a => db.insert(schema.alerts).values(a as any)));
  console.log(`   ✓ ${alertDefs.length} alerts (2 active, 5 historical)`);

  // ── 11. Conversations + Messages ─────────────────────────────────────────
  console.log("💬 Creating conversations and messages...");

  async function addConversation(
    residentId: number,
    scenarioId: number | null,
    title: string,
    createdAt: Date,
    isActive: boolean,
    turns: { role: string; content: string; delayMin: number }[]
  ) {
    const [conv] = await db.insert(schema.conversations).values({
      entityId: entity.id, residentId, scenarioId, title, isActive, createdAt,
    } as any).returning();
    let msgTime = new Date(createdAt);
    for (const t of turns) {
      msgTime = new Date(msgTime.getTime() + t.delayMin * 60 * 1000);
      await db.insert(schema.messages).values({
        conversationId: conv.id, role: t.role, content: t.content, createdAt: new Date(msgTime),
      });
    }
    return conv;
  }

  // Maggie — companionship chat
  await addConversation(rMaggie.id, null, "Morning Chat", daysAgo(0), false, [
    { role: "assistant", content: "Good morning Maggie, how's your garden doing today?", delayMin: 0 },
    { role: "user", content: "Oh it's doing wonderfully! The roses came out absolutely beautiful this week.", delayMin: 2 },
    { role: "assistant", content: "That sounds lovely! Which variety are your favourites this year?", delayMin: 1 },
    { role: "user", content: "The pink climbing ones David brought me last spring. They've taken over the entire trellis!", delayMin: 3 },
    { role: "assistant", content: "How wonderful — it sounds like David has quite the eye for beautiful gifts. Has he been by to see them?", delayMin: 1 },
    { role: "user", content: "He's coming Sunday! I'm going to make my shortbread to celebrate. Would you like the recipe?", delayMin: 2 },
    { role: "assistant", content: "I'd love to hear it! Your shortbread sounds absolutely delicious.", delayMin: 1 },
  ]);

  // Bob — inactivity check-in (active scenario)
  await addConversation(rBob.id, activeBob.id, "Inactivity Check-in", hoursAgo(1), true, [
    { role: "assistant", content: "Good day Bob, checking in on you. It's been a little while since we detected any movement — are you doing alright?", delayMin: 0 },
    { role: "user", content: "I'm fine. Just sitting and reading.", delayMin: 8 },
    { role: "assistant", content: "That's good to hear. Anything good — history or one of your crosswords?", delayMin: 1 },
    { role: "user", content: "Churchill biography. Third time reading it.", delayMin: 5 },
    { role: "assistant", content: "Classic choice. I'll let you get back to it. Ring if you need anything.", delayMin: 1 },
  ]);

  // Ellie — escalated scenario conversation
  await addConversation(rEllie.id, activeEllie.id, "Wellness Check Escalated", hoursAgo(3), true, [
    { role: "assistant", content: "Hello Ellie, it's lovely to hear from you. I noticed you've been very quiet this morning — are you feeling alright?", delayMin: 0 },
    { role: "assistant", content: "Ellie, I haven't heard from you in a little while. I just want to make sure you're comfortable and safe.", delayMin: 45 },
    { role: "assistant", content: "I'm going to let the care team know I haven't been able to reach you so they can pop by and check on you. Nothing to worry about — just making sure you're looked after.", delayMin: 30 },
  ]);

  // Dot — trivia conversation
  await addConversation(rDot.id, null, "Daily Trivia Challenge", daysAgo(1), false, [
    { role: "assistant", content: "Good morning Dot! Ready for your daily trivia challenge?", delayMin: 0 },
    { role: "user", content: "Always! Give me your best shot.", delayMin: 1 },
    { role: "assistant", content: "Wonderful! Here we go: Which planet in our solar system has the most moons?", delayMin: 1 },
    { role: "user", content: "Ooh, that's a tricky one… is it Saturn?", delayMin: 2 },
    { role: "assistant", content: "That is correct! Saturn has 146 confirmed moons — including the famous Titan. You got it in one!", delayMin: 1 },
    { role: "user", content: "Ha! I knew that from Michael's astronomy phase when he was twelve. He had posters all over his bedroom.", delayMin: 3 },
    { role: "assistant", content: "What a wonderful memory — sounds like you sparked quite an interest in him! Does he still follow astronomy?", delayMin: 1 },
    { role: "user", content: "Not really, he became an accountant! But we still joke about it.", delayMin: 2 },
    { role: "assistant", content: "From rocket scientist to accountant — still working with numbers! Shall we do one more question?", delayMin: 1 },
  ]);

  // Frank — engineering nostalgia
  await addConversation(rFrank.id, null, "Space Programme Stories", daysAgo(2), false, [
    { role: "assistant", content: "Good day Frank, what's on the engineering mind today?", delayMin: 0 },
    { role: "user", content: "I was reading about the Artemis programme this morning. They're doing it all wrong with the schedule.", delayMin: 4 },
    { role: "assistant", content: "You worked on Saturn V, didn't you? How does today's programme compare in your view?", delayMin: 1 },
    { role: "user", content: "We had discipline. Every part was triple-verified. You couldn't rush the timeline without someone raising hell. Now everything is 'agile'.", delayMin: 5 },
    { role: "assistant", content: "It sounds like the culture of engineering rigour was something you really valued. What was the most memorable moment during the Saturn V work?", delayMin: 1 },
    { role: "user", content: "The day of Apollo 11 launch. I was in a support room watching the telemetry. Every sensor was green. Nothing like it.", delayMin: 6 },
    { role: "assistant", content: "You watched that in real time. That must have been extraordinary — you were part of one of humanity's greatest achievements.", delayMin: 1 },
  ]);
  console.log(`   ✓ 5 conversations with message threads`);

  // ── 12. Memories ────────────────────────────────────────────────────────
  console.log("🧠 Creating resident memories...");
  const memoryDefs: schema.InsertMemory[] = [
    // Maggie
    { residentId: rMaggie.id, entityId: entity.id, topic: "family", content: "Maggie was born and raised in Hong Kong and immigrated to the US in 1968 with her husband Wei. They settled in Austin and raised two sons, David and Kevin. She speaks fondly of Sunday dim sum dinners and teaching her sons to cook her mother's recipes.", dateCaptured: daysAgo(60) } as any,
    { residentId: rMaggie.id, entityId: entity.id, topic: "hobbies", content: "Gardening has been Maggie's lifelong passion. She won the Austin Botanical Society prize for her rose display in 2019. She still tends to her roses at the facility's courtyard garden every morning weather permitting.", dateCaptured: daysAgo(45) } as any,
    { residentId: rMaggie.id, entityId: entity.id, topic: "career", content: "Maggie worked as a school librarian for 28 years at Barton Hills Elementary. She is still remembered by former students and occasionally receives letters. She credits reading with keeping her sharp.", dateCaptured: daysAgo(30) } as any,
    // Bob
    { residentId: rBob.id, entityId: entity.id, topic: "career", content: "Bob served 22 years in the US Navy, retiring as a Lieutenant Commander in 1982. He served on three different destroyers and saw active deployment during the Cold War. He keeps his service medals framed in his room.", dateCaptured: daysAgo(55) } as any,
    { residentId: rBob.id, entityId: entity.id, topic: "hobbies", content: "Bob built an entire wooden chess set by hand in 2015 — each piece carved from different Texas hardwoods. He plays correspondence chess by email with a former shipmate in Virginia and rarely loses.", dateCaptured: daysAgo(40) } as any,
    { residentId: rBob.id, entityId: entity.id, topic: "family", content: "Bob's wife Carol passed in 2018 after 51 years of marriage. He does not like to speak about this directly but softens noticeably when their daughter Sarah is mentioned. Carol was an elementary school music teacher.", dateCaptured: daysAgo(25) } as any,
    // Ellie
    { residentId: rEllie.id, entityId: entity.id, topic: "career", content: "Eleanor taught visual art at UT Austin for 31 years, retiring in 2010. Her watercolour landscapes are held in three Texas municipal collections. She considers colour theory her deepest intellectual love.", dateCaptured: daysAgo(50) } as any,
    { residentId: rEllie.id, entityId: entity.id, topic: "childhood", content: "Ellie grew up in Jaipur, India, where her father was a textile merchant. She has vivid memories of the colours of the spice market and says they directly shaped her palette as a painter.", dateCaptured: daysAgo(35) } as any,
    { residentId: rEllie.id, entityId: entity.id, topic: "milestones", content: "Ellie won a Fulbright scholarship in 1972 and spent a year painting in Florence. She describes this year as 'the year that made me an artist.' She still dreams in Italian occasionally.", dateCaptured: daysAgo(20) } as any,
    // Dot
    { residentId: rDot.id, entityId: entity.id, topic: "career", content: "Dorothy taught fifth grade at Crockett Elementary for 34 years. She is legendary among former students for her 'Mystery Friday' sessions where she would read one chapter of a mystery novel and stop at the cliffhanger.", dateCaptured: daysAgo(48) } as any,
    { residentId: rDot.id, entityId: entity.id, topic: "hobbies", content: "Dot has been completing a crossword every single day without exception since 1987. She does the NYT crossword first, then the local paper crossword, then creates her own for whoever is willing to try.", dateCaptured: daysAgo(28) } as any,
    // Frank
    { residentId: rFrank.id, entityId: entity.id, topic: "career", content: "Frank worked at NASA's Marshall Space Flight Center from 1962 to 1989, contributing to structural analysis on the S-IVB stage of Saturn V. He was in the mission support room during the Apollo 11 launch and calls it the greatest day of his life.", dateCaptured: daysAgo(52) } as any,
    { residentId: rFrank.id, entityId: entity.id, topic: "hobbies", content: "Frank builds 1:72 scale model aircraft with a preference for WWII-era designs. He has a collection of 47 completed models. His dexterity with tiny parts has slowed due to his Parkinson's tremor, which frustrates him greatly.", dateCaptured: daysAgo(32) } as any,
    { residentId: rFrank.id, entityId: entity.id, topic: "milestones", content: "Frank published a technical paper in 1974 on fatigue stress in aluminium alloy spacecraft structures that is still occasionally cited. He is quietly proud of this and has a laminated copy in his desk drawer.", dateCaptured: daysAgo(15) } as any,
  ];
  await Promise.all(memoryDefs.map(m => db.insert(schema.memories).values(m)));
  console.log(`   ✓ ${memoryDefs.length} memories across 5 residents`);

  // ── 13. Community broadcasts ─────────────────────────────────────────────
  console.log("📢 Creating community broadcasts...");
  const broadcastDefs = [
    { entityId: entity.id, senderName: "Sarah Mitchell (Admin)", message: "🌟 Good morning Sunrise family! Just a reminder that the Thursday afternoon bingo session has moved to the Sunroom on Floor 2 starting this week. Snacks provided!", createdAt: daysAgo(3) },
    { entityId: entity.id, senderName: "James Carter (Manager)", message: "📋 Heads up: the main dining room will be closed for a deep clean this Saturday morning (8–11 AM). Breakfast will be served in the Garden Lounge. Apologies for any inconvenience!", createdAt: daysAgo(7) },
    { entityId: entity.id, senderName: "Lisa Park (Care Staff)", message: "🌸 Exciting news! Our courtyard garden is in full bloom. Feel free to visit anytime between 9 AM and 4 PM — Maggie has been doing a wonderful job with the roses this season.", createdAt: daysAgo(14) },
  ];
  await Promise.all(broadcastDefs.map(b => db.insert(schema.communityBroadcasts).values(b as any)));
  console.log(`   ✓ 3 community broadcasts`);

  // ── 14. User preferences ─────────────────────────────────────────────────
  console.log("⚙️  Creating resident user preferences...");
  const prefDefs = [
    { residentId: rMaggie.id, entityId: entity.id, aiVerbosity: "medium" as const, preferredVoiceTone: "nurturing" as const, quietHoursStart: "22:00", quietHoursEnd: "07:00" },
    { residentId: rBob.id,   entityId: entity.id, aiVerbosity: "short" as const,  preferredVoiceTone: "professional" as const, quietHoursStart: "21:00", quietHoursEnd: "06:00" },
    { residentId: rEllie.id, entityId: entity.id, aiVerbosity: "long" as const,   preferredVoiceTone: "calm" as const, quietHoursStart: "23:00", quietHoursEnd: "08:00" },
    { residentId: rDot.id,   entityId: entity.id, aiVerbosity: "medium" as const, preferredVoiceTone: "friendly" as const, quietHoursStart: "21:30", quietHoursEnd: "07:00" },
    { residentId: rFrank.id, entityId: entity.id, aiVerbosity: "short" as const,  preferredVoiceTone: "professional" as const, quietHoursStart: "22:30", quietHoursEnd: "06:30" },
  ];
  await Promise.all(prefDefs.map(p => db.insert(schema.userPreferences).values(p)));
  console.log(`   ✓ 5 resident preference profiles`);

  // ─── done ────────────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════════════╗
║          ✅  Demo data seed complete!                    ║
╠══════════════════════════════════════════════════════════╣
║  Facility : Sunrise Senior Living                        ║
║  Entity ID: ${String(entity.id).padEnd(44)}║
║                                                          ║
║  Staff logins (password: Demo@2026)                      ║
║   • sarah.admin   (Admin)                                ║
║   • james.manager (Manager)                              ║
║   • lisa.staff    (Staff)                                ║
║                                                          ║
║  Residents (5)                                           ║
║   • Maggie Chen  Room 101  ✅ Safe                       ║
║   • Bob Williams Room 205  🟡 Checking (1h no motion)   ║
║   • Ellie Patel  Room 310  🔴 Alert (3h no motion)      ║
║   • Dot Harris   Room 412  ✅ Safe                       ║
║   • Frank Thompson Room 118 ✅ Safe                      ║
╚══════════════════════════════════════════════════════════╝
  `);
}

async function main() {
  try {
    await clearAll();
    await seed();
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
