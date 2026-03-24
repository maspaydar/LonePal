import { Router } from "express";
import { storage } from "../storage";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { facilityRegistrationSchema } from "@shared/schema";
import { sendVerificationEmail, sendWelcomeAndCredentialsEmail, sendSuperAdminNewRegistrationEmail } from "../services/email-service";
import { log } from "../index";
import { provisionEntityFolder } from "../tenant-folders";

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const parsed = facilityRegistrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }

    const { facilityName, contactName, contactEmail, contactPhone, password } = parsed.data;

    const existing = await storage.getFacilityByContactEmail(contactEmail);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const facilityId = facilityName.toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 30) + "-" + crypto.randomBytes(4).toString("hex");

    const facility = await storage.createFacility({
      facilityId,
      name: facilityName,
      contactName,
      contactEmail,
      contactPhone: contactPhone || null,
      password: hashedPassword,
      emailVerified: false,
      verificationToken,
      verificationTokenExpiresAt,
      subscriptionStatus: "pending_verification",
      status: "onboarding",
    });

    await sendVerificationEmail(contactEmail, contactName, verificationToken);

    log(`New facility registration: ${facilityName} (${contactEmail})`, "registration");

    res.status(201).json({
      success: true,
      message: "Registration successful! Please check your email to verify your account.",
      facilityId: facility.facilityId,
    });
  } catch (err: any) {
    log(`Registration error: ${err.message}`, "registration");
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Verification token is required." });
    }

    const facility = await storage.getFacilityByVerificationToken(token);
    if (!facility) {
      return res.status(404).json({ error: "Invalid or expired verification link." });
    }

    if (facility.emailVerified) {
      return res.json({
        success: true,
        alreadyVerified: true,
        message: "Your email has already been verified.",
        facilityName: facility.name,
      });
    }

    if (facility.verificationTokenExpiresAt && facility.verificationTokenExpiresAt < new Date()) {
      return res.status(410).json({ error: "This verification link has expired. Please register again." });
    }

    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const baseUsername = (facility.contactEmail || facility.name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .substring(0, 28);
    let adminUsername = baseUsername;
    let suffix = 2;
    while (await storage.getUserByUsername(adminUsername)) {
      adminUsername = `${baseUsername}_${suffix++}`;
    }

    const entity = await storage.createEntity({
      name: facility.name,
      type: "facility",
      address: facility.address || undefined,
      contactPhone: facility.contactPhone || undefined,
      contactEmail: facility.contactEmail || undefined,
      isActive: true,
    });
    provisionEntityFolder(entity.id);

    await storage.createUser({
      username: adminUsername,
      password: facility.password!,
      fullName: facility.contactName || `${facility.name} Admin`,
      role: "admin",
      entityId: entity.id,
    });

    await storage.updateFacility(facility.id, {
      emailVerified: true,
      verificationToken: null,
      verificationTokenExpiresAt: null,
      subscriptionStatus: "trial",
      trialEndsAt,
      status: "active",
      linkedEntityId: entity.id,
    });

    const appUrl = process.env.APP_URL || (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:5000");

    if (facility.contactEmail && facility.contactName) {
      await sendWelcomeAndCredentialsEmail(
        facility.contactEmail,
        facility.contactName,
        facility.name,
        `${appUrl}/login`,
        adminUsername,
        trialEndsAt
      );
    }

    const allSuperAdmins = await storage.getAllSuperAdmins();
    for (const admin of allSuperAdmins) {
      await sendSuperAdminNewRegistrationEmail(
        admin.email,
        facility.name,
        facility.contactName || "Unknown",
        facility.contactEmail || "Unknown",
        trialEndsAt
      );
    }

    log(`Facility verified and trial started: ${facility.name} (entity=${entity.id}, user=${adminUsername})`, "registration");

    res.json({
      success: true,
      message: "Email verified! Your 30-day trial is now active.",
      facilityName: facility.name,
      loginUsername: adminUsername,
      trialEndsAt: trialEndsAt.toISOString(),
    });
  } catch (err: any) {
    log(`Email verification error: ${err.message}`, "registration");
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

export default router;
