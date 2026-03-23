#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

const ENTITY_ID = parseInt(process.argv[2]) || 1;
const RESIDENT_ID = parseInt(process.argv[3]) || null;
const MODE = process.argv[4] || "normal";

const HELP = `
=== HeyGrand ADT Motion Simulator ===

Usage:
  node scripts/simulateMotion.js [entityId] [residentId] [mode]

Arguments:
  entityId    Facility ID (default: 1)
  residentId  Target resident ID, or omit to ping shared sensors
  mode        Simulation mode:
                normal    - Send motion pings every 5 minutes (keeps resident "safe")
                inactivity - Send one ping, then stop for 12 minutes to trigger alert
                burst     - Send rapid pings to simulate active movement
                stop      - Send one ping then exit (manual testing)

Examples:
  node scripts/simulateMotion.js 1 1 normal       # Keep resident 1 safe with regular pings
  node scripts/simulateMotion.js 1 1 inactivity   # Trigger 10-min inactivity alert for resident 1
  node scripts/simulateMotion.js 1                # Ping shared hallway sensors
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

async function getSensors() {
  const res = await fetch(`${BASE_URL}/api/entities/${ENTITY_ID}/sensors`);
  if (!res.ok) {
    console.error("Failed to fetch sensors. Is the server running?");
    process.exit(1);
  }
  return res.json();
}

async function sendMotionPing(deviceId, eventType = "motion_detected") {
  const timestamp = new Date().toISOString();
  const payload = { deviceId, eventType, timestamp };

  try {
    const res = await fetch(`${BASE_URL}/api/webhook/adt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const time = new Date().toLocaleTimeString();
    if (res.ok) {
      console.log(`  [${time}] Motion ping sent: ${deviceId} -> Event #${data.eventId}`);
    } else {
      console.log(`  [${time}] Ping failed: ${data.error}`);
    }
    return res.ok;
  } catch (err) {
    console.error(`  Connection error: ${err.message}`);
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runNormal(sensors) {
  const intervalMs = 5 * 60 * 1000;
  console.log(`\nMode: NORMAL - Sending pings every 5 minutes`);
  console.log(`Press Ctrl+C to stop\n`);

  while (true) {
    for (const s of sensors) {
      await sendMotionPing(s.adtDeviceId);
    }
    console.log(`  --- Next ping in 5 minutes ---\n`);
    await sleep(intervalMs);
  }
}

async function runInactivity(sensors) {
  console.log(`\nMode: INACTIVITY - Testing 10-minute inactivity alert`);
  console.log(`Step 1: Sending initial motion ping to mark resident as "safe"...\n`);

  for (const s of sensors) {
    await sendMotionPing(s.adtDeviceId);
  }

  const waitMinutes = 12;
  console.log(`\nStep 2: Going silent for ${waitMinutes} minutes...`);
  console.log(`  The inactivity monitor should trigger after ~10 minutes.`);
  console.log(`  Watch the Admin Dashboard for alerts!\n`);

  for (let i = 1; i <= waitMinutes; i++) {
    await sleep(60 * 1000);
    const time = new Date().toLocaleTimeString();
    console.log(`  [${time}] ${i}/${waitMinutes} minutes of silence elapsed`);
    if (i === 10) {
      console.log(`  >>> Inactivity alert should trigger around now! <<<`);
    }
  }

  console.log(`\nStep 3: Sending "recovery" ping to resolve the alert...\n`);
  for (const s of sensors) {
    await sendMotionPing(s.adtDeviceId);
  }

  console.log(`\nSimulation complete! Check the dashboard for the alert history.`);
}

async function runBurst(sensors) {
  console.log(`\nMode: BURST - Sending 10 rapid pings\n`);

  for (let i = 0; i < 10; i++) {
    const sensor = sensors[i % sensors.length];
    await sendMotionPing(sensor.adtDeviceId);
    await sleep(1000);
  }

  console.log(`\nBurst complete!`);
}

async function runStop(sensors) {
  console.log(`\nMode: STOP - Single ping then exit\n`);

  for (const s of sensors) {
    await sendMotionPing(s.adtDeviceId);
  }

  console.log(`\nDone.`);
}

async function main() {
  console.log("=== HeyGrand ADT Motion Simulator ===\n");
  console.log(`Server:     ${BASE_URL}`);
  console.log(`Entity ID:  ${ENTITY_ID}`);
  console.log(`Resident:   ${RESIDENT_ID || "All shared sensors"}`);
  console.log(`Mode:       ${MODE}`);

  const allSensors = await getSensors();

  let sensors;
  if (RESIDENT_ID) {
    sensors = allSensors.filter((s) => s.residentId === RESIDENT_ID);
    if (sensors.length === 0) {
      sensors = allSensors.filter((s) => !s.residentId);
      console.log(`\n  No sensors assigned to resident ${RESIDENT_ID}, using shared sensors`);
    }
  } else {
    sensors = allSensors;
  }

  if (sensors.length === 0) {
    console.error("\nNo sensors found! Run the onboard script first:");
    console.error("  node scripts/onboard.js");
    process.exit(1);
  }

  console.log(`\nUsing ${sensors.length} sensor(s):`);
  sensors.forEach((s) => console.log(`  - ${s.adtDeviceId} @ ${s.location}`));

  switch (MODE) {
    case "normal":
      await runNormal(sensors);
      break;
    case "inactivity":
      await runInactivity(sensors);
      break;
    case "burst":
      await runBurst(sensors);
      break;
    case "stop":
      await runStop(sensors);
      break;
    default:
      console.error(`Unknown mode: ${MODE}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Simulator error:", err.message);
  process.exit(1);
});
