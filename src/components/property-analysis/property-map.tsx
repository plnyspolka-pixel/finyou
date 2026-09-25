// Mapa nieruchomości — OpenStreetMap w ramce (bez klucza API i bibliotek).
// Do 22.07.2026 Google Maps JS SDK; konektor Google Maps odłączono w Lovable.
import { osmEmbedUrl } from "@/lib/osm-embed";

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
  return (
    <iframe
      title={label ?? "Nieruchomość"}
      src={osmEmbedUrl(latitude, longitude, zoom)}
      style={{ width: "100%", height, border: 0 }}
      className="rounded border overflow-hidden bg-muted"
      loading="lazy"
    />
  );
}
