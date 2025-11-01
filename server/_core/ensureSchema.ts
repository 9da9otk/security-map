// server/_core/ensureSchema.ts
import type { Pool } from "mysql2/promise";

export async function ensureSchema(pool: Pool) {
  const conn = await pool.getConnection();
  try {
    // إنشاء جدول locations إن لم يوجد
    await conn.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        latitude VARCHAR(64) NOT NULL,
        longitude VARCHAR(64) NOT NULL,
        locationType ENUM('security','traffic','mixed') NOT NULL DEFAULT 'mixed',
        radius INT NULL,
        notes TEXT NULL,
        isActive TINYINT NOT NULL DEFAULT 1,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // تعديلات آمنة (idempotent) لإضافة الأعمدة إن لم تكن موجودة
    await conn.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS radius INT NULL;`);
    await conn.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS notes TEXT NULL;`);
    await conn.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS isActive TINYINT NOT NULL DEFAULT 1;`);
    await conn.query(`ALTER TABLE locations MODIFY COLUMN latitude VARCHAR(64) NOT NULL;`);
    await conn.query(`ALTER TABLE locations MODIFY COLUMN longitude VARCHAR(64) NOT NULL;`);
    await conn.query(`
      ALTER TABLE locations 
      MODIFY COLUMN updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
    `);

    // جدول personnel إن لم يوجد
    await conn.query(`
      CREATE TABLE IF NOT EXISTS personnel (
        id INT NOT NULL AUTO_INCREMENT,
        locationId INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(255) NULL,
        phone VARCHAR(64) NULL,
        email VARCHAR(255) NULL,
        personnelType ENUM('security','traffic') NOT NULL DEFAULT 'security',
        notes TEXT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_personnel_loc (locationId),
        CONSTRAINT fk_personnel_loc FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

  } finally {
    conn.release();
  }
}
