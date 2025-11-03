import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Crosshair, Plus, Save, Trash2 } from "lucide-react";
import maplibregl, { Map, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/styles/map.css";

const DIRIYAH_CENTER: [number, number] = [46.5733, 24.7423];
const DIRIYAH_BOUNDS: [[number, number], [number, number]] = [
  [46.5598, 24.7328],
  [46.5864, 24.7512],
];

/* ====== helpers ====== */
type LocationDTO = {
  id: number | "draft";
  name: string;
  lat: number;
  lng: number;
  radius: number;
  notes?: string | null;
  fillColor?: string | null;
  fillOpacity?: number | null;
  strokeColor?: string | null;
  strokeWidth?: number | null;
  strokeEnabled?: boolean | null;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const toFixed = (v: number, n = 6) => Number.parseFloat(String(v)).toFixed(n);

function getQueryParam(name: string) {
  if (typeof window === "undefined") return undefined;
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || undefined;
}

/** يحاول جلب مفتاح MapTiler بعدة طرق لضمان العمل حتى لو فشل الحقن وقت الـ build */
function getMaptilerKey(): string | undefined {
  // 1) Vite build-time
  const fromVite = (import.meta as any)?.env?.VITE_MAPTILER_KEY as string | undefined;
  if (fromVite && fromVite.length > 5) return fromVite;

  // 2) نافذة المتصفح (يمكن حقنها يدوياً في index.html: window.VITE_MAPTILER_KEY = '...';
  const fromWindow = (globalThis as any)?.VITE_MAPTILER_KEY as string | undefined;
  if (fromWindow && fromWindow.length > 5) return fromWindow;

  // 3) localStorage (للاختبار السريع)
  try {
    const fromLS = typeof window !== "undefined" ? window.localStorage.getItem("VITE_MAPTILER_KEY") || undefined : undefined;
    if (fromLS && fromLS.length > 5) return fromLS;
  } catch {}

  // 4) باراميتر في الرابط ?mtk=KEY (للتجربة اليدوية)
  const fromURL = getQueryParam("mtk");
  if (fromURL && fromURL.length > 5) return fromURL;

  return undefined;
}

function buildOSMStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#f0f0f0" } },
      { id: "osm-tiles", type: "raster", source: "osm", minzoom: 0, maxzoom: 22 },
    ],
  };
}

function getBaseStyle(): string | StyleSpecification {
  const KEY = getMaptilerKey();
  if (KEY) {
    console.info("[maps] Using MapTiler with key");
    // اختر ستايل آخر إذا تبي: basic-v2, bright, outdoor, satellite, hybrid...
    return `https://api.maptiler.com/maps/streets/style.json?key=${KEY}`;
  }
  console.warn("[maps] MapTiler key not found — using OSM fallback");
  return buildOSMStyle();
}

/** يحاول العثور على ميوتاشن موجودة: upsert أو save أو set أو create أو update */
function pickUpsertMutation() {
  const anyTrpc = trpc as any;
  const candidates = ["upsert", "save", "set", "create", "update"];
  for (const name of candidates) {
    const fn = anyTrpc?.locations?.[name]?.useMutation;
    if (typeof fn === "function") return fn.call(anyTrpc.locations);
  }
  return null;
}

