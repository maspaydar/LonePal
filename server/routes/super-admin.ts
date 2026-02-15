import { Router } from "express";
import { storage } from "../storage";
import bcrypt from "bcryptjs";
import { TOTP, generateSecret, generateURI, verifySync } from "otplib";
import jwt from "jsonwebtoken";
import {
  superAdminLoginSchema,
  superAdminVerify2FASchema,
} from "@shared/schema";
import {
  signSuperAdminToken,
  signPending2FAToken,
  superAdminAuthMiddleware,
} from "../middleware/super-admin-auth";

const router = Router();

function getJwtSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not configured");
  return secret;
}

router.post("/auth/login", async (req, res) => {
  try {
    const parsed = superAdminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;
    const admin = await storage.getSuperAdminByEmail(email);
    if (!admin || !admin.isActive) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordValid = await bcrypt.compare(password, admin.password);
    if (!passwordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (admin.totpEnabled) {
      const pendingToken = signPending2FAToken(admin.id, admin.email);
      return res.json({
        requires2FA: true,
        pendingToken,
        message: "Enter your 2FA code to continue",
      });
    }

    const token = signSuperAdminToken({
      superAdminId: admin.id,
      email: admin.email,
      twoFactorVerified: true,
    });

    await storage.updateSuperAdmin(admin.id, { lastLoginAt: new Date() });

    res.json({
      requires2FA: false,
      token,
      admin: { id: admin.id, email: admin.email, fullName: admin.fullName, totpEnabled: admin.totpEnabled },
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/auth/verify-2fa", async (req, res) => {
  try {
    const parsed = superAdminVerify2FASchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Pending 2FA token required" });
    }

    const pendingToken = authHeader.substring(7);
    let decoded: any;
    try {
      decoded = jwt.verify(pendingToken, getJwtSecret());
    } catch {
      return res.status(401).json({ error: "Invalid or expired pending token" });
    }

    if (!decoded.pending2FA) {
      return res.status(400).json({ error: "Not a pending 2FA token" });
    }

    const admin = await storage.getSuperAdmin(decoded.superAdminId);
    if (!admin || !admin.totpSecret) {
      return res.status(400).json({ error: "2FA not configured" });
    }

    const isValid = verifySync({ token: parsed.data.token, secret: admin.totpSecret });

    if (!isValid) {
      return res.status(401).json({ error: "Invalid 2FA code" });
    }

    const token = signSuperAdminToken({
      superAdminId: admin.id,
      email: admin.email,
      twoFactorVerified: true,
    });

    await storage.updateSuperAdmin(admin.id, { lastLoginAt: new Date() });

    res.json({
      token,
      admin: { id: admin.id, email: admin.email, fullName: admin.fullName, totpEnabled: admin.totpEnabled },
    });
  } catch (error) {
    res.status(500).json({ error: "2FA verification failed" });
  }
});

router.post("/auth/setup-2fa", superAdminAuthMiddleware, async (req, res) => {
  try {
    const admin = await storage.getSuperAdmin(req.superAdmin!.superAdminId);
    if (!admin) return res.status(404).json({ error: "Admin not found" });

    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: "EchoPath Nexus", label: admin.email, secret, type: "totp" });

    await storage.updateSuperAdmin(admin.id, { totpSecret: secret, totpEnabled: false });

    res.json({
      secret,
      otpauthUrl,
      message: "Scan the QR code with your authenticator app, then verify with a code to enable 2FA",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to setup 2FA" });
  }
});

router.post("/auth/confirm-2fa", superAdminAuthMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Verification code required" });

    const admin = await storage.getSuperAdmin(req.superAdmin!.superAdminId);
    if (!admin || !admin.totpSecret) {
      return res.status(400).json({ error: "2FA setup not initiated" });
    }

    const isValid = verifySync({ token, secret: admin.totpSecret });
    if (!isValid) {
      return res.status(401).json({ error: "Invalid code. Please try again." });
    }

    await storage.updateSuperAdmin(admin.id, { totpEnabled: true });
    res.json({ message: "2FA enabled successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to confirm 2FA" });
  }
});

router.post("/auth/disable-2fa", superAdminAuthMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    const admin = await storage.getSuperAdmin(req.superAdmin!.superAdminId);
    if (!admin || !admin.totpSecret) {
      return res.status(400).json({ error: "2FA not configured" });
    }

    const isValid = verifySync({ token, secret: admin.totpSecret });
    if (!isValid) {
      return res.status(401).json({ error: "Invalid 2FA code" });
    }

    await storage.updateSuperAdmin(admin.id, { totpSecret: null, totpEnabled: false });
    res.json({ message: "2FA disabled successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to disable 2FA" });
  }
});

