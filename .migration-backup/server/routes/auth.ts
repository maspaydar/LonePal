import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import {
  signSuperAdminToken,
  signPending2FAToken,
} from "../middleware/super-admin-auth";
import { signCompanyToken } from "../middleware/company-auth";

const router = Router();

const unifiedLoginSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

type UnifiedLoginResponse =
  | {
      accountType: "super";
      requires2FA: true;
      pendingToken: string;
      redirect: "/super-admin/dashboard";
    }
  | {
      accountType: "super";
      requires2FA: false;
      token: string;
      admin: { id: number; email: string; fullName: string | null; totpEnabled: boolean };
      redirect: "/super-admin/dashboard";
    }
  | {
      accountType: "company";
      token: string;
      user: { id: number; username: string; fullName: string | null; role: string; entityId: number };
      entity: { id: number; name: string; type: string } | null;
      redirect: "/dashboard";
    };

// Outcome of attempting a single account type. `subscription` represents a
// definitive (non-retriable) rejection that should be surfaced to the user
// rather than falling through to the other account type.
type AttemptResult =
  | { status: "ok"; response: UnifiedLoginResponse }
  | { status: "not-found" }
  | { status: "bad-password" }
  | { status: "rejected"; httpStatus: number; body: Record<string, unknown> };

async function attemptSuperAdmin(identifier: string, password: string): Promise<AttemptResult> {
  // Super admins authenticate with an email address.
  if (!z.string().email().safeParse(identifier).success) {
    return { status: "not-found" };
  }

  const admin = await storage.getSuperAdminByEmail(identifier);
  if (!admin || !admin.isActive) {
    return { status: "not-found" };
  }

  const passwordValid = await bcrypt.compare(password, admin.password);
  if (!passwordValid) {
    return { status: "bad-password" };
  }

  if (admin.totpEnabled) {
    const pendingToken = signPending2FAToken(admin.id, admin.email);
    return {
      status: "ok",
      response: {
        accountType: "super",
        requires2FA: true,
        pendingToken,
        redirect: "/super-admin/dashboard",
      },
    };
  }

  const token = signSuperAdminToken({
    superAdminId: admin.id,
    email: admin.email,
    twoFactorVerified: true,
  });

  await storage.updateSuperAdmin(admin.id, { lastLoginAt: new Date() });

  return {
    status: "ok",
    response: {
      accountType: "super",
      requires2FA: false,
      token,
      admin: { id: admin.id, email: admin.email, fullName: admin.fullName, totpEnabled: admin.totpEnabled },
      redirect: "/super-admin/dashboard",
    },
  };
}

async function attemptCompany(identifier: string, password: string): Promise<AttemptResult> {
  const user = await storage.getUserByUsername(identifier);

  if (!user || !user.entityId) {
    return { status: "not-found" };
  }

  if (!user.role || !["admin", "manager", "staff"].includes(user.role)) {
    return {
      status: "rejected",
      httpStatus: 403,
      body: { error: "This portal is for facility staff only. Residents must use the mobile app." },
    };
  }

  if (user.isActive === false) {
    return {
      status: "rejected",
      httpStatus: 401,
      body: { error: "Account has been deactivated" },
    };
  }

  const facility = await storage.getFacilityByLinkedEntityId(user.entityId);
  if (facility) {
    if (facility.subscriptionStatus === "paused") {
      return {
        status: "rejected",
        httpStatus: 403,
        body: {
          error: "subscription_paused",
          message: "Your facility's subscription has expired. Please contact support to renew.",
        },
      };
    }
    if (facility.subscriptionStatus === "cancelled") {
      return {
        status: "rejected",
        httpStatus: 403,
        body: {
          error: "subscription_cancelled",
          message: "Your facility's subscription has been cancelled. Please contact support.",
        },
      };
    }
  }

  const passwordValid = await bcrypt.compare(password, user.password);
  if (!passwordValid) {
    return { status: "bad-password" };
  }

  const token = signCompanyToken({
    userId: user.id,
    entityId: user.entityId,
    role: user.role,
  });

  const entity = await storage.getEntity(user.entityId);

  return {
    status: "ok",
    response: {
      accountType: "company",
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        entityId: user.entityId,
      },
      entity: entity ? { id: entity.id, name: entity.name, type: entity.type } : null,
      redirect: "/dashboard",
    },
  };
}

// Unified login: the browser submits a single credential to one endpoint. The
// server determines the account type (super admin vs. facility/company user),
// authenticates, and returns where to route. This avoids sending one password
// submission to two different login endpoints from the client.
router.post("/login", async (req, res) => {
  try {
    const parsed = unifiedLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { identifier, password } = parsed.data;

    // Probe the most likely backend first based on the identifier shape:
    // emails → super admin, plain usernames → facility (company) users.
    const looksLikeEmail = identifier.includes("@");
    const attempts = looksLikeEmail
      ? [attemptSuperAdmin, attemptCompany]
      : [attemptCompany, attemptSuperAdmin];

    for (const attempt of attempts) {
      const result = await attempt(identifier, password);
      if (result.status === "ok") {
        return res.json(result.response);
      }
      // A definitive rejection (deactivated, wrong portal, subscription lapsed)
      // should be returned immediately rather than retried elsewhere.
      if (result.status === "rejected") {
        return res.status(result.httpStatus).json(result.body);
      }
    }

    return res.status(401).json({ error: "Invalid credentials" });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
