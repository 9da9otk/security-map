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
import { getDb, locations, personnelTable } from './db';
import { eq } from 'drizzle-orm';

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

// CREATE Location
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
      notes,
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
      latitude: String(latNum),   // أعمدة السكيمة لديك نصية
      longitude: String(lngNum),  // "
      locationType: (locationType as 'security' | 'traffic' | 'mixed') ?? 'mixed',
      radius: radius == null ? null : Number(radius),
      notes: notes == null ? null : String(notes),
      isActive: isActive == null ? 1 : Number(isActive) ? 1 : 0,
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error('POST /api/locations error:', err?.message || err, err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// UPDATE Location (Partial)
app.put('/api/locations/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad_id' });

    const { name, description, locationType, radius, notes, latitude, longitude } = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = String(name);
    if (description !== undefined) patch.description = description ?? null;
    if (locationType !== undefined) patch.locationType = locationType;
    if (radius !== undefined) patch.radius = radius == null ? null : Number(radius);
    if (notes !== undefined) patch.notes = notes == null ? null : String(notes);
    if (latitude !== undefined) patch.latitude = String(latitude);
    if (longitude !== undefined) patch.longitude = String(longitude);

    const db = await getDb();
    await db.update(locations).set(patch).where(eq(locations.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    console.error('PUT /api/locations/:id error:', e?.message || e, e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// DELETE Location
app.delete('/api/locations/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad_id' });

    const db = await getDb();
    await db.delete(locations).where(eq(locations.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE /api/locations/:id error:', e?.message || e, e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// CREATE Personnel
app.post('/api/personnel', async (req, res) => {
  try {
    const { locationId, name, role, phone, email, personnelType, notes } = req.body ?? {};
    const locId = Number(locationId);
    if (!Number.isFinite(locId) || !name) {
      return res.status(400).json({ ok: false, error: 'missing' });
    }
    const db = await getDb();
    await db.insert(personnelTable).values({
      locationId: locId,
      name: String(name),
      role: role ? String(role) : '',
      phone: phone ? String(phone) : null,
      email: email ? String(email) : null,
      personnelType: (personnelType as 'security' | 'traffic') ?? 'security',
      notes: notes ? String(notes) : null,
    });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('POST /api/personnel error:', e?.message || e, e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// DELETE Personnel
app.delete('/api/personnel/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad_id' });
    const db = await getDb();
    await db.delete(personnelTable).where(eq(personnelTable.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE /api/personnel/:id error:', e?.message || e, e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/* -------------------- Health -------------------- */

app.get('/healthz', async (_req, res) => {
  try {
    sanitizeDatabaseUrlInEnv();
    let dbOk = false;
    try {
      await getDb();
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
