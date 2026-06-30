import { storage } from "../storage";
import { dailyLogger } from "../daily-logger";
import { emergencyService } from "./emergency-service";

const CHECK_INTERVAL_MS = 60 * 1000;
const INACTIVITY_THRESHOLD_MS = 10 * 60 * 1000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let broadcastFn: ((data: any) => void) | null = null;

async function checkAllResidents(): Promise<void> {
  try {
    const entities = await storage.getEntities();

    for (const entity of entities) {
      if (!entity.isActive) continue;

      const residents = await storage.getResidents(entity.id);

      for (const resident of residents) {
        if (!resident.isActive) continue;

        const lastActivity = resident.lastActivityAt;
        if (!lastActivity) continue;

        const elapsed = Date.now() - new Date(lastActivity).getTime();

        if (elapsed >= INACTIVITY_THRESHOLD_MS && resident.status !== "alert" && resident.status !== "checking" && resident.status !== "emergency") {
          dailyLogger.warn("inactivity", `Resident ${resident.id} inactive for ${Math.round(elapsed / 60000)} minutes`, {
            entityId: entity.id,
            residentId: resident.id,
            lastActivityAt: lastActivity,
            minutesInactive: Math.round(elapsed / 60000),
          });

          await storage.updateResidentStatus(resident.id, "alert");

          const name = resident.preferredName || resident.firstName;
          const minutesInactive = Math.round(elapsed / 60000);

          const alert = await storage.createAlert({
            entityId: entity.id,
            residentId: resident.id,
            severity: minutesInactive >= 20 ? "critical" : "warning",
            title: `Inactivity Alert: ${name}`,
            message: `${name} (Room ${resident.roomNumber || "N/A"}) has had no motion detected for ${minutesInactive} minutes. Last activity: ${new Date(lastActivity).toLocaleTimeString()}.`,
          });

          if (broadcastFn) {
            broadcastFn({
              type: "safety_alert",
              data: {
                alert,
                resident: {
                  id: resident.id,
                  name,
                  roomNumber: resident.roomNumber,
                },
              },
            });
          }

          try {
            const checkIn = await emergencyService.initiateProactiveCheckIn(
              entity.id,
              resident.id,
              alert,
              minutesInactive,
            );
            await storage.updateResidentStatus(resident.id, "checking");

            dailyLogger.info("inactivity", `Safety alert ${alert.id} created + AI check-in sent for resident ${resident.id}`, {
              entityId: entity.id,
              alertId: alert.id,
              conversationId: checkIn.conversationId,
              severity: alert.severity,
              minutesInactive,
            });
          } catch (checkInErr) {
            dailyLogger.error("inactivity", `Failed to send AI check-in for resident ${resident.id}: ${checkInErr}`);
            dailyLogger.info("inactivity", `Safety alert ${alert.id} created (without AI check-in) for resident ${resident.id}`, {
              entityId: entity.id,
              alertId: alert.id,
              severity: alert.severity,
              minutesInactive,
            });
          }
        }
      }
    }
  } catch (err) {
    dailyLogger.error("inactivity", `Inactivity check failed: ${err}`);
  }
}

export const inactivityMonitor = {
  start(broadcast?: (data: any) => void): void {
    if (intervalHandle) {
      dailyLogger.warn("inactivity", "Monitor already running, skipping duplicate start");
      return;
    }

    if (broadcast) {
      broadcastFn = broadcast;
    }

    dailyLogger.info("inactivity", `Inactivity monitor started (check every ${CHECK_INTERVAL_MS / 1000}s, threshold ${INACTIVITY_THRESHOLD_MS / 60000} min)`);

    intervalHandle = setInterval(checkAllResidents, CHECK_INTERVAL_MS);

    setTimeout(checkAllResidents, 5000);
  },

  stop(): void {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
      dailyLogger.info("inactivity", "Inactivity monitor stopped");
    }
  },

  async runOnce(): Promise<void> {
    await checkAllResidents();
  },
};
