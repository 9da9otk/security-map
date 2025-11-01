import { z } from "zod";
import { procedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { personnel as personnelTable } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const personnelRouter = router({
  listByLocation: procedure
    .input(z.object({ locationId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(personnelTable).where(eq(personnelTable.locationId, input.locationId));
    }),

  create: procedure
    .input(z.object({ locationId: z.number(), name: z.string().min(1), role: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.insert(personnelTable).values({
        locationId: input.locationId,
        name: input.name,
        role: input.role ?? null,
      }).returning();
      return row;
    }),

  delete: procedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.delete(personnelTable).where(eq(personnelTable.id, input.id)).returning();
      return row;
    }),
});
