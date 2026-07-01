import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
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
import { authLimiter, registerLimiter } from "./middleware/rate-limit";

// Any key matching this pattern has its value scrubbed before logging. Pattern-based
// (not an exact allow-list) so variants like pendingToken / access_token / totpSecret
// are all caught.
const SENSITIVE_KEY_RE = /token|secret|password|passwd|authorization|apikey|api_key|otp|totp|credential|cookie/i;

function redactSensitive(value: any): any {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY_RE.test(k) ? "[REDACTED]" : redactSensitive(v);
    }
    return out;
  }
  return value;
}

const app = express();
const httpServer = createServer(app);
// Behind the Replit reverse proxy: trust the first hop so req.ip reflects the
// real client (needed for correct rate limiting).
app.set("trust proxy", 1);

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

const isProduction = process.env.NODE_ENV === "production";

// Allow-list of frontend origins for production CORS, derived from the deploy env.
const allowedOrigins = new Set<string>();
for (const domain of process.env.REPLIT_DOMAINS?.split(",") ?? []) {
  const trimmed = domain.trim();
  if (trimmed) allowedOrigins.add(`https://${trimmed}`);
}
if (process.env.APP_URL) {
  // Normalize to scheme+host(+port) so a trailing slash or path in APP_URL still
  // matches the browser Origin header (which is origin-only).
  try {
    allowedOrigins.add(new URL(process.env.APP_URL).origin);
  } catch {
    // Malformed APP_URL — skip rather than crash startup.
  }
}

// Security headers.
app.use(helmet());

app.use(cors({
  // In production, restrict to known frontend origins (not "*"). In development,
  // reflect any origin so local tooling and previews work.
  origin: isProduction
    ? (origin, cb) => {
        // No Origin header = same-origin or non-browser client (e.g. Stripe webhooks) — allow.
        if (!origin || allowedOrigins.has(origin)) return cb(null, true);
        return cb(new Error("Not allowed by CORS"));
      }
    : true,
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
        logLine += ` :: ${JSON.stringify(redactSensitive(capturedJsonResponse))}`;
      }
      log(logLine);
    }
  });

  next();
});

// Rate limiting on authentication + public registration endpoints (brute-force / abuse protection).
// Mounted before registerRoutes so they run ahead of the route handlers.
app.use("/api/auth/login", authLimiter);
app.use("/api/company/auth/login", authLimiter);
app.use("/api/mobile/login", authLimiter);
app.use("/api/super-admin/auth/login", authLimiter);
app.use("/api/super-admin/auth/verify-2fa", authLimiter);
app.use("/api/super-admin/auth/emergency-reset", authLimiter);
app.use("/api/register", registerLimiter);
app.use("/api/verify-email", registerLimiter);

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

    // Never leak internal error details (messages, stack traces, SQL) to clients
    // on 5xx responses in production.
    const clientMessage = status >= 500 && isProduction ? "Internal Server Error" : message;
    return res.status(status).json({ message: clientMessage });
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