router.get("/auth/me", superAdminAuthMiddleware, async (req, res) => {
  const admin = await storage.getSuperAdmin(req.superAdmin!.superAdminId);
  if (!admin) return res.status(404).json({ error: "Admin not found" });
  res.json({
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    totpEnabled: admin.totpEnabled,
    lastLoginAt: admin.lastLoginAt,
  });
});

router.post("/auth/register", async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: "Email, password, and full name are required" });
    }

    const existing = await storage.getSuperAdminByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const admin = await storage.createSuperAdmin({
      email,
      password: hashedPassword,
      fullName,
    });

    const token = signSuperAdminToken({
      superAdminId: admin.id,
      email: admin.email,
      twoFactorVerified: true,
    });

    res.status(201).json({
      token,
      admin: { id: admin.id, email: admin.email, fullName: admin.fullName, totpEnabled: false },
    });
  } catch (error) {
    res.status(500).json({ error: "Registration failed" });
  }
});

router.get("/facilities", superAdminAuthMiddleware, async (_req, res) => {
  const result = await storage.getFacilities();
  res.json(result.map(f => ({ ...f, geminiApiKey: f.geminiApiKey ? "****" + f.geminiApiKey.slice(-4) : null })));
});

router.get("/facilities/:id", superAdminAuthMiddleware, async (req, res) => {
  const facility = await storage.getFacility(Number(req.params.id));
  if (!facility) return res.status(404).json({ error: "Facility not found" });
  res.json({ ...facility, geminiApiKey: facility.geminiApiKey ? "****" + facility.geminiApiKey.slice(-4) : null });
});

router.post("/facilities", superAdminAuthMiddleware, async (req, res) => {
  try {
    const { facilityId, name, address, contactEmail, contactPhone, installationUrl, status, geminiApiKey, configJson } = req.body;
    if (!facilityId || !name) {
      return res.status(400).json({ error: "facilityId and name are required" });
    }

    const existing = await storage.getFacilityByFacilityId(facilityId);
    if (existing) {
      return res.status(409).json({ error: "Facility ID already exists" });
    }

    const facility = await storage.createFacility({
      facilityId,
      name,
      address,
      contactEmail,
      contactPhone,
      installationUrl,
      status: status || "onboarding",
      geminiApiKey,
      configJson,
    });

    res.status(201).json(facility);
  } catch (error) {
    res.status(500).json({ error: "Failed to create facility" });
  }
});

router.patch("/facilities/:id", superAdminAuthMiddleware, async (req, res) => {
  const updated = await storage.updateFacility(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: "Facility not found" });
  res.json({ ...updated, geminiApiKey: updated.geminiApiKey ? "****" + updated.geminiApiKey.slice(-4) : null });
});

router.delete("/facilities/:id", superAdminAuthMiddleware, async (req, res) => {
  const facility = await storage.getFacility(Number(req.params.id));
  if (!facility) return res.status(404).json({ error: "Facility not found" });
  await storage.deleteFacility(Number(req.params.id));
  res.json({ deleted: true });
});

