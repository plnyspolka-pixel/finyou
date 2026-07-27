import { useEffect, useRef } from "react";

declare global {
  interface Window {
    google?: any;
    __initPropertyMap?: () => void;
    __propertyMapLoading?: Promise<void>;
  }
}

const SCRIPT_ID = "google-maps-js-sdk";

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__propertyMapLoading) return window.__propertyMapLoading;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) return Promise.reject(new Error("Brak klucza Google Maps"));

  window.__propertyMapLoading = new Promise<void>((resolve, reject) => {
    window.__initPropertyMap = () => resolve();
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Nie udało się załadować Google Maps")),
      );
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initPropertyMap${channel ? `&channel=${channel}` : ""}`;
    s.onerror = () => reject(new Error("Nie udało się załadować Google Maps"));
    document.head.appendChild(s);
  });
  return window.__propertyMapLoading;
}

interface PropertyMapProps {
  latitude: number;
  longitude: number;
  label?: string;
  zoom?: number;
  height?: number;
}

export function PropertyMap({
  latitude,
  longitude,
  label,
  zoom = 16,
  height = 320,
}: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return;
        const center = { lat: latitude, lng: longitude };
        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(containerRef.current, {
            center,
            zoom,
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
            mapTypeId: "hybrid",
          });
        } else {
          mapRef.current.setCenter(center);
          mapRef.current.setZoom(zoom);
        }
        if (markerRef.current) markerRef.current.setMap(null);
        markerRef.current = new window.google.maps.Marker({
          position: center,
          map: mapRef.current,
          title: label ?? "Nieruchomość",
        });
      })
      .catch((e) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div style="padding:12px;font-size:12px;color:#666">${e.message}</div>`;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, zoom, label]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height }}
      className="rounded border overflow-hidden bg-muted"
    />
  );
}
