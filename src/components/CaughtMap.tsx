"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import type { Camera } from "@/lib/cameras";
import type { CameraMaxxingResult } from "@/lib/route-planning";

import "leaflet/dist/leaflet.css";

const COBALT = "#0b3b8c";
const COBALT_STROKE = "#072a66";
const USER_CORE = "#e63946";
const USER_RING = "#0b3b8c";

type Props = {
  cameras: Camera[];
  user: { lat: number; lng: number } | null;
  selectedCameraId?: string | null;
  onCameraSelect?: (camera: Camera) => void;
  routePlan?: CameraMaxxingResult | null;
};

function Recenter({ user }: { user: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!user) return;
    map.panTo([user.lat, user.lng], { animate: true, duration: 0.45 });
  }, [map, user]);
  return null;
}

export default function CaughtMap({ cameras, user, selectedCameraId, onCameraSelect, routePlan }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const center = useMemo(() => {
    if (user) return [user.lat, user.lng] as [number, number];
    return [40.758, -73.9855] as [number, number];
  }, [user]);

  const waypointIds = useMemo(
    () => new Set((routePlan?.waypointCameras ?? []).map((cam) => cam.id)),
    [routePlan],
  );

  if (!mounted) {
    return (
      <div
        className="flex h-[min(52vh,440px)] w-full items-center justify-center rounded-2xl border border-[#0b3b8c]/10 bg-[#f0ebe3] text-sm text-[#5c6478]"
        aria-hidden
      >
        Loading map…
      </div>
    );
  }

  return (
    <MapContainer
      center={center}
      zoom={13}
      className="h-[min(52vh,440px)] w-full overflow-hidden rounded-2xl border border-[#0b3b8c]/15 shadow-[0_20px_50px_-20px_rgba(11,59,140,0.25)]"
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      {routePlan?.normal.geometry.length ? (
        <Polyline
          positions={routePlan.normal.geometry.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: "#5c6478", weight: 4, opacity: 0.38 }}
        />
      ) : null}
      {routePlan?.maxxed.geometry.length ? (
        <Polyline
          positions={routePlan.maxxed.geometry.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: COBALT, weight: 5, opacity: 0.88 }}
        />
      ) : null}
      {cameras.map((c) => (
        <CircleMarker
          key={c.id}
          center={[c.latitude, c.longitude]}
          radius={selectedCameraId === c.id ? 8 : waypointIds.has(c.id) ? 7 : 5}
          pathOptions={{
            color: COBALT_STROKE,
            weight: selectedCameraId === c.id || waypointIds.has(c.id) ? 3 : 1.5,
            fillColor: selectedCameraId === c.id ? USER_CORE : waypointIds.has(c.id) ? "#15a36d" : COBALT,
            fillOpacity: selectedCameraId === c.id || waypointIds.has(c.id) ? 1 : 0.92,
          }}
          eventHandlers={{
            click: () => onCameraSelect?.(c),
          }}
        />
      ))}
      {user ? (
        <>
          <CircleMarker
            center={[user.lat, user.lng]}
            radius={14}
            pathOptions={{
              color: USER_RING,
              weight: 2,
              fillColor: USER_CORE,
              fillOpacity: 0.22,
            }}
          />
          <CircleMarker
            center={[user.lat, user.lng]}
            radius={6}
            pathOptions={{
              color: "#fff",
              weight: 2,
              fillColor: USER_CORE,
              fillOpacity: 1,
            }}
          />
        </>
      ) : null}
      <Recenter user={user} />
    </MapContainer>
  );
}
