#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

const TEST_TRANSCRIPT = `
Interviewer: Good morning! Can you tell me a little about yourself?
Resident: My name is Virginia Moore. I'm 84 years old. I was born in Charleston, South Carolina.
I worked as a school teacher for 38 years at Jefferson Elementary. I taught third grade mostly.

Interviewer: That's wonderful! What did you enjoy most about teaching?
Resident: Oh, the children. Watching them learn to read was magical. I still remember little Tommy
Henderson - he struggled so much with reading but by the end of the year he was reading chapter books.
That was 1978 I think. Those moments made everything worth it.

Interviewer: Do you have family nearby?
Resident: My daughter Patricia lives about thirty minutes away. She visits every Sunday with my
granddaughter Emily who is twelve now. My husband Walter passed away six years ago. We were married
for 52 years. He was an electrician. We used to go dancing every Friday night at the Elks Lodge.

Interviewer: What are your hobbies?
Resident: I love crossword puzzles - I do the newspaper one every morning with my coffee. I also
enjoy watching Jeopardy in the evenings. I used to garden quite a bit but my knees don't cooperate
like they used to. I still keep a small herb garden on my windowsill though - basil and rosemary
mostly. Oh, and I read romance novels. Don't judge me! Barbara Cartland is my favorite.

Interviewer: Any health concerns we should know about?
Resident: My hearing isn't what it used to be, especially in my left ear. And I have arthritis in
my hands which makes the crosswords harder some days. I take medication for blood pressure too.
Sometimes I get a bit dizzy if I stand up too fast.

Interviewer: How would you describe your communication style?
Resident: I'm a talker, always have been! I like to tell stories. My students used to say I could
talk the paint off the walls. I prefer people to be straightforward with me though. And I like humor -
Walter always said I had a dry wit. I don't like being talked down to just because I'm older.

Interviewer: Is there anything you'd rather not discuss?
Resident: I'd rather not talk about Walter's passing too much. It still hurts. And please don't
bring up politics - I've had enough of that for one lifetime.
`;

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`  ERROR ${res.status}:`, data);
    return null;
  }
  return data;
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  return res.json();
}

async function main() {
  console.log("=== HeyGrand Onboarding Script ===\n");

  console.log("Step 1: Creating facility...");
  const entity = await post("/api/admin/entities", {
    name: "Sunset Gardens Senior Living",
    type: "facility",
    address: "456 Peaceful Lane, Riverside, CA 92501",
    contactPhone: "555-9900",
    contactEmail: "admin@sunsetgardens.com",
  });
  if (!entity) return process.exit(1);
  console.log(`  Created: "${entity.name}" (ID: ${entity.id})\n`);

  console.log("Step 2: Adding resident...");
  const resident = await post(`/api/admin/${entity.id}/users`, {
    firstName: "Virginia",
    lastName: "Moore",
    dateOfBirth: "1941-06-15",
    roomNumber: "204",
    emergencyContact: "Patricia Moore",
    emergencyPhone: "555-2040",
    preferredName: "Ginny",
    communicationStyle: "Talkative and humorous, appreciates directness, dislikes being patronized",
  });
  if (!resident) return process.exit(1);
  console.log(`  Created: ${resident.preferredName || resident.firstName} ${resident.lastName}`);
  console.log(`  Anonymous Username: ${resident.anonymousUsername}`);
  console.log(`  Room: ${resident.roomNumber}\n`);

  console.log("Step 3: Adding ADT motion sensors...");
  const sensors = [
    { entityId: entity.id, sensorType: "motion", location: "hallway_west", adtDeviceId: `ADT-HALL-W-${entity.id}` },
    { entityId: entity.id, sensorType: "motion", location: "common_room", adtDeviceId: `ADT-COM-${entity.id}` },
    { entityId: entity.id, sensorType: "motion", location: `room_${resident.roomNumber}`, adtDeviceId: `ADT-RM${resident.roomNumber}-${entity.id}`, residentId: resident.id },
  ];
  for (const s of sensors) {
    const created = await post(`/api/entities/${entity.id}/sensors`, s);
    if (created) {
      console.log(`  Sensor: ${created.adtDeviceId} @ ${created.location}`);
    }
  }
  console.log();

  console.log("Step 4: Setting up scenario configs...");
  const scenarios = await get(`/api/entities/${entity.id}/scenario-configs`);
  if (scenarios && scenarios.length > 0) {
    console.log(`  ${scenarios.length} default scenarios already configured`);
  } else {
    console.log("  Default scenarios were seeded automatically");
  }
  console.log();

  console.log("Step 5: Ingesting test interview transcript...");
  console.log("  (Processing with AI - this may take a moment...)\n");
  const intake = await post("/api/test/ingest", {
    transcript: TEST_TRANSCRIPT,
    entityId: entity.id,
    residentId: resident.id,
  });
  if (intake) {
    console.log("  Interview processed successfully!");
    if (intake.biography) {
      const bio = intake.biography;
      console.log(`  Former Profession: ${bio.formerProfession?.title || "Processed"}`);
      console.log(`  Personality: ${bio.personalitySnapshot?.socialStyle || "Analyzed"}`);
      console.log(`  Communication: ${bio.communicationDNA?.preferredTone || "Mapped"}`);
    }
  }
  console.log();

  console.log("=== Onboarding Complete! ===\n");
  console.log("Summary:");
  console.log(`  Facility:  ${entity.name} (ID: ${entity.id})`);
  console.log(`  Resident:  ${resident.preferredName} ${resident.lastName} (ID: ${resident.id})`);
  console.log(`  Username:  ${resident.anonymousUsername}`);
  console.log(`  Room:      ${resident.roomNumber}`);
  console.log(`  Sensors:   ${sensors.length} motion sensors configured`);
  console.log();
  console.log("Next Steps:");
  console.log(`  1. Open Admin Dashboard: ${BASE_URL}/`);
  console.log(`  2. Open Mobile Companion: ${BASE_URL}/companion`);
  console.log(`     Login with: ${resident.anonymousUsername} + any 4-digit PIN`);
  console.log(`  3. Run ADT simulator: node scripts/simulateMotion.js ${entity.id} ${resident.id}`);
}

main().catch((err) => {
  console.error("Onboarding failed:", err.message);
  process.exit(1);
});
