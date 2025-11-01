import {
  mysqlTable, serial, varchar, text, int, tinyint, mysqlEnum, timestamp,
} from "drizzle-orm/mysql-core";

// جدول المواقع
export const locations = mysqlTable("locations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  description: text("description"),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  locationType: mysqlEnum("location_type", ["security", "traffic", "mixed"]).notNull().default("mixed"),
  radius: int("radius"),
  // 👇 مهم: نخزّن ستايل الدائرة كـ JSON نصي
  notes: text("notes"),
  isActive: tinyint("is_active").notNull().default(1),

  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// جدول الأفراد (اختياري كما كان عندك)
export const personnel = mysqlTable("personnel", {
  id: serial("id").primaryKey(),
  locationId: int("location_id").notNull(),
  name: varchar("name", { length: 191 }).notNull(),
  role: varchar("role", { length: 191 }).notNull(),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 191 }),
  personnelType: mysqlEnum("personnel_type", ["security", "traffic"]).notNull().default("security"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// إن كان لديك users أبقه كما هو
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 191 }).notNull(),
  name: varchar("name", { length: 191 }),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});
