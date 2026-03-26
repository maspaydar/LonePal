#!/usr/bin/env tsx
/**
 * HeyGrand Demo Data Seed Script (CLI wrapper)
 *
 * Delegates to server/demo-seed.ts which contains the actual seed logic.
 * This file exists so the seed can also be triggered from the command line
 * during local development without needing a running server.
 *
 * Run: npx tsx scripts/seed-demo-data.ts
 *
 * Credentials after seeding:
 *   Staff login  → sarah.admin   / Demo@2026  (admin)
 *                → james.manager / Demo@2026  (manager)
 *                → lisa.staff    / Demo@2026  (staff)
 */

import { runDemoSeed } from "../server/demo-seed";

async function main() {
  console.log("🌱 Starting HeyGrand demo data seed...\n");
  try {
    const result = await runDemoSeed();
    console.log(`
╔══════════════════════════════════════════════════════════╗
║          ✅  Demo data seed complete!                    ║
╠══════════════════════════════════════════════════════════╣
║  Facility : Sunrise Senior Living                        ║
║  Entity ID: ${String(result.entityId).padEnd(44)}║
║                                                          ║
║  Staff logins (password: Demo@2026)                      ║
║   • sarah.admin   (Admin)                                ║
║   • james.manager (Manager)                              ║
║   • lisa.staff    (Staff)                                ║
║                                                          ║
║  Residents                                               ║
║   • Maggie Chen    Room 101  ✅ Safe                     ║
║   • Bob Williams   Room 205  🟡 Checking                 ║
║   • Ellie Patel    Room 310  🔴 Alert                    ║
║   • Dot Harris     Room 412  ✅ Safe                     ║
║   • Frank Thompson Room 118  ✅ Safe                     ║
╚══════════════════════════════════════════════════════════╝
    `);
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
}

main();
