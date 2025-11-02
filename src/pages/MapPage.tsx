import { useLayoutEffect, useEffect, useMemo, useRef, useState } from "react";
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
import "@/styles/base.css";
import "@/styles/map.css";

const DEBUG = true; // اجعلها false لإخفاء طبقة الديبَغ

const DIRIYAH_CENTER: [number, number] = [46.5733, 24.7423];
const DIRIYAH_BOUNDS: [[number, number], [number, number]] = [
  [46.5598, 24.7328],
  [46.5864, 24.7512],
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const toFixed = (v: number, n = 6) => Number.parseFloat(String(v)).toFixed(n);

interface LocationDTO {
  id: string;
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
}

function baseStyle(): StyleSpecification {
  const key = (import.meta as any).env?.VITE_MAPTILER_KEY as string | undefined;
  if (key) {
    return {
      version: 8,
      sources: {
        basemap: {
          type: "raster",
          tiles: [
            `https://api.maptiler.com/tiles/tiles/256/{z}/{x}/{y}.jpg?key=${key}`,
          ],
          tileSize: 256,
          attribution: "© MapTiler © OpenStreetMap contributors",
        },
      },
      layers: [{ id: "basemap", type: "raster", source: "basemap" }],
    } as any;
  }
  return {
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
  };
}

export default function MapPage() {
  // API
  const { data, isLoading, refetch } = trpc.locations.list.useQuery();
  const upsertMutation = trpc.locations.upsert.useMutation();
  const deleteMutation = trpc.locations.remove.useMutation();

  // Map refs
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isReadyRef = useRef(false);

  // “جاهز للتهيئة” بعد التأكد من قياس الحاوية
  const [canInit, setCanInit] = useState(false);
  const [box, setBox] = useState<{w: number; h: number}>({ w: 0, h: 0 });

  // Draft + style
  const [draft, setDraft] = useState<LocationDTO | null>(null);
  const [fillColor, setFillColor] = useState("#0066ff");
  const [fillOpacity, setFillOpacity] = useState(0.25);
  const [strokeColor, setStrokeColor] = useState("#001533");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeEnabled, setStrokeEnabled] = useState(true);
  const [radiusM, setRadiusM] = useState(60);

  // ===== قياس الحاوية وانتظار حجم > 0 =====
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: Math.round(r.width), h: Math.round(r.height) });
      if (r.width > 0 && r.height > 0) setCanInit(true);
    };

    measure();                        // قياس أولي
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    // احتياط: بعض الواجهات تتأخر في الحساب، نعيد القياس بعد فريم
    const id = requestAnimationFrame(measure);
    const id2 = setTimeout(measure, 60);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(id);
      clearTimeout(id2);
    };
  }, []);

  // ===== إنشاء الخريطة بعد التأكد من القياس =====
  useLayoutEffect(() => {
    if (!canInit || mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: DIRIYAH_CENTER,
      zoom: 14.8,
      style: baseStyle(),
      attributionControl: true,
      preserveDrawingBuffer: false,
    });

    map.on("error", (e) => console.error("[maplibre error]", e?.error || e));

    mapRef.current = map;
    map.once("load", () => {
      ensureSourcesAndLayers();
      isReadyRef.current = true;
      fitDiriyahOnce();
      map.resize();           // تأكيد التمدد
      setTimeout(() => map.resize(), 50);
    });

    // راقب تغيّر الحجم دومًا
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    (map as any).__ro = ro;

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canInit]);

  const fitDiriyahOnce = () => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(DIRIYAH_BOUNDS, { padding: 40, pitch: 0, bearing: 0, duration: 0 });
  };

  // Utilities
  function metersToPixels(meters: number, zoom: number) {
    const lat = DIRIYAH_CENTER[1];
    const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
    return meters / metersPerPixel;
  }

  function ensureSourcesAndLayers() {
    const map = mapRef.current!;
    // saved
    if (!map.getSource("locations-src")) {
      map.addSource("locations-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id",
      });
    }
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
    // draft
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
            8, metersToPixels(radiusM, 8),
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
            8, metersToPixels(radiusM, 8) + strokeWidth,
            18, metersToPixels(radiusM, 18) + strokeWidth,
          ],
        },
      });
    }
  }

  // Saved locations → GeoJSON
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
  }, [isLoading, data]);

  // Draft GEO (coords/name only)
  useEffect(() => {
    if (!isReadyRef.current || !mapRef.current) return;
    const map = mapRef.current;
    const geo = draft
      ? {
          type: "FeatureCollection" as const,
          features: [
            {
              type: "Feature" as const,
              properties: { name: draft.name || "Draft" },
              geometry: { type: "Point" as const, coordinates: [draft.lng, draft.lat] },
            },
          ],
        }
      : { type: "FeatureCollection", features: [] };
    (map.getSource("draft-src") as any)?.setData(geo);
  }, [draft?.lat, draft?.lng, draft?.name]);

  // Draft STYLE (via rAF)
  useEffect(() => {
    if (!isReadyRef.current || !mapRef.current) return;
    const map = mapRef.current;
    let raf = 0;
    const apply = () => {
      if (map.getLayer("draft-fill")) {
        map.setPaintProperty("draft-fill", "circle-color", fillColor);
        map.setPaintProperty("draft-fill", "circle-opacity", clamp(fillOpacity, 0, 1));
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
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [fillColor, fillOpacity, strokeColor, strokeWidth, strokeEnabled, radiusM]);

  // Actions
  const handleNew = () => {
    const map = mapRef.current!;
    const c = map.getCenter();
    const d: LocationDTO = {
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
    };
    setDraft(d);
  };

  const handleSave = async () => {
    if (!draft) return;
    await upsertMutation.mutateAsync({
      id: draft.id === "draft" ? undefined : draft.id,
      name: draft.name,
      lat: draft.lat,
      lng: draft.lng,
      radius: radiusM,
      notes: draft.notes ?? "",
      fillColor,
      fillOpacity,
      strokeColor,
      strokeWidth,
      strokeEnabled,
    });
    setDraft(null);
    await refetch();
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync({ id });
    if (draft && draft.id === id) setDraft(null);
    await refetch();
  };

  const selectExisting = (loc: LocationDTO) => {
    setDraft({ ...loc });
    setRadiusM(loc.radius ?? 60);
    setFillColor(loc.fillColor ?? "#0066ff");
    setFillOpacity(loc.fillOpacity ?? 0.25);
    setStrokeColor(loc.strokeColor ?? "#001533");
    setStrokeWidth(loc.strokeWidth ?? 2);
    setStrokeEnabled(loc.strokeEnabled ?? true);
  };

  const locations: LocationDTO[] = useMemo(() => (data as any) ?? [], [data]);

  return (
    <div className="map-page">
      {/* العمود الأيسر = الخريطة */}
      <div className="map-container" ref={containerRef}>
        {DEBUG && (
          <div className="debug-overlay">
            <b>Container:</b> {box.w} × {box.h}px {canInit ? "✅" : "⏳"}
          </div>
        )}
        <div className="map-toolbar">
          <Button onClick={handleNew} size="sm">
            <Plus className="mr-1 h-4 w-4" /> موقع جديد
          </Button>
          <Button variant="secondary" size="sm" onClick={() => fitDiriyahOnce()}>
            <Crosshair className="mr-1 h-4 w-4" /> نطاق الدرعية
          </Button>
        </div>
      </div>

      {/* العمود الأيمن = اللوحة */}
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
                  <button onClick={() => selectExisting(l)} title="تعديل">
                    {l.name}
                  </button>
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
              type="number"
              step="0.000001"
              value={draft ? toFixed(draft.lat) : ""}
              onChange={(e) => draft && setDraft({ ...draft, lat: Number(e.target.value) })}
              disabled={!draft}
            />

            <Label>خط الطول</Label>
            <Input
              type="number"
              step="0.000001"
              value={draft ? toFixed(draft.lng) : ""}
              onChange={(e) => draft && setDraft({ ...draft, lng: Number(e.target.value) })}
              disabled={!draft}
            />

            <Label>نصف القطر (م)</Label>
            <div className="flex items-center gap-2">
              <Slider value={[radiusM]} min={5} max={500} step={1} onValueChange={(v) => setRadiusM(v[0])} disabled={!draft} />
              <Input className="w-20" type="number" value={radiusM} onChange={(e) => setRadiusM(clamp(Number(e.target.value), 1, 1000))} disabled={!draft} />
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
            <Button onClick={handleSave} disabled={!draft}>
              <Save className="mr-1 h-4 w-4" /> حفظ
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={!draft}>
              إلغاء
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
