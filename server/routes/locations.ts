import { z } from "zod";
import { procedure, router } from "../_core/trpc";
import { getDb, locations } from "../db";
import { eq } from "drizzle-orm";

export const locationsRouter = router({
  list: procedure.query(async () => {
    const db = await getDb();
    return db.select().from(locations).orderBy(locations.id);
  }),

  getById: procedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(locations).where(eq(locations.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),

  create: procedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional().nullable(),
      locationType: z.enum(["security", "traffic", "mixed"]),
      latitude: z.number(),
      longitude: z.number(),
      radius: z.number().default(30),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.insert(locations).values({
        name: input.name,
        description: input.description ?? null,
        locationType: input.locationType,
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        radius: input.radius,
        notes: input.notes ?? null,
        isActive: 1,
      }).returning();
      return row;
    }),

  update: procedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
      locationType: z.enum(["security", "traffic", "mixed"]).optional(),
      radius: z.number().optional(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const patch: any = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.locationType !== undefined) patch.locationType = input.locationType;
      if (input.radius !== undefined) patch.radius = input.radius;
      if (input.notes !== undefined) patch.notes = input.notes;

      const [row] = await db.update(locations).set(patch).where(eq(locations.id, input.id)).returning();
      return row;
    }),

  delete: procedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.delete(locations).where(eq(locations.id, input.id)).returning();
      return row;
    }),
});
