import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, locations, personnel as personnelTable } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ Locations Queries ============

export async function getAllLocations() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get locations: database not available");
    return [];
  }

  try {
    return await db.select().from(locations);
  } catch (error) {
    console.error("[Database] Failed to get locations:", error);
    throw error;
  }
}

export async function getLocationById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get location: database not available");
    return undefined;
  }

  try {
    const result = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error("[Database] Failed to get location:", error);
    throw error;
  }
}

export async function createLocation(data: any) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create location: database not available");
    return undefined;
  }

  try {
    const result = await db.insert(locations).values(data);
    return result;
  } catch (error) {
    console.error("[Database] Failed to create location:", error);
    throw error;
  }
}

export async function updateLocation(id: number, data: any) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update location: database not available");
    return undefined;
  }

  try {
    return await db.update(locations).set(data).where(eq(locations.id, id));
  } catch (error) {
    console.error("[Database] Failed to update location:", error);
    throw error;
  }
}

export async function deleteLocation(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete location: database not available");
    return undefined;
  }

  try {
    return await db.delete(locations).where(eq(locations.id, id));
  } catch (error) {
    console.error("[Database] Failed to delete location:", error);
    throw error;
  }
}

// ============ Personnel Queries ============

export async function getPersonnelByLocationId(locationId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get personnel: database not available");
    return [];
  }

  try {
    return await db.select().from(personnelTable).where(eq(personnelTable.locationId, locationId));
  } catch (error) {
    console.error("[Database] Failed to get personnel:", error);
    throw error;
  }
}

export async function getPersonnelById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get personnel: database not available");
    return undefined;
  }

  try {
    const result = await db.select().from(personnelTable).where(eq(personnelTable.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error("[Database] Failed to get personnel:", error);
    throw error;
  }
}

export async function createPersonnel(data: any) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create personnel: database not available");
    return undefined;
  }

  try {
    const result = await db.insert(personnelTable).values(data);
    return result;
  } catch (error) {
    console.error("[Database] Failed to create personnel:", error);
    throw error;
  }
}

export async function updatePersonnel(id: number, data: any) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update personnel: database not available");
    return undefined;
  }

  try {
    return await db.update(personnelTable).set(data).where(eq(personnelTable.id, id));
  } catch (error) {
    console.error("[Database] Failed to update personnel:", error);
    throw error;
  }
}

export async function deletePersonnel(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete personnel: database not available");
    return undefined;
  }

  try {
    return await db.delete(personnelTable).where(eq(personnelTable.id, id));
  } catch (error) {
    console.error("[Database] Failed to delete personnel:", error);
    throw error;
  }
}