router.post("/facilities/:id/push-config", superAdminAuthMiddleware, async (req, res) => {
  try {
    const facility = await storage.getFacility(Number(req.params.id));
    if (!facility) return res.status(404).json({ error: "Facility not found" });

    if (!facility.installationUrl) {
      return res.status(400).json({ error: "Facility has no installation URL configured" });
    }

    const { config } = req.body;
    if (!config || typeof config !== "object") {
      return res.status(400).json({ error: "Config object required" });
    }

    try {
      const response = await fetch(`${facility.installationUrl}/api/super-admin/receive-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facilityId: facility.facilityId, config }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return res.status(502).json({ error: `Facility responded with ${response.status}` });
      }

      await storage.updateFacility(facility.id, { configJson: config });
      res.json({ pushed: true, facilityId: facility.facilityId });
    } catch (fetchErr: any) {
      res.status(502).json({ error: `Could not reach facility: ${fetchErr.message}` });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to push config" });
  }
});

router.get("/facilities/:id/health-logs", superAdminAuthMiddleware, async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const logs = await storage.getFacilityHealthLogs(Number(req.params.id), limit);
  res.json(logs);
});

router.post("/facilities/check-health", superAdminAuthMiddleware, async (_req, res) => {
  try {
    const allFacilities = await storage.getFacilities();
    const results = [];

    for (const facility of allFacilities) {
      if (!facility.installationUrl) {
        results.push({ facilityId: facility.facilityId, status: "no_url", responseTimeMs: 0 });
        continue;
      }

      const startTime = Date.now();
      try {
        const response = await fetch(`${facility.installationUrl}/api/health`, {
          signal: AbortSignal.timeout(10000),
        });
        const responseTimeMs = Date.now() - startTime;
        const data = response.ok ? await response.json() : null;

        const status = response.ok ? "healthy" : "unhealthy";
        const activeUsers = data?.activeUsers || 0;

        await storage.createFacilityHealthLog({
          facilityId: facility.id,
          status,
          responseTimeMs,
          activeUsers,
        });

        await storage.updateFacility(facility.id, {
          lastHealthCheck: new Date(),
          lastHealthStatus: status,
          activeResidents: activeUsers,
        });

        results.push({ facilityId: facility.facilityId, name: facility.name, status, responseTimeMs, activeUsers });
      } catch (err: any) {
        const responseTimeMs = Date.now() - startTime;
        await storage.createFacilityHealthLog({
          facilityId: facility.id,
          status: "unreachable",
          responseTimeMs,
          errorMessage: err.message,
        });

        await storage.updateFacility(facility.id, {
          lastHealthCheck: new Date(),
          lastHealthStatus: "unreachable",
        });

        results.push({ facilityId: facility.facilityId, name: facility.name, status: "unreachable", responseTimeMs, error: err.message });
      }
    }

    res.json({ checked: results.length, results });
  } catch (error) {
    res.status(500).json({ error: "Health check failed" });
  }
});

router.get("/dashboard", superAdminAuthMiddleware, async (_req, res) => {
  const allFacilities = await storage.getFacilities();

  const active = allFacilities.filter(f => f.status === "active").length;
  const inactive = allFacilities.filter(f => f.status === "inactive").length;
  const maintenance = allFacilities.filter(f => f.status === "maintenance").length;
  const onboarding = allFacilities.filter(f => f.status === "onboarding").length;

  const healthy = allFacilities.filter(f => f.lastHealthStatus === "healthy").length;
  const unhealthy = allFacilities.filter(f => f.lastHealthStatus === "unhealthy" || f.lastHealthStatus === "unreachable").length;

  const totalResidents = allFacilities.reduce((sum, f) => sum + (f.activeResidents || 0), 0);

  res.json({
    totalFacilities: allFacilities.length,
    active,
    inactive,
    maintenance,
    onboarding,
    healthy,
    unhealthy,
    totalResidents,
    facilities: allFacilities.map(f => ({
      ...f,
      geminiApiKey: f.geminiApiKey ? "****" + f.geminiApiKey.slice(-4) : null,
    })),
  });
});

export default router;
