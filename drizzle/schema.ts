// drizzle/schema.ts
import {
  mysqlTable,
  serial,
  varchar,
  text,
  int,
  mysqlEnum,
  datetime,
  tinyint,
} from "drizzle-orm/mysql-core";
import { InferInsertModel, InferSelectModel } from "drizzle-orm";

/* =========================
   users
   ========================= */
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  // عدّل الحقلين التاليين إذا كانت أسماء أعمدتك مختلفة
  passwordHash: varchar("password_hash", { length: 255 }),
  role: varchar("role", { length: 100 }),
  phone: varchar("phone", { length: 64 }),
  createdAt: datetime("created_at").defaultNow().notNull(),
  updatedAt: datetime("updated_at").defaultNow().notNull(),
});
export type InsertUser = InferInsertModel<typeof users>;
export type SelectUser = InferSelectModel<typeof users>;

/* =========================
   locations
   ========================= */
export const locations = mysqlTable("locations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  locationType: mysqlEnum("location_type", ["security", "traffic", "mixed"]).notNull(),
  radius: int("radius"),
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: datetime("created_at").defaultNow().notNull(),
  updatedAt: datetime("updated_at").defaultNow().notNull(),
});
export type InsertLocation = InferInsertModel<typeof locations>;
export type SelectLocation = InferSelectModel<typeof locations>;

/* =========================
   personnel
   ========================= */
export const personnel = mysqlTable("personnel", {
  id: serial("id").primaryKey(),
  locationId: int("location_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 255 }),
  personnelType: mysqlEnum("personnel_type", ["security", "traffic"]).notNull(),
  notes: text("notes"),
  createdAt: datetime("created_at").defaultNow().notNull(),
  updatedAt: datetime("updated_at").defaultNow().notNull(),
});
export type InsertPersonnel = InferInsertModel<typeof personnel>;
export type SelectPersonnel = InferSelectModel<typeof personnel>;
