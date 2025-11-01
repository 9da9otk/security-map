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

type StyleJSON = {
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
};

function parseStyleNotes(notes?: string | null): StyleJSON {
  if (!notes) return {};
  try {
    const obj = JSON.parse(notes);
    if (obj && typeof obj === "object") return obj as StyleJSON;
    return {};
  } catch {
    return {};
  }
}
function stringifyStyleNotes(style: StyleJSON): string {
  return JSON.stringify(style ?? {});
}
function circlePolygonFor(lng: number, lat: number, radiusMeters: number) {
  const circle = turf.circle([lng, lat], Math.max(1, radiusMeters), {
    units: "meters",
    steps: 64,
  });
  return circle;
}

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

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // API
  const listQ = trpc.locations.list.useQuery();
  const getQ = trpc.locations.getById.useQuery(
    { id: selectedId as number },
    { enabled: selectedId != null }
  );
  const updateM = trpc.locations.update.useMutation();
  const deleteM = trpc.locations.delete.useMutation();

  const pplListQ = trpc.personnel.listByLocation.useQuery(
    { locationId: selectedId as number },
    { enabled: selectedId != null }
  );
  const pplCreateM = trpc.personnel.create.useMutation();
  const pplDeleteM = trpc.personnel.delete.useMutation();

  // init map
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
      map.addSource("locations-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id",
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

      map.on("mouseenter", "loc-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "loc-fill", () => {
        map.getCanvas().style.cursor = "";
        hideHoverPopup();
      });
      map.on("mousemove", "loc-fill", (e) => showHoverPopup(e));
      map.on("click", "loc-fill", (e) => {
        const raw = e.features?.[0]?.properties?.id as any;
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
    };
  }, []);

  // GeoJSON
  const geojson = useMemo(() => {
    if (!listQ.data) return { type: "FeatureCollection", features: [] } as turf.FeatureCollection;

    const features = listQ.data.map((loc) => {
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      const radius = Number(loc.radius || 30);
      const style = parseStyleNotes(loc.notes);

      const poly = circlePolygonFor(lng, lat, radius);
      const properties = {
        id: Number(loc.id), // ← مهم: رقم
        name: loc.name,
        type: loc.locationType,
        radius,
        fill: style.fill ?? "#f59e0b",
        fillOpacity: style.fillOpacity ?? 0.25,
        stroke: style.stroke ?? "#b45309",
        strokeWidth: style.strokeWidth ?? 2,
        lat,
        lng,
      };

      return {
        type: "Feature",
        geometry: poly.geometry,
        properties,
      } as turf.Feature;
    });

    return { type: "FeatureCollection", features } as turf.FeatureCollection;
  }, [listQ.data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("locations-src") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(geojson as any);
  }, [geojson]);

  // hover popup
  function showHoverPopup(e: MapLayerMouseEvent) {
    const map = mapRef.current!;
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties as any;
    const html = `
      <div style="font-family: system-ui; min-width:220px">
        <div style="font-weight:600; margin-bottom:4px">${p.name ?? "موقع"}</div>
        <div style="font-size:12px; opacity:.8">النوع: ${p.type}</div>
        <div style="font-size:12px; opacity:.8">النطاق: ${p.radius} م</div>
        <div style="font-size:12px; opacity:.8">الإحداثيات: ${(+p.lat).toFixed(6)}, ${(+p.lng).toFixed(6)}</div>
        <div style="margin-top:6px; font-size:12px; color:#555">انقر للتعديل…</div>
      </div>
    `;
    if (!popupRef.current) {
      popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    }
    popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
  }
  function hideHoverPopup() {
    popupRef.current?.remove();
  }

  // editor state
  const loc = getQ.data;
  const style = useMemo<StyleJSON>(() => parseStyleNotes(loc?.notes), [loc?.notes]);
  const [edit, setEdit] = useState({
    name: "",
    description: "",
    type: "mixed" as "mixed" | "security" | "traffic",
    radius: 30,
    fill: style.fill ?? "#f59e0b",
    fillOpacity: style.fillOpacity ?? 0.25,
    stroke: style.stroke ?? "#b45309",
    strokeWidth: style.strokeWidth ?? 2,
  });

  useEffect(() => {
    if (!loc) return;
    const s = parseStyleNotes(loc.notes);
    setEdit({
      name: loc.name ?? "",
      description: loc.description ?? "",
      type: (loc.locationType as any) ?? "mixed",
      radius: Number(loc.radius ?? 30),
      fill: s.fill ?? "#f59e0b",
      fillOpacity: s.fillOpacity ?? 0.25,
      stroke: s.stroke ?? "#b45309",
      strokeWidth: s.strokeWidth ?? 2,
    });
  }, [loc?.id]);

  async function saveChanges() {
    if (selectedId == null) return;
    await updateM.mutateAsync({
      id: selectedId,
      name: edit.name,
      description: edit.description,
      locationType: edit.type,
      radius: edit.radius,
      notes: stringifyStyleNotes({
        fill: edit.fill,
        fillOpacity: edit.fillOpacity,
        stroke: edit.stroke,
        strokeWidth: edit.strokeWidth,
      }),
    });
    await Promise.all([getQ.refetch(), listQ.refetch()]);
  }

  async function deleteLocation() {
    if (selectedId == null) return;
    if (!confirm("حذف هذا الموقع؟")) return;
    await deleteM.mutateAsync({ id: selectedId });
    setEditorOpen(false);
    setSelectedId(null);
    await listQ.refetch();
  }

  async function addPerson(name: string, role?: string) {
    if (selectedId == null) return;
    await pplCreateM.mutateAsync({ locationId: selectedId, name, role: role ?? "" });
    await pplListQ.refetch();
  }
  async function removePerson(id: number | string) {
    await pplDeleteM.mutateAsync({ id: Number(id) });
    await pplListQ.refetch();
  }

  return (
    <div className="w-full h-full relative">
      <div id="map" className="absolute inset-0" />

      {editorOpen && loc && (
        <div className="absolute top-4 right-4 w-[360px] max-h-[92vh] overflow-auto z-20">
          <Card className="shadow-2xl">
            <CardHeader className="flex justify-between items-center">
              <CardTitle className="text-base">تعديل الموقع</CardTitle>
              <div className="flex gap-2">
                <Button size="icon" variant="secondary" onClick={() => setEditorOpen(false)}>
                  <X size={16} />
                </Button>
              </div>
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

              <hr className="my-2" />

              <div className="space-y-2">
                <div className="font-semibold text-sm">أفراد الأمن</div>
                <div className="space-y-2">
                  {(pplListQ.data ?? []).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between border rounded p-2 text-sm">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        {!!p.role && <div className="opacity-70">{p.role}</div>}
                      </div>
                      <Button size="icon" variant="destructive" onClick={() => removePerson(p.id)}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  ))}
                  <AddPersonRow onAdd={addPerson} />
                </div>
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

function AddPersonRow({ onAdd }: { onAdd: (name: string, role?: string) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  return (
    <div className="flex gap-2">
      <Input placeholder="اسم الفرد" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="الوظيفة/الدور" value={role} onChange={(e) => setRole(e.target.value)} />
      <Button onClick={() => { if (name.trim()) { onAdd(name.trim(), role.trim() || undefined); setName(""); setRole(""); }}}>
        <Plus size={16} className="mr-1" /> إضافة
      </Button>
    </div>
  );
}
