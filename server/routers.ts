import { initTRPC } from "@trpc/server";
import type { Context } from "./_core/context";

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  health: t.procedure.query(() => "ok"),
});

export type AppRouter = typeof appRouter;
