import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { getDb, locations } from "./db";

// ===== إعدادات أساسية =====
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

// ===== tRPC على /trpc =====
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// ===== REST بسيط للاختبار (اختياري) =====
app.post("/api/locations", async (req, res) => {
  try {
    const { name, description, latitude, longitude, locationType, radius } = req.body || {};
    if (!name || !latitude || !longitude || !locationType) {
      return res.status(400).json({ ok: false, error: "missing_fields" });
    }
    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    if (!isFinite(latNum) || !isFinite(lngNum)) {
      return res.status(400).json({ ok: false, error: "invalid_coordinates" });
    }
    const db = await getDb();
    await db.insert(locations).values({
      name: String(name),
      description: description ?? null,
      latitude: String(latNum),
      longitude: String(lngNum),
      locationType: locationType as "security" | "traffic" | "mixed",
      radius: radius == null ? null : Number(radius),
      isActive: 1,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/locations error:", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.get("/healthz", (_req, res) => res.send("ok"));

// ===== تقديم الواجهة (Vite dist) + SPA fallback =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// بعد البناء، يتم وضع client والملف server.mjs داخل مجلد dist نفسه
const CLIENT_DIST = path.resolve(__dirname); // هذا هو /dist وقت التشغيل

// قدّم الملفات الثابتة (css/js/صور)
app.use(express.static(CLIENT_DIST));

// أي مسار ليس /trpc أو /api أعطه index.html (SPA)
app.get("*", (req, res) => {
  if (req.path.startsWith("/trpc") || req.path.startsWith("/api")) {
    return res.status(404).send("Not found");
  }
  res.sendFile(path.join(CLIENT_DIST, "index.html"));
});

// ===== التشغيل =====
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`Server listening on :${port}`);
});
