// src/pages/MapPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map, LngLatLike, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as turf from "@turf/turf";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2, Save, X } from "lucide-react";

const DIRIYYAH_CENTER: [number, number] = [46.67, 24.74];
const DIRIYYAH_ZOOM = 13;

type StyleJSON = { fill?: string; fillOpacity?: number; stroke?: string; strokeWidth?: number };
const parseStyle = (s?: string | null): StyleJSON => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const styleJSON = (o: StyleJSON) => JSON.stringify(o ?? {});

const circlePolygonFor = (lng: number, lat: number, r: number) =>
  turf.circle([lng, lat], Math.max(1, r), { units: "meters", steps: 64 });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

export default function MapPage() {
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const mapLoadedRef = useRef(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // ===== API hooks
  const listQ = trpc.locations.list.useQuery();
  const getQ = trpc.locations.getById.useQuery(
    { id: (selectedId ?? 0) as number },
    { enabled: selectedId != null, refetchOnWindowFocus: false }
  );
  const updateM = trpc.locations.update.useMutation();
  const deleteM = trpc.locations.delete.useMutation();

  const pplListQ = trpc.personnel.listByLocation.useQuery(
    { locationId: (selectedId ?? 0) as number },
    { enabled: selectedId != null }
  );
  const pplCreateM = trpc.personnel.create.useMutation();
  const pplDeleteM = trpc.personnel.delete.useMutation();

  // ===== Build GeoJSON from API
  const geojson = useMemo(() => {
    if (!listQ.data) return { type: "FeatureCollection", features: [] } as turf.FeatureCollection;
    const features = listQ.data.map((loc: any) => {
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      const radius = Number(loc.radius ?? 30);
      const s = parseStyle(loc.notes);
      const poly = circlePolygonFor(lng, lat, radius);
      return {
        type: "Feature",
        geometry: poly.geometry,
        properties: {
          id: Number(loc.id),
          name: loc.name,
          type: loc.locationType,
          radius,
          fill: s.fill ?? "#f59e0b",
          fillOpacity: s.fillOpacity ?? 0.25,
          stroke: s.stroke ?? "#b45309",
          strokeWidth: s.strokeWidth ?? 2,
          lat, lng,
        },
      } as turf.Feature;
    });
    return { type: "FeatureCollection", features } as turf.FeatureCollection;
  }, [listQ.data]);

  // احتفظ بآخر GeoJSON حتى لو تأخر load
  const geojsonRef = useRef<any>(geojson);
  useEffect(() => { geojsonRef.current = geojson; }, [geojson]);

  // Helper: setData بأمان
  function setSourceDataSafe() {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("locations-src") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(geojsonRef.current as any);
  }

  // ===== Init map
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: "map",
      style: `https://api.maptiler.com/maps/streets/style.json?key=${import.meta.env.VITE_MAPTILER_KEY}`,
      center: DIRIYYAH_CENTER as LngLatLike,
      zoom: DIRIYYAH_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      mapLoadedRef.current = true;

      map.addSource("locations-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id", // نروّج خاصية id إلى feature.id
      });

      map.addLayer({
        id: "loc-fill",
        type: "fill",
        source: "locations-src",
        paint: {
          "fill-color": ["coalesce", ["get", "fill"], "#f59e0b"],
          "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.25],
        },
      });

      map.addLayer({
        id: "loc-outline",
        type: "line",
        source: "locations-src",
        paint: {
          "line-color": ["coalesce", ["get", "stroke"], "#b45309"],
          "line-width": ["coalesce", ["get", "strokeWidth"], 2],
        },
      });

      map.addLayer({
        id: "loc-center",
        type: "circle",
        source: "locations-src",
        paint: {
          "circle-radius": 4,
          "circle-color": ["coalesce", ["get", "stroke"], "#7c2d12"],
        },
      });

      // ضخ البيانات الحالية فور التحميل
      setSourceDataSafe();

      map.on("mouseenter", "loc-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "loc-fill", () => { map.getCanvas().style.cursor = ""; hideHoverPopup(); });
      map.on("mousemove", "loc-fill", (e) => showHoverPopup(e));
      map.on("click", "loc-fill", (e) => {
        const f = e.features?.[0];
        const raw = (f && (f.id as any)) ?? (f?.properties as any)?.id; // feature.id أولاً
        const id = raw != null ? Number(raw) : NaN;
        if (!Number.isFinite(id)) return;
        console.log("[map] clicked feature id:", id);
        setSelectedId(id);
        setEditorOpen(true);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, []);

  // حدّث المصدر كل ما تغيّر geojson (حتى لو الـ style متأخر)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mapLoadedRef.current) {
      setSourceDataSafe();
    } else {
      map.once("load", setSourceDataSafe);
    }
  }, [geojson]);

  // ===== Hover popup
  function showHoverPopup(e: MapLayerMouseEvent) {
    const map = mapRef.current!;
    const f = e.features?.[0]; if (!f) return;
    const p = f.properties as any;
    const html = `<div style="font-family: system-ui; min-width:220px">
      <div style="font-weight:600; margin-bottom:4px">${p.name ?? "موقع"}</div>
      <div style="font-size:12px; opacity:.8">النوع: ${p.type}</div>
      <div style="font-size:12px; opacity:.8">النطاق: ${p.radius} م</div>
      <div style="font-size:12px; opacity:.8">الإحداثيات: ${(+p.lat).toFixed(6)}, ${(+p.lng).toFixed(6)}</div>
      <div style="margin-top:6px; font-size:12px; color:#555">انقر للتعديل…</div>
    </div>`;
    if (!popupRef.current) popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
  }
  function hideHoverPopup() { popupRef.current?.remove(); }

  // ===== Editor state
  const loc = getQ.data as any;
  const s = parseStyle(loc?.notes);
  const [edit, setEdit] = useState({
    name: "", description: "", type: "mixed" as "mixed" | "security" | "traffic",
    radius: 30, fill: s.fill ?? "#f59e0b", fillOpacity: s.fillOpacity ?? 0.25,
    stroke: s.stroke ?? "#b45309", strokeWidth: s.strokeWidth ?? 2,
  });

  useEffect(() => {
    if (!loc) return;
    const st = parseStyle(loc.notes);
    setEdit({
      name: loc.name ?? "",
      description: loc.description ?? "",
      type: (loc.locationType as any) ?? "mixed",
      radius: Number(loc.radius ?? 30),
      fill: st.fill ?? "#f59e0b",
      fillOpacity: st.fillOpacity ?? 0.25,
      stroke: st.stroke ?? "#b45309",
      strokeWidth: st.strokeWidth ?? 2,
    });
  }, [loc?.id]);

  // ===== Save / Delete
  async function saveChanges() {
    if (selectedId == null) return;
    const notes = styleJSON({
      fill: edit.fill,
      fillOpacity: edit.fillOpacity,
      stroke: edit.stroke,
      strokeWidth: edit.strokeWidth,
    });

    try {
      await updateM.mutateAsync({
        id: selectedId,
        name: edit.name,
        description: edit.description,
        locationType: edit.type,
        radius: edit.radius,
        notes,
      });
    } catch (e) {
      console.warn("[tRPC update failed] falling back to REST", e);
      await fetch(`/api/locations/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: edit.name,
          description: edit.description,
          locationType: edit.type,
          radius: edit.radius,
          notes,
        }),
      });
    }

    await Promise.all([getQ.refetch(), listQ.refetch()]);
  }

  async function deleteLocation() {
    if (selectedId == null) return;
    if (!confirm("حذف هذا الموقع؟")) return;
    try {
      await deleteM.mutateAsync({ id: selectedId });
    } catch {
      await fetch(`/api/locations/${selectedId}`, { method: "DELETE", credentials: "include" });
    }
    setEditorOpen(false);
    setSelectedId(null);
    await listQ.refetch();
  }

  // ===== Personnel helpers (اختياري/مبسط)
  async function addPerson(name: string, role?: string) {
    if (selectedId == null) return;
    try {
      await pplCreateM.mutateAsync({ locationId: selectedId, name, role: role ?? "" });
    } catch {
      await fetch(`/api/personnel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ locationId: selectedId, name, role: role ?? "" }),
      });
    }
    await pplListQ.refetch();
  }

  async function removePerson(id: number | string) {
    try {
      await pplDeleteM.mutateAsync({ id: Number(id) });
    } catch {
      await fetch(`/api/personnel/${id}`, { method: "DELETE", credentials: "include" });
    }
    await pplListQ.refetch();
  }

  return (
    <div className="w-full h-full relative">
      {/* الخريطة */}
      <div id="map" className="absolute inset-0" />

      {/* قائمة مواقع (بديل سريع لفتح المحرّر) */}
      <div className="absolute left-4 top-4 w-[260px] max-h-[80vh] overflow-auto z-20">
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-sm">المواقع</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(listQ.data ?? []).map((it: any) => (
              <div key={it.id} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                <div className="truncate">{it.name ?? `#${it.id}`}</div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { setSelectedId(Number(it.id)); setEditorOpen(true); }}
                >
                  تعديل
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* المحرّر */}
      {editorOpen && loc && (
        <div className="absolute top-4 right-4 w-[360px] max-h-[92vh] overflow-auto z-20">
          <Card className="shadow-2xl">
            <CardHeader className="flex justify-between items-center">
              <CardTitle className="text-base">تعديل الموقع</CardTitle>
              <Button size="icon" variant="secondary" onClick={() => setEditorOpen(false)}>
                <X size={16} />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <FieldRow label="اسم الموقع">
                  <Input value={edit.name} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} />
                </FieldRow>
                <FieldRow label="الوصف">
                  <Textarea rows={3} value={edit.description} onChange={(e) => setEdit((s) => ({ ...s, description: e.target.value }))} />
                </FieldRow>
                <FieldRow label="نوع الموقع">
                  <Select value={edit.type} onValueChange={(v: any) => setEdit((s) => ({ ...s, type: v }))}>
                    <SelectTrigger><SelectValue placeholder="نوع" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mixed">مختلط</SelectItem>
                      <SelectItem value="security">أمني</SelectItem>
                      <SelectItem value="traffic">مروري</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
                <FieldRow label={`نطاق التمركز (متر): ${edit.radius}`}>
                  <Slider value={[edit.radius]} min={5} max={500} step={5} onValueChange={(v) => setEdit((s) => ({ ...s, radius: v[0] }))} />
                </FieldRow>
              </div>

              <hr className="my-2" />

              <div className="space-y-3">
                <div className="font-semibold text-sm">نمط الدائرة</div>
                <FieldRow label="لون التعبئة">
                  <input type="color" value={edit.fill} onChange={(e) => setEdit((s) => ({ ...s, fill: e.target.value }))} />
                </FieldRow>
                <FieldRow label={`شفافية التعبئة: ${edit.fillOpacity}`}>
                  <Slider value={[edit.fillOpacity]} min={0} max={1} step={0.05} onValueChange={(v) => setEdit((s) => ({ ...s, fillOpacity: v[0] }))} />
                </FieldRow>
                <FieldRow label="لون الحدود">
                  <input type="color" value={edit.stroke} onChange={(e) => setEdit((s) => ({ ...s, stroke: e.target.value }))} />
                </FieldRow>
                <FieldRow label={`عرض الحدود (px): ${edit.strokeWidth}`}>
                  <Slider value={[edit.strokeWidth]} min={0} max={10} step={1} onValueChange={(v) => setEdit((s) => ({ ...s, strokeWidth: v[0] }))} />
                </FieldRow>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={saveChanges} className="flex-1">
                  <Save size={16} className="mr-2" /> حفظ التعديلات
                </Button>
                <Button variant="destructive" onClick={deleteLocation}>
                  <Trash2 size={16} className="mr-2" /> حذف
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
