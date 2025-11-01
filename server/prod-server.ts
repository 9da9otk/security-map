import path from "path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";

const app = express();
import snapshotsRouter from "./routes/snapshots";

// If frontend+backend on same domain, you can later tighten this CORS to your domain.
app.use(cors({ origin: "*", credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/api/snapshots", snapshotsRouter);

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Serve React build assets
const clientDir = path.resolve(process.cwd(), "dist");
app.use(express.static(clientDir));

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`✅ Running on http://localhost:${port}`));
