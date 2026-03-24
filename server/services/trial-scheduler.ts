import { storage } from "../storage";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function checkExpiredTrials() {
  try {
    const expired = await storage.getExpiredTrialFacilities();
    if (expired.length === 0) return;

    console.log(`[trial-scheduler] Found ${expired.length} expired trial facility(ies). Transitioning to paused.`);

    for (const facility of expired) {
      await storage.updateFacility(facility.id, { subscriptionStatus: "paused" });
      console.log(`[trial-scheduler] Facility ${facility.facilityId} (${facility.name}) trial expired — paused.`);
    }
  } catch (err) {
    console.error("[trial-scheduler] Error checking expired trials:", err);
  }
}

export function startTrialScheduler() {
  console.log("[trial-scheduler] Starting trial lifecycle scheduler (interval: 1h)");
  checkExpiredTrials();
  setInterval(checkExpiredTrials, CHECK_INTERVAL_MS);
}
