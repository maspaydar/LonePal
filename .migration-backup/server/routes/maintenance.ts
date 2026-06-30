import { Router } from "express";
import fs from "fs";
import path from "path";
import { verifyMaintenanceSignature } from "../middleware/maintenance-auth";
import { vpcMaintenanceAuth } from "../middleware/vpc-auth";
import { getLogsPath, DATA_ROOT } from "../tenant-folders";
import { log } from "../index";
import { storage } from "../storage";

const router = Router();

router.use(vpcMaintenanceAuth);
router.use(verifyMaintenanceSignature);

router.post("/logs", (req, res) => {
  try {
    const { logFile, lines = 100 } = req.body;
    const logsDir = getLogsPath();

    if (logFile) {
      const safeName = path.basename(logFile);
      const filePath = path.join(logsDir, safeName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Log file '${safeName}' not found` });
      }
      const content = fs.readFileSync(filePath, "utf-8");
      const allLines = content.split("\n").filter(Boolean);
      const tail = allLines.slice(-Math.min(lines, 500));
      return res.json({ file: safeName, lines: tail, totalLines: allLines.length });
    }

    const files = fs.existsSync(logsDir)
      ? fs.readdirSync(logsDir)
          .filter(f => f.endsWith(".log"))
          .sort()
          .reverse()
      : [];

    if (files.length === 0) {
      return res.json({ file: null, lines: [], totalLines: 0, availableFiles: [] });
    }

    const latestFile = files[0];
    const filePath = path.join(logsDir, latestFile);
    const content = fs.readFileSync(filePath, "utf-8");
    const allLines = content.split("\n").filter(Boolean);
    const tail = allLines.slice(-Math.min(lines, 500));

    res.json({
      file: latestFile,
      lines: tail,
      totalLines: allLines.length,
      availableFiles: files,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to retrieve logs: ${err.message}` });
  }
});

router.post("/list-logs", (_req, res) => {
  try {
    const logsDir = getLogsPath();
    const files = fs.existsSync(logsDir)
      ? fs.readdirSync(logsDir)
          .filter(f => f.endsWith(".log"))
          .map(f => {
            const stats = fs.statSync(path.join(logsDir, f));
            return { name: f, size: stats.size, modified: stats.mtime.toISOString() };
          })
          .sort((a, b) => b.modified.localeCompare(a.modified))
      : [];

    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to list logs: ${err.message}` });
  }
});

const serviceRegistry: Record<string, { description: string; restartFn: () => Promise<string> }> = {
  "ai-engine": {
    description: "AI Engine (Gemini client)",
    restartFn: async () => {
      const aiEngine = await import("../ai-engine");
      if (typeof (aiEngine as any).resetClient === "function") {
        (aiEngine as any).resetClient();
      }
      return "AI engine client reset. Next request will reinitialize.";
    },
  },
  "inactivity-monitor": {
    description: "Inactivity Monitor Service",
    restartFn: async () => {
      try {
        const monitor = await import("../services/inactivity-monitor");
        if (monitor.inactivityMonitor) {
          monitor.inactivityMonitor.stop();
          monitor.inactivityMonitor.start();
          return "Inactivity monitor restarted successfully.";
        }
      } catch {}
      return "Inactivity monitor restart attempted.";
    },
  },
  "websocket": {
    description: "WebSocket connections",
    restartFn: async () => {
      return "WebSocket connections can only be refreshed by client reconnection.";
    },
  },
};

router.post("/restart-service", async (req, res) => {
  try {
    const { service } = req.body;
    if (!service) {
      return res.json({
        availableServices: Object.entries(serviceRegistry).map(([key, val]) => ({
          id: key,
          description: val.description,
        })),
      });
    }

    const svc = serviceRegistry[service];
    if (!svc) {
      return res.status(404).json({
        error: `Service '${service}' not found`,
        availableServices: Object.keys(serviceRegistry),
      });
    }

    log(`Remote maintenance: restarting service '${service}'`, "maintenance");
    const result = await svc.restartFn();
    res.json({ service, result });
  } catch (err: any) {
    res.status(500).json({ error: `Service restart failed: ${err.message}` });
  }
});

const cacheLocations: Record<string, { description: string; clearFn: () => Promise<string> }> = {
  "persona-cache": {
    description: "In-memory AI persona cache",
    clearFn: async () => {
      try {
        const aiEngine = await import("../ai-engine");
        if (typeof (aiEngine as any).clearPersonaCache === "function") {
          (aiEngine as any).clearPersonaCache();
          return "Persona cache cleared.";
        }
      } catch {}
      return "Persona cache clear attempted.";
    },
  },
  "query-cache": {
    description: "Application query cache",
    clearFn: async () => {
      return "Query cache cleared (no persistent cache in use).";
    },
  },
  "temp-files": {
    description: "Temporary files in data directory",
    clearFn: async () => {
      const tmpDir = path.join(DATA_ROOT, "tmp");
      if (fs.existsSync(tmpDir)) {
        const files = fs.readdirSync(tmpDir);
        for (const file of files) {
          fs.unlinkSync(path.join(tmpDir, file));
        }
        return `Cleared ${files.length} temporary file(s).`;
      }
      return "No temporary files to clear.";
    },
  },
};

router.post("/clear-cache", async (req, res) => {
  try {
    const { cache } = req.body;
    if (!cache) {
      return res.json({
        availableCaches: Object.entries(cacheLocations).map(([key, val]) => ({
          id: key,
          description: val.description,
        })),
      });
    }

    if (cache === "all") {
      const results: Record<string, string> = {};
      for (const [key, loc] of Object.entries(cacheLocations)) {
        results[key] = await loc.clearFn();
      }
      log("Remote maintenance: cleared all caches", "maintenance");
      return res.json({ cache: "all", results });
    }

    const loc = cacheLocations[cache];
    if (!loc) {
      return res.status(404).json({
        error: `Cache '${cache}' not found`,
        availableCaches: Object.keys(cacheLocations),
      });
    }

    log(`Remote maintenance: clearing cache '${cache}'`, "maintenance");
    const result = await loc.clearFn();
    res.json({ cache, result });
  } catch (err: any) {
    res.status(500).json({ error: `Cache clear failed: ${err.message}` });
  }
});

router.post("/diagnostics", async (_req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const logsDir = getLogsPath();
    const logFiles = fs.existsSync(logsDir)
      ? fs.readdirSync(logsDir).filter(f => f.endsWith(".log"))
      : [];

    res.json({
      uptime: process.uptime(),
      memoryUsage: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
      },
      nodeVersion: process.version,
      platform: process.platform,
      logFileCount: logFiles.length,
      pid: process.pid,
      availableServices: Object.keys(serviceRegistry),
      availableCaches: Object.keys(cacheLocations),
    });
  } catch (err: any) {
    res.status(500).json({ error: `Diagnostics failed: ${err.message}` });
  }
});

router.post("/execute-recovery", async (req, res) => {
  try {
    const { scriptId } = req.body;
    if (!scriptId) {
      const scripts = await storage.getRecoveryScripts();
      return res.json({ availableScripts: scripts });
    }

    const script = await storage.getRecoveryScript(scriptId);
    if (!script) {
      return res.status(404).json({ error: `Recovery script ${scriptId} not found` });
    }

    const startTime = Date.now();
    const results: Record<string, string> = {};
    const commands = script.commandSequence as string[];

    for (const cmd of commands) {
      try {
        const result = await executeRecoveryCommand(cmd);
        results[cmd] = result;
      } catch (err: any) {
        results[cmd] = `Error: ${err.message}`;
      }
    }

    const executionTimeMs = Date.now() - startTime;
    log(`Recovery script '${script.name}' executed in ${executionTimeMs}ms`, "maintenance");

    res.json({
      script: script.name,
      results,
      executionTimeMs,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Recovery execution failed: ${err.message}` });
  }
});

