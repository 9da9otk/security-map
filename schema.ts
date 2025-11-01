import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * جدول المواقع - يحتوي على معلومات مواقع تمركز الأفراد
 */
export const locations = mysqlTable("locations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(), // اسم الموقع
  description: text("description"), // وصف الموقع
  latitude: varchar("latitude", { length: 50 }).notNull(), // خط العرض
  longitude: varchar("longitude", { length: 50 }).notNull(), // خط الطول
  locationType: mysqlEnum("locationType", ["security", "traffic", "mixed"]).default("mixed").notNull(), // نوع الموقع
  radius: int("radius").default(100), // نطاق التمركز بالمتر
  isActive: int("isActive").default(1).notNull(), // هل الموقع نشط
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Location = typeof locations.$inferSelect;
export type InsertLocation = typeof locations.$inferInsert;

/**
 * جدول الأفراد - يحتوي على معلومات الأفراد المتمركزين في المواقع
 */
export const personnel = mysqlTable("personnel", {
  id: int("id").autoincrement().primaryKey(),
  locationId: int("locationId").notNull(), // معرف الموقع
  name: varchar("name", { length: 255 }).notNull(), // اسم الفرد
  role: varchar("role", { length: 100 }).notNull(), // دور الفرد (ضابط، جندي، مرور، إلخ)
  phone: varchar("phone", { length: 20 }), // رقم الهاتف
  email: varchar("email", { length: 320 }), // البريد الإلكتروني
  personnelType: mysqlEnum("personnelType", ["security", "traffic"]).default("security").notNull(), // نوع الفرد
  notes: text("notes"), // ملاحظات إضافية
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Personnel = typeof personnel.$inferSelect;
export type InsertPersonnel = typeof personnel.$inferInsert;

/**
 * العلاقات بين الجداول
 */
export const locationsRelations = relations(locations, ({ many }) => ({
  personnel: many(personnel),
}));

export const personnelRelations = relations(personnel, ({ one }) => ({
  location: one(locations, {
    fields: [personnel.locationId],
    references: [locations.id],
  }),
}));

/** لقطة تعيينات المشاركة */
import { json as jsoncol } from "drizzle-orm/mysql-core";

export const assignmentSnapshots = mysqlTable("assignment_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  data: jsoncol("data").$type<Record<number, Array<{
    id: number;
    name: string;
    role: "قائد فريق" | "رجل أمن ثاني";
    phone?: string;
    email?: string;
    personnelType?: "security" | "traffic";
    notes?: string | null;
  }>>>().notNull(),
  locations: jsoncol("locations").$type<Array<{
    id: number;
    name: string;
    latitude: string;
    longitude: string;
    locationType: "security" | "traffic" | "mixed";
    radius?: number | null;
  }>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AssignmentSnapshot = typeof assignmentSnapshots.$inferSelect;
