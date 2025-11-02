// ================================
// FILE: src/pages/MapPage.tsx
// ================================
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Loader, MapPin, Plus, Save, Trash2, ZoomIn, ZoomOut, Crosshair } from "lucide-react";
import maplibregl, { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/styles/map.css";

// ——————————
// Diriyah default view (no camera jump during edits)
// ——————————
const DIRIYAH_CENTER: [number, number] = [46.5733, 24.7423];
const DIRIYAH_BOUNDS: [[number, number], [number, number]] = [
  [46.5598, 24.7328], // SW
  [46.5864, 24.7512], // NE
];

// Utilities
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const toFixed = (v: number, n = 6) => Number.parseFloat(String(v)).toFixed(n);

// Types (kept light to match typical TRPC outputs)
interface LocationDTO {
  id: string;
  name: string;
  lat: number; // WGS84
  lng: number;
  radius: number; // meters
  notes?: string | null;
  fillColor?: string | null; // #RRGGBB
  fillOpacity?: number | null; // 0..1
  strokeColor?: string | null; // #RRGGBB
  strokeWidth?: number | null; // px
  strokeEnabled?: boolean | null;
}

export default function MapPage() {
  // Server data
  const { data, isLoading, refetch } = trpc.locations.list.useQuery();
  const upsertMutation = trpc.locations.upsert.useMutation();
  const deleteMutation = trpc.locations.remove.useMutation();

  // Map refs
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isReadyRef = useRef(false);

  // Draft (new/edited) item with live preview
  const [draft, setDraft] = useState<LocationDTO | null>(null);

  // UI controls for style (affect only the DRAFT layer immediately)
  const [fillColor, setFillColor] = useState<string>("#0066ff");
  const [fillOpacity, setFillOpacity] = useState<number>(0.25);
  const [strokeColor, setStrokeColor] = useState<string>("#001533");
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [strokeEnabled, setStrokeEnabled] = useState<boolean>(true);

  // Radius (m) live control
  const [radiusM, setRadiusM] = useState<number>(60);

  // Camera helpers (no jump while editing)
  const fitDiriyahOnce = () => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(DIRIYAH_BOUNDS, { padding: 40, pitch: 0, bearing: 0, duration: 0 });
  };

  const ensureSourcesAndLayers = () => {
    const map = mapRef.current!;
    if (!map.getSource("locations-src")) {
      map.addSource("locations-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id",
      });
    }
    if (!map.getSource("draft-src")) {
      map.addSource("draft-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }

    // Base layer for saved locations (points + circles)
    if (!map.getLayer("locations-circle")) {
      map.addLayer({
        id: "locations-circle",
        type: "circle",
        source: "locations-src",
        paint: {
          "circle-color": ["coalesce", ["get", "fillColor"], "#118bee"],
          "circle-radius": 4,
          "circle-stroke-width": 1,
          "circle-stroke-color": ["coalesce", ["get", "strokeColor"], "#002255"],
        },
      });
    }

    // Draft preview (fill)
    if (!map.getLayer("draft-fill")) {
      map.addLayer({
        id: "draft-fill",
        type: "circle",
        source: "draft-src",
        paint: {
          "circle-color": fillColor,
          "circle-opacity": fillOpacity,
          // circle-radius in pixels; we will map meters -> pixels via expression based on zoom
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8, metersToPixels(radiusM, 8),
            18, metersToPixels(radiusM, 18),
          ],
        },
      });
    }

    // Draft preview (stroke)
    if (!map.getLayer("draft-line")) {
      map.addLayer({
        id: "draft-line",
        type: "circle",
        source: "draft-src",
        paint: {
          "circle-color": strokeColor,
          "circle-opacity": strokeEnabled ? 1 : 0,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8, metersToPixels(radiusM, 8) + strokeWidth,
            18, metersToPixels(radiusM, 18) + strokeWidth,
          ],
          "circle-stroke-color": strokeColor,
          "circle-stroke-width": strokeEnabled ? strokeWidth : 0,
        },
      });
    }
  };

  // meters -> pixels approximation for MapLibre circle at given zoom (WebMercator near Diriyah lat)
  function metersToPixels(meters: number, zoom: number) {
    const lat = DIRIYAH_CENTER[1];
    const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
    return meters / metersPerPixel;
  }

  // Initialize map once
useEffect(() => {
  if (mapRef.current || !containerRef.current) return;
  const map = new maplibregl.Map({
    container: containerRef.current,
    center: DIRIYAH_CENTER,
    zoom: 14.8,
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: [
            "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution: "© OpenStreetMap",
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    },
    attributionControl: true,
  });

  mapRef.current = map;
  map.once("load", () => { // once = لا يعيد الربط
    ensureSourcesAndLayers();
    isReadyRef.current = true;
    fitDiriyahOnce();
  });

  // منع أي إعادة تهيئة عرضية عند تغيّر حجم الحاوية
  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => map.resize());
  };
  window.addEventListener("resize", onResize);
  return () => {
    window.removeEventListener("resize", onResize);
    map.remove();
    mapRef.current = null;
  };
}, []);

  // Populate saved locations source when data changes (no camera jump)
