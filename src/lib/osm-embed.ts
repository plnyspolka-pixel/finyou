// Osadzana mapa OpenStreetMap (iframe) — bez klucza API, bezpieczne po stronie klienta.

/** Adres osadzanej mapy OSM z pinezką (okno ~ zoom wokół punktu). */
export function osmEmbedUrl(latitude: number, longitude: number, zoom = 16): string {
  // Połowa szerokości okna w stopniach dla danego przybliżenia (przybliżenie).
  const span = 360 / 2 ** (zoom + 1);
  const bbox = [longitude - span, latitude - span / 2, longitude + span, latitude + span / 2]
    .map((v) => v.toFixed(6))
    .join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}
