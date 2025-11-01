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
