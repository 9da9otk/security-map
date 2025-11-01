import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";

const distDir = path.resolve(process.cwd(), "dist");

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// صحة
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// tRPC endpoint
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// ملفات الواجهة
app.use(express.static(distDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const port = process.env.PORT ? Number(process.env.PORT) : 10000;
app.listen(port, () => console.log(`Server running on :${port}`));
