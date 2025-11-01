import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map, LngLatLike, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/styles/map.css";
import * as turf from "@turf/turf";

// OPTIONAL: لو كان عندك tRPC، خلّه، وإلا أشّر السطور الخاصة به
import { trpc } from "@/lib/trpc"; // إن ما عندك، علّق الاستيراد واستخدم REST فقط

const DIRIYYAH_CENTER: [number, number] = [46.67, 24.74];
const DIRIYYAH_ZOOM = 13;

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
const STYLE_MAPTILER = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`
  : null;
const STYLE_FALLBACK = "https://demotiles.maplibre.org/style.json";

// ---------------- utils ----------------
type StyleJSON = {
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeEnabled?: boolean;
};
const parseStyle = (s?: string | null): StyleJSON => {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
};
const styleJSON = (o: StyleJSON) => JSON.stringify(o ?? {});
const circlePolygonFor = (lng: number, lat: number, r: number) =>
  turf.circle([lng, lat], Math.max(1, r), { units: "meters", steps: 64 });

// ---------------- component ----------------
export default function MapPage() {
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const loadedRef = useRef(false);

  // مصدر البيانات: نحاول عبر tRPC، ولو فشل نستخدم REST
  const listQ = trpc?.locations?.list?.useQuery?.() as any;
  const [restList, setRestList] = useState<any[] | null>(null);

  // حمل عبر REST لو ما فيه tRPC أو فشل
  useEffect(() => {
    const needRest = !listQ || listQ?.error || !listQ?.data;
    if (!needRest) return;
    (async () => {
      try {
        const r = await fetch("/trpc/locations.list"); // لو عندك REST خاصك استبدله بـ /api/locations/all
        if (r.ok) {
          // tRPC يرجّع JSON خاص، فالأبسط نستعمل REST احتياطي:
          // الأفضل: اعمل إندبوينت GET /api/locations يرجع مصفوفة.
          // مؤقتًا نتركها فاضية لو ما فيه REST جاهز.
          setRestList([]);
        } else {
          const r2 = await fetch("/api/locations"); // جرّب REST
          if (r2.ok) setRestList(await r2.json());
          else setRestList([]);
        }
      } catch {
        setRestList([]);
      }
    })();
  }, [listQ?.data, listQ?.error]);

  const listData: any[] = useMemo(() => {
    if (listQ?.data) return listQ.data;
    if (restList) return restList;
    return [];
  }, [listQ?.data, restList]);

  // اختيار العنصر + فتح المحرر
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const selectedLoc = useMemo(
    () => listData.find((x) => Number(x.id) === selectedId),
    [listData, selectedId]
  );

  // حالة الرسم (editable)
  const initialStyle = parseStyle(selectedLoc?.notes);
  const [edit, setEdit] = useState({
    name: "",
    description: "",
    type: "mixed" as "mixed" | "security" | "traffic",
    radius: 50,
    fill: initialStyle.fill ?? "#f59e0b",
    fillOpacity: initialStyle.fillOpacity ?? 0.25,
    stroke: initialStyle.stroke ?? "#b45309",
    strokeWidth: initialStyle.strokeWidth ?? 2,
    strokeEnabled: initialStyle.strokeEnabled ?? true,
  });

  // لما يتغيّر الاختيار، حمّل القيم
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

  // GeoJSON
  const geojson = useMemo(() => {
    const fc: turf.FeatureCollection = { type: "FeatureCollection", features: [] };
    for (const loc of listData) {
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      const radius = Number(loc.radius ?? 50);
      const s = parseStyle(loc.notes);
      const poly = circlePolygonFor(lng, lat, radius);
      fc.features.push({
        type: "Feature",
        id: Number(loc.id),
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
          strokeEnabled: s.strokeEnabled ?? true,
          lat, lng,
        },
      } as any);
    }
    return fc;
  }, [listData]);

  const geojsonRef = useRef<any>(geojson);
  useEffect(() => { geojsonRef.current = geojson; }, [geojson]);

  const setSourceData = () => {
    const src = mapRef.current?.getSource("locations-src") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(geojsonRef.current as any);
  };

  // إنشاء الخريطة
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: "map",
      style: STYLE_MAPTILER ?? STYLE_FALLBACK,
      center: DIRIYYAH_CENTER as LngLatLike,
      zoom: DIRIYYAH_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    requestAnimationFrame(() => map.resize());

    const prepare = () => {
      if (!map.getSource("locations-src")) {
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
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["coalesce", ["get", "stroke"], "#b45309"],
            "line-width": ["coalesce", ["get", "strokeWidth"], 2],
            "line-opacity": ["case", ["==", ["get", "strokeEnabled"], true], 1, 0],
          },
        });

        map.addLayer({
          id: "loc-center",
          type: "circle",
          source: "locations-src",
          paint: { "circle-radius": 4, "circle-color": ["coalesce", ["get", "stroke"], "#7c2d12"] },
        });
      }
    };

    map.on("error", () => {
      // تحوّل تلقائيًا للستايل الاحتياطي
      map.setStyle(STYLE_FALLBACK);
      map.once("styledata", () => {
        prepare();
        setSourceData();
        setTimeout(() => map.resize(), 0);
      });
    });

    map.on("load", () => {
      loadedRef.current = true;
      prepare();
      setSourceData();
      setTimeout(() => map.resize(), 0);
    });

    // أحداث التفاعل
    const onEnter = () => (map.getCanvas().style.cursor = "pointer");
    const onLeave = () => (map.getCanvas().style.cursor = "");
    const onMove = (e: MapLayerMouseEvent) => {
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
    const onClick = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const id = Number((f?.id ?? (f?.properties as any)?.id) as any);
      if (!Number.isFinite(id)) return;
      setSelectedId(id);
      setEditorOpen(true);
    };

    map.on("mouseenter", "loc-fill", onEnter);
    map.on("mouseleave", "loc-fill", onLeave);
    map.on("mousemove", "loc-fill", onMove);
    map.on("click", "loc-fill", onClick);

    const onResize = () => map.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // تحديث المصدر عند تغيّر البيانات
  useEffect(() => {
    if (!mapRef.current) return;
    if (loadedRef.current) setSourceData();
    else mapRef.current.once("load", setSourceData);
  }, [geojson]);

  // فتح/إغلاق المحرر → أعِد القياس
  useEffect(() => { setTimeout(() => mapRef.current?.resize(), 50); }, [editorOpen]);

  // معاينة حيّة على الخريطة
  function live(partial: Partial<typeof edit>) {
    setEdit((prev) => {
      const next = { ...prev, ...partial };
      const fc = geojsonRef.current as turf.FeatureCollection;
      const idx = fc.features.findIndex((f: any) => Number(f.id) === selectedId);
      if (idx >= 0) {
        const f: any = fc.features[idx];
        // خصائص
        f.properties.fill = next.fill;
        f.properties.fillOpacity = next.fillOpacity;
        f.properties.stroke = next.stroke;
        f.properties.strokeWidth = next.strokeWidth;
        f.properties.strokeEnabled = next.strokeEnabled;
        f.properties.radius = next.radius;
        // الشكل
        const lng = Number(f.properties.lng);
        const lat = Number(f.properties.lat);
        f.geometry = circlePolygonFor(lng, lat, next.radius).geometry;
      }
      setSourceData();
      return next;
    });
  }

  // حفظ
  async function save() {
    if (!selectedId) return;
    const notes = styleJSON({
      fill: edit.fill,
      fillOpacity: edit.fillOpacity,
      stroke: edit.stroke,
      strokeWidth: edit.strokeWidth,
      strokeEnabled: edit.strokeEnabled,
    });

    // tRPC أولاً ثم REST احتياطي
    try {
      await trpc.locations.update.mutateAsync({
        id: selectedId,
        name: edit.name,
        description: edit.description,
        locationType: edit.type,
        radius: edit.radius,
        notes,
      } as any);
    } catch {
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

    // تحديث القائمة
    try { await listQ?.refetch?.(); } catch {}
    setTimeout(() => mapRef.current?.resize(), 0);
  }

  // حذف
  async function del() {
    if (!selectedId || !confirm("حذف هذا الموقع؟")) return;
    try {
      await trpc.locations.delete.mutateAsync({ id: selectedId } as any);
    } catch {
      await fetch(`/api/locations/${selectedId}`, { method: "DELETE", credentials: "include" });
    }
    setSelectedId(null);
    setEditorOpen(false);
    try { await listQ?.refetch?.(); } catch {}
  }

  return (
    <div className="maplibre-page">
      <div id="map" />

      {/* قائمة المواقع */}
      <div className="map-panel" style={{ position:"absolute", left:16, top:16, width:260, maxHeight:"80vh", overflow:"auto" }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>المواقع</div>
        {(listData ?? []).map((it) => (
          <div className="list-item" key={it.id}>
            <div className="truncate" title={it.name}>{it.name ?? `#${it.id}`}</div>
            <button className="btn secondary" onClick={() => { setSelectedId(Number(it.id)); setEditorOpen(true); }}>
              تعديل
            </button>
          </div>
        ))}
      </div>

      {/* محرر الموقع */}
      {editorOpen && selectedLoc && (
        <div className="map-panel" style={{ position:"absolute", right:16, top:16, width:"var(--panel-w)", maxHeight:"92vh", overflow:"auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div style={{ fontWeight:700 }}>تعديل الموقع</div>
            <button className="btn secondary" onClick={() => setEditorOpen(false)}>إغلاق</button>
          </div>

          <div className="form-row">
            <label>اسم الموقع</label>
            <input type="text" value={edit.name} onChange={(e) => setEdit(s => ({ ...s, name: e.target.value }))} />
          </div>

          <div className="form-row">
            <label>الوصف</label>
            <textarea rows={3} value={edit.description} onChange={(e) => setEdit(s => ({ ...s, description: e.target.value }))} />
          </div>

          <div className="form-row">
            <label>نوع الموقع</label>
            <select value={edit.type} onChange={(e) => setEdit(s => ({ ...s, type: e.target.value as any }))}>
              <option value="mixed">مختلط</option>
              <option value="security">أمني</option>
              <option value="traffic">مروري</option>
            </select>
          </div>

          <div className="form-row">
            <label>نطاق التمركز (متر): {edit.radius}</label>
            <input className="range" type="range" min={5} max={500} step={5}
              value={edit.radius} onChange={(e) => live({ radius: Number(e.target.value) })} />
          </div>

          <hr style={{ margin:"12px 0" }} />

          <div className="form-row">
            <label>لون التعبئة</label>
            <input type="color" value={edit.fill} onChange={(e) => live({ fill: e.target.value })} />
          </div>

          <div className="form-row">
            <label>شفافية التعبئة: {edit.fillOpacity.toFixed(2)}</label>
            <input className="range" type="range" min={0} max={1} step={0.05}
              value={edit.fillOpacity} onChange={(e) => live({ fillOpacity: Number(e.target.value) })} />
          </div>

          <div className="form-row" style={{ display:"flex", alignItems:"center", gap:8 }}>
            <input id="strokeEnabled" type="checkbox" checked={!!edit.strokeEnabled}
              onChange={(e) => live({ strokeEnabled: e.target.checked })} />
            <label htmlFor="strokeEnabled" style={{ margin:0 }}>تفعيل الحدود</label>
          </div>

          <div className="form-row">
            <label>لون الحدود</label>
            <input type="color" disabled={!edit.strokeEnabled}
              value={edit.stroke} onChange={(e) => live({ stroke: e.target.value })} />
          </div>

          <div className="form-row">
            <label>عرض الحدود (px): {edit.strokeWidth}</label>
            <input className="range" type="range" min={0} max={10} step={1} disabled={!edit.strokeEnabled}
              value={edit.strokeWidth} onChange={(e) => live({ strokeWidth: Number(e.target.value) })} />
          </div>

          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button className="btn" onClick={save}>حفظ التعديلات</button>
            <button className="btn red" onClick={del}>حذف</button>
          </div>
        </div>
      )}
    </div>
  );
}
