// server/prod-server.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers';
import { createContext } from './_core/context';
import { getDb, locations } from './db';

/* -------------------- Helpers -------------------- */

// نظّف DATABASE_URL من ssl=true/sslmode=* لأن mysql2 v3 يرفض boolean
function sanitizeDatabaseUrlInEnv() {
  const urlStr = process.env.DATABASE_URL;
  if (!urlStr) return;
  try {
    const u = new URL(urlStr);
    u.searchParams.delete('ssl');
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl-mode');
    const clean = u.toString();
    if (clean !== urlStr) {
      console.log('[BOOT] sanitized DATABASE_URL query params (ssl*)');
      process.env.DATABASE_URL = clean;
    }
  } catch {
    /* ignore */
  }
}

// يدعم ORIGIN كقائمة مفصولة بفواصل
function parseOrigins(input?: string) {
  if (!input) return true; // في الإنتاج يفضل ضبط ORIGIN
  const list = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : true;
}

// لوجر خفيف بديل عن morgan
function tinyLogger(req: express.Request, _res: express.Response, next: express.NextFunction) {
  console.log(`${req.method} ${req.path}`);
  next();
}

/* -------------------- App -------------------- */

const app = express();

app.set('trust proxy', 1);
app.use(tinyLogger);
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser(process.env.SESSION_SECRET || 'insecure'));

const allowedOrigins = parseOrigins(process.env.ORIGIN);
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

console.log('[BOOT]', {
  NODE_ENV: process.env.NODE_ENV,
  ORIGIN: process.env.ORIGIN,
  DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'missing',
  SESSION_SECRET: process.env.SESSION_SECRET ? 'set' : 'missing',
  VITE_MAPTILER_KEY: process.env.VITE_MAPTILER_KEY ? 'set' : 'missing',
  NODE_VERSION: process.version,
});

sanitizeDatabaseUrlInEnv();

/* -------------------- tRPC -------------------- */

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

/* -------------------- REST Fallback -------------------- */

app.post('/api/locations', async (req, res) => {
  try {
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

    sanitizeDatabaseUrlInEnv();
    const db = await getDb();

    await db.insert(locations).values({
      name: String(name),
      description: description ?? null,
      // عدّل الأسماء هنا إذا أعمدة الجدول لديك lat/lng رقمية
      latitude: String(latNum),
      longitude: String(lngNum),
      locationType: (locationType as 'security' | 'traffic' | 'mixed') ?? 'mixed',
      radius: radius == null ? null : Number(radius),
      isActive: isActive == null ? 1 : Number(isActive) ? 1 : 0,
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error('POST /api/locations error:', err?.message || err, err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/* -------------------- Health -------------------- */

app.get('/healthz', async (_req, res) => {
  try {
    sanitizeDatabaseUrlInEnv();
    let dbOk = false;
    try {
      const _db = await getDb();
      dbOk = true;
    } catch {
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

/* -------------------- Static + SPA fallback -------------------- */

// بعد البناء هذا الملف يكون داخل dist/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLIENT_DIST = process.env.CLIENT_DIR
  ? path.resolve(process.env.CLIENT_DIR)
  : path.resolve(__dirname); // لو تبني Vite إلى dist/client غيّره إلى path.resolve(__dirname, 'client')

app.use(express.static(CLIENT_DIST, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

app.get('*', (req, res) => {
  if (req.path.startsWith('/trpc') || req.path.startsWith('/api')) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

/* -------------------- Listen -------------------- */

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`Server listening on :${port}`);
});
