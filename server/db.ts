// server/db.ts
import 'dotenv/config';
import mysql, { Pool } from 'mysql2/promise';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';

// جداولك من السكيمة
import { locations, personnel as personnelTable, users } from '../drizzle/schema';
import * as schema from '../drizzle/schema';

import { ENV } from './_core/env';
import { ensureSchema } from './_core/ensureSchema';

let _db: MySql2Database<typeof schema> | null = null;
let _pool: Pool | null = null;

/** يحذف أي ssl=true/sslmode=* من DATABASE_URL لأنها تتحول إلى boolean داخل mysql2 */
function cleanDatabaseUrl(urlStr: string) {
  try {
    const u = new URL(urlStr);
    u.searchParams.delete('ssl');
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl-mode');
    return u.toString();
  } catch {
    return urlStr;
  }
}

/** إن أردت تعطيل SSL تمامًا ضع APP_DB_SSL=off في المتغيرات */
function buildSslOption() {
  if (process.env.APP_DB_SSL === 'off') return undefined;
  // إن كنت تحتاج CA مخصصًا، استبدل بالسطرين أدناه:
  // import fs from 'node:fs';
  // return { ca: fs.readFileSync('/path/to/ca.pem', 'utf8') };
  return { rejectUnauthorized: true, minVersion: 'TLSv1.2' } as const;
}

async function createPool(): Promise<Pool> {
  const ssl = buildSslOption();

  if (ENV.DATABASE_URL) {
    const uri = cleanDatabaseUrl(ENV.DATABASE_URL);
    return mysql.createPool({
      uri,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      ssl, // <-- كائن وليس boolean
      dateStrings: true,
      charset: 'utf8mb4',
      multipleStatements: false,
    });
  }

  return mysql.createPool({
    host: ENV.DB_HOST,
    port: ENV.DB_PORT,
    database: ENV.DB_NAME,
    user: ENV.DB_USER,
    password: ENV.DB_PASS,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    ssl, // <-- كائن وليس boolean
    dateStrings: true,
    charset: 'utf8mb4',
    multipleStatements: false,
  });
}

export async function getDb() {
  if (_db) return _db;

  _pool = await createPool();

  // اختبار اتصال سريع + لوج
  try {
    const conn = await _pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('[DB] ping ok');
  } catch (e: any) {
    console.error('[DB] ping failed:', e?.message || e);
    throw e;
  }

  // إنشاء/تعديل الجداول إن لم تكن موجودة
  await ensureSchema(_pool);

  // المهم: حدّد وضع Drizzle عند تمرير schema
  _db = drizzle(_pool, { schema, mode: 'default' });

  console.log(
    '[DB] pool ready (ssl:',
    process.env.APP_DB_SSL === 'off' ? 'disabled' : 'enabled',
    ')'
  );

  return _db;
}

// إعادة تصدير الجداول المستخدمة في بقية المشروع
export { locations, personnelTable, users };

// إتاحة الوصول للـ pool عند الحاجة (اختياري)
export function getPool(): Pool | null {
  return _pool;
}

// إغلاق أنيق للـ pool عند الإنهاء
async function closePool() {
  try { await _pool?.end(); } catch {}
}

process.on('SIGTERM', closePool);
process.on('SIGINT', closePool);
