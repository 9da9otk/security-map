# Security Map Project — One-service Deploy (Railway)
## Build & Run scripts
- **Build**: `pnpm install --frozen-lockfile && pnpm run build && pnpm run migrate`
- **Start**: `pnpm run start`

## Required env vars
- `DATABASE_URL` (MySQL/TiDB connection string)
- `NODE_ENV=production`

## What this does
- Vite builds React from `client/` into `dist/`
- Express serves `dist/` and exposes tRPC under `/trpc`
- Drizzle migrations via `drizzle-kit`



Env on Render:
- PUBLIC_BASE_URL=https://your-app.onrender.com
- VITE_MAPTILER_KEY=XXXX
- VITE_EPHEMERAL_ASSIGNMENTS=true
