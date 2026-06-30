import { Router } from "express";
import { storage } from "../../storage";
import bcrypt from "bcryptjs";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import {
  companyLoginSchema,
  createCompanyUserSchema,
} from "@shared/schema";
import {
  signCompanyToken,
  requireCompanyAuth,
  requireCompanyAuthBasic,
  requireCompanyAdmin,
  requireCompanyAdminBasic,
} from "../../middleware/company-auth";
import { getUncachableStripeClient, getStripePublishableKey } from "../../stripeClient";

const router = Router();

router.post("/auth/login", async (req, res) => {
  try {
    const parsed = companyLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { username, password } = parsed.data;
    const user = await storage.getUserByUsername(username);

    if (!user || !user.entityId) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.role || !["admin", "manager", "staff"].includes(user.role)) {
      return res.status(403).json({ error: "This portal is for facility staff only. Residents must use the mobile app." });
    }

    if (user.isActive === false) {
      return res.status(401).json({ error: "Account has been deactivated" });
    }

    const facility = await storage.getFacilityByLinkedEntityId(user.entityId);
    if (facility) {
      if (facility.subscriptionStatus === "paused") {
        return res.status(403).json({
          error: "subscription_paused",
          message: "Your facility's subscription has expired. Please contact support to renew.",
        });
      }
      if (facility.subscriptionStatus === "cancelled") {
        return res.status(403).json({
          error: "subscription_cancelled",
          message: "Your facility's subscription has been cancelled. Please contact support.",
        });
      }
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signCompanyToken({
      userId: user.id,
      entityId: user.entityId,
      role: user.role,
    });

    const entity = await storage.getEntity(user.entityId);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        entityId: user.entityId,
      },
      entity: entity
        ? { id: entity.id, name: entity.name, type: entity.type }
        : null,
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/auth/refresh", requireCompanyAuth, async (req, res) => {
  try {
    const { companyUser } = req;
    if (!companyUser) return res.status(401).json({ error: "Unauthorized" });

    const user = await storage.getUser(companyUser.userId);
    if (!user || !user.entityId) {
      return res.status(401).json({ error: "User not found" });
    }

    const token = signCompanyToken({
      userId: user.id,
      entityId: user.entityId,
      role: user.role,
    });

    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: "Token refresh failed" });
  }
});

