import { Router } from "express";
import { storage } from "../../storage";
import bcrypt from "bcryptjs";
import {
  companyLoginSchema,
  createCompanyUserSchema,
} from "@shared/schema";
import {
  signCompanyToken,
  requireCompanyAuth,
  requireCompanyAdmin,
} from "../../middleware/company-auth";

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

export default router;
