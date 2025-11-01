import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import axios from "axios";
import { Plus, Trash2, Edit2, MapPin, Users, Info, Home, X, Share2, Loader } from "lucide-react";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const EPHEMERAL_ASSIGNMENTS =
  (import.meta.env.VITE_EPHEMERAL_ASSIGNMENTS ?? "true") === "true";

/* ===================== إعداد الدرعية (الوضع الافتراضي) ===================== */
// مركز الدرعية التقريبي [lng, lat]
const DIRIYAH_CENTER_LNG_LAT: [number, number] = [46.67, 24.74];
const DIRIYAH_ZOOM = 13;

// حدود بسيطة للقبول (داخل الدرعية تقريبًا)
const isInDiriyah = (lat: number, lng: number) =>
  lat >= 24.600000 && lat <= 24.900000 && lng >= 46.400000 && lng <= 46.800000;
/* ========================================================================== */

interface Location {
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
}

interface Personnel {
  id: number;
  locationId: number;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  personnelType: "security" | "traffic";
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export default function MapPage() {
  const [, navigate] = useLocation();

  // refs للخريطة وعناصرها
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const geolocateRef = useRef<maplibregl.GeolocateControl | null>(null);
  const tempMarkerRef = useRef<maplibregl.Marker | null>(null);

  // حالات الواجهة
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [sessionPersonnel, setSessionPersonnel] = useState<
    Record<
      number,
      Array<{
        id: number;
        name: string;
        role: "قائد فريق" | "رجل أمن ثاني";
        phone?: string;
        email?: string;
        personnelType: "security" | "traffic";
        notes?: string | null;
      }>
    >
  >({});
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showAddPersonnel, setShowAddPersonnel] = useState(false);
  const [showPersonnelDetails, setShowPersonnelDetails] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editingPersonnel, setEditingPersonnel] = useState<Personnel | null>(null);
  const [isSelectingLocation, setIsSelectingLocation] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isZoomedIn, setIsZoomedIn] = useState(false);

  // نماذج الإدخال
  const [locationForm, setLocationForm] = useState<{
    name: string;
    description: string;
    latitude: string;
    longitude: string;
    locationType: "security" | "traffic" | "mixed";
    radius: number;
  }>({
    name: "",
    description: "",
    latitude: String(DIRIYAH_CENTER_LNG_LAT[1]), // 24.74
    longitude: String(DIRIYAH_CENTER_LNG_LAT[0]), // 46.67
    locationType: "mixed",
    radius: 50,
  });

  const [personnelForm, setPersonnelForm] = useState<{
    name: string;
    role: string;
    phone: string;
    email: string;
    personnelType: "security" | "traffic";
    notes: string | null;
  }>({
    name: "",
    role: "",
    phone: "",
    email: "",
    personnelType: "security",
    notes: null,
  });

  // TRPC
  const locationsQuery = trpc.locations.list.useQuery();
  const locationDetailsQuery = trpc.locations.getById.useQuery(
    { id: selectedLocation?.id || 0 },
    { enabled: !!selectedLocation }
  );

  const createLocationMutation = trpc.locations.create.useMutation({
    onSuccess: () => {
      locationsQuery.refetch();
      resetLocationUI();
    },
    onError: (err) => {
      console.error("TRPC create location error:", err);
      alert("تعذر حفظ الموقع (تحقق من الإحداثيات داخل نطاق الدرعية).");
    },
  });

  const updateLocationMutation = trpc.locations.update.useMutation({
    onSuccess: () => {
      locationsQuery.refetch();
      setEditingLocation(null);
      resetLocationUI();
    },
    onError: (err) => {
      console.error("TRPC update location error:", err);
      alert("تعذر تحديث الموقع");
    },
  });

  const deleteLocationMutation = trpc.locations.delete.useMutation({
    onSuccess: () => {
      locationsQuery.refetch();
      setSelectedLocation(null);
    },
    onError: (err) => {
      console.error("TRPC delete location error:", err);
      alert("تعذر حذف الموقع");
    },
  });

  const createPersonnelMutation = trpc.personnel.create.useMutation({
    onSuccess: () => {
      if (selectedLocation) locationDetailsQuery.refetch();
      setShowAddPersonnel(false);
      setPersonnelForm({
        name: "",
        role: "",
        phone: "",
        email: "",
        personnelType: "security",
        notes: null,
      });
    },
    onError: (err) => {
      console.error("TRPC create personnel error:", err);
      alert("تعذر إضافة الفرد");
    },
  });

  const updatePersonnelMutation = trpc.personnel.update.useMutation({
    onSuccess: () => {
      if (selectedLocation) locationDetailsQuery.refetch();
      setEditingPersonnel(null);
    },
    onError: (err) => {
      console.error("TRPC update personnel error:", err);
      alert("تعذر تحديث بيانات الفرد");
    },
  });

  const deletePersonnelMutation = trpc.personnel.delete.useMutation({
    onSuccess: () => {
      if (selectedLocation) locationDetailsQuery.refetch();
    },
    onError: (err) => {
      console.error("TRPC delete personnel error:", err);
      alert("تعذر حذف الفرد");
    },
  });

  function resetLocationUI() {
    setShowAddLocation(false);
    setIsSelectingLocation(false);
    if (tempMarkerRef.current) {
      tempMarkerRef.current.remove();
      tempMarkerRef.current = null;
    }
    setLocationForm({
      name: "",
      description: "",
      latitude: String(DIRIYAH_CENTER_LNG_LAT[1]),
      longitude: String(DIRIYAH_CENTER_LNG_LAT[0]),
      locationType: "mixed",
      radius: 50,
    });
  }

  // تحويل بيانات المواقع إلى GeoJSON
  const toGeoJSON = (items: Location[]) => ({
    type: "FeatureCollection",
    features: (items || []).map((p) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [parseFloat(p.longitude), parseFloat(p.latitude)],
      },
      properties: {
        id: p.id,
        name: p.name,
        type: p.locationType,
        radius: p.radius ?? 100,
      },
    })),
  });

  // إنشاء الخريطة (مرة واحدة)
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const MT_KEY = import.meta.env.VITE_MAPTILER_KEY;
    const styleUrl = MT_KEY
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MT_KEY}`
      : "https://demotiles.maplibre.org/style.json";

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl,
      center: DIRIYAH_CENTER_LNG_LAT, // ✅ يبدأ في الدرعية
      zoom: DIRIYAH_ZOOM,             // ✅ زوم افتراضي مناسب
      attributionControl: false,
    });
    mapRef.current = map;

    // Controls
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.addControl(new maplibregl.FullscreenControl(), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      showUserLocation: true,
      trackUserLocation: false,
    });
    geolocateRef.current = geolocate;
    map.addControl(geolocate, "top-left");

    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: true,
      maxWidth: "360px",
    });

    map.on("load", () => {
      // مصدر المواقع مع عنقدة
      map.addSource("sites", {
        type: "geojson",
        data: toGeoJSON(locationsQuery.data || []),
        cluster: true,
        clusterMaxZoom: 16,
        clusterRadius: 40,
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
          "circle-stroke-width": 1.5,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "sites",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
        paint: { "text-color": "#ffffff" },
      });

      // نقاط منفردة — دوائر صغيرة
      map.addLayer({
        id: "site-point",
        type: "circle",
        source: "sites",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "type"],
            "security",
            "#a85a4a",
            "traffic",
            "#4a7ba7",
            /* mixed */ "#a87a4a",
          ],
          "circle-radius": 6,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
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

      // بوب-أب باسم الموقع + زر "عرض التفاصيل"
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
              const original = (locationsQuery.data || []).find((x) => x.id === props.id);
              if (original) {
                setSelectedLocation(original);
                setShowPersonnelDetails(true);
                map.easeTo({ center: coords as [number, number], zoom: 16 });
                setIsZoomedIn(true);
              }
              popupRef.current?.remove();
            };
          }
        }, 0);
      });

      map.on("mouseenter", "site-point", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "site-point", () => (map.getCanvas().style.cursor = ""));
    });

    return () => {
      map.remove();
      mapRef.current = null;
      tempMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تحديث بيانات المصدر عند تغيّر المواقع
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("sites") as any;
    if (src?.setData) src.setData(toGeoJSON(locationsQuery.data || []));
  }, [locationsQuery.data]);

  // وضع اختيار موقع جديد
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onMapClick = (e: maplibregl.MapMouseEvent & maplibregl.EventData) => {
      if (!isSelectingLocation) return;

      // استخدم wrap لضمان الإحداثيات ضمن النطاق العالمي الصحيح
      const wrapped = (e.lngLat as maplibregl.LngLat).wrap();
      const lat = Number(wrapped.lat.toFixed(6));
      const lng = Number(wrapped.lng.toFixed(6));

      // التحقق أن النقطة داخل حدود الدرعية
      if (!isInDiriyah(lat, lng)) {
        alert("اختر نقطة داخل نطاق الدرعية.");
        return;
      }

      if (tempMarkerRef.current) {
        tempMarkerRef.current.remove();
        tempMarkerRef.current = null;
      }

      const m = new maplibregl.Marker({ color: "#5B3A1E" })
        .setLngLat([lng, lat])
        .addTo(map);
      tempMarkerRef.current = m;

      setLocationForm((prev) => ({
        ...prev,
        latitude: String(lat),
        longitude: String(lng),
      }));
    };

    if (isSelectingLocation) {
      // عند بدء الاختيار اعرض الدرعية وكرّسير التقاطع
      map.easeTo({ center: DIRIYAH_CENTER_LNG_LAT, zoom: DIRIYAH_ZOOM });
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", onMapClick);
    } else {
      map.getCanvas().style.cursor = "";
      map.off("click", onMapClick);
    }

    return () => {
      map.off("click", onMapClick);
      map.getCanvas().style.cursor = "";
    };
  }, [isSelectingLocation]);

  // وظائف التحكم
  const handleZoomToLocation = (location: Location) => {
    const map = mapRef.current;
    if (!map) return;
    const lat = parseFloat(location.latitude);
    const lng = parseFloat(location.longitude);
    map.easeTo({ center: [lng, lat], zoom: 16 });
    setIsZoomedIn(true);
  };

  const handleZoomOut = () => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: DIRIYAH_CENTER_LNG_LAT, zoom: DIRIYAH_ZOOM });
    setIsZoomedIn(false);
  };

  const handleShowUserLocation = () => {
    geolocateRef.current?.trigger();
  };

  // حفظ الموقع
  const handleAddLocation = async () => {
    try {
      if (!locationForm.name.trim()) {
        alert("فضلاً أدخل اسم الموقع");
        return;
      }

      const lat = Number(locationForm.latitude);
      const lng = Number(locationForm.longitude);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        alert("فضلاً اختر إحداثيات صحيحة من الخريطة");
        return;
      }
      if (!isInDiriyah(lat, lng)) {
        alert("الإحداثيات خارج نطاق الدرعية.");
        return;
      }

      if (editingLocation) {
        await updateLocationMutation.mutateAsync({
          id: editingLocation.id,
          ...locationForm,
          latitude: String(lat),
          longitude: String(lng),
        });
      } else {
        // جرّب tRPC أولاً
        let saved = false;
        try {
          await createLocationMutation.mutateAsync({
            ...locationForm,
            latitude: String(lat),
            longitude: String(lng),
          } as any);
          saved = true;
        } catch (e) {
          console.warn("tRPC create failed, falling back to REST:", e);
        }

        // REST كاحتياط
        if (!saved) {
          const resp = await axios.post("/api/locations", {
            name: locationForm.name,
            description: locationForm.description || null,
            latitude: String(lat),
            longitude: String(lng),
            locationType: locationForm.locationType,
            radius: locationForm.radius ?? null,
          });
          if (!resp?.data?.ok) {
            throw new Error(resp?.data?.error || "REST save failed");
          }
        }

        await locationsQuery.refetch?.();
        resetLocationUI();
      }
    } catch (error: any) {
      console.error("Error saving location:", error);
      alert("تعذر حفظ الموقع:\n" + (error?.message || "خطأ غير متوقع"));
    }
  };

  const handleAddPersonnel = async () => {
    if (!selectedLocation) return;
    try {
      if (EPHEMERAL_ASSIGNMENTS) {
        const entry = {
          id: Date.now(),
          name: personnelForm.name,
          role: (personnelForm.role as any) || "رجل أمن ثاني",
          phone: personnelForm.phone || undefined,
          email: personnelForm.email || undefined,
          personnelType: personnelForm.personnelType,
          notes: personnelForm.notes || undefined,
        };
        setSessionPersonnel((prev) => {
          const arr = [...(prev[selectedLocation.id] || []), entry];
          const next = { ...prev, [selectedLocation.id]: arr };
          sessionStorage.setItem("assignments", JSON.stringify(next));
          return next;
        });
        setShowAddPersonnel(false);
        setPersonnelForm({
          name: "",
          role: "",
          phone: "",
          email: "",
          personnelType: "security",
          notes: null,
        });
        return;
      }

      const data = {
        name: personnelForm.name,
        role: personnelForm.role,
        phone: personnelForm.phone || undefined,
        email: personnelForm.email || undefined,
        personnelType: personnelForm.personnelType,
        notes: personnelForm.notes || undefined,
      };

      if (editingPersonnel) {
        await updatePersonnelMutation.mutateAsync({ id: editingPersonnel.id, ...data });
      } else {
        await createPersonnelMutation.mutateAsync({
          locationId: selectedLocation.id,
          ...data,
        });
      }
    } catch (error) {
      console.error("Error saving personnel:", error);
      alert("تعذر حفظ بيانات الفرد");
    }
  };

  const handleShare = async (platform: string) => {
    try {
      const raw = sessionStorage.getItem("assignments");
      const assignments = raw ? JSON.parse(raw) : {};
      const locations = (locationsQuery.data || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        latitude: l.latitude,
        longitude: l.longitude,
        locationType: l.locationType,
        radius: l.radius ?? null,
      }));
      const resp = await axios.post("/api/snapshots", { assignments, locations });
      const shareUrl = resp.data.url as string;

      const text = selectedLocation ? `موقع: ${selectedLocation.name}` : "خريطة المواقع";
      if (platform === "whatsapp") {
        window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + shareUrl)}`);
      } else if (platform === "email") {
        window.open(`mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(shareUrl)}`);
      } else if (platform === "copy") {
        await navigator.clipboard.writeText(shareUrl);
        alert("تم نسخ رابط العرض!");
      }
      setShowShareMenu(false);
      setSessionPersonnel({});
      sessionStorage.removeItem("assignments");
    } catch (e) {
      console.error("Error sharing snapshot:", e);
      alert("تعذر إنشاء رابط المشاركة الآن.");
    }
  };

  const handleStartSelectingLocation = () => {
    setEditingLocation(null);
    setLocationForm({
      name: "",
      description: "",
      latitude: String(DIRIYAH_CENTER_LNG_LAT[1]),
      longitude: String(DIRIYAH_CENTER_LNG_LAT[0]),
      locationType: "mixed",
      radius: 50,
    });
    setIsSelectingLocation(true);
    setShowAddLocation(true);

    // ركّز الخريطة على الدرعية عند البدء
    mapRef.current?.easeTo({ center: DIRIYAH_CENTER_LNG_LAT, zoom: DIRIYAH_ZOOM });
  };

  const handleCancelSelection = () => {
    setIsSelectingLocation(false);
    if (tempMarkerRef.current) {
      tempMarkerRef.current.remove();
      tempMarkerRef.current = null;
    }
    setShowAddLocation(false);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <style>{`
        .diriyah-header { background: linear-gradient(135deg, #a85a4a 0%, #d4a5a0 100%); }
        .control-card { z-index: 999; pointer-events: auto; }
        .maplibregl-canvas { z-index: 1; }
      `}</style>

      {/* Map Container */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />

        {/* Top Right Control Card */}
        <div className="absolute top-4 right-4 control-card">
          <Card className="w-72 shadow-lg border-amber-200">
            <CardHeader className="pb-3 diriyah-header text-white rounded-t-lg sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="w-5 h-5" />
                  إدارة المواقع
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate("/home")}
                  className="text-white hover:bg-white hover:bg-opacity-20"
                  title="العودة إلى الصفحة الرئيسية"
                >
                  <Home className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <Button
                onClick={handleStartSelectingLocation}
                className="w-full gap-2 bg-amber-600 hover:bg-amber-700"
              >
                <Plus className="w-4 h-4" />
                إضافة موقع جديد
              </Button>

              <Button
                onClick={handleShowUserLocation}
                className="w-full gap-2 bg-green-600 hover:bg-green-700"
              >
                <Loader className="w-4 h-4" />
                موقعي الحالي
              </Button>

              {isSelectingLocation && (
                <div className="border-t pt-3 space-y-3">
                  <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                    اضغط على الخريطة لاختيار الموقع (داخل نطاق الدرعية)
                  </div>

                  <div className="space-y-3 border-t pt-3">
                    <div>
                      <Label>اسم الموقع</Label>
                      <Input
                        value={locationForm.name}
                        onChange={(e) =>
                          setLocationForm({ ...locationForm, name: e.target.value })
                        }
                        placeholder="مثال: نقطة تفتيش الدرعية"
                      />
                    </div>
                    <div>
                      <Label>الوصف</Label>
                      <Textarea
                        value={locationForm.description}
                        onChange={(e) =>
                          setLocationForm({
                            ...locationForm,
                            description: e.target.value,
                          })
                        }
                        placeholder="وصف الموقع"
                        className="h-20"
                      />
                    </div>

                    {/* الإحداثيات → للعرض فقط وتُملأ من الخريطة */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Lat (خط العرض)</Label>
                        <Input value={locationForm.latitude} readOnly placeholder="اختر من الخريطة" />
                      </div>
                      <div>
                        <Label>Lng (خط الطول)</Label>
                        <Input value={locationForm.longitude} readOnly placeholder="اختر من الخريطة" />
                      </div>
                    </div>

                    <div>
                      <Label>نوع الموقع</Label>
                      <Select
                        value={locationForm.locationType}
                        onValueChange={(value: any) =>
                          setLocationForm({ ...locationForm, locationType: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="security">أمن</SelectItem>
                          <SelectItem value="traffic">مروري</SelectItem>
                          <SelectItem value="mixed">مختلط</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>نطاق التمركز (متر)</Label>
                      <Input
                        type="number"
                        value={locationForm.radius}
                        onChange={(e) =>
                          setLocationForm({
                            ...locationForm,
                            radius: parseInt(e.target.value || "0", 10),
                          })
                        }
                        placeholder="100"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleAddLocation}
                        className="flex-1 bg-amber-600 hover:bg-amber-700"
                        disabled={
                          createLocationMutation.isPending ||
                          updateLocationMutation.isPending
                        }
                      >
                        حفظ
                      </Button>
                      <Button
                        onClick={handleCancelSelection}
                        variant="outline"
                        className="flex-1"
                      >
                        إلغاء
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {selectedLocation && !isSelectingLocation && (
                <>
                  <div className="border-t pt-3">
                    <h3 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      الموقع المختار
                    </h3>
                    <p className="text-sm text-gray-700 mb-3">{selectedLocation.name}</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingLocation(selectedLocation);
                          setLocationForm({
                            name: selectedLocation.name,
                            description: selectedLocation.description || "",
                            latitude: selectedLocation.latitude,
                            longitude: selectedLocation.longitude,
                            locationType: selectedLocation.locationType,
                            radius: selectedLocation.radius || 100,
                          });
                          setIsSelectingLocation(true);
                        }}
                        className="flex-1 gap-1 text-amber-700 hover:bg-amber-50"
                      >
                        <Edit2 className="w-3 h-3" />
                        تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          deleteLocationMutation.mutate({ id: selectedLocation.id })
                        }
                        className="flex-1 gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        حذف
                      </Button>
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-2">
                    <Button
                      onClick={() => {
                        setEditingPersonnel(null);
                        setPersonnelForm({
                          name: "",
                          role: "",
                          phone: "",
                          email: "",
                          personnelType: "security",
                          notes: null,
                        });
                        setShowAddPersonnel(true);
                      }}
                      className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                    >
                      <Users className="w-4 h-4" />
                      إضافة فرد أمني
                    </Button>

                    <div className="relative">
                      <Button
                        onClick={() => setShowShareMenu(!showShareMenu)}
                        className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
                      >
                        <Share2 className="w-4 h-4" />
                        مشاركة
                      </Button>
                      {showShareMenu && (
                        <div className="absolute bottom-12 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                          <button
                            onClick={() => handleShare("whatsapp")}
                            className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm"
                          >
                            📱 واتساب
                          </button>
                          <button
                            onClick={() => handleShare("email")}
                            className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm border-t"
                          >
                            📧 بريد إلكتروني
                          </button>
                          <button
                            onClick={() => handleShare("copy")}
                            className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm border-t"
                          >
                            📋 نسخ الرابط
                          </button>
                        </div>
                      )}
                    </div>

                    {isZoomedIn && (
                      <Button onClick={handleZoomOut} variant="outline" className="w-full">
                        العودة للعرض العام
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Personnel Modal */}
      {showAddPersonnel && selectedLocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center pointer-events-auto">
          <Card className="w-full max-w-md mx-4">
            <CardHeader className="pb-3 diriyah-header text-white rounded-t-lg flex items-center justify-between">
              <CardTitle>
                {editingPersonnel ? "تعديل الفرد" : "إضافة فرد جديد"}
              </CardTitle>
              <button
                onClick={() => setShowAddPersonnel(false)}
                className="text-white hover:opacity-80"
              >
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label>الاسم</Label>
                <Input
                  value={personnelForm.name}
                  onChange={(e) =>
                    setPersonnelForm({ ...personnelForm, name: e.target.value })
                  }
                  placeholder="اسم الفرد"
                />
              </div>
              <div>
                <Label>الدور</Label>
                <Select
                  value={personnelForm.role as any}
                  onValueChange={(v: any) => setPersonnelForm({ ...personnelForm, role: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الدور" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="قائد فريق">قائد فريق</SelectItem>
                    <SelectItem value="رجل أمن ثاني">رجل أمن ثاني</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>رقم الهاتف</Label>
                <Input
                  value={personnelForm.phone}
                  onChange={(e) =>
                    setPersonnelForm({ ...personnelForm, phone: e.target.value })
                  }
                  placeholder="0501234567"
                />
              </div>
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={personnelForm.email}
                  onChange={(e) =>
                    setPersonnelForm({ ...personnelForm, email: e.target.value })
                  }
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label>النوع</Label>
                <Select
                  value={personnelForm.personnelType}
                  onValueChange={(value: any) =>
                    setPersonnelForm({ ...personnelForm, personnelType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="security">أمن</SelectItem>
                    <SelectItem value="traffic">مروري</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ملاحظات</Label>
                <Textarea
                  value={personnelForm.notes || ""}
                  onChange={(e) =>
                    setPersonnelForm({ ...personnelForm, notes: e.target.value || null })
                  }
                  placeholder="ملاحظات إضافية"
                  className="h-20"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddPersonnel}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  disabled={
                    createPersonnelMutation.isPending || updatePersonnelMutation.isPending
                  }
                >
                  {editingPersonnel ? "تحديث" : "إضافة"}
                </Button>
                <Button
                  onClick={() => setShowAddPersonnel(false)}
                  variant="outline"
                  className="flex-1"
                >
                  إلغاء
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Personnel Details Modal */}
      {selectedLocation && showPersonnelDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center pointer-events-auto">
          <Card className="w-full max-w-md mx-4 max-h-96 overflow-y-auto">
            <CardHeader className="pb-3 diriyah-header text-white rounded-t-lg sticky top-0 z-10 flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {selectedLocation.name}
              </CardTitle>
              <button
                onClick={() => setShowPersonnelDetails(false)}
                className="text-white hover:opacity-80"
              >
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent className="pt-4">
              {(EPHEMERAL_ASSIGNMENTS
                ? (sessionPersonnel[selectedLocation.id]?.length ?? 0) > 0
                : !!locationDetailsQuery.data?.personnel?.length) ? (
                <div className="space-y-3">
                  {(EPHEMERAL_ASSIGNMENTS
                    ? sessionPersonnel[selectedLocation.id] || []
                    : locationDetailsQuery.data!.personnel
                  ).map((person: any) => (
                    <Card key={person.id} className="border-amber-200">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-semibold text-amber-900">{person.name}</h4>
                            <p className="text-sm text-gray-600">{person.role}</p>
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              person.personnelType === "security"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {person.personnelType === "security" ? "أمن" : "مروري"}
                          </span>
                        </div>
                        {person.phone && (
                          <p className="text-sm text-gray-600">📱 {person.phone}</p>
                        )}
                        {person.email && (
                          <p className="text-sm text-gray-600">📧 {person.email}</p>
                        )}
                        {person.notes && (
                          <p className="text-sm text-gray-600 mt-2 p-2 bg-gray-50 rounded">
                            📝 {person.notes}
                          </p>
                        )}
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingPersonnel(person);
                              const pType = person.personnelType as "security" | "traffic";
                              setPersonnelForm({
                                name: person.name,
                                role: person.role,
                                phone: person.phone || "",
                                email: person.email || "",
                                personnelType: pType,
                                notes: person.notes,
                              });
                              setShowAddPersonnel(true);
                            }}
                            className="flex-1 gap-1 text-amber-700 hover:bg-amber-50"
                          >
                            <Edit2 className="w-3 h-3" />
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (EPHEMERAL_ASSIGNMENTS) {
                                setSessionPersonnel((prev) => {
                                  const arr = (prev[selectedLocation.id] || []).filter(
                                    (p: any) => p.id !== person.id
                                  );
                                  const next = { ...prev, [selectedLocation.id]: arr };
                                  sessionStorage.setItem("assignments", JSON.stringify(next));
                                  return next;
                                });
                              } else {
                                deletePersonnelMutation.mutate({ id: person.id });
                              }
                            }}
                            className="flex-1 gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            حذف
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-4">
                  لا توجد أفراد متمركزون في هذا الموقع
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
