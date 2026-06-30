import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { ensureDataRoot } from "./tenant-folders";
import { dailyLogger } from "./daily-logger";
import { tenantResolver } from "./middleware/tenant-resolver";
import { startTrialScheduler } from "./services/trial-scheduler";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { storage } from "./storage";
import { log } from "./logger-util";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: Buffer | unknown;
  }
}

ensureDataRoot();
dailyLogger.init();
startTrialScheduler();

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("DATABASE_URL not set — skipping Stripe initialization");
    return;
  }
  try {
    await runMigrations({ databaseUrl, schema: "stripe" });
    const stripeSync = await getStripeSync();
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (domain) {
      const webhookBaseUrl = `https://${domain}`;
      await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/webhooks/stripe`);
    }
    stripeSync.syncBackfill().catch((err: any) => {
      console.error("Stripe syncBackfill error:", err?.message);
    });
    console.log("Stripe initialized");
  } catch (err: any) {
    console.error("Stripe initialization failed:", err?.message);
  }
}

initStripe();

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  credentials: true,
  maxAge: 86400,
}));

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use("/api", tenantResolver);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

const rawPort = process.env["PORT"];
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

(async () => {
  await registerRoutes(httpServer, app);

  try {
    await storage.fixOrphanedDemoResidents(12);
  } catch (e) {
    dailyLogger.error("startup", `fixOrphanedDemoResidents failed: ${e}`);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);
    dailyLogger.error("server", `Internal Server Error: ${message}`, { status });

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      dailyLogger.info("system", `HeyGrand server started on port ${port}`);
    },
  );
})();
