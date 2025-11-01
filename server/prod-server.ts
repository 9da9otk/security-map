import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { getDb } from "./db";
import { locations } from "../drizzle/schema";
import { desc, eq } from "drizzle-orm";

/* ------------ Helpers ------------ */
function sanitizeDatabaseUrlInEnv() {
  const urlStr = process.env.DATABASE_URL;
  if (!urlStr) return;
  try {
    const u = new URL(urlStr);
    u.searchParams.delete("ssl");
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl-mode");
    const clean = u.toString();
    if (clean !== urlStr) {
      console.log("[BOOT] sanitized DATABASE_URL query params (ssl*)");
      process.env.DATABASE_URL = clean;
    }
  } catch {}
}

function parseOrigins(input?: string) {
  if (!input) return true;
  const list = input.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : true;
}

function tinyLogger(req: express.Request, _res: express.Response, next: express.NextFunction) {
  console.log(`${req.method} ${req.path}`);
  next();
}

/* ------------ App ------------ */
const app = express();
app.set("trust proxy", 1);
app.use(tinyLogger);
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser(process.env.SESSION_SECRET || "insecure"));

const allowedOrigins = parseOrigins(process.env.ORIGIN);
app.use(cors({ origin: allowedOrigins, credentials: true }));

console.log("[BOOT]", {
  NODE_ENV: process.env.NODE_ENV,
  ORIGIN: process.env.ORIGIN,
  DATABASE_URL: process.env.DATABASE_URL ? "set" : "missing",
  SESSION_SECRET: process.env.SESSION_SECRET ? "set" : "missing",
  VITE_MAPTILER_KEY: process.env.VITE_MAPTILER_KEY ? "set" : "missing",
  NODE_VERSION: process.version,
});

sanitizeDatabaseUrlInEnv();

/* ------------ tRPC ------------ */
app.use("/trpc", createExpressMiddleware({
  router: appRouter,
  createContext,
  onError({ error, path, type }) {
    console.error("[tRPC]", { path, type, msg: error.message });
  },
}));

/* ------------ REST Fallback ------------ */
// قائمة المواقع
app.get("/api/locations", async (_req, res) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(locations).orderBy(desc(locations.id));
    res.json(rows);
  } catch (e: any) {
    console.error("GET /api/locations error:", e?.message || e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// إنشاء موقع
app.post("/api/locations", async (req, res) => {
  try {
    const { name, description, locationType, radius, latitude, longitude, notes } = req.body || {};
    if (!name || latitude == null || longitude == null || !locationType) {
      return res.status(400).json({ ok: false, error: "missing_fields" });
    }
    const db = await getDb();
    const r = await db.insert(locations).values({
      name: String(name),
      description: description ?? null,
      latitude: String(latitude),
      longitude: String(longitude),
      locationType,
      radius: radius == null ? null : Number(radius),
      notes: notes ?? null, // 👈 مهم
      isActive: 1,
    });
    const id = (r as any)?.insertId ?? undefined;
    return res.json({ ok: true, id });
  } catch (e: any) {
    console.error("POST /api/locations error:", e?.message || e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// تحديث موقع
app.put("/api/locations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "bad_id" });

    const { name, description, locationType, radius, notes } = req.body || {};
    const db = await getDb();
    await db.update(locations).set({
      name: name ?? undefined,
      description: description ?? null,
      locationType: locationType ?? undefined,
      radius: radius == null ? null : Number(radius),
      notes: notes ?? null, // 👈 مهم
    }).where(eq(locations.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/locations/:id error:", e?.message || e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// حذف موقع
app.delete("/api/locations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "bad_id" });
    const db = await getDb();
    await db.delete(locations).where(eq(locations.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/locations/:id error:", e?.message || e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

/* ------------ Health ------------ */
app.get("/healthz", async (_req, res) => {
  try {
    let dbOk = false;
    try { await getDb(); dbOk = true; } catch { dbOk = false; }
    res.json({ ok: true, db: dbOk, env: process.env.NODE_ENV, origin: process.env.ORIGIN });
  } catch {
    res.status(500).json({ ok: false });
  }
});

/* ------------ Static + SPA ------------ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIST = path.resolve(__dirname); // بعد build

app.use(express.static(CLIENT_DIST, { maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));

app.get("*", (req, res) => {
  if (req.path.startsWith("/trpc") || req.path.startsWith("/api")) {
    return res.status(404).send("Not found");
  }
  res.sendFile(path.join(CLIENT_DIST, "index.html"));
});

/* ------------ Listen ------------ */
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => console.log(`Server listening on :${port}`));
