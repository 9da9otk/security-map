import type { Pool } from "mysql2/promise";

/**
 * إنشاء/ترقية الجدول بأوامر آمنة (لا تفشل لو العمود موجود).
 * تعتمد MySQL 8: ADD COLUMN IF NOT EXISTS.
 */
export async function ensureSchema(pool: Pool) {
  const conn = await pool.getConnection();
  try {
    // أنشئ الجدول إن لم يكن موجودًا
    await conn.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        description TEXT NULL,
        latitude VARCHAR(32) NOT NULL,
        longitude VARCHAR(32) NOT NULL,
        location_type ENUM('security','traffic','mixed') NOT NULL DEFAULT 'mixed',
        radius INT NULL,
        notes TEXT NULL,
        is_active TINYINT NOT NULL DEFAULT 1,
        createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // تأكد من الأعمدة الضرورية لو كانت الجداول قديمة
    await conn.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS notes TEXT NULL;`);
    await conn.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS radius INT NULL;`);
    await conn.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS location_type ENUM('security','traffic','mixed') NOT NULL DEFAULT 'mixed';`);
    await conn.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_active TINYINT NOT NULL DEFAULT 1;`);
    await conn.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;`);
    await conn.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;`);

    // جداول أخرى (إن لزم)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS personnel (
        id INT AUTO_INCREMENT PRIMARY KEY,
        location_id INT NOT NULL,
        name VARCHAR(191) NOT NULL,
        role VARCHAR(191) NOT NULL,
        phone VARCHAR(64) NULL,
        email VARCHAR(191) NULL,
        personnel_type ENUM('security','traffic') NOT NULL DEFAULT 'security',
        notes TEXT NULL,
        createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (location_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } finally {
    conn.release();
  }
}
