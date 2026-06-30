/**
 * Demo data seeding logic — shared between the CLI script and the
 * protected /api/admin/seed-demo HTTP endpoint.
 *
 * Uses the server's existing db connection so it works in both
 * development and production environments.
 */

import bcrypt from "bcryptjs";
import { sql, eq } from "drizzle-orm";
import { db } from "./db";
import * as schema from "@shared/schema";

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

export async function clearDemoData() {
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
}

// ─── seed ───────────────────────────────────────────────────────────────────

export async function runDemoSeed(): Promise<{ entityId: number; summary: Record<string, number> }> {
  await clearDemoData();

  // 1. Entity
  const [entity] = await db.insert(schema.entities).values({
    name: "Sunrise Senior Living",
    type: "facility",
    address: "4821 Meadow Creek Drive, Austin, TX 78701",
    contactPhone: "(512) 555-0100",
    contactEmail: "admin@sunrisesenior.com",
    isActive: true,
  }).returning();

  // 2. Facility subscription record
  await db.insert(schema.facilities).values({
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
  });

  // 3. Staff users
  await Promise.all([
    db.insert(schema.users).values({ username: "sarah.admin",   password: await hash("Demo@2026"), fullName: "Sarah Mitchell", role: "admin",   entityId: entity.id }),
    db.insert(schema.users).values({ username: "james.manager", password: await hash("Demo@2026"), fullName: "James Carter",   role: "manager", entityId: entity.id }),
    db.insert(schema.users).values({ username: "lisa.staff",    password: await hash("Demo@2026"), fullName: "Lisa Park",      role: "staff",   entityId: entity.id }),
  ]);

  // 4. Units
  const unitRows = await Promise.all([
    db.insert(schema.units).values({ entityId: entity.id, unitIdentifier: "Room-101", label: "Room 101", floor: "1", hardwareType: "adt_google",   smartSpeakerId: "google-hub-room-101" }).returning().then(r => r[0]),
    db.insert(schema.units).values({ entityId: entity.id, unitIdentifier: "Room-205", label: "Room 205", floor: "2", hardwareType: "adt_google",   smartSpeakerId: "google-hub-room-205" }).returning().then(r => r[0]),
    db.insert(schema.units).values({ entityId: entity.id, unitIdentifier: "Room-310", label: "Room 310", floor: "3", hardwareType: "adt_google",   smartSpeakerId: "google-hub-room-310" }).returning().then(r => r[0]),
    db.insert(schema.units).values({ entityId: entity.id, unitIdentifier: "Room-412", label: "Room 412", floor: "4", hardwareType: "esp32_custom", esp32DeviceMac: "AA:BB:CC:DD:EE:01", esp32FirmwareVersion: "v2.1.4", esp32IpAddress: "192.168.1.41" }).returning().then(r => r[0]),
    db.insert(schema.units).values({ entityId: entity.id, unitIdentifier: "Room-118", label: "Room 118", floor: "1", hardwareType: "esp32_custom", esp32DeviceMac: "AA:BB:CC:DD:EE:02", esp32FirmwareVersion: "v2.1.4", esp32IpAddress: "192.168.1.18" }).returning().then(r => r[0]),
  ]);
  const [unit101, unit205, unit310, unit412, unit118] = unitRows;

  // 5. Residents
  const residentRows = await Promise.all([
    db.insert(schema.residents).values({
      entityId: entity.id, unitId: unit101.id,
      firstName: "Margaret", lastName: "Chen", preferredName: "Maggie",
      dateOfBirth: "1942-03-15", roomNumber: "101",
      emergencyContact: "David Chen (Son)", emergencyPhone: "(512) 555-0201",
      communicationStyle: "Warm and chatty; loves talking about her garden, grandchildren, and favourite recipes.",
      mobilePin: "1942", status: "safe", isActive: true, lastActivityAt: minutesAgo(18),
      anonymousUsername: "maggie_c",
      intakeInterviewData: { hobbies: ["gardening", "reading", "tea ceremonies", "knitting"], personality: "outgoing and nurturing", concerns: ["mild arthritis in left knee"], familyNotes: "Son David visits every Sunday." },
      digitalTwinPersona: { tone: "warm", topics: ["gardening", "family", "cooking", "grandchildren"], avoidTopics: ["late husband", "hospital stays"], greeting: "Good morning Maggie, how's your garden doing today?" },
    } as any).returning().then(r => r[0]),
    db.insert(schema.residents).values({
      entityId: entity.id, unitId: unit205.id,
      firstName: "Robert", lastName: "Williams", preferredName: "Bob",
      dateOfBirth: "1938-07-22", roomNumber: "205",
      emergencyContact: "Sarah Williams (Daughter)", emergencyPhone: "(512) 555-0202",
      communicationStyle: "Direct and brief. Ex-Navy officer; appreciates efficiency and precision.",
      mobilePin: "1938", status: "checking", isActive: true, lastActivityAt: hoursAgo(1),
      anonymousUsername: "bob_w",
      intakeInterviewData: { hobbies: ["chess", "history documentaries", "woodworking"], personality: "reserved but friendly", concerns: ["balance issues", "mild hearing loss"], familyNotes: "Daughter Sarah calls twice weekly." },
      digitalTwinPersona: { tone: "respectful and direct", topics: ["history", "sports", "woodworking", "Navy stories"], avoidTopics: ["late wife Carol"], greeting: "Good day Bob, checking in on you." },
    } as any).returning().then(r => r[0]),
    db.insert(schema.residents).values({
      entityId: entity.id, unitId: unit310.id,
      firstName: "Eleanor", lastName: "Patel", preferredName: "Ellie",
      dateOfBirth: "1945-11-08", roomNumber: "310",
      emergencyContact: "Amit Patel (Son)", emergencyPhone: "(512) 555-0203",
      communicationStyle: "Gentle and thoughtful. Former art teacher; enjoys deep conversations.",
      mobilePin: "1945", status: "alert", isActive: true, lastActivityAt: hoursAgo(3),
      anonymousUsername: "ellie_p",
      intakeInterviewData: { hobbies: ["watercolour painting", "classical music", "bird watching"], personality: "introspective and creative", concerns: ["macular degeneration"], familyNotes: "Grandson Rohan visits weekends." },
      digitalTwinPersona: { tone: "gentle and encouraging", topics: ["art", "nature", "music", "poetry"], avoidTopics: ["driving", "vision deterioration"], greeting: "Hello Ellie, it's lovely to chat with you today." },
    } as any).returning().then(r => r[0]),
    db.insert(schema.residents).values({
      entityId: entity.id, unitId: unit412.id,
      firstName: "Dorothy", lastName: "Harris", preferredName: "Dot",
      dateOfBirth: "1940-06-30", roomNumber: "412",
      emergencyContact: "Michael Harris (Son)", emergencyPhone: "(512) 555-0204",
      communicationStyle: "Cheerful and talkative. Retired schoolteacher; loves quiz questions and word games.",
      mobilePin: "1940", status: "safe", isActive: true, lastActivityAt: minutesAgo(42),
      anonymousUsername: "dot_h",
      intakeInterviewData: { hobbies: ["crossword puzzles", "bingo", "word games"], personality: "outgoing, loves to laugh", concerns: ["type 2 diabetes"], familyNotes: "Son Michael visits fortnightly." },
      digitalTwinPersona: { tone: "playful and encouraging", topics: ["trivia", "family stories", "word games"], avoidTopics: ["finances"], greeting: "Good morning Dot, ready for your daily trivia challenge?" },
    } as any).returning().then(r => r[0]),
    db.insert(schema.residents).values({
      entityId: entity.id, unitId: unit118.id,
      firstName: "Franklin", lastName: "Thompson", preferredName: "Frank",
      dateOfBirth: "1936-09-14", roomNumber: "118",
      emergencyContact: "Karen Thompson (Daughter)", emergencyPhone: "(512) 555-0205",
      communicationStyle: "Analytical and detail-oriented. Retired aerospace engineer.",
      mobilePin: "1936", status: "safe", isActive: true, lastActivityAt: minutesAgo(55),
      anonymousUsername: "frank_t",
      intakeInterviewData: { hobbies: ["model aircraft", "astronomy", "sudoku"], personality: "quiet and thoughtful", concerns: ["early-stage Parkinson's tremor"], familyNotes: "Daughter Karen visits monthly. Formerly worked on Saturn V programme." },
      digitalTwinPersona: { tone: "analytical and respectful", topics: ["engineering", "space history", "astronomy"], avoidTopics: ["tremors", "driving"], greeting: "Good day Frank, what's on the engineering mind today?" },
    } as any).returning().then(r => r[0]),
  ]);
  const [rMaggie, rBob, rEllie, rDot, rFrank] = residentRows;

  // 6. Sensors
  await Promise.all([
    db.insert(schema.sensors).values({ entityId: entity.id, unitId: unit101.id, residentId: rMaggie.id, sensorType: "motion", location: "Bedroom",     adtDeviceId: "ADT-BED-101" } as any),
    db.insert(schema.sensors).values({ entityId: entity.id, unitId: unit101.id, residentId: rMaggie.id, sensorType: "motion", location: "Bathroom",     adtDeviceId: "ADT-BATH-101" } as any),
    db.insert(schema.sensors).values({ entityId: entity.id, unitId: unit205.id, residentId: rBob.id,   sensorType: "motion", location: "Bedroom",     adtDeviceId: "ADT-BED-205" } as any),
    db.insert(schema.sensors).values({ entityId: entity.id, unitId: unit205.id, residentId: rBob.id,   sensorType: "motion", location: "Living Room", adtDeviceId: "ADT-LVG-205" } as any),
    db.insert(schema.sensors).values({ entityId: entity.id, unitId: unit310.id, residentId: rEllie.id, sensorType: "motion", location: "Bedroom",     adtDeviceId: "ADT-BED-310" } as any),
    db.insert(schema.sensors).values({ entityId: entity.id, unitId: unit310.id, residentId: rEllie.id, sensorType: "motion", location: "Hallway",     adtDeviceId: "ADT-HALL-310" } as any),
    db.insert(schema.sensors).values({ entityId: entity.id, unitId: unit412.id, residentId: rDot.id,   sensorType: "motion", location: "Bedroom",     esp32DeviceMac: "AA:BB:CC:DD:EE:41" } as any),
    db.insert(schema.sensors).values({ entityId: entity.id, unitId: unit412.id, residentId: rDot.id,   sensorType: "motion", location: "Bathroom",    esp32DeviceMac: "AA:BB:CC:DD:EE:42" } as any),
    db.insert(schema.sensors).values({ entityId: entity.id, unitId: unit118.id, residentId: rFrank.id, sensorType: "motion", location: "Study",       esp32DeviceMac: "AA:BB:CC:DD:EE:18" } as any),
    db.insert(schema.sensors).values({ entityId: entity.id, unitId: unit118.id, residentId: rFrank.id, sensorType: "motion", location: "Bedroom",     esp32DeviceMac: "AA:BB:CC:DD:EE:19" } as any),
  ]);

  // 7. Scenario configs
  const scenarioRows = await Promise.all([
    db.insert(schema.scenarioConfigs).values({ entityId: entity.id, scenarioType: "inactivity_gentle", label: "Gentle Check-in (30 min)",       triggerMinutes: 30, escalationMinutes: 10, maxEscalations: 2, isActive: true }).returning().then(r => r[0]),
    db.insert(schema.scenarioConfigs).values({ entityId: entity.id, scenarioType: "inactivity_urgent", label: "Urgent Non-Response (90 min)",    triggerMinutes: 90, escalationMinutes: 15, maxEscalations: 3, isActive: true }).returning().then(r => r[0]),
    db.insert(schema.scenarioConfigs).values({ entityId: entity.id, scenarioType: "fall_detected",     label: "Fall Detection Response",          triggerMinutes: 1,  escalationMinutes: 3,  maxEscalations: 2, isActive: true }).returning().then(r => r[0]),
    db.insert(schema.scenarioConfigs).values({ entityId: entity.id, scenarioType: "bathroom_extended", label: "Extended Bathroom Time (25 min)", triggerMinutes: 25, escalationMinutes: 5,  maxEscalations: 2, locations: ["bathroom", "washroom"], isActive: true }).returning().then(r => r[0]),
    db.insert(schema.scenarioConfigs).values({ entityId: entity.id, scenarioType: "shower_extended",   label: "Extended Shower Time (35 min)",   triggerMinutes: 35, escalationMinutes: 5,  maxEscalations: 2, locations: ["shower", "bathroom"],   isActive: true }).returning().then(r => r[0]),
  ]);
  const [scenGentle, scenUrgent] = scenarioRows;

  // 8. Motion events
  const allSensors = await db.select().from(schema.sensors).where(eq(schema.sensors.entityId, entity.id));
  const sensorsByResident = (rid: number) => allSensors.filter(s => s.residentId === rid);

  const motionInserts: Promise<any>[] = [];
  for (const { r, gap, count } of [
    { r: rMaggie, gap: 25, count: 30 },
    { r: rDot,   gap: 35, count: 25 },
    { r: rFrank, gap: 40, count: 22 },
  ]) {
    const sens = sensorsByResident(r.id);
    for (let i = 0; i < count; i++) {
      const s = sens[i % sens.length];
      motionInserts.push(db.insert(schema.motionEvents).values({
        entityId: entity.id, sensorId: s.id, residentId: r.id,
        eventType: "motion_detected", location: s.location,
        rawPayload: { source: s.adtDeviceId || s.esp32DeviceMac, strength: Math.floor(Math.random() * 40) + 60 },
        createdAt: minutesAgo(gap * (count - i)),
      } as any));
    }
  }
  for (let i = 0; i < 8; i++) {
    const s = sensorsByResident(rBob.id)[i % 2];
    motionInserts.push(db.insert(schema.motionEvents).values({ entityId: entity.id, sensorId: s.id, residentId: rBob.id, eventType: "motion_detected", location: s.location, rawPayload: { source: s.adtDeviceId }, createdAt: minutesAgo(60 + i * 15) } as any));
  }
  for (let i = 0; i < 6; i++) {
    const s = sensorsByResident(rEllie.id)[i % 2];
    motionInserts.push(db.insert(schema.motionEvents).values({ entityId: entity.id, sensorId: s.id, residentId: rEllie.id, eventType: "motion_detected", location: s.location, rawPayload: { source: s.adtDeviceId }, createdAt: minutesAgo(180 + i * 20) } as any));
  }
  await Promise.all(motionInserts);

  // 9. Active scenarios
  const [activeBob] = await db.insert(schema.activeScenarios).values({
    entityId: entity.id, residentId: rBob.id, scenarioConfigId: scenGentle.id,
    scenarioType: "inactivity_gentle", status: "active", escalationLevel: 1,
    triggerLocation: "Bedroom", createdAt: hoursAgo(1),
  } as any).returning();
  const [activeEllie] = await db.insert(schema.activeScenarios).values({
    entityId: entity.id, residentId: rEllie.id, scenarioConfigId: scenUrgent.id,
    scenarioType: "inactivity_urgent", status: "staff_alerted", escalationLevel: 2,
    triggerLocation: "Bedroom", createdAt: hoursAgo(3),
  } as any).returning();

  // 10. Alerts
  await Promise.all([
    db.insert(schema.alerts).values({ entityId: entity.id, residentId: rEllie.id, scenarioId: activeEllie.id, severity: "emergency", title: "Ellie Patel — No Motion for 3+ Hours", message: "Eleanor Patel (Room 310) has had no detected motion for over 3 hours. Immediate welfare check recommended.", isRead: false, isAcknowledged: false, createdAt: hoursAgo(3) } as any),
    db.insert(schema.alerts).values({ entityId: entity.id, residentId: rBob.id,   scenarioId: activeBob.id,   severity: "warning",   title: "Bob Williams — Inactivity Check-in Pending", message: "Robert Williams (Room 205) has not responded to the 60-minute check-in.", isRead: false, isAcknowledged: false, createdAt: hoursAgo(1) } as any),
    db.insert(schema.alerts).values({ entityId: entity.id, residentId: rFrank.id, severity: "info",      title: "Frank Thompson — Extended Bathroom Time", message: "Franklin Thompson (Room 118) spent 28 minutes in the bathroom — above threshold. Resident reported he was fine.", isRead: true, isAcknowledged: false, createdAt: daysAgo(1) } as any),
    db.insert(schema.alerts).values({ entityId: entity.id, residentId: rMaggie.id, severity: "warning",  title: "Maggie Chen — Evening Inactivity", message: "Maggie Chen (Room 101) triggered a gentle check-in at 8:45 PM. She had fallen asleep early. Scenario resolved.", isRead: true, isAcknowledged: true, acknowledgedBy: "lisa.staff", createdAt: daysAgo(3) } as any),
    db.insert(schema.alerts).values({ entityId: entity.id, residentId: rDot.id,   severity: "critical",  title: "Dot Harris — No Motion After Dinner", message: "Dorothy Harris (Room 412) had no motion for 2 hours after dinner. Staff welfare check — resident asleep in armchair.", isRead: true, isAcknowledged: true, acknowledgedBy: "james.manager", createdAt: daysAgo(5) } as any),
    db.insert(schema.alerts).values({ entityId: entity.id, residentId: rBob.id,   severity: "info",      title: "Bob Williams — Sensor Reconnected", message: "ADT-BED-205 briefly went offline and reconnected. No safety concern.", isRead: true, isAcknowledged: true, acknowledgedBy: "sarah.admin", createdAt: daysAgo(7) } as any),
    db.insert(schema.alerts).values({ entityId: entity.id, residentId: rEllie.id, severity: "warning",   title: "Ellie Patel — Late Evening Activity", message: "Eleanor Patel detected moving at 2:14 AM. Check-in sent — she reported she couldn't sleep.", isRead: true, isAcknowledged: true, acknowledgedBy: "lisa.staff", createdAt: daysAgo(10) } as any),
  ]);

  // 11. Conversations & messages
  async function addConv(residentId: number, scenarioId: number | null, title: string, createdAt: Date, isActive: boolean, turns: { role: string; content: string; delayMin: number }[]) {
    const [conv] = await db.insert(schema.conversations).values({ entityId: entity.id, residentId, scenarioId, title, isActive, createdAt } as any).returning();
    let t = new Date(createdAt);
    for (const m of turns) {
      t = new Date(t.getTime() + m.delayMin * 60000);
      await db.insert(schema.messages).values({ conversationId: conv.id, role: m.role, content: m.content, createdAt: new Date(t) });
    }
  }

  await addConv(rMaggie.id, null, "Morning Chat", daysAgo(0), false, [
    { role: "assistant", content: "Good morning Maggie, how's your garden doing today?", delayMin: 0 },
    { role: "user",      content: "Oh it's doing wonderfully! The roses came out absolutely beautiful this week.", delayMin: 2 },
    { role: "assistant", content: "That sounds lovely! Which variety are your favourites this year?", delayMin: 1 },
    { role: "user",      content: "The pink climbing ones David brought me last spring. They've taken over the entire trellis!", delayMin: 3 },
    { role: "assistant", content: "How wonderful — it sounds like David has quite the eye for beautiful gifts. Has he been by to see them?", delayMin: 1 },
    { role: "user",      content: "He's coming Sunday! I'm going to make my shortbread to celebrate.", delayMin: 2 },
    { role: "assistant", content: "That sounds like a perfect Sunday. Your shortbread must be wonderful!", delayMin: 1 },
  ]);
  await addConv(rBob.id, activeBob.id, "Inactivity Check-in", hoursAgo(1), true, [
    { role: "assistant", content: "Good day Bob, checking in on you. It's been a little while since we detected any movement — are you doing alright?", delayMin: 0 },
    { role: "user",      content: "I'm fine. Just sitting and reading.", delayMin: 8 },
    { role: "assistant", content: "That's good to hear. Anything good — history or one of your crosswords?", delayMin: 1 },
    { role: "user",      content: "Churchill biography. Third time reading it.", delayMin: 5 },
    { role: "assistant", content: "Classic choice. I'll let you get back to it. Ring if you need anything.", delayMin: 1 },
  ]);
  await addConv(rEllie.id, activeEllie.id, "Wellness Check Escalated", hoursAgo(3), true, [
    { role: "assistant", content: "Hello Ellie, it's lovely to hear from you. I noticed you've been very quiet this morning — are you feeling alright?", delayMin: 0 },
    { role: "assistant", content: "Ellie, I haven't heard from you in a little while. I just want to make sure you're comfortable and safe.", delayMin: 45 },
    { role: "assistant", content: "I'm going to let the care team know so they can pop by and check on you. Nothing to worry about — just making sure you're looked after.", delayMin: 30 },
  ]);
  await addConv(rDot.id, null, "Daily Trivia Challenge", daysAgo(1), false, [
    { role: "assistant", content: "Good morning Dot! Ready for your daily trivia challenge?", delayMin: 0 },
    { role: "user",      content: "Always! Give me your best shot.", delayMin: 1 },
    { role: "assistant", content: "Which planet in our solar system has the most moons?", delayMin: 1 },
    { role: "user",      content: "Ooh, that's a tricky one… is it Saturn?", delayMin: 2 },
    { role: "assistant", content: "Correct! Saturn has 146 confirmed moons. You got it in one!", delayMin: 1 },
    { role: "user",      content: "Ha! I knew that from Michael's astronomy phase when he was twelve.", delayMin: 3 },
    { role: "assistant", content: "What a wonderful memory! Shall we do one more question?", delayMin: 1 },
  ]);
  await addConv(rFrank.id, null, "Space Programme Stories", daysAgo(2), false, [
    { role: "assistant", content: "Good day Frank, what's on the engineering mind today?", delayMin: 0 },
    { role: "user",      content: "I was reading about the Artemis programme. They're doing it all wrong with the schedule.", delayMin: 4 },
    { role: "assistant", content: "You worked on Saturn V, didn't you? How does today's programme compare?", delayMin: 1 },
    { role: "user",      content: "We had discipline. Every part was triple-verified. You couldn't rush the timeline.", delayMin: 5 },
    { role: "assistant", content: "What was the most memorable moment during the Saturn V work?", delayMin: 1 },
    { role: "user",      content: "The day of Apollo 11 launch. I was watching the telemetry. Every sensor was green. Nothing like it.", delayMin: 6 },
    { role: "assistant", content: "You watched that in real time — you were part of one of humanity's greatest achievements.", delayMin: 1 },
  ]);

  // 12. Memories
  await Promise.all([
    db.insert(schema.memories).values({ residentId: rMaggie.id, entityId: entity.id, topic: "family",   content: "Maggie was born in Hong Kong and immigrated to Austin in 1968 with her husband Wei. She raised two sons, David and Kevin, and taught them her mother's recipes. Sunday dim sum was a family tradition.", dateCaptured: daysAgo(60) } as any),
    db.insert(schema.memories).values({ residentId: rMaggie.id, entityId: entity.id, topic: "hobbies",  content: "Gardening is Maggie's lifelong passion. She won the Austin Botanical Society prize for her rose display in 2019 and still tends the facility's courtyard garden every morning.", dateCaptured: daysAgo(45) } as any),
    db.insert(schema.memories).values({ residentId: rMaggie.id, entityId: entity.id, topic: "career",   content: "Maggie worked as a school librarian for 28 years at Barton Hills Elementary. She is still remembered by former students and occasionally receives letters.", dateCaptured: daysAgo(30) } as any),
    db.insert(schema.memories).values({ residentId: rBob.id,   entityId: entity.id, topic: "career",   content: "Bob served 22 years in the US Navy, retiring as a Lieutenant Commander in 1982. He served on three destroyers during the Cold War and keeps his service medals framed in his room.", dateCaptured: daysAgo(55) } as any),
    db.insert(schema.memories).values({ residentId: rBob.id,   entityId: entity.id, topic: "hobbies",  content: "Bob built an entire wooden chess set by hand in 2015 — each piece carved from different Texas hardwoods. He plays correspondence chess by email with a former shipmate in Virginia.", dateCaptured: daysAgo(40) } as any),
    db.insert(schema.memories).values({ residentId: rBob.id,   entityId: entity.id, topic: "family",   content: "Bob's wife Carol passed in 2018 after 51 years of marriage. He softens noticeably when daughter Sarah is mentioned. Carol was an elementary school music teacher.", dateCaptured: daysAgo(25) } as any),
    db.insert(schema.memories).values({ residentId: rEllie.id, entityId: entity.id, topic: "career",   content: "Eleanor taught visual art at UT Austin for 31 years, retiring in 2010. Her watercolour landscapes are held in three Texas municipal collections.", dateCaptured: daysAgo(50) } as any),
    db.insert(schema.memories).values({ residentId: rEllie.id, entityId: entity.id, topic: "childhood", content: "Ellie grew up in Jaipur, India, where her father was a textile merchant. The colours of the spice market directly shaped her palette as a painter.", dateCaptured: daysAgo(35) } as any),
    db.insert(schema.memories).values({ residentId: rEllie.id, entityId: entity.id, topic: "milestones", content: "Ellie won a Fulbright scholarship in 1972 and spent a year painting in Florence. She describes this as 'the year that made me an artist.' She still dreams in Italian occasionally.", dateCaptured: daysAgo(20) } as any),
    db.insert(schema.memories).values({ residentId: rDot.id,   entityId: entity.id, topic: "career",   content: "Dorothy taught fifth grade at Crockett Elementary for 34 years. She is legendary for her 'Mystery Friday' sessions — reading one chapter of a mystery novel and stopping at the cliffhanger.", dateCaptured: daysAgo(48) } as any),
    db.insert(schema.memories).values({ residentId: rDot.id,   entityId: entity.id, topic: "hobbies",  content: "Dot has completed a crossword every single day without exception since 1987. She does the NYT crossword first, then the local paper, then creates her own for whoever is willing to try.", dateCaptured: daysAgo(28) } as any),
    db.insert(schema.memories).values({ residentId: rFrank.id, entityId: entity.id, topic: "career",   content: "Frank worked at NASA's Marshall Space Flight Center from 1962–1989, contributing to structural analysis on Saturn V's S-IVB stage. He was in the mission support room during the Apollo 11 launch.", dateCaptured: daysAgo(52) } as any),
    db.insert(schema.memories).values({ residentId: rFrank.id, entityId: entity.id, topic: "hobbies",  content: "Frank builds 1:72 scale model aircraft with a preference for WWII-era designs. He has 47 completed models. His dexterity has slowed due to Parkinson's tremor, which frustrates him greatly.", dateCaptured: daysAgo(32) } as any),
    db.insert(schema.memories).values({ residentId: rFrank.id, entityId: entity.id, topic: "milestones", content: "Frank published a technical paper in 1974 on fatigue stress in aluminium alloy spacecraft structures that is still occasionally cited. He has a laminated copy in his desk drawer.", dateCaptured: daysAgo(15) } as any),
  ]);

  // 13. Community broadcasts
  await Promise.all([
    db.insert(schema.communityBroadcasts).values({ entityId: entity.id, senderName: "Sarah Mitchell (Admin)",    message: "Good morning Sunrise family! Just a reminder that the Thursday afternoon bingo session has moved to the Sunroom on Floor 2 starting this week. Snacks provided!", createdAt: daysAgo(3) } as any),
    db.insert(schema.communityBroadcasts).values({ entityId: entity.id, senderName: "James Carter (Manager)",   message: "Heads up: the main dining room will be closed for a deep clean this Saturday morning (8–11 AM). Breakfast will be served in the Garden Lounge.", createdAt: daysAgo(7) } as any),
    db.insert(schema.communityBroadcasts).values({ entityId: entity.id, senderName: "Lisa Park (Care Staff)",   message: "Our courtyard garden is in full bloom! Feel free to visit anytime between 9 AM and 4 PM — Maggie has been doing a wonderful job with the roses.", createdAt: daysAgo(14) } as any),
  ]);

  // 14. User preferences
  await Promise.all([
    db.insert(schema.userPreferences).values({ residentId: rMaggie.id, entityId: entity.id, aiVerbosity: "medium", preferredVoiceTone: "nurturing",    quietHoursStart: "22:00", quietHoursEnd: "07:00" }),
    db.insert(schema.userPreferences).values({ residentId: rBob.id,   entityId: entity.id, aiVerbosity: "short",  preferredVoiceTone: "professional",  quietHoursStart: "21:00", quietHoursEnd: "06:00" }),
    db.insert(schema.userPreferences).values({ residentId: rEllie.id, entityId: entity.id, aiVerbosity: "long",   preferredVoiceTone: "calm",          quietHoursStart: "23:00", quietHoursEnd: "08:00" }),
    db.insert(schema.userPreferences).values({ residentId: rDot.id,   entityId: entity.id, aiVerbosity: "medium", preferredVoiceTone: "friendly",      quietHoursStart: "21:30", quietHoursEnd: "07:00" }),
    db.insert(schema.userPreferences).values({ residentId: rFrank.id, entityId: entity.id, aiVerbosity: "short",  preferredVoiceTone: "professional",  quietHoursStart: "22:30", quietHoursEnd: "06:30" }),
  ]);

  return {
    entityId: entity.id,
    summary: {
      entities: 1, facilities: 1, users: 3, units: 5, residents: 5,
      sensors: 10, scenarioConfigs: 5, activeScenarios: 2,
      alerts: 7, conversations: 5, motionEvents: motionInserts.length,
      memories: 14, communityBroadcasts: 3, userPreferences: 5,
    },
  };
}
