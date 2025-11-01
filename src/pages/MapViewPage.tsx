import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const DIRIYAH_BOUNDS = {
  north: 24.8,
  south: 24.65,
  east: 46.8,
  west: 46.55,
};

const DIRIYAH_CENTER = [24.725, 46.675] as [number, number];

export default function MapViewPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const circlesRef = useRef<Map<number, L.Circle>>(new Map());

  const locationsQuery = trpc.locations.list.useQuery();

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = L.map(mapContainer.current).setView(DIRIYAH_CENTER, 11);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map.current);

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current || !locationsQuery.data) return;

    circlesRef.current.forEach((circle) => {
      map.current?.removeLayer(circle);
    });
    circlesRef.current.clear();

    locationsQuery.data.forEach((location) => {
      const getColor = (type: string) => {
        switch (type) {
          case "security":
            return { color: "#a85a4a", fillColor: "#d4a5a0" };
          case "traffic":
            return { color: "#4a7ba7", fillColor: "#a0c4d4" };
          default:
            return { color: "#a87a4a", fillColor: "#d4bfa0" };
        }
      };

      const colorSet = getColor(location.locationType);

      const circle = L.circle(
        [parseFloat(location.latitude), parseFloat(location.longitude)],
        location.radius || 100,
        {
          ...colorSet,
          fillOpacity: 0.4,
          weight: 2,
        }
      );

      circle.bindPopup(`<strong>${location.name}</strong><br>${location.description || ""}`);
      circle.addTo(map.current!);
      circlesRef.current.set(location.id, circle);
    });
  }, [locationsQuery.data]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <style>{`
        .diriyah-header {
          background: linear-gradient(135deg, #a85a4a 0%, #d4a5a0 100%);
        }
      `}</style>

      <div className="diriyah-header text-white p-4 flex items-center gap-3">
        <img src="/logo.png" alt="Diriyah" className="w-12 h-12 bg-white rounded-full p-1" />
        <div>
          <h1 className="text-xl font-bold">خريطة الدرعية</h1>
          <p className="text-sm opacity-90">الأمن والتنظيم المروري - عرض عام</p>
        </div>
      </div>

      <div ref={mapContainer} className="flex-1 w-full" />
    </div>
  );
}