useEffect(() => {
  if (!isReadyRef.current || !mapRef.current) return;
  const map = mapRef.current;
  const fc = {
    type: "FeatureCollection" as const,
    features: (data ?? []).map((loc: any) => ({
      type: "Feature" as const,
      id: loc.id,
      properties: {
        id: loc.id,
        name: loc.name,
        fillColor: loc.fillColor ?? "#118bee",
        strokeColor: loc.strokeColor ?? "#002255",
      },
      geometry: { type: "Point" as const, coordinates: [loc.lng, loc.lat] },
    })),
  };
  (map.getSource("locations-src") as any)?.setData(fc);
}, [isLoading]);

  return (
    <div className="map-page">
      <div className="map-toolbar">
        <Button onClick={handleNew} size="sm"><Plus className="mr-1 h-4 w-4"/> موقع جديد</Button>
        <Button variant="secondary" size="sm" onClick={() => fitDiriyahOnce()}><Crosshair className="mr-1 h-4 w-4"/> نطاق الدرعية</Button>
      </div>

      <div ref={containerRef} className="map-container" />

      <Card className="map-sidebar">
        <CardHeader>
          <CardTitle>التحكم</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>المواقع</Label>
            <div className="locations-list">
              {isLoading && <div className="muted">Loading…</div>}
              {!isLoading && locations.length === 0 && <div className="muted">لا توجد مواقع</div>}
              {locations.map((l) => (
                <div key={l.id} className={`loc-row ${draft?.id === l.id ? "active" : ""}`}>
                  <button onClick={() => selectExisting(l)} title="تعديل">{l.name}</button>
                  <div className="actions">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(l.id)} title="حذف"><Trash2 className="h-4 w-4"/></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="divider"/>

          <div className="grid grid-cols-2 gap-2 items-center">
            <Label>الاسم</Label>
            <Input
              value={draft?.name ?? ""}
              placeholder="اسم الموقع"
              onChange={(e) => draft && setDraft({ ...draft, name: e.target.value })}
              disabled={!draft}
            />

            <Label>الملاحظات</Label>
            <Textarea
              value={draft?.notes ?? ""}
              placeholder="ملاحظات"
              onChange={(e) => draft && setDraft({ ...draft, notes: e.target.value })}
              disabled={!draft}
            />

            <Label>خط العرض</Label>
            <Input
              type="number" step="0.000001"
              value={draft ? toFixed(draft.lat) : ""}
              onChange={(e) => draft && setDraft({ ...draft, lat: Number(e.target.value) })}
              disabled={!draft}
            />

            <Label>خط الطول</Label>
            <Input
              type="number" step="0.000001"
              value={draft ? toFixed(draft.lng) : ""}
              onChange={(e) => draft && setDraft({ ...draft, lng: Number(e.target.value) })}
              disabled={!draft}
            />

            <Label>نصف القطر (م)</Label>
            <div className="flex items-center gap-2">
              <Slider value={[radiusM]} min={5} max={500} step={1} onValueChange={(v) => setRadiusM(v[0])} disabled={!draft} />
              <Input className="w-20" type="number" value={radiusM} onChange={(e) => setRadiusM(clamp(Number(e.target.value), 1, 1000))} disabled={!draft}/>
            </div>

            <Label>لون التعبئة</Label>
            <Input type="color" value={fillColor} onChange={(e) => setFillColor(e.target.value)} disabled={!draft} />

            <Label>شفافية التعبئة</Label>
            <Slider value={[Math.round(fillOpacity * 100)]} min={0} max={100} step={1} onValueChange={(v) => setFillOpacity(v[0] / 100)} disabled={!draft} />

            <div className="col-span-2 grid grid-cols-2 gap-2 items-center">
              <Label>إظهار الحدود</Label>
              <Switch checked={strokeEnabled} onCheckedChange={setStrokeEnabled} disabled={!draft} />
            </div>

            <Label>لون الحدود</Label>
            <Input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} disabled={!draft} />

            <Label>سُمك الحدود</Label>
            <Slider value={[strokeWidth]} min={0} max={20} step={1} onValueChange={(v) => setStrokeWidth(v[0])} disabled={!draft} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={!draft}><Save className="mr-1 h-4 w-4"/> حفظ</Button>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={!draft}>إلغاء</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ================================
// FILE: src/styles/map.css
// ================================
/* Basic responsive layout */
.map-page { position: relative; height: calc(100vh - 70px); }
.map-toolbar { position: absolute; top: 10px; left: 10px; z-index: 5; display: flex; gap: 8px; }
.map-container { position: absolute; inset: 0; }
.map-sidebar { position: absolute; top: 10px; right: 10px; width: 360px; max-height: calc(100vh - 20px); overflow: auto; z-index: 6; }
.locations-list { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.loc-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,0.55); }
.loc-row.active { outline: 2px solid rgba(17,139,238,0.6); }
.loc-row button { text-align: left; }
.loc-row .actions { display: flex; align-items: center; gap: 4px; }
.divider { height: 1px; background: rgba(0,0,0,0.08); margin: 8px 0; }
.muted { color: #6b7280; font-size: 12px; }

/* MapLibre popups if used later */
.maplibregl-popup-content { border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); }

// ================================
// FILE: server/prod-server.ts
// ================================
import express from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import { createTRPCRouter } from "./routers";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

const app = express();
const ORIGIN = process.env.ORIGIN ?? "*";

app.set("trust proxy", 1);
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: ORIGIN, credentials: true }));

