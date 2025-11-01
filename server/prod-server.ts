import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";           // نفس الملف الذي أرسلته سابقًا
import { createContext } from "./_core/context"; // سياق tRPC (بالأسفل)
import { getDb, locations } from "./db";

// -------------------------------------------------

const app = express();
app.set("trust proxy", 1);

app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

// اسمّح للواجهة نفسها على Render
app.use(
  cors({
    origin: true, // يقرأ Origin ويردّ به
    credentials: true,
  })
);

// صحّة
app.get("/healthz", (_req, res) => res.send("ok"));

// tRPC على /trpc
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

/**
 * REST Fallback لحفظ المواقع
 * POST /api/locations
 * body: { name, description?, latitude, longitude, locationType, radius? }
 */
app.post("/api/locations", async (req, res) => {
  try {
    const { name, description, latitude, longitude, locationType, radius } = req.body || {};

    if (!name || !latitude || !longitude || !locationType) {
      return res.status(400).json({ ok: false, error: "missing_fields" });
    }

    // تأكد أن الإحداثيات أرقام صحيحة
    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    if (!isFinite(latNum) || !isFinite(lngNum)) {
      return res.status(400).json({ ok: false, error: "invalid_coordinates" });
    }

    const db = await getDb();
    // drizzle مع mysql: استخدم insert + returning id متوافق
    const result = await db
      .insert(locations)
      .values({
        name: String(name),
        description: description ?? null,
        latitude: String(latNum),
        longitude: String(lngNum),
        locationType: locationType as "security" | "traffic" | "mixed",
        radius: radius == null ? null : Number(radius),
        isActive: 1,
      });

    // بعضドرازل لا تعيد id مباشرة، فنردّ ok بدون id
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/locations error:", err?.stack || err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// (اختياري) قائمة المواقع عبر REST لتجربة سريعة
app.get("/api/locations", async (_req, res) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(locations);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// تشغيل
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`Server listening on :${port}`);
});
