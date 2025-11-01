/* snapshot read-only view */ 
import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type StyleKey = "streets" | "hybrid" | "satellite" | "dark";
const DIRIYAH_CENTER: [number, number] = [46.5738, 24.7400];
const DIRIYAH_BOUNDS: [[number, number], [number, number]] = [[46.5600, 24.7320], [46.5850, 24.7485]];
const DIRIYAH_ZOOM = 13;

const getStyleUrl = (kind: StyleKey) => {
  const MT_KEY = import.meta.env.VITE_MAPTILER_KEY;
  const base = "https://api.maptiler.com/maps";
  switch (kind) {
    case "satellite": return `${base}/satellite/style.json?key=${MT_KEY}`;
    case "hybrid":    return `${base}/hybrid/style.json?key=${MT_KEY}`;
    case "dark":      return `${base}/dataviz-dark/style.json?key=${MT_KEY}`;
    default:          return `${base}/streets-v2/style.json?key=${MT_KEY}`;
  }
};

export default function SnapshotViewPage() {
  const [, params] = useRoute("/view/s/:token");
  const token = params?.token!;
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapStyle, setMapStyle] = useState<StyleKey>("streets");
  const [data, setData] = useState<{ assignments: Record<number, any[]>, locations: any[] } | null>(null);

  useEffect(() => {
    (async () => {
      const resp = await fetch(`/api/snapshots/${token}`);
      if (!resp.ok) { alert("الرابط غير صالح"); return; }
      const json = await resp.json();
      setData(json);
    })();
  }, [token]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: getStyleUrl(mapStyle),
      center: DIRIYAH_CENTER,
      zoom: DIRIYAH_ZOOM,
      maxBounds: DIRIYAH_BOUNDS,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.addControl(new maplibregl.FullscreenControl(), "bottom-right");
    map.fitBounds(DIRIYAH_BOUNDS, { padding: 20 });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    const gj: any = {
      type: "FeatureCollection",
      features: (data.locations || []).map((l:any) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [parseFloat(l.longitude), parseFloat(l.latitude)] },
        properties: { id: l.id, name: l.name, type: l.locationType, radius: l.radius ?? 100 },
      }))
    };

    const add = () => {
      if (!map.getSource("loc")) {
        map.addSource("loc", { type: "geojson", data: gj } as any);
        map.addLayer({
          id: "site-point",
          type: "circle",
          source: "loc",
          paint: {
            "circle-color": [
              "match", ["get", "type"],
              "security", "#a85a4a",
              "traffic",  "#4a7ba7",
              "#a87a4a"
            ],
            "circle-radius": 6,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5
          }
        });
        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true });
        map.on("click", "site-point", (e: any) => {
          const f = e.features?.[0];
          if (!f) return;
          const id = Number(f.properties.id);
          const people = (data.assignments?.[id] || []) as Array<any>;
          const [lng, lat] = f.geometry.coordinates;
          const html = `
            <div dir="rtl" style="font-family: Tahoma, system-ui;">
              <div style="font-weight:700;margin-bottom:6px">${f.properties.name}</div>
              ${
                people.length
                  ? `<div style="display:grid;gap:6px;">
                      ${people.map(p=>`
                        <div style="border:1px solid #eee;border-radius:8px;padding:6px 8px;">
                          <div><b>${p.name}</b> • <span style="font-size:12px;color:#555">${p.role}</span></div>
                          ${p.phone ? `<div style="font-size:12px;">📱 ${p.phone}</div>` : ""}
                          ${p.notes ? `<div style="font-size:12px;color:#444;">📝 ${p.notes}</div>` : ""}
                        </div>
                      `).join("")}
                    </div>`
                  : `<div style="font-size:12px;color:#666;">لا توجد أسماء محفوظة لهذا الموقع في هذه اللقطة.</div>`
              }
            </div>`;
          popup.setLngLat([lng, lat]).setHTML(html).addTo(map);
        });
        map.on("mouseenter", "site-point", () => map.getCanvas().style.cursor = "pointer");
        map.on("mouseleave", "site-point", () => map.getCanvas().style.cursor = "");
      } else {
        (map.getSource("loc") as any).setData(gj);
      }
    };

    if ((map as any).isStyleLoaded()) add();
    else map.once("styledata", add);
  }, [data, mapStyle]);

  return (
    <div style={{width:"100vw",height:"100vh",position:"relative"}}>
      <div ref={mapEl} style={{width:"100%",height:"100%"}} />
      <div style={{position:"absolute", top:12, left:12, zIndex:6}}>
        <div style={{background:"#fff", border:"1px solid #eee", borderRadius:12, boxShadow:"0 10px 30px rgba(0,0,0,0.12)"}}>
          <button onClick={()=>setMapStyle("streets")}   style={{padding:"8px 12px", width:160, textAlign:"right"}}>خريطة الشوارع</button>
          <button onClick={()=>setMapStyle("hybrid")}    style={{padding:"8px 12px", width:160, textAlign:"right"}}>خريطة هجينة</button>
          <button onClick={()=>setMapStyle("satellite")} style={{padding:"8px 12px", width:160, textAlign:"right"}}>صور فضائية</button>
          <button onClick={()=>setMapStyle("dark")}      style={{padding:"8px 12px", width:160, textAlign:"right"}}>الوضع الليلي</button>
        </div>
      </div>
    </div>
  );
}
