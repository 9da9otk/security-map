// server/routers.ts
import { initTRPC } from "@trpc/server";
import type { Context } from "./_core/context";
import { z } from "zod";
import { getDb, locations, personnelTable } from "./db";
import { eq, desc } from "drizzle-orm";

const t = initTRPC.context<Context>().create();

/* ---------- Locations ---------- */
const locationsRouter = t.router({
  list: t.procedure.query(async () => {
    const db = await getDb();
    // لا تعتمد على updatedAt لتفادي أخطاء الأعمدة القديمة
    return db.select().from(locations).orderBy(desc(locations.id));
  }),

  getById: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [loc] = await db
        .select()
        .from(locations)
        .where(eq(locations.id, input.id))
        .limit(1);

      if (!loc) return null;

      const people = await db
        .select()
        .from(personnelTable)
        .where(eq(personnelTable.locationId, loc.id));

      return { ...loc, personnel: people };
    }),

  create: t.procedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        latitude: z.string().min(1),
        longitude: z.string().min(1),
        locationType: z.enum(["security", "traffic", "mixed"]),
        radius: z.number().int().optional().nullable(),
        // NEW: نخزن تنسيق الدائرة JSON بالعامود notes
        notes: z.string().optional().nullable(),
        isActive: z.number().int().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const result = await db.insert(locations).values({
        name: input.name,
        description: input.description ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        locationType: input.locationType,
        radius: input.radius ?? null,
        notes: input.notes ?? null,
        isActive: input.isActive ?? 1,
      });
      const id = (result as any)?.insertId ?? undefined;
      return id ? { id } : { ok: true };
    }),

  update: t.procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        // latitude/longitude اختيارية هنا لأن التحرير غالبًا بصري فقط
        latitude: z.string().optional().nullable(),
        longitude: z.string().optional().nullable(),
        locationType: z.enum(["security", "traffic", "mixed"]),
        radius: z.number().int().optional().nullable(),
        // NEW: نمط الدائرة
        notes: z.string().optional().nullable(),
        isActive: z.number().int().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(locations)
        .set({
          name: input.name,
          description: input.description ?? null,
          // لا نغيّر الإحداثيات إلا إذا وصلت
          ...(input.latitude != null ? { latitude: input.latitude ?? null } : {}),
          ...(input.longitude != null ? { longitude: input.longitude ?? null } : {}),
          locationType: input.locationType,
          radius: input.radius ?? null,
          notes: input.notes ?? null,
          ...(input.isActive != null ? { isActive: input.isActive } : {}),
        })
        .where(eq(locations.id, input.id));
      return { ok: true };
    }),

  delete: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(locations).where(eq(locations.id, input.id));
      return { ok: true };
    }),
});

/* ---------- Personnel ---------- */
const personnelRouter = t.router({
  // NEW: لعرض أفراد الموقع في المحرّر
  listByLocation: t.procedure
    .input(z.object({ locationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(personnelTable)
        .where(eq(personnelTable.locationId, input.locationId))
        .orderBy(desc(personnelTable.id));
    }),

  create: t.procedure
    .input(
      z.object({
        locationId: z.number().int().positive(),
        name: z.string().min(1),
        role: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        email: z.string().email().optional().nullable(),
        personnelType: z.enum(["security", "traffic"]).optional().default("security"),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const result = await db.insert(personnelTable).values({
        locationId: input.locationId,
        name: input.name,
        role: input.role ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        personnelType: input.personnelType,
        notes: input.notes ?? null,
      });
      const id = (result as any)?.insertId ?? undefined;
      return id ? { id } : { ok: true };
    }),

  update: t.procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1),
        role: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        email: z.string().email().optional().nullable(),
        personnelType: z.enum(["security", "traffic"]).optional().default("security"),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(personnelTable)
        .set({
          name: input.name,
          role: input.role ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          personnelType: input.personnelType,
          notes: input.notes ?? null,
        })
        .where(eq(personnelTable.id, input.id));
      return { ok: true };
    }),

  delete: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(personnelTable).where(eq(personnelTable.id, input.id));
      return { ok: true };
    }),
});

/* ---------- App Router ---------- */
export const appRouter = t.router({
  health: t.procedure.query(() => "ok"),
  locations: locationsRouter,
  personnel: personnelRouter,
});

export type AppRouter = typeof appRouter;
