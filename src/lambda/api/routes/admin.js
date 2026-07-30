import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { listUsers, getUser, updateUserPermissions, getEffectivePermissions } from "../lib/users.js";

const router = Router();

// Every route here requires the admin role (in addition to the requireAuth
// middleware applied where this router is mounted).
router.use(requireAdmin);

const MAX_FILE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024 * 1024; // 5 TB safety ceiling

// List all known users with their effective permissions.
router.get("/users", async (_req, res) => {
  try {
    const users = await listUsers();
    res.json({ users });
  } catch (error) {
    console.error("Admin list users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fetch a single user.
router.get("/users/:userId", async (req, res) => {
  try {
    const record = await getUser(req.params.userId);
    if (!record) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      user: {
        userId: record.userId,
        name: record.name || null,
        email: record.email || null,
        createdAt: record.createdAt || null,
        lastLoginAt: record.lastLoginAt || null,
        ...getEffectivePermissions(record),
      },
    });
  } catch (error) {
    console.error("Admin get user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a user's permissions.
router.put("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { canUploadCdn, canUploadFile, maxFileSizeBytes } = req.body || {};

    if (typeof canUploadCdn !== "boolean" || typeof canUploadFile !== "boolean") {
      return res.status(400).json({ error: "canUploadCdn and canUploadFile must be booleans" });
    }

    const size = Number(maxFileSizeBytes);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE_LIMIT_BYTES) {
      return res.status(400).json({ error: "maxFileSizeBytes must be a positive number within the allowed range" });
    }

    const updated = await updateUserPermissions(userId, {
      canUploadCdn,
      canUploadFile,
      maxFileSizeBytes: Math.floor(size),
    });

    res.json({
      user: {
        userId: updated.userId,
        name: updated.name || null,
        email: updated.email || null,
        createdAt: updated.createdAt || null,
        lastLoginAt: updated.lastLoginAt || null,
        ...getEffectivePermissions(updated),
      },
    });
  } catch (error) {
    console.error("Admin update user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