router.get("/auth/me", requireCompanyAuth, async (req, res) => {
  try {
    const user = await storage.getUser(req.companyUser!.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const entity = user.entityId ? await storage.getEntity(user.entityId) : null;

    res.json({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      entityId: user.entityId,
      entity: entity ? { id: entity.id, name: entity.name, type: entity.type } : null,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

router.get("/users", requireCompanyAdmin, async (req, res) => {
  try {
    const entityId = req.companyUser!.entityId;
    const userList = await storage.getUsersByEntity(entityId);
    res.json(userList.map(u => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      entityId: u.entityId,
      isActive: u.isActive,
    })));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/users", requireCompanyAdmin, async (req, res) => {
  try {
    const parsed = createCompanyUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { username, password, fullName, role } = parsed.data;
    const entityId = req.companyUser!.entityId;

    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await storage.createUser({
      username,
      password: hashedPassword,
      fullName,
      role,
      entityId,
    });

    res.status(201).json({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      entityId: user.entityId,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/users/:userId", requireCompanyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const entityId = req.companyUser!.entityId;

    const targetUser = await storage.getUser(userId);
    if (!targetUser || targetUser.entityId !== entityId) {
      return res.status(404).json({ error: "User not found" });
    }

    const { fullName, role, password, isActive } = req.body;
    const updateData: Record<string, any> = {};
    if (fullName) updateData.fullName = fullName;
    if (role && ["admin", "manager", "staff"].includes(role)) updateData.role = role;
    if (password) updateData.password = await bcrypt.hash(password, 12);
    if (typeof isActive === "boolean") updateData.isActive = isActive;

    const updated = await storage.updateUser(userId, updateData);
    if (!updated) return res.status(404).json({ error: "User not found" });

    res.json({
      id: updated.id,
      username: updated.username,
      fullName: updated.fullName,
      role: updated.role,
      entityId: updated.entityId,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.get("/subscription-status", requireCompanyAuthBasic, async (req, res) => {
  try {
    const entityId = req.companyUser!.entityId;
    const facility = await storage.getFacilityByLinkedEntityId(entityId);
    if (!facility) {
      return res.json({ status: null });
    }

    const now = new Date();
    let currentStatus = facility.subscriptionStatus;
    const trialEndsAt = facility.trialEndsAt ? new Date(facility.trialEndsAt) : null;

    if (currentStatus === "trial" && trialEndsAt && trialEndsAt < now) {
      await storage.updateFacility(facility.id, { subscriptionStatus: "paused" });
      currentStatus = "paused";
    }

    const daysRemaining =
      currentStatus === "trial" && trialEndsAt
        ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : null;

    let stripeSubscription: any = null;
    if (facility.stripeSubscriptionId) {
      try {
        const result = await db.execute(
          sql`SELECT * FROM stripe.subscriptions WHERE id = ${facility.stripeSubscriptionId} LIMIT 1`
        );
        stripeSubscription = result.rows[0] || null;
      } catch {}
    }

    res.json({
      status: currentStatus,
      trialEndsAt: facility.trialEndsAt,
      daysRemaining,
      stripeCustomerId: facility.stripeCustomerId,
      stripeSubscriptionId: facility.stripeSubscriptionId,
      currentPeriodEnd: stripeSubscription?.current_period_end ?? null,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch subscription status" });
  }
});

router.get("/billing/prices", requireCompanyAdminBasic, async (_req, res) => {
  try {
    const stripe = await getUncachableStripeClient();
    const priceList = await stripe.prices.list({ active: true, expand: ["data.product"], limit: 20 });
    const prices = priceList.data
      .filter((p) => p.type === "recurring" && p.product && typeof p.product !== "string" && (p.product as any).active)
      .map((p) => {
        const product = p.product as any;
        return {
          price_id: p.id,
          product_id: product.id,
          product_name: product.name,
          product_description: product.description,
          unit_amount: p.unit_amount,
          currency: p.currency,
          recurring: p.recurring,
        };
      })
      .sort((a, b) => (a.unit_amount || 0) - (b.unit_amount || 0));
    res.json({ prices });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch prices", detail: error.message });
  }
});

router.get("/billing/publishable-key", requireCompanyAdminBasic, async (_req, res) => {
  try {
    const key = await getStripePublishableKey();
    res.json({ publishableKey: key });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to get publishable key" });
  }
});

router.post("/billing/checkout", requireCompanyAdminBasic, async (req, res) => {
  try {
    const entityId = req.companyUser!.entityId;
    const facility = await storage.getFacilityByLinkedEntityId(entityId);
    if (!facility) {
      return res.status(404).json({ error: "Facility not found" });
    }

    const { priceId } = req.body;
    if (!priceId) {
      return res.status(400).json({ error: "priceId is required" });
    }

    const stripe = await getUncachableStripeClient();

    let customerId = facility.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: facility.contactEmail || undefined,
        name: facility.name,
        metadata: { facilityId: String(facility.id), facilitySlug: facility.facilityId },
      });
      customerId = customer.id;
      await storage.updateFacility(facility.id, { stripeCustomerId: customerId });
    }

    const host = req.get("host");
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const baseUrl = `${protocol}://${host}`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${baseUrl}/billing?success=1`,
      cancel_url: `${baseUrl}/billing?cancelled=1`,
      metadata: { facilityId: String(facility.id) },
    });

    res.json({ url: session.url });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to create checkout session", detail: error.message });
  }
});

router.post("/billing/portal", requireCompanyAdminBasic, async (req, res) => {
  try {
    const entityId = req.companyUser!.entityId;
    const facility = await storage.getFacilityByLinkedEntityId(entityId);
    if (!facility || !facility.stripeCustomerId) {
      return res.status(400).json({ error: "No billing account found. Please subscribe first." });
    }

    const stripe = await getUncachableStripeClient();
    const host = req.get("host");
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const returnUrl = `${protocol}://${host}/billing`;

    const session = await stripe.billingPortal.sessions.create({
      customer: facility.stripeCustomerId,
      return_url: returnUrl,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to create portal session", detail: error.message });
  }
});

export default router;
