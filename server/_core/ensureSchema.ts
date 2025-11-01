// server/_core/ensureSchema.ts
import mysql from "mysql2/promise";

export async function ensureSchema(pool: mysql.Pool) {
  // users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255),
      role VARCHAR(100),
      phone VARCHAR(64),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // locations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS locations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      latitude VARCHAR(32) NOT NULL,
      longitude VARCHAR(32) NOT NULL,
      location_type ENUM('security','traffic','mixed') NOT NULL,
      radius INT,
      is_active TINYINT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_locations_type (location_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // personnel
  await pool.query(`
    CREATE TABLE IF NOT EXISTS personnel (
      id INT AUTO_INCREMENT PRIMARY KEY,
      location_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(255) NOT NULL,
      phone VARCHAR(64),
      email VARCHAR(255),
      personnel_type ENUM('security','traffic') NOT NULL,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_personnel_location
        FOREIGN KEY (location_id) REFERENCES locations(id)
        ON DELETE CASCADE,
      INDEX idx_personnel_location (location_id),
      INDEX idx_personnel_type (personnel_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}
