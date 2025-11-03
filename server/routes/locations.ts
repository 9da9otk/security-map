import { z } from "zod";
import { procedure, router } from "../_core/trpc";
import { getDb, locations } from "../db";
import { eq } from "drizzle-orm";

const v = "locationsRouter v3 (coerce.number + logs)";

export const locationsRouter = router({
  __version: procedure.query(() => ({ v })),

  list: procedure.query(async () => {
    const db = await getDb();
    const rows = await db.select().from(locations).orderBy(locations.id);
    return rows;
  }),

  getById: procedure
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(locations).where(eq(locations.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),

  upsert: procedure
    .input(z.object({
      id: z.coerce.number().int().positive().optional(),
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
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      if (input.id) {
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

        const [row] = await db.update(locations).set(patch).where(eq(locations.id, input.id)).returning();
        return row;
      }

      const [row] = await db.insert(locations).values({
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
      }).returning();
      return row;
    }),

  update: procedure
    .input(z.object({
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
    }))
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

      const [row] = await db.update(locations).set(patch).where(eq(locations.id, input.id)).returning();
      return row;
    }),

  delete: procedure
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .mutation(async ({ input }) => {
      // لوغ تأكيدي
      // eslint-disable-next-line no-console
      console.log("[locations.delete] input.id typeof:", typeof input.id, "value:", input.id);
      const db = await getDb();
      const [row] = await db.delete(locations).where(eq(locations.id, input.id)).returning();
      return row;
    }),
});
