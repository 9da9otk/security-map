import { z } from "zod";
import { procedure, router } from "../_core/trpc";
import { getDb, locations } from "../db";
import { eq } from "drizzle-orm";

/** محوّل مساعد لتوحيد الإخراج (اختياري) */
// const toPlain = (row: any) => ({
//   ...row,
//   id: Number(row.id),
//   latitude: row.latitude,
//   longitude: row.longitude,
// });

export const locationsRouter = router({
  /* قائمة المواقع */
  list: procedure.query(async () => {
    const db = await getDb();
    const rows = await db.select().from(locations).orderBy(locations.id);
    // إن رغبت ترجع id رقمًا:
    // return rows.map(toPlain);
    return rows;
  }),

  /* جلب موقع بالمعرف */
  getById: procedure
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .select()
        .from(locations)
        .where(eq(locations.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),

  /* إنشاء/تحديث سريع */
  upsert: procedure
    .input(
      z.object({
        id: z.coerce.number().int().positive().optional(), // كان string → الآن يُحوَّل لnumber تلقائيًا
        name: z.string().min(1),
        lat: z.number(),
        lng: z.number(),
        radius: z.number().default(30),
        notes: z.string().optional().nullable(),
        fillColor: z.string().optional().nullable(),
        fillOpacity: z.number().optional().nullable(),
        strokeColor: z.string().optional().nullable(),
        strokeWidth: z.number().optional().nullable(),
        strokeEnabled: z.boolean().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();

      // تحديث
      if (input.id && Number.isFinite(input.id)) {
        const numId = Number(input.id);
        const patch: any = {
          name: input.name,
          latitude: String(input.lat),
          longitude: String(input.lng),
          radius: input.radius,
          notes: input.notes ?? null,
        };
        if (input.fillColor !== undefined) patch.fillColor = input.fillColor;
        if (input.fillOpacity !== undefined) patch.fillOpacity = input.fillOpacity;
        if (input.strokeColor !== undefined) patch.strokeColor = input.strokeColor;
        if (input.strokeWidth !== undefined) patch.strokeWidth = input.strokeWidth;
        if (input.strokeEnabled !== undefined) patch.strokeEnabled = input.strokeEnabled;

        const [row] = await db
          .update(locations)
          .set(patch)
          .where(eq(locations.id, numId))
          .returning();
        return row;
      }

      // إنشاء
      const [row] = await db
        .insert(locations)
        .values({
          name: input.name,
          latitude: String(input.lat),
          longitude: String(input.lng),
          radius: input.radius,
          notes: input.notes ?? null,
          isActive: 1,
          locationType: "security",
          fillColor: input.fillColor ?? null,
          fillOpacity: input.fillOpacity ?? null,
          strokeColor: input.strokeColor ?? null,
          strokeWidth: input.strokeWidth ?? null,
          strokeEnabled: input.strokeEnabled ?? null,
        })
        .returning();
      return row;
    }),

  /* إنشاء قياسي */
  create: procedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        locationType: z.enum(["security", "traffic", "mixed"]),
        latitude: z.number(),
        longitude: z.number(),
        radius: z.number().default(30),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db
        .insert(locations)
        .values({
          name: input.name,
          description: input.description ?? null,
          locationType: input.locationType,
          latitude: String(input.latitude),
          longitude: String(input.longitude),
          radius: input.radius,
          notes: input.notes ?? null,
          isActive: 1,
        })
        .returning();
      return row;
    }),

  /* تحديث جزئي */
  update: procedure
    .input(
      z.object({
        id: z.coerce.number().int().positive(),
        name: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
        locationType: z.enum(["security", "traffic", "mixed"]).optional(),
        radius: z.number().optional(),
        notes: z.string().optional().nullable(),
        fillColor: z.string().optional().nullable(),
        fillOpacity: z.number().optional().nullable(),
        strokeColor: z.string().optional().nullable(),
        strokeWidth: z.number().optional().nullable(),
        strokeEnabled: z.boolean().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const patch: any = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.locationType !== undefined) patch.locationType = input.locationType;
      if (input.radius !== undefined) patch.radius = input.radius;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.fillColor !== undefined) patch.fillColor = input.fillColor;
      if (input.fillOpacity !== undefined) patch.fillOpacity = input.fillOpacity;
      if (input.strokeColor !== undefined) patch.strokeColor = input.strokeColor;
      if (input.strokeWidth !== undefined) patch.strokeWidth = input.strokeWidth;
      if (input.strokeEnabled !== undefined) patch.strokeEnabled = input.strokeEnabled;

      const [row] = await db
        .update(locations)
        .set(patch)
        .where(eq(locations.id, input.id))
        .returning();
      return row;
    }),

  /* حذف */
  delete: procedure
    .input(z.object({ id: z.coerce.number().int().positive() })) // كان string → الآن يتحول لرقم
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db
        .delete(locations)
        .where(eq(locations.id, input.id))
        .returning();
      return row;
    }),
});
