// server/db.ts
import mysql from "mysql2/promise";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import { locations, personnel as personnelTable, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { ensureSchema } from "./_core/ensureSchema";

let _db: MySql2Database | null = null;

export async function getDb() {
  if (_db) return _db;

  // استخدم DATABASE_URL إن وُجد، وإلا حقول منفصلة
  let pool: mysql.Pool;
  if (ENV.DATABASE_URL) {
    pool = mysql.createPool(ENV.DATABASE_URL);
  } else {
    pool = mysql.createPool({
      host: ENV.DB_HOST,
      port: ENV.DB_PORT,
      database: ENV.DB_NAME,
      user: ENV.DB_USER,
      password: ENV.DB_PASS,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
    });
  }

  // أنشئ الجداول إذا ما وُجدت
  await ensureSchema(pool);

  // مرّر الـ pool إلى Drizzle
  _db = drizzle(pool);
  return _db;
}

export { locations, personnelTable, users };
