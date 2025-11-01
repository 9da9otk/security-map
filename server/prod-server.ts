// server/prod-server.ts  (أو الملف الذي تستخدمه كبوابة إنتاج)
// ملاحظات:
// - قم ببناء الفرونت إلى نفس مجلد dist الذي يحوي هذا الملف بعد التحويل إلى JS.
// - يتوقع وجود getDb/locations في ./db، لكنه ينظّف DATABASE_URL قبل النداء.
// - إن كان عندك مسار اسمُه مختلف، حدّث الاستيرادات أدناه.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import morgan from 'morgan';

import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers';
import { createContext } from './_core/context';

// ملاحظة: getDb يجب أن يقرأ process.env.DATABASE_URL عند النداء (وليس وقت الاستيراد)
import { getDb, locations } from './db';

/* -------------------- أدوات مساعدة -------------------- */

// نظّف DATABASE_URL من أي ssl=true/sslmode كي لا يمرّ إلى mysql2 كـ boolean
function sanitizeDatabaseUrlInEnv() {
  const urlStr = process.env.DATABASE_URL;
  if (!urlStr) return;
  try {
    const u = new URL(urlStr);
    // احذف مفاتيح SSL الشائعة من الكويري
    u.searchParams.delete('ssl');
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl-mode');
    const clean = u.toString();
    if (clean !== urlStr) {
      console.log('[BOOT] sanitized DATABASE_URL query params (ssl*)');
      process.env.DATABASE_URL = clean;
    }
  } catch {
    // تجاهل إن لم تكن DATABASE_URL بصيغة URL
  }
}

// يدعم ORIGIN كقائمة مفصولة بفواصل
function parseOrigins(input?: string) {
  if (!input) return true; // لتسهيل التطوير؛ يفضّل ضبط ORIGIN في الإنتاج
  const list = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : true;
}

/* -------------------- إعداد السيرفر -------------------- */

const app = express();

// ثقة بالبروكسي (Render)
app.set('trust proxy', 1);

// لوجات خفيفة
app.use(morgan('tiny'));

// JSON/كوكيز
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser(process.env.SESSION_SECRET || 'insecure'));

// CORS مضبوط على ORIGIN (يمكن تمرير أكثر من أوريجن مفصول بفواصل)
const allowedOrigins = parseOrigins(process.env.ORIGIN);
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// اطبع حالة البيئة (بدون إفشاء الأسرار)
console.log('[BOOT]', {
  NODE_ENV: process.env.NODE_ENV,
  ORIGIN: process.env.ORIGIN,
  DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'missing',
  SESSION_SECRET: process.env.SESSION_SECRET ? 'set' : 'missing',
  VITE_MAPTILER_KEY: process.env.VITE_MAPTILER_KEY ? 'set' : 'missing',
  NODE_VERSION: process.version,
});

// نظّف الـ DATABASE_URL قبل أول استخدام للـ DB
sanitizeDatabaseUrlInEnv();

/* -------------------- tRPC على /trpc -------------------- */

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path, type }) {
      console.error('[tRPC]', { path, type, msg: error.message });
    },
  })
);

/* -------------------- REST Fallback للاختبار -------------------- */

app.post('/api/locations', async (req, res) => {
  try {
    // يقبل الحقلين: lat/lng أو latitude/longitude
    const {
      name,
      description,
      locationType,
      radius,
      lat,
      lng,
      latitude,
      longitude,
      isActive,
    } = req.body || {};

    const latRaw = lat ?? latitude;
    const lngRaw = lng ?? longitude;

    if (!name || latRaw == null || lngRaw == null || !locationType) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    const latNum = Number(latRaw);
    const lngNum = Number(lngRaw);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ ok: false, error: 'invalid_coordinates' });
    }

    // تأكد دائمًا من تنظيف DATABASE_URL قبل أي اتصال
    sanitizeDatabaseUrlInEnv();
    const db = await getDb();

    await db.insert(locations).values({
      name: String(name),
      description: description ?? null,
      // إن كانت أعمدة السكيمة لديك اسمها lat/lng (DECIMAL/DOUBLE) بدّلها هنا
      // الكود الحالي يستخدم أعمدة باسم latitude/longitude نصيّة كما كان عندك
      latitude: String(latNum),
      longitude: String(lngNum),
      locationType: (locationType as 'security' | 'traffic' | 'mixed') ?? 'mixed',
      radius: radius == null ? null : Number(radius),
      isActive: isActive == null ? 1 : Number(isActive) ? 1 : 0,
      // createdAt/updatedAt تُدار بواسطة timestamp().defaultNow().onUpdateNow()
    });

    return res.json({ ok: true });
  } catch (err: any) {
    // التتبع المهم لخطأ mysql2: "SSL profile must be an object..."
    console.error('POST /api/locations error:', err?.message || err, err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/* -------------------- Healthz -------------------- */

app.get('/healthz', async (_req, res) => {
  try {
    sanitizeDatabaseUrlInEnv();
    let dbOk = false;
    try {
      const db = await getDb();
      // استعلام خفيف حسب محرك الـ DB لديك؛ إن أردت ping أدق استخدم pool.getConnection().ping()
      dbOk = true;
    } catch (e) {
      dbOk = false;
    }
    res.json({
      ok: true,
      env: process.env.NODE_ENV,
      origin: process.env.ORIGIN,
      db: dbOk,
    });
  } catch {
    res.status(500).json({ ok: false });
  }
});

/* -------------------- تقديم الواجهة + SPA fallback -------------------- */

// بعد التحويل إلى JS، يكون هذا الملف داخل dist/.
// لو كنت تبني Vite إلى dist/client فعدّل CLIENT_DIST وفقًا لذلك.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// افتراضيًا: قد تكون ملفات الفرونت بجانب هذا الملف داخل dist/
// إن كنت تبني إلى dist/client استخدم المسار التالي:
const CLIENT_DIST = process.env.CLIENT_DIR
  ? path.resolve(process.env.CLIENT_DIR)
  : path.resolve(__dirname); // dist/ نفسه

app.use(express.static(CLIENT_DIST, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

// مسارات API/TRPC تسبق الفولباك
app.get('*', (req, res) => {
  if (req.path.startsWith('/trpc') || req.path.startsWith('/api')) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

/* -------------------- التشغيل -------------------- */

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`Server listening on :${port}`);
});