// tRPC API
app.use("/trpc", createExpressMiddleware({ router: createTRPCRouter() }));

// Health check
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// Static client (Vite output assumed in /dist/client)
const clientDir = path.join(process.cwd(), "dist", "client");
app.use(express.static(clientDir));
app.get("*", (_req, res) => res.sendFile(path.join(clientDir, "index.html")));

const port = process.env.PORT ? Number(process.env.PORT) : 10000;
app.listen(port, () => console.log(`[server] listening on ${port}`));

// ================================
// FILE: server/db.ts
// ================================
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";

const APP_DB_SSL = (process.env.APP_DB_SSL ?? "on").toLowerCase();
const useSSL = APP_DB_SSL !== "off";

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL!,
  ssl: useSSL ? { rejectUnauthorized: true } : undefined,
  connectionLimit: 10,
});

export const db = drizzle(pool);

// ================================
// FILE: server/routers.ts
// ================================
import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { db } from "./db";
import { locations } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const t = initTRPC.create();

export function createTRPCRouter() {
  return t.router({
    locations: t.router({
      list: t.procedure.query(async () => {
        const rows = await db.select().from(locations).orderBy(locations.createdAt);
        return rows;
      }),
      upsert: t.procedure
        .input(z.object({
          id: z.string().optional(),
          name: z.string().min(1),
          lat: z.number(),
          lng: z.number(),
          radius: z.number().min(1),
          notes: z.string().optional(),
          fillColor: z.string().optional(),
          fillOpacity: z.number().min(0).max(1).optional(),
          strokeColor: z.string().optional(),
          strokeWidth: z.number().min(0).max(50).optional(),
          strokeEnabled: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const payload = {
            name: input.name,
            lat: input.lat,
            lng: input.lng,
            radius: input.radius,
            notes: input.notes ?? "",
            fillColor: input.fillColor ?? "#0066ff",
            fillOpacity: input.fillOpacity ?? 0.25,
            strokeColor: input.strokeColor ?? "#001533",
            strokeWidth: input.strokeWidth ?? 2,
            strokeEnabled: input.strokeEnabled ?? true,
            updatedAt: new Date(),
          } as any;

          if (input.id) {
            await db.update(locations).set(payload).where(eq(locations.id, input.id));
            return { id: input.id };
          } else {
            const ins = await db.insert(locations).values({ ...payload, createdAt: new Date() });
            return ins;
          }
        }),
      remove: t.procedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
        await db.delete(locations).where(eq(locations.id, input.id));
        return { ok: true };
      }),
    }),
  });
}

// ================================
// FILE: drizzle/schema.ts (excerpt)
// ================================
import { mysqlTable, varchar, double, int, boolean, datetime } from "drizzle-orm/mysql-core";

export const locations = mysqlTable("locations", {
  id: varchar("id", { length: 191 }).primaryKey().notNull().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 191 }).notNull(),
  lat: double("lat").notNull(),
  lng: double("lng").notNull(),
  radius: int("radius").notNull().default(60),
  notes: varchar("notes", { length: 1024 }).notNull().default(""),
  fillColor: varchar("fill_color", { length: 16 }).notNull().default("#0066ff"),
  fillOpacity: double("fill_opacity").notNull().default(0.25),
  strokeColor: varchar("stroke_color", { length: 16 }).notNull().default("#001533"),
  strokeWidth: int("stroke_width").notNull().default(2),
  strokeEnabled: boolean("stroke_enabled").notNull().default(true),
  createdAt: datetime("created_at").notNull().default(new Date()),
  updatedAt: datetime("updated_at").notNull().default(new Date()),
});

// ================================
// FILE: index.html (Vite)
// ================================
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Security Map</title>
    <link rel="icon" href="/favicon.ico" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

// ================================
// FILE: package.json (scripts excerpt)
// ================================
{
  "scripts": {
    "dev": "vite",
    "build:client": "vite build --outDir dist/client",
    "build:server": "tsup server/prod-server.ts --format esm --target node20 --outDir dist --minify",
    "build": "pnpm run build:client && pnpm run build:server",
    "start": "NODE_ENV=production node dist/server.mjs"
  }
}
