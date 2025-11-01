// server/prod-server.ts
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { getDb, locations } from "./db";
import { eq } from "drizzle-orm";

const distDir = path.resolve(process.cwd(), "dist");
const app = express();

// لوج مبسّط لكل طلب
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(
  cors({
    origin: true, // يسمح بنفس الـ origin أو أي origin (Render يستخدم domains مختلفة)
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

// صحة
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// ---- REST Fallback للتجربة السريعة ----
app.get("/api/locations", async (_req, res) => {
  try {
    const db = await getDb();
    const data = await db.select().from(locations);
    res.json({ ok: true, data });
  } catch (e: any) {
    console.error("GET /api/locations error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/locations", async (req, res) => {
  try {
    const { name, description, latitude, longitude, locationType, radius } = req.body || {};
    if (!name || !latitude || !longitude || !locationType) {
      return res.status(400).json({ ok: false, error: "missing required fields" });
    }
    const db = await getDb();
    // Drizzle $returningId قد لا يعمل مع بعض إعدادات mysql2، لذا نستخدم insert ثم نأتي بالـ id عبر last insert id
    const result: any = await db
      .insert(locations)
      .values({
        name,
        description: description ?? null,
        latitude,
        longitude,
        locationType,
        radius: radius ?? null,
        isActive: 1,
      });

    // fallback: استرجع آخر صف بنفس الاسم والإحداثيات (في حال عدم دعم returning)
    const insertedId = result?.[0]?.insertId;
    if (insertedId) {
      return res.json({ ok: true, id: insertedId });
    }

    // في حال لم يُرجع insertId (اعتماداً على نسخة drizzle/mysql2)
    const after = await db
      .select({ id: locations.id })
      .from(locations)
      .where(
        eq(locations.name, name)
      );
    return res.json({ ok: true, id: after?.[0]?.id ?? null });
  } catch (e: any) {
    console.error("POST /api/locations error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
// ---- END REST ----

// tRPC
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path, type }) {
      console.error(`[tRPC] ${type} ${path} ->`, error);
    },
  })
);

// ملفات الواجهة
app.use(express.static(distDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const port = process.env.PORT ? Number(process.env.PORT) : 10000;
app.listen(port, () => console.log(`Server running on :${port}`));
