// server/_core/env.ts
import "dotenv/config";

function number(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const ENV = {
  // اتصال MySQL
  DB_HOST: process.env.DB_HOST ?? "",
  DB_PORT: number(process.env.DB_PORT, 3306),
  DB_NAME: process.env.DB_NAME ?? "",
  DB_USER: process.env.DB_USER ?? "",
  DB_PASS: process.env.DB_PASS ?? "",

  // بدائل إن كنت تستخدم DATABASE_URL
  DATABASE_URL: process.env.DATABASE_URL ?? "",

  // مفاتيح أخرى قد تحتاجها
  VITE_MAPTILER_KEY: process.env.VITE_MAPTILER_KEY ?? "",
};
