import { Router } from "express";
import crypto from "crypto";
import { getDb } from "../db";
import { assignmentSnapshots } from "../../schema";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "db_unavailable" });
    const { assignments, locations } = req.body || {};
    if (!assignments || typeof assignments !== "object") {
      return res.status(400).json({ error: "assignments_required" });
    }
    const token = crypto.randomBytes(16).toString("hex");
    await db.insert(assignmentSnapshots).values({
      token,
      data: assignments,
      locations: locations ?? null,
    });
    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const url = `${base}/view/s/${token}`;
    return res.json({ token, url });
  } catch (e) {
    console.error("snapshot_create_failed", e);
    return res.status(500).json({ error: "snapshot_failed" });
  }
});

router.get("/:token", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "db_unavailable" });
    const { token } = req.params;
    const rows = await db.select().from(assignmentSnapshots).where(eq(assignmentSnapshots.token, token)).limit(1);
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    const s = rows[0];
    return res.json({ assignments: s.data, locations: s.locations, createdAt: s.createdAt });
  } catch (e) {
    console.error("snapshot_read_failed", e);
    return res.status(500).json({ error: "read_failed" });
  }
});

export default router;
