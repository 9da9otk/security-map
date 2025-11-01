// server/db.ts
import 'dotenv/config';
import mysql, { Pool } from 'mysql2/promise';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';

// حدّث المسار حسب مشروعك (هذا هو الصحيح لديك)
import { locations, personnel as personnelTable, users } from '../drizzle/schema';
import * as schema from '../drizzle/schema';

import { ENV } from './_core/env';
import { ensureSchema } from './_core/ensureSchema';

let _db: MySql2Database<typeof schema> | null = null;
let _pool: Pool | null = null;

// نحذف أي ssl=true/sslmode=* من DATABASE_URL لأنها تتحول إلى boolean داخل mysql2
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

// إن أردت تعطيل SSL تمامًا ضع APP_DB_SSL=off في المتغيرات
function buildSslOption() {
  if (process.env.APP_DB_SSL === 'off') return undefined;
  // إن كان مزودك يتطلب CA مخصصًا، استبدل السطر التالي بقراءة ca من ملف:
  // import fs from 'node:fs';
  // return { ca: fs.readFileSync('/path/to/ca.pem', 'utf8') };
  return { rejectUnauthorized: true, minVersion: 'TLSv1.2' } as const;
}

export async function getDb() {
  if (_db) return _db;

  const ssl = buildSslOption();

  if (ENV.DATABASE_URL) {
    const uri = cleanDatabaseUrl(ENV.DATABASE_URL);
    _pool = mysql.createPool({
      uri,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      ssl, // <-- مهم: كائن وليس boolean
    });
  } else {
    _pool = mysql.createPool({
      host: ENV.DB_HOST,
      port: ENV.DB_PORT,
      database: ENV.DB_NAME,
      user: ENV.DB_USER,
      password: ENV.DB_PASS,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      ssl, // <-- مهم: كائن وليس boolean
    });
  }

  // إنشاء الجداول إن لم تكن موجودة
  await ensureSchema(_pool);

  // مرّر الـ schema إلى Drizzle لتحصل على typing كامل
  _db = drizzle(_pool, { schema });
  console.log('[DB] pool ready (ssl:', process.env.APP_DB_SSL === 'off' ? 'disabled' : 'enabled', ')');

  return _db;
}

// إعادة تصدير الجداول المستخدمة في بقية المشروع
export { locations, personnelTable, users };

// إغلاق أنيق للـ pool عند الإنهاء
process.on('SIGTERM', async () => { try { await _pool?.end(); } catch {} });
process.on('SIGINT', async () => { try { await _pool?.end(); } catch {} });
