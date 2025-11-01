import { initTRPC } from "@trpc/server";
import type { Context } from "./_core/context";
import { z } from "zod";
import { getDb, locations, personnelTable } from "./db";
import { eq, desc } from "drizzle-orm";

const t = initTRPC.context<Context>().create();

/* -------------------- مساعدات Zod -------------------- */
const ZNumStrToString = z.union([z.string(), z.number()]).transform((v) => String(v));
const ZRadius = z.number().int().nonnegative();

/* -------------------- Locations -------------------- */
const locationsRouter = t.router({
  list: t.procedure.query(async () => {
    const db = await getDb();
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
        latitude: ZNumStrToString,            // يقبل رقم أو نص ويحوّله لسلسلة
        longitude: ZNumStrToString,           // يقبل رقم أو نص ويحوّله لسلسلة
        locationType: z.enum(["security", "traffic", "mixed"]),
        radius: ZRadius.optional().nullable(),
        notes: z.string().optional().nullable(), // لتخزين نمط الدائرة JSON
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const result = await db.insert(locations).values({
        name: input.name,
        description: input.description ?? null,
        latitude: input.latitude,   // مخزنة كسلسلة في السكيمة لديك
        longitude: input.longitude, // مخزنة كسلسلة في السكيمة لديك
        locationType: input.locationType,
        radius: input.radius ?? null,
        notes: input.notes ?? null,
        isActive: 1,
      });
      // mysql2 OkPacket
      const id = (result as any)?.insertId ?? undefined;
      return id ? { id } : { ok: true };
    }),

  // صار يقبل حقول اختيارية فقط (Partial) - أرسل ما تريد تحديثه
  update: t.procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
        latitude: ZNumStrToString.optional(),
        longitude: ZNumStrToString.optional(),
        locationType: z.enum(["security", "traffic", "mixed"]).optional(),
        radius: ZRadius.optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description ?? null;
      if (input.latitude !== undefined) patch.latitude = input.latitude;
      if (input.longitude !== undefined) patch.longitude = input.longitude;
      if (input.locationType !== undefined) patch.locationType = input.locationType;
      if (input.radius !== undefined) patch.radius = input.radius ?? null;
      if (input.notes !== undefined) patch.notes = input.notes ?? null;

      if (Object.keys(patch).length === 0) {
        return { ok: true }; // لا شيء لتحديثه
      }

      await db.update(locations).set(patch).where(eq(locations.id, input.id));
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

/* -------------------- Personnel -------------------- */
const personnelRouter = t.router({
  // جديد: مطلوب للواجهة لعرض أفراد الموقع في لوحة التعديل
  listByLocation: t.procedure
    .input(z.object({ locationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(personnelTable)
        .where(eq(personnelTable.locationId, input.locationId));
    }),

  create: t.procedure
    .input(
      z.object({
        locationId: z.number().int().positive(),
        name: z.string().min(1),
        role: z.string().min(1).optional().default(""),
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
        role: input.role ?? "",
        phone: input.phone ?? null,
        email: input.email ?? null,
        personnelType: input.personnelType ?? "security",
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
        role: z.string().min(1),
        phone: z.string().optional().nullable(),
        email: z.string().email().optional().nullable(),
        personnelType: z.enum(["security", "traffic"]),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(personnelTable)
        .set({
          name: input.name,
          role: input.role,
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

/* -------------------- App Router -------------------- */
export const appRouter = t.router({
  health: t.procedure.query(() => "ok"),
  locations: locationsRouter,
  personnel: personnelRouter,
});

export type AppRouter = typeof appRouter;