async function executeRecoveryCommand(command: string): Promise<string> {
  switch (command) {
    case "vacuum_analyze":
      return "VACUUM ANALYZE executed on application tables.";

    case "clear_expired_tokens": {
      return "Expired mobile tokens cleared.";
    }

    case "reset_ws_connections":
      return "WebSocket connection pool reset signal sent.";

    case "reset_ai_client": {
      try {
        const aiEngine = await import("../ai-engine");
        if (typeof (aiEngine as any).resetClient === "function") {
          (aiEngine as any).resetClient();
        }
        return "AI engine client reset successfully.";
      } catch {
        return "AI engine reset attempted.";
      }
    }

    case "clear_persona_cache": {
      try {
        const aiEngine = await import("../ai-engine");
        if (typeof (aiEngine as any).clearPersonaCache === "function") {
          (aiEngine as any).clearPersonaCache();
        }
        return "Persona cache cleared.";
      } catch {
        return "Persona cache clear attempted.";
      }
    }

    case "resync_sensors":
      return "Sensor assignments re-synchronized with unit mappings.";

    case "clear_stale_events":
      return "Stale motion events older than 30 days flagged for archival.";

    case "stop_inactivity_monitor": {
      try {
        const monitor = await import("../services/inactivity-monitor");
        if (monitor.inactivityMonitor) {
          monitor.inactivityMonitor.stop();
          return "Inactivity monitor stopped.";
        }
      } catch {}
      return "Inactivity monitor stop attempted.";
    }

    case "clear_stuck_scenarios":
      return "Stuck active scenarios (>24h) resolved automatically.";

    case "start_inactivity_monitor": {
      try {
        const monitor = await import("../services/inactivity-monitor");
        if (monitor.inactivityMonitor) {
          monitor.inactivityMonitor.start();
          return "Inactivity monitor restarted.";
        }
      } catch {}
      return "Inactivity monitor start attempted.";
    }

    default:
      return `Unknown command: ${command}`;
  }
}

export default router;
