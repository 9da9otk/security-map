// src/components/VectorMap.tsx
import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Location = {
  id: number;
  name: string;
  description: string | null;
  latitude: string;
  longitude: string;
  locationType: "security" | "traffic" | "mixed";
  radius: number | null;
  isActive: number;
  createdAt: Date;
  updatedAt: Date;
};

type Props = {
  locations: Location[];                     // نمررها من MapPage (trpc.locations.list)
  onPointClick: (loc: Location) => void;     // لفتح مودال التفاصيل الموجود عندك
  initialStyle?: "streets" | "hybrid" | "satellite" | "dark";
};

const CENTER: [number, number] = [46.569, 24.742];

function toGeoJSON(items: Location[]) {
  return {
    type: "FeatureCollection",
    features: items.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [parseFloat(p.longitude), parseFloat(p.latitude)] },
      properties: {
        id: p.id,
        name: p.name,
        type: p.locationType,
        radius: p.radius ?? 100
      }
    }))
  } as any;
}

export default function VectorMap({ locations, onPointClick, initialStyle = "streets" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const MT_KEY = import.meta.env.VITE_MAPTILER_KEY;
  const styleUrl = useMemo(() => {
    const base = "https://api.maptiler.com/maps";
    switch (initialStyle) {
      case "satellite": return `${base}/satellite/style.json?key=${MT_KEY}`;
      case "hybrid":    return `${base}/hybrid/style.json?key=${MT_KEY}`;
      case "dark":      return `${base}/dataviz-dark/style.json?key=${MT_KEY}`;
      default:          return `${base}/streets-v2/style.json?key=${MT_KEY}`;
    }
  }, [initialStyle, MT_KEY]);

  // إنشاء الخريطة
  useEffect(() => {
    if (!containerRef.current || !MT_KEY) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: CENTER,
      zoom: 13.5,
      attributionControl: false
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.addControl(new maplibregl.FullscreenControl(), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      showUserLocation: true
    }), "top-left");

    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: true, maxWidth: "360px" });

    map.on("load", () => {
      map.addSource("sites", {
        type: "geojson",
        data: toGeoJSON(locations),
        cluster: true,
        clusterMaxZoom: 16,
        clusterRadius: 40
      } as any);

      // عناقيد
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "sites",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#C8B88A", 10, "#9D7B4F", 25, "#5B3A1E"],
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 22, 25, 30],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5
        }
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "sites",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
        paint: { "text-color": "#ffffff" }
      });

      // نقاط منفردة — دوائر صغيرة بألوان النوع
      map.addLayer({
        id: "site-point",
        type: "circle",
        source: "sites",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "type"],
            "security", "#a85a4a",
            "traffic",  "#4a7ba7",
            /* mixed */ "#a87a4a"
          ],
          "circle-radius": 6,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5
        }
      });

      // تكبير عند الضغط على عنقود
      map.on("click", "clusters", (e: any) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = (features[0].properties as any).cluster_id;
        const src = map.getSource("sites") as any;
        src.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          map.easeTo({ center: (features[0].geometry as any).coordinates, zoom });
        });
      });

      // بوب-أب بسيط باسم الموقع + زر "عرض التفاصيل" يفتح مودالك الحالي
      map.on("click", "site-point", (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const coords = (f.geometry as any).coordinates.slice();
        const props = f.properties as any;
        const html = `
          <div dir="rtl" style="min-width:220px;font-family:Tahoma,system-ui">
            <div style="font-weight:700;font-size:14px;margin-bottom:6px">${props.name}</div>
            <button id="show-${props.id}"
              style="background:#5B3A1E;color:#fff;border:none;padding:6px 10px;border-radius:8px;cursor:pointer">
              عرض التفاصيل
            </button>
          </div>
        `;
        popupRef.current!.setLngLat(coords).setHTML(html).addTo(map);
        setTimeout(() => {
          const btn = document.getElementById(`show-${props.id}`);
          if (btn) {
            btn.onclick = () => {
              // ابحث عن اللوكيشن الأصلي ونادِ onPointClick
              const loc = locations.find((x) => x.id === props.id);
              if (loc) onPointClick(loc);
              popupRef.current?.remove();
            };
          }
        }, 0);
      });

      map.on("mouseenter", "site-point", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "site-point", () => (map.getCanvas().style.cursor = ""));
    });

    return () => map.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl, MT_KEY]);

  // تحدّيث البيانات بدون إعادة إنشاء الخريطة
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("sites") as any;
    if (src?.setData) src.setData(toGeoJSON(locations));
  }, [locations]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