export default function MapPage() {
  const { data, isLoading, refetch } = trpc.locations.list.useQuery();
  const deleteMutation = trpc.locations.delete.useMutation();

  // اختر ميوتاشن للحفظ مما هو متاح
  const UpsertHook = pickUpsertMutation();
  const upsertMutation = UpsertHook ? UpsertHook() : null;

  const mapRef = useRef<Map | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);

  const [draft, setDraft] = useState<LocationDTO | null>(null);
  const [fillColor, setFillColor] = useState("#0066ff");
  const [fillOpacity, setFillOpacity] = useState(0.25);
  const [strokeColor, setStrokeColor] = useState("#001533");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeEnabled, setStrokeEnabled] = useState(true);
  const [radiusM, setRadiusM] = useState(60);

  function metersToPixels(m: number, z: number) {
    const lat = DIRIYAH_CENTER[1];
    const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
    return m / mpp;
  }

  useEffect(() => {
    if (mapRef.current || !mapEl.current) return;

    mapEl.current.style.minHeight = "100vh";
    mapEl.current.style.width = "100%";

    const map = new maplibregl.Map({
      container: mapEl.current,
      center: DIRIYAH_CENTER,
      zoom: 14.8,
      style: getBaseStyle(),
      attributionControl: true,
      maxBounds: [
        [46.45, 24.60],
        [46.70, 24.85],
      ],
    });

    map.on("error", (e) => console.error("[maplibre]", e?.error || e));
    mapRef.current = map;

    map.once("load", () => {
      if (!map.getSource("locations-src")) {
        map.addSource("locations-src", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          promoteId: "id",
        });
      }
      if (!map.getLayer("locations-points")) {
        map.addLayer({
          id: "locations-points",
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

      if (!map.getSource("draft-src")) {
        map.addSource("draft-src", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer("draft-fill")) {
        map.addLayer({
          id: "draft-fill",
          type: "circle",
          source: "draft-src",
          paint: {
            "circle-color": fillColor,
            "circle-opacity": fillOpacity,
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              8,  metersToPixels(radiusM, 8),
              18, metersToPixels(radiusM, 18),
            ],
          },
        });
      }
      if (!map.getLayer("draft-line")) {
        map.addLayer({
          id: "draft-line",
          type: "circle",
          source: "draft-src",
          paint: {
            "circle-color": strokeColor,
            "circle-opacity": strokeEnabled ? 1 : 0,
            "circle-stroke-color": strokeColor,
            "circle-stroke-width": strokeEnabled ? strokeWidth : 0,
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              8,  metersToPixels(radiusM, 8) + strokeWidth,
              18, metersToPixels(radiusM, 18) + strokeWidth,
            ],
          },
        });
      }

      readyRef.current = true;
      map.addControl(new maplibregl.NavigationControl(), "top-left");
      map.fitBounds(DIRIYAH_BOUNDS, { padding: 40, duration: 0 });
      map.resize();
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapEl.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const { mutateAsync: remove } = deleteMutation;
  const locations = useMemo(() => (data as any[]) ?? [], [data]);

  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    const map = mapRef.current;
    const fc = {
      type: "FeatureCollection" as const,
      features: (locations ?? []).map((l: any) => ({
        type: "Feature" as const,
        id: Number(l.id),
        properties: {
          id: Number(l.id),
          name: l.name,
          fillColor: l.fillColor ?? "#118bee",
          strokeColor: l.strokeColor ?? "#002255",
        },
        geometry: { type: "Point" as const, coordinates: [Number(l.longitude), Number(l.latitude)] },
      })),
    };
    (map.getSource("locations-src") as any)?.setData(fc);
  }, [isLoading, locations]);

  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    const map = mapRef.current;
    const dataGeo = draft
      ? {
          type: "FeatureCollection" as const,
          features: [{
            type: "Feature" as const,
            properties: { name: draft.name || "Draft" },
            geometry: { type: "Point" as const, coordinates: [draft.lng, draft.lat] },
          }],
        }
      : { type: "FeatureCollection", features: [] };

    (map.getSource("draft-src") as any)?.setData(dataGeo);
  }, [draft?.lat, draft?.lng, draft?.name]);

  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    const map = mapRef.current;

    if (map.getLayer("draft-fill")) {
      map.setPaintProperty("draft-fill", "circle-color", fillColor);
      map.setPaintProperty("draft-fill", "circle-opacity", fillOpacity);
      map.setPaintProperty("draft-fill", "circle-radius", [
        "interpolate", ["linear"], ["zoom"],
        8,  metersToPixels(radiusM, 8),
        18, metersToPixels(radiusM, 18),
      ]);
    }
    if (map.getLayer("draft-line")) {
      map.setPaintProperty("draft-line", "circle-color", strokeColor);
      map.setPaintProperty("draft-line", "circle-opacity", strokeEnabled ? 1 : 0);
      map.setPaintProperty("draft-line", "circle-stroke-color", strokeColor);
      map.setPaintProperty("draft-line", "circle-stroke-width", strokeEnabled ? strokeWidth : 0);
      map.setPaintProperty("draft-line", "circle-radius", [
        "interpolate", ["linear"], ["zoom"],
        8,  metersToPixels(radiusM, 8) + strokeWidth,
        18, metersToPixels(radiusM, 18) + strokeWidth,
      ]);
    }
  }, [fillColor, fillOpacity, strokeColor, strokeWidth, strokeEnabled, radiusM]);

  const handleNew = () => {
    const map = mapRef.current!;
    const c = map.getCenter();
    setDraft({
      id: "draft",
      name: "New Location",
      lat: c.lat,
      lng: c.lng,
      radius: radiusM,
      notes: "",
      fillColor,
      fillOpacity,
      strokeColor,
      strokeWidth,
      strokeEnabled,
    });
  };

  const handleSave = async () => {
    if (!draft) return;

    if (!upsertMutation) {
      console.error('[tRPC] No "upsert/save/set/create/update" mutation found in locations router.');
      alert("لا يوجد إجراء حفظ في السيرفر (upsert/save/set/create/update). رجاءً تحقق من أسماء إجراءات tRPC في الخلفية.");
      return;
    }

    await upsertMutation.mutateAsync({
      id: draft.id === "draft" ? undefined : Number(draft.id),
      name: draft.name,
      lat: draft.lat,
      lng: draft.lng,
      radius: radiusM,
      notes: draft.notes ?? "",
      fillColor, fillOpacity, strokeColor, strokeWidth, strokeEnabled,
    });

    setDraft(null);
    await refetch();
  };

  const handleDelete = async (id: number | string) => {
    await remove({ id: Number(id) }); // <-- تحويل إجباري إلى رقم
    if (draft && draft.id !== "draft" && Number(draft.id) === Number(id)) setDraft(null);
    await refetch();
  };

  const selectExisting = (loc: any) => {
    setDraft({
      id: Number(loc.id),
      name: loc.name,
      lat: Number(loc.latitude),
      lng: Number(loc.longitude),
      radius: loc.radius ?? 60,
      notes: loc.notes,
      fillColor: loc.fillColor ?? "#0066ff",
      fillOpacity: loc.fillOpacity ?? 0.25,
      strokeColor: loc.strokeColor ?? "#001533",
      strokeWidth: loc.strokeWidth ?? 2,
      strokeEnabled: loc.strokeEnabled ?? true,
    });
    setRadiusM(loc.radius ?? 60);
    setFillColor(loc.fillColor ?? "#0066ff");
    setFillOpacity(loc.fillOpacity ?? 0.25);
    setStrokeColor(loc.strokeColor ?? "#001533");
    setStrokeWidth(loc.strokeWidth ?? 2);
    setStrokeEnabled(loc.strokeEnabled ?? true);
  };

  return (
    <div className="map-page flex-layout">
      <div className="map-left">
        <div ref={mapEl} className="map-canvas" />
        <div className="map-toolbar">
          <Button onClick={handleNew} size="sm"><Plus className="mr-1 h-4 w-4" /> موقع جديد</Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => mapRef.current?.fitBounds(DIRIYAH_BOUNDS, { padding: 40, duration: 0 })}
            title="الرجوع إلى نطاق الدرعية"
          >
            <Crosshair className="mr-1 h-4 w-4" /> نطاق الدرعية
          </Button>
        </div>
      </div>

      <Card className="map-right">
        <CardHeader><CardTitle>التحكم</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>المواقع</Label>
            <div className="locations-list">
              {isLoading && <div className="muted">Loading…</div>}
              {!isLoading && (data?.length ?? 0) === 0 && <div className="muted">لا توجد مواقع</div>}
              {(data ?? []).map((l: any) => (
                <div key={l.id} className={`loc-row ${draft && draft.id !== "draft" && Number(draft.id) === Number(l.id) ? "active" : ""}`}>
                  <button onClick={() => selectExisting(l)}>{l.name}</button>
                  <div className="actions">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(l.id)} title="حذف">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="divider" />

          <div className="grid grid-cols-2 gap-2 items-center">
            <Label>الاسم</Label>
            <Input value={draft?.name ?? ""} onChange={(e)=>draft&&setDraft({...draft, name:e.target.value})} disabled={!draft} placeholder="اسم الموقع" />

            <Label>الملاحظات</Label>
            <Textarea value={draft?.notes ?? ""} onChange={(e)=>draft&&setDraft({...draft, notes:e.target.value})} disabled={!draft} placeholder="ملاحظات" />

            <Label>خط العرض</Label>
            <Input type="number" step="0.000001" value={draft?toFixed(draft.lat):""} onChange={(e)=>draft&&setDraft({...draft, lat:Number(e.target.value)})} disabled {!draft} />

            <Label>خط الطول</Label>
            <Input type="number" step="0.000001" value={draft?toFixed(draft.lng):""} onChange={(e)=>draft&&setDraft({...draft, lng:Number(e.target.value)})} disabled {!draft} />

            <Label>نصف القطر (م)</Label>
            <div className="flex items-center gap-2">
              <Slider value={[radiusM]} min={5} max={500} step={1} onValueChange={(v)=>setRadiusM(v[0])} disabled={!draft} />
              <Input className="w-20" type="number" value={radiusM} onChange={(e)=>setRadiusM(clamp(Number(e.target.value),1,1000))} disabled={!draft} />
            </div>

            <Label>لون التعبئة</Label>
            <Input type="color" value={fillColor} onChange={(e)=>setFillColor(e.target.value)} disabled={!draft} />

            <Label>شفافية التعبئة</Label>
            <Slider value={[Math.round(fillOpacity*100)]} min={0} max={100} step={1} onValueChange={(v)=>setFillOpacity(v[0]/100)} disabled={!draft} />

            <div className="col-span-2 grid grid-cols-2 gap-2 items-center">
              <Label>إظهار الحدود</Label>
              <Switch checked={strokeEnabled} onCheckedChange={setStrokeEnabled} disabled={!draft} />
            </div>

            <Label>لون الحدود</Label>
            <Input type="color" value={strokeColor} onChange={(e)=>setStrokeColor(e.target.value)} disabled={!draft} />

            <Label>سُمك الحدود</Label>
            <Slider value={[strokeWidth]} min={0} max={20} step={1} onValueChange={(v)=>setStrokeWidth(v[0])} disabled={!draft} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={!draft || !upsertMutation}>
              <Save className="mr-1 h-4 w-4" /> حفظ
            </Button>
            <Button variant="outline" onClick={()=>setDraft(null)} disabled={!draft}>إلغاء</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
