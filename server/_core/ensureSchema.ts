// server/_core/ensureSchema.ts
import type { Pool } from "mysql2/promise";

async function columnExists(conn: any, table: string, column: string) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number((rows as any)[0]?.c || 0) > 0;
}

async function tableExists(conn: any, table: string) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [table]
  );
  return Number((rows as any)[0]?.c || 0) > 0;
}

export async function ensureSchema(pool: Pool) {
  const conn = await pool.getConnection();
  try {
    /* ---------------- locations ---------------- */
    if (!(await tableExists(conn, "locations"))) {
      await conn.query(`
        CREATE TABLE locations (
          id INT NOT NULL AUTO_INCREMENT,
          name VARCHAR(255) NOT NULL,
          description TEXT NULL,
          latitude VARCHAR(64) NOT NULL,
          longitude VARCHAR(64) NOT NULL,
          locationType ENUM('security','traffic','mixed') NOT NULL DEFAULT 'mixed',
          radius INT NULL,
          notes TEXT NULL,
          isActive TINYINT NOT NULL DEFAULT 1,
          createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    } else {
      // أضف الأعمدة الناقصة فقط — بدون MODIFY
      if (!(await columnExists(conn, "locations", "radius"))) {
        await conn.query(`ALTER TABLE locations ADD COLUMN radius INT NULL`);
      }
      if (!(await columnExists(conn, "locations", "notes"))) {
        await conn.query(`ALTER TABLE locations ADD COLUMN notes TEXT NULL`);
      }
      if (!(await columnExists(conn, "locations", "isActive"))) {
        await conn.query(`ALTER TABLE locations ADD COLUMN isActive TINYINT NOT NULL DEFAULT 1`);
      }
      if (!(await columnExists(conn, "locations", "createdAt"))) {
        await conn.query(
          `ALTER TABLE locations ADD COLUMN createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP`
        );
      }
      if (!(await columnExists(conn, "locations", "updatedAt"))) {
        await conn.query(
          `ALTER TABLE locations ADD COLUMN updatedAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
        );
      }
      // ضَبّط نوع latitude/longitude لو كانت ناقصة (بدون MODIFY إنكاري)
      // إذا احتجت تعديل النوع لاحقًا أخبرني ونجهز migration منفصل.
    }

    /* ---------------- personnel ---------------- */
    if (!(await tableExists(conn, "personnel"))) {
      await conn.query(`
        CREATE TABLE personnel (
          id INT NOT NULL AUTO_INCREMENT,
          locationId INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          role VARCHAR(255) NULL,
          phone VARCHAR(64) NULL,
          email VARCHAR(255) NULL,
          personnelType ENUM('security','traffic') NOT NULL DEFAULT 'security',
          notes TEXT NULL,
          createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          INDEX idx_personnel_loc (locationId)
          -- تجنّبنا قيود الـ FK لتوافق مزوّدات مثل PlanetScale
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    } else {
      if (!(await columnExists(conn, "personnel", "createdAt"))) {
        await conn.query(
          `ALTER TABLE personnel ADD COLUMN createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP`
        );
      }
      if (!(await columnExists(conn, "personnel", "updatedAt"))) {
        await conn.query(
          `ALTER TABLE personnel ADD COLUMN updatedAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
        );
      }
    }
  } finally {
    conn.release();
  }
}
