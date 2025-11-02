import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map, LngLatLike, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/styles/map.css";
import * as turf from "@turf/turf";
import { trpc } from "@/lib/trpc";

const DIRIYYAH_CENTER: [number, number] = [46.67, 24.74];
const DIRIYYAH_ZOOM = 13;

/** نجبر الستايل على fallback لتفادي أي reset للكاميرا */
const STYLE_FALLBACK = "https://demotiles.maplibre.org/style.json";

type StyleJSON = {
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeEnabled?: boolean;
};
const parseStyle = (s?: string | null): StyleJSON => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const styleJSON = (o: StyleJSON) => JSON.stringify(o ?? {});
const circlePolygonFor = (lng: number, lat: number, r: number) =>
  turf.circle([lng, lat], Math.max(1, r), { units: "meters", steps: 64 });

type Mode = "view" | "edit" | "create";

export default function MapPage() {
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const loadedRef = useRef(false);

  const [mode, setMode] = useState<Mode>("view");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // API
  const listQ   = trpc.locations.list.useQuery();
  const getQ    = trpc.locations.getById.useQuery({ id: selectedId ?? 0 }, { enabled: selectedId != null });
  const createM = trpc.locations.create.useMutation();
  const updateM = trpc.locations.update.useMutation();
  const deleteM = trpc.locations.delete.useMutation();

  const listData: any[] = listQ.data ?? [];
  const selectedLoc = useMemo(() => listData.find((x) => Number(x.id) === selectedId), [listData, selectedId]);

  // محرر
  const s0 = parseStyle(selectedLoc?.notes);
  const [edit, setEdit] = useState({
    name: "", description: "", type: "mixed" as "mixed"|"security"|"traffic",
    radius: 50,
    fill: s0.fill ?? "#f59e0b",
    fillOpacity: s0.fillOpacity ?? 0.25,
    stroke: s0.stroke ?? "#b45309",
    strokeWidth: s0.strokeWidth ?? 2,
    strokeEnabled: s0.strokeEnabled ?? true,
  });

  useEffect(() => {
    if (!selectedLoc) return;
    const s = parseStyle(selectedLoc.notes);
    setEdit({
      name: selectedLoc.name ?? "",
      description: selectedLoc.description ?? "",
      type: (selectedLoc.locationType as any) ?? "mixed",
      radius: Number(selectedLoc.radius ?? 50),
      fill: s.fill ?? "#f59e0b",
      fillOpacity: s.fillOpacity ?? 0.25,
      stroke: s.stroke ?? "#b45309",
      strokeWidth: s.strokeWidth ?? 2,
      strokeEnabled: s.strokeEnabled ?? true,
    });
  }, [selectedLoc?.id]);

  // مسودة الإنشاء
  const [draft, setDraft] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

  // GeoJSON
  const geojson = useMemo(() => {
    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    for (const loc of listData) {
      const lat = Number(loc.latitude), lng = Number(loc.longitude);
      const radius = Number(loc.radius ?? 50);
      const st = parseStyle(loc.notes);
      const poly = circlePolygonFor(lng, lat, radius);
      fc.features.push({
        type: "Feature", id: Number(loc.id), geometry: poly.geometry,
        properties: {
          id: Number(loc.id), name: loc.name, type: loc.locationType, radius,
          fill: st.fill ?? "#f59e0b", fillOpacity: st.fillOpacity ?? 0.25,
          stroke: st.stroke ?? "#b45309", strokeWidth: st.strokeWidth ?? 2,
          strokeEnabled: st.strokeEnabled ?? true, lat, lng,
        },
      } as any);
    }
    if (mode === "create" && draft.lat != null && draft.lng != null) {
      const poly = circlePolygonFor(draft.lng, draft.lat, edit.radius);
      fc.features.push({
        type: "Feature", id: -1, geometry: poly.geometry,
        properties: {
          id: -1, name: edit.name || "موقع جديد", type: edit.type, radius: edit.radius,
          fill: edit.fill, fillOpacity: edit.fillOpacity, stroke: edit.stroke, strokeWidth: edit.strokeWidth,
          strokeEnabled: edit.strokeEnabled, lat: draft.lat, lng: draft.lng,
        },
      } as any);
    }
    return fc;
  }, [
    listData, mode, draft,
    edit.radius, edit.fill, edit.fillOpacity, edit.stroke, edit.strokeWidth, edit.strokeEnabled, edit.name, edit.type
  ]);

  const geojsonRef = useRef<GeoJSON.FeatureCollection>(geojson);
  useEffect(() => { geojsonRef.current = geojson; }, [geojson]);

  const setSourceData = (data?: GeoJSON.FeatureCollection) => {
    const src = mapRef.current?.getSource("locations-src") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const payload = data ?? geojsonRef.current;
    // clone بسيط لتفادي cache داخلي
    src.setData(JSON.parse(JSON.stringify(payload)));
  };

  // تهيئة الخريطة مرة واحدة فقط
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: "map",
      style: STYLE_FALLBACK,           // 👈 ثابت
      center: DIRIYYAH_CENTER as LngLatLike,
      zoom: DIRIYYAH_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    requestAnimationFrame(() => map.resize());

    const prepare = () => {
      if (map.getSource("locations-src")) return;
      map.addSource("locations-src", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id" });

      map.addLayer({
        id: "loc-fill", type: "fill", source: "locations-src",
        paint: {
          "fill-color": ["coalesce", ["get","fill"], "#f59e0b"],
          "fill-opacity": ["coalesce", ["get","fillOpacity"], 0.25],
        }
      });

      map.addLayer({
        id: "loc-outline", type: "line", source: "locations-src",
        layout: { "line-cap":"round", "line-join":"round" },
        paint: {
          "line-color": ["coalesce", ["get","stroke"], "#b45309"],
          "line-width": ["coalesce", ["get","strokeWidth"], 2],
          "line-opacity": ["case", ["==", ["get","strokeEnabled"], true], 1, 0],
        }
      });

      map.addLayer({
        id: "loc-center", type: "circle", source: "locations-src",
        paint: { "circle-radius": 4, "circle-color": ["coalesce", ["get","stroke"], "#7c2d12"] }
      });
    };

    map.on("load", () => {
      loadedRef.current = true;
      prepare();
      setSourceData();
      setTimeout(() => map.resize(), 0);
    });

    // Hover
    const onEnter = () => (map.getCanvas().style.cursor = "pointer");
    const onLeave = () => { map.getCanvas().style.cursor = ""; popupRef.current?.remove(); };
    const onMove  = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]; if (!f) return;
      const p = f.properties as any;
      const html = `<div style="font-family:system-ui;min-width:220px">
        <div style="font-weight:600;margin-bottom:4px">${p.name ?? "موقع"}</div>
        <div style="font-size:12px;opacity:.8">النوع: ${p.type}</div>
        <div style="font-size:12px;opacity:.8">النطاق: ${p.radius} م</div>
      </div>`;
      if (!popupRef.current)
        popupRef.current = new maplibregl.Popup({ closeButton:false, closeOnClick:false, offset:8 });
      popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
    };
    const onClickFill = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const id = Number((f?.id ?? (f?.properties as any)?.id) as any);
      if (!Number.isFinite(id)) return;
      setSelectedId(id);
      setMode("edit");
    };

    map.on("mouseenter", "loc-fill", onEnter);
    map.on("mouseleave", "loc-fill", onLeave);
    map.on("mousemove", "loc-fill", onMove);
    map.on("click", "loc-fill", onClickFill);

    // اختيار مركز الدائرة في وضع الإنشاء
    const onClickMap = (e: maplibregl.MapMouseEvent & maplibregl.EventData) => {
      if (mode !== "create") return;
      const { lng, lat } = e.lngLat.wrap();
      setDraft({ lat, lng });

      const current = geojsonRef.current;
      const draftFeat: any = {
        type: "Feature", id: -1,
        geometry: circlePolygonFor(lng, lat, edit.radius).geometry,
        properties: {
          id: -1, name: edit.name || "موقع جديد", type: edit.type, radius: edit.radius,
          fill: edit.fill, fillOpacity: edit.fillOpacity, stroke: edit.stroke, strokeWidth: edit.strokeWidth,
          strokeEnabled: edit.strokeEnabled, lat, lng,
        },
      };
      const updated = { ...current, features: [...current.features.filter((f:any)=>f.id!==-1), draftFeat] } as GeoJSON.FeatureCollection;
      geojsonRef.current = updated;
      setSourceData(updated);
    };
    map.on("click", onClickMap);

    const onResize = () => map.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []); // مرة واحدة فقط

  // كل تعديل على geojson → setData فقط (بدون تعديل الكاميرا)
  useEffect(() => {
    if (!mapRef.current) return;
    if (loadedRef.current) setSourceData();
    else mapRef.current.once("load", setSourceData);
  }, [geojson]);

  // معاينة فورية
  function live(partial: Partial<typeof edit>) {
    setEdit((prev) => {
      const next = { ...prev, ...partial };
      const current = geojsonRef.current;

      const newFeatures = current.features.map((feat: any) => {
        const isDraft = feat.id === -1 && mode === "create";
        const isSelected = Number(feat.id) === selectedId && mode === "edit";
        if (!isDraft && !isSelected) return feat;

        const p = { ...feat.properties };
        p.fill = next.fill; p.fillOpacity = next.fillOpacity;
        p.stroke = next.stroke; p.strokeWidth = next.strokeWidth;
        p.strokeEnabled = !!next.strokeEnabled; p.radius = next.radius;

        const poly = circlePolygonFor(Number(p.lng), Number(p.lat), next.radius);
        return { ...feat, properties: p, geometry: poly.geometry };
      });

      const updated = { ...current, features: newFeatures } as GeoJSON.FeatureCollection;
      geojsonRef.current = updated;
      setSourceData(updated);
      return next;
    });
  }

  // حفظ/حذف/إنشاء
  async function saveEdit() {
    if (selectedId == null) return;
    const notes = styleJSON({
      fill: edit.fill, fillOpacity: edit.fillOpacity,
      stroke: edit.stroke, strokeWidth: edit.strokeWidth,
      strokeEnabled: edit.strokeEnabled,
    });
    try {
      await updateM.mutateAsync({ id: selectedId, name: edit.name, description: edit.description, locationType: edit.type, radius: edit.radius, notes } as any);
    } catch {
      await fetch(`/api/locations/${selectedId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ name: edit.name, description: edit.description, locationType: edit.type, radius: edit.radius, notes }) });
    }
    await listQ.refetch(); setMode("view"); setSelectedId(null);
  }

  async function deleteLoc() {
    if (selectedId == null) return;
    if (!confirm("حذف هذا الموقع؟")) return;
    try { await deleteM.mutateAsync({ id: selectedId }); }
    catch { await fetch(`/api/locations/${selectedId}`, { method: "DELETE", credentials: "include" }); }
    await listQ.refetch(); setMode("view"); setSelectedId(null);
  }

  async function saveCreate() {
    if (draft.lat == null || draft.lng == null) { alert("اضغط على الخريطة لتحديد المركز."); return; }
    try {
      await createM.mutateAsync({
        name: edit.name || "موقع", description: edit.description || null,
        latitude: String(draft.lat), longitude: String(draft.lng),
        locationType: edit.type, radius: edit.radius,
        notes: styleJSON({ fill: edit.fill, fillOpacity: edit.fillOpacity, stroke: edit.stroke, strokeWidth: edit.strokeWidth, strokeEnabled: edit.strokeEnabled }),
      } as any);
    } catch {
      await fetch(`/api/locations`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ name: edit.name || "موقع", description: edit.description || null, latitude: draft.lat, longitude: draft.lng,
          locationType: edit.type, radius: edit.radius, notes: styleJSON({ fill: edit.fill, fillOpacity: edit.fillOpacity, stroke: edit.stroke, strokeWidth: edit.strokeWidth, strokeEnabled: edit.strokeEnabled }) }) });
    }
    await listQ.refetch(); cancel();
  }

  function cancel() {
    setMode("view"); setSelectedId(null); setDraft({ lat: null, lng: null });
    const current = geojsonRef.current as GeoJSON.FeatureCollection;
    const updated = { ...current, features: current.features.filter((f:any)=>f.id!==-1) } as GeoJSON.FeatureCollection;
    geojsonRef.current = updated; setSourceData(updated);
  }

  // UI
  return (
    <div className="maplibre-page">
      <div id="map" />

      {/* لستة المواقع + زر جديد */}
      <div className="map-panel" style={{ position:"absolute", left:16, top:16, width:260, maxHeight:"80vh", overflow:"auto" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontWeight:700 }}>المواقع</div>
          <button className="btn secondary" onClick={() => { setMode("create"); setSelectedId(null); setDraft({ lat:null, lng:null }); }}>
            موقع جديد
          </button>
        </div>
        {(listData ?? []).map((it) => (
          <div className="list-item" key={it.id}>
            <div className="truncate" title={it.name}>{it.name ?? `#${it.id}`}</div>
            <button className="btn secondary" onClick={() => { setSelectedId(Number(it.id)); setMode("edit"); }}>
              تعديل
            </button>
          </div>
        ))}
      </div>

      {/* محرر التعديل */}
      {mode === "edit" && selectedLoc && (
        <div className="map-panel" style={{ position:"absolute", right:16, top:16, width:380, maxHeight:"92vh", overflow:"auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div style={{ fontWeight:700 }}>تعديل الموقع</div>
            <button className="btn secondary" onClick={cancel}>إغلاق</button>
          </div>

          <div className="form-row"><label>اسم الموقع</label>
            <input type="text" value={edit.name} onChange={(e)=>setEdit(s=>({...s,name:e.target.value}))} />
          </div>
          <div className="form-row"><label>الوصف</label>
            <textarea rows={3} value={edit.description} onChange={(e)=>setEdit(s=>({...s,description:e.target.value}))} />
          </div>
          <div className="form-row"><label>نوع الموقع</label>
            <select value={edit.type} onChange={(e)=>setEdit(s=>({...s,type:e.target.value as any}))}>
              <option value="mixed">مختلط</option><option value="security">أمني</option><option value="traffic">مروري</option>
            </select>
          </div>

          <div className="form-row"><label>نطاق التمركز (متر): {edit.radius}</label>
            <input className="range" type="range" min={5} max={500} step={5} value={edit.radius}
              onChange={(e)=>live({ radius:Number(e.target.value) })} />
          </div>

          <hr style={{ margin:"12px 0" }} />

          <div className="form-row"><label>لون التعبئة</label>
            <input type="color" value={edit.fill} onChange={(e)=>live({ fill:e.target.value })} />
          </div>
          <div className="form-row"><label>شفافية التعبئة: {edit.fillOpacity.toFixed(2)}</label>
            <input className="range" type="range" min={0} max={1} step={0.05} value={edit.fillOpacity}
              onChange={(e)=>live({ fillOpacity:Number(e.target.value) })} />
          </div>
          <div className="form-row" style={{ display:"flex", alignItems:"center", gap:8 }}>
            <input id="strokeEnabled_edit" type="checkbox" checked={!!edit.strokeEnabled}
              onChange={(e)=>live({ strokeEnabled:e.target.checked })} />
            <label htmlFor="strokeEnabled_edit" style={{ margin:0 }}>تفعيل الحدود</label>
          </div>
          <div className="form-row"><label>لون الحدود</label>
            <input type="color" disabled={!edit.strokeEnabled} value={edit.stroke}
              onChange={(e)=>live({ stroke:e.target.value })} />
          </div>
          <div className="form-row"><label>عرض الحدود (px): {edit.strokeWidth}</label>
            <input className="range" type="range" min={0} max={10} step={1} disabled={!edit.strokeEnabled} value={edit.strokeWidth}
              onChange={(e)=>live({ strokeWidth:Number(e.target.value) })} />
          </div>

          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button className="btn" onClick={saveEdit}>حفظ التعديلات</button>
            <button className="btn red" onClick={deleteLoc}>حذف</button>
          </div>
        </div>
      )}

      {/* محرر الإنشاء */}
      {mode === "create" && (
        <div className="map-panel" style={{ position:"absolute", right:16, top:16, width:380, maxHeight:"92vh", overflow:"auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div style={{ fontWeight:700 }}>إنشاء موقع جديد</div>
            <button className="btn secondary" onClick={cancel}>إلغاء</button>
          </div>

          <div style={{ background:"#f8fafc", border:"1px dashed #cbd5e1", borderRadius:8, padding:10, fontSize:13, color:"#334155", marginBottom:10 }}>
            اضغط على الخريطة لاختيار مركز الدائرة (تظهر فورًا).
          </div>

          <div className="form-row"><label>اسم الموقع</label>
            <input type="text" value={edit.name} onChange={(e)=>setEdit(s=>({...s,name:e.target.value}))} />
          </div>
          <div className="form-row"><label>الوصف</label>
            <textarea rows={3} value={edit.description} onChange={(e)=>setEdit(s=>({...s,description:e.target.value}))} />
          </div>
          <div className="form-row"><label>نوع الموقع</label>
            <select value={edit.type} onChange={(e)=>setEdit(s=>({...s,type:e.target.value as any}))}>
              <option value="mixed">مختلط</option><option value="security">أمني</option><option value="traffic">مروري</option>
            </select>
          </div>
          <div className="form-row"><label>نطاق التمركز (متر): {edit.radius}</label>
            <input className="range" type="range" min={5} max={500} step={5} value={edit.radius}
              onChange={(e)=>live({ radius:Number(e.target.value) })} />
          </div>

          <hr style={{ margin:"12px 0" }} />

          <div className="form-row"><label>لون التعبئة</label>
            <input type="color" value={edit.fill} onChange={(e)=>live({ fill:e.target.value })} />
          </div>
          <div className="form-row"><label>شفافية التعبئة: {edit.fillOpacity.toFixed(2)}</label>
            <input className="range" type="range" min={0} max={1} step={0.05} value={edit.fillOpacity}
              onChange={(e)=>live({ fillOpacity:Number(e.target.value) })} />
          </div>
          <div className="form-row" style={{ display:"flex", alignItems:"center", gap:8 }}>
            <input id="strokeEnabled_new" type="checkbox" checked={!!edit.strokeEnabled}
              onChange={(e)=>live({ strokeEnabled:e.target.checked })} />
            <label htmlFor="strokeEnabled_new" style={{ margin:0 }}>تفعيل الحدود</label>
          </div>
          <div className="form-row"><label>لون الحدود</label>
            <input type="color" disabled={!edit.strokeEnabled} value={edit.stroke}
              onChange={(e)=>live({ stroke:e.target.value })} />
          </div>
          <div className="form-row"><label>عرض الحدود (px): {edit.strokeWidth}</label>
            <input className="range" type="range" min={0} max={10} step={1} disabled={!edit.strokeEnabled} value={edit.strokeWidth}
              onChange={(e)=>live({ strokeWidth:Number(e.target.value) })} />
          </div>

          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button className="btn" onClick={saveCreate} disabled={draft.lat == null || draft.lng == null}>حفظ الموقع</button>
            <button className="btn secondary" onClick={cancel}>إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
