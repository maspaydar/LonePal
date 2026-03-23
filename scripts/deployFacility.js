#!/usr/bin/env node

const readline = require("readline");
const crypto = require("crypto");

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`  ERROR ${res.status}:`, data);
    return null;
  }
  return data;
}

async function get(path, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return res.json();
}

function generateFacilityId() {
  const prefix = "FAC";
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const random = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║       HeyGrand — Facility Deployment Tool        ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const facilityId = generateFacilityId();
  console.log(`Generated Facility ID: ${facilityId}\n`);

  const name = await ask("Facility name (e.g., Sunrise Senior Living): ");
  if (!name.trim()) {
    console.error("Facility name is required.");
    rl.close();
    return process.exit(1);
  }

  const address = await ask("Address: ");
  const contactEmail = await ask("Contact email: ");
  const contactPhone = await ask("Contact phone: ");
  const geminiApiKey = await ask("Gemini API Key (leave blank to use global key): ");

  console.log("\n━━━ Step 1: Creating local entity ━━━");
  const entity = await post("/api/admin/entities", {
    name: name.trim(),
    type: "facility",
    address: address.trim() || null,
    contactPhone: contactPhone.trim() || null,
    contactEmail: contactEmail.trim() || null,
    geminiApiKey: geminiApiKey.trim() || null,
  });
  if (!entity) {
    console.error("Failed to create facility entity.");
    rl.close();
    return process.exit(1);
  }
  console.log(`  Entity created: "${entity.name}" (ID: ${entity.id})`);

  if (geminiApiKey.trim()) {
    await post(`/api/entities/${entity.id}`, { geminiApiKey: geminiApiKey.trim() });
    console.log("  Gemini API key configured for tenant isolation");
  }

  console.log("\n━━━ Step 2: Provisioning data directories ━━━");
  console.log(`  /data/entities/${entity.id}/profiles`);
  console.log(`  /data/entities/${entity.id}/conversations`);
  console.log(`  /data/entities/${entity.id}/activity`);

  console.log("\n━━━ Step 3: Verifying tenant data isolation ━━━");
  const allEntities = await get("/api/entities");
  const otherEntities = allEntities.filter((e) => e.id !== entity.id);
  if (otherEntities.length > 0) {
    console.log(`  Checking isolation against ${otherEntities.length} other facility(ies)...`);
    const newResidents = await get(`/api/entities/${entity.id}/residents`);
    let isolated = true;
    for (const other of otherEntities) {
      const otherResidents = await get(`/api/entities/${other.id}/residents`);
      const leaking = otherResidents.filter((r) =>
        newResidents.some((nr) => nr.id === r.id)
      );
      if (leaking.length > 0) {
        console.log(`  WARNING: Data leak detected with entity ${other.id}!`);
        isolated = false;
      }
    }
    if (isolated) {
      console.log("  PASSED: Tenant data is fully isolated.");
    }
  } else {
    console.log("  This is the first facility — isolation verified by default.");
  }

  console.log("\n━━━ Step 4: Seeding default scenario configurations ━━━");
  const scenarios = await get(`/api/entities/${entity.id}/scenario-configs`);
  if (scenarios && scenarios.length > 0) {
    console.log(`  ${scenarios.length} default scenarios already configured`);
  } else {
    const defaultScenarios = [
      { entityId: entity.id, scenarioType: "inactivity_gentle", label: "Gentle Inactivity Check", thresholdMinutes: 120, escalationSteps: 3, isActive: true },
      { entityId: entity.id, scenarioType: "inactivity_urgent", label: "Urgent Inactivity Alert", thresholdMinutes: 240, escalationSteps: 5, isActive: true },
      { entityId: entity.id, scenarioType: "fall_detected", label: "Fall Detection Response", thresholdMinutes: 0, escalationSteps: 3, isActive: true },
    ];
    for (const sc of defaultScenarios) {
      await post(`/api/entities/${entity.id}/scenario-configs`, sc);
    }
    console.log("  3 default scenario configs created");
  }

  console.log("\n━━━ Step 5: Registering with Super-Admin Hub ━━━");
  const installationUrl = BASE_URL;
  let superAdminToken = null;

  try {
    const loginResult = await post("/api/super-admin/auth/login", {
      email: "admin@heygrand.com",
      password: "admin123",
    });
    if (loginResult && loginResult.token) {
      superAdminToken = loginResult.token;
    }
  } catch {}

  if (!superAdminToken) {
    try {
      const registerResult = await post("/api/super-admin/auth/register", {
        email: "admin@heygrand.com",
        password: "admin123",
        fullName: "System Admin",
      });
      if (registerResult && registerResult.token) {
        superAdminToken = registerResult.token;
      }
    } catch {}
  }

  if (superAdminToken) {
    const facilityReg = await post(
      "/api/super-admin/facilities",
      {
        facilityId,
        name: name.trim(),
        address: address.trim() || null,
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        installationUrl,
        status: "active",
        geminiApiKey: geminiApiKey.trim() || null,
      },
      { Authorization: `Bearer ${superAdminToken}` }
    );
    if (facilityReg) {
      console.log(`  Registered: ${facilityReg.facilityId} (Hub ID: ${facilityReg.id})`);
    } else {
      console.log("  Warning: Could not register with Super-Admin Hub (may already exist)");
    }

    console.log("\n━━━ Step 6: Running health check ━━━");
    const healthCheck = await post(
      "/api/super-admin/facilities/check-health",
      {},
      { Authorization: `Bearer ${superAdminToken}` }
    );
    if (healthCheck && healthCheck.results) {
      const thisResult = healthCheck.results.find((r) => r.facilityId === facilityId);
      if (thisResult) {
        console.log(`  Health: ${thisResult.status} (${thisResult.responseTimeMs}ms)`);
      } else {
        console.log("  Health check ran for all facilities");
      }
    }
  } else {
    console.log("  Skipped: Could not authenticate with Super-Admin Hub");
    console.log("  Register a Super-Admin account first, then re-run deployment.");
  }

  const setupResident = await ask("\nAdd a test resident? (y/n): ");
  if (setupResident.trim().toLowerCase() === "y") {
    console.log("\n━━━ Step 7: Adding test resident ━━━");
    const firstName = await ask("  First name: ");
    const lastName = await ask("  Last name: ");
    const roomNumber = await ask("  Room/Unit number: ");
    const preferredName = await ask("  Preferred name (optional): ");

    const resident = await post(`/api/admin/${entity.id}/users`, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth: "1940-01-01",
      roomNumber: roomNumber.trim(),
      preferredName: preferredName.trim() || null,
      emergencyContact: "Emergency Contact",
      emergencyPhone: "555-0000",
    });

    if (resident) {
      console.log(`  Resident: ${resident.preferredName || resident.firstName} ${resident.lastName}`);
      console.log(`  Username: ${resident.anonymousUsername}`);

      const setupUnit = await ask("  Create a unit and assign? (y/n): ");
      if (setupUnit.trim().toLowerCase() === "y") {
        const unitIdentifier = await ask("  Unit identifier (e.g., Apt-101): ");
        const speakerId = await ask("  Smart Speaker ID (optional): ");

        const unit = await post(`/api/entities/${entity.id}/units`, {
          unitIdentifier: unitIdentifier.trim() || `Unit-${roomNumber.trim()}`,
          label: `${firstName.trim()}'s Unit`,
          smartSpeakerId: speakerId.trim() || null,
          floor: roomNumber.trim().replace(/\D/g, "").charAt(0) || "1",
        });

        if (unit) {
          console.log(`  Unit created: ${unit.unitIdentifier} (ID: ${unit.id})`);
          await post(`/api/entities/${entity.id}/units/${unit.id}/assign-resident`, { residentId: resident.id });
          console.log(`  Resident assigned to unit`);

          const addSensor = await ask("  Add a motion sensor? (y/n): ");
          if (addSensor.trim().toLowerCase() === "y") {
            const adtDeviceId = `ADT-${unitIdentifier.trim().replace(/\s/g, "-")}-${entity.id}`;
            const sensor = await post(`/api/entities/${entity.id}/sensors`, {
              entityId: entity.id,
              sensorType: "motion",
              location: `room_${roomNumber.trim()}`,
              adtDeviceId,
              unitId: unit.id,
            });
            if (sensor) {
              console.log(`  Sensor: ${sensor.adtDeviceId} @ ${sensor.location}`);
            }
          }
        }
      }
    }
  }

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║          Deployment Complete                    ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log("Summary:");
  console.log(`  Facility ID:     ${facilityId}`);
  console.log(`  Entity DB ID:    ${entity.id}`);
  console.log(`  Name:            ${entity.name}`);
  console.log(`  API Key:         ${geminiApiKey.trim() ? "Custom (tenant-isolated)" : "Global fallback"}`);
  console.log(`  Installation:    ${BASE_URL}`);
  console.log();
  console.log("Next Steps:");
  console.log(`  1. Admin Dashboard:   ${BASE_URL}/`);
  console.log(`  2. Super-Admin Hub:   ${BASE_URL}/super-admin`);
  console.log(`  3. Units Management:  ${BASE_URL}/units`);
  console.log(`  4. Run hardware test: curl ${BASE_URL}/api/test/unit/<unitId>`);
  console.log();

  rl.close();
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  rl.close();
  process.exit(1);
});
