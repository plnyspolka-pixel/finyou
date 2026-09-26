// OpenStreetMap — geokodowanie (Nominatim) i punkty w okolicy (Overpass).
//
// Zastępuje Google Maps Platform: konektor Google Maps odłączono w Lovable
// (od 22.07.2026 geokodowanie zwracało „brak współrzędnych"). Oba serwisy są
// darmowe i bez klucza, ale mają zasady użycia:
//   • Nominatim — najwyżej 1 zapytanie/s, nagłówek User-Agent identyfikujący
//     aplikację (nie przeglądarkę), wyniki warto cache'ować,
//   • Overpass — publiczna instancja, rozsądna liczba zapytań.
// Najpierw bezpośrednio (OSM blokuje sieć Supabase — Nominatim odpowiada
// registry-proxy 403), przy blokadzie przez registry-proxy.
import { registryGet } from "@/lib/registry-fetch.server";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
/** Publiczne instancje Overpass — kolejna, gdy poprzednia przeciążona/odmawia. */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const USER_AGENT = "FinanceYou.pl/1.0 (analiza lokalizacji nieruchomosci; https://financeyou.pl)";

export interface OsmGeocode {
  lat: number;
  lng: number;
  formattedAddress: string;
  osmId: string | null;
  /** Dopasowanie tylko do miejscowości (bez ulicy/numeru). */
  approximate: boolean;
}

export function normPl(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "");
}

// Nominatim: 1 zapytanie/s na aplikację — prosta kolejka w obrębie instancji.
let lastNominatimAt = 0;
async function nominatimSlot(): Promise<void> {
  const wait = lastNominatimAt + 1_100 - Date.now();
  lastNominatimAt = Math.max(Date.now(), lastNominatimAt + 1_100);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

interface NominatimRow {
  lat: string;
  lon: string;
  display_name: string;
  osm_type?: string;
  osm_id?: number;
  addresstype?: string;
  address?: Record<string, string>;
}

/** Czy wynik leży w oczekiwanej miejscowości / województwie. */
export function nominatimMatches(
  row: Pick<NominatimRow, "address">,
  expectedCity?: string | null,
  expectedVoivodeship?: string | null,
): boolean {
  const a = row.address ?? {};
  if (expectedCity) {
    const want = normPl(expectedCity);
    const places = [a.city, a.town, a.village, a.municipality, a.hamlet, a.suburb, a.city_district]
      .filter(Boolean)
      .map((p) => normPl(p));
    if (!places.some((p) => p === want || p.includes(want) || want.includes(p))) return false;
  }
  if (expectedVoivodeship) {
    const want = normPl(expectedVoivodeship).replace(/^wojewodztwo/, "");
    const state = normPl(a.state).replace(/^wojewodztwo/, "");
    if (state && want && !state.includes(want)) return false;
  }
  return true;
}

async function nominatimSearch(query: string): Promise<NominatimRow[]> {
  await nominatimSlot();
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    countrycodes: "pl",
    addressdetails: "1",
    limit: "5",
    "accept-language": "pl",
  });
  const res = await registryGet(`${NOMINATIM}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    timeoutMs: 12_000,
    prefer: "direct",
  });
  noteAttempt("Nominatim", res);
  if (!res.ok) return [];
  try {
    const rows = JSON.parse(res.text);
    return Array.isArray(rows) ? (rows as NominatimRow[]) : [];
  } catch {
    return [];
  }
}

// ── Diagnostyka geokodowania ─────────────────────────────────────────────────
// Ostatnie odpowiedzi geokoderów (np. „Nominatim: 403 przez proxy") — trafiają
// do ostrzeżeń analizy, gdy położenia nie ustalono.
let lastAttempts: string[] = [];
function noteAttempt(provider: string, res: { status: number; viaProxy: boolean; ok: boolean }) {
  lastAttempts.push(
    `${provider}: ${res.ok ? "OK" : res.status || "brak odpowiedzi"}${res.viaProxy ? " (przez proxy)" : ""}`,
  );
  if (lastAttempts.length > 12) lastAttempts = lastAttempts.slice(-12);
}
/** Odpowiedzi geokoderów z ostatniej próby (do ostrzeżeń w raporcie). */
export function lastGeocodeDiagnostics(): string {
  return [...new Set(lastAttempts)].join("; ");
}

// ── GUGiK UUG — oficjalna usługa geokodowania adresów w Polsce ───────────────
const GUGIK_UUG = "https://services.gugik.gov.pl/uug/";
const PHOTON = "https://photon.komoot.io/api/";

/** Punkt w Polsce z pary liczb w dowolnej kolejności (lon/lat albo lat/lon). */
export function plPoint(a: number, b: number): { lat: number; lng: number } | null {
  const isLat = (v: number) => v >= 48.9 && v <= 55;
  const isLng = (v: number) => v >= 14 && v <= 24.2;
  if (isLat(b) && isLng(a)) return { lat: b, lng: a };
  if (isLat(a) && isLng(b)) return { lat: a, lng: b };
  return null;
}

/** Wynik UUG → punkt (pola x/y albo geometry_wkt „POINT(x y)"). */
export function parseUugResult(r: Record<string, any>): { lat: number; lng: number } | null {
  const wkt = String(r.geometry_wkt ?? "").match(/POINT\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)/i);
  if (wkt) return plPoint(Number(wkt[1]), Number(wkt[2]));
  const x = Number(r.x);
  const y = Number(r.y);
  return Number.isFinite(x) && Number.isFinite(y) ? plPoint(x, y) : null;
}

async function gugikGeocode(
  query: string,
  expectedCity: string | null | undefined,
): Promise<OsmGeocode | null> {
  // UUG oczekuje „Miejscowość, ulica numer" — bez numeru lokalu.
  const streetPart = query
    .split(",")[0]
    .replace(/(\d+[a-z]?)\s*\/\s*\d+[a-z]?/gi, "$1")
    .trim();
  const address =
    expectedCity && normPl(streetPart) !== normPl(expectedCity)
      ? `${expectedCity}, ${streetPart}`
      : query;
  const params = new URLSearchParams({ request: "GetAddress", address, srid: "4326" });
  const res = await registryGet(`${GUGIK_UUG}?${params.toString()}`, {
    headers: { Accept: "application/json" },
    timeoutMs: 12_000,
  });
  noteAttempt("GUGiK", res);
  if (!res.ok) return null;
  let json: any;
  try {
    json = JSON.parse(res.text);
  } catch {
    return null;
  }
  const rows = Object.values((json?.results ?? {}) as Record<string, Record<string, any>>);
  for (const r of rows) {
    if (expectedCity && normPl(r.city) !== normPl(expectedCity)) continue;
    const pt = parseUugResult(r);
    if (!pt) continue;
    const exact = Boolean(r.number);
    return {
      ...pt,
      formattedAddress: [r.street, r.number, r.code, r.city].filter(Boolean).join(" "),
      osmId: r.id ? `uug/${r.id}` : null,
      approximate: !exact,
    };
  }
  return null;
}

async function photonGeocode(
  query: string,
  opts: { expectedCity?: string | null; expectedVoivodeship?: string | null },
): Promise<OsmGeocode | null> {
  const params = new URLSearchParams({ q: query, limit: "5", bbox: "14.0,48.9,24.2,55.0" });
  const res = await registryGet(`${PHOTON}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    timeoutMs: 12_000,
    prefer: "direct",
  });
  noteAttempt("Photon", res);
  if (!res.ok) return null;
  let features: any[] = [];
  try {
    features = JSON.parse(res.text)?.features ?? [];
  } catch {
    return null;
  }
  for (const f of features) {
    const p = f?.properties ?? {};
    if (p.countrycode && p.countrycode !== "PL") continue;
    const address = {
      city: p.city ?? (p.type === "city" ? p.name : undefined),
      town: p.town,
      village: p.village,
      municipality: p.county,
      state: p.state,
    };
    if (!nominatimMatches({ address }, opts.expectedCity, opts.expectedVoivodeship)) continue;
    const [lng, lat] = f?.geometry?.coordinates ?? [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    return {
      lat,
      lng,
      formattedAddress: [p.street ?? p.name, p.housenumber, p.postcode, p.city]
        .filter(Boolean)
        .join(" "),
      osmId: p.osm_type && p.osm_id ? `${p.osm_type}/${p.osm_id}` : null,
      approximate: !p.housenumber,
    };
  }
  return null;
}

/**
 * Geokodowanie adresu w Polsce: Nominatim → GUGiK UUG → Photon. Przy podanej
 * miejscowości/województwie wynik musi do nich pasować (geokoder potrafi
 * podstawić ulicę o tej samej nazwie w innym mieście). null = nie znaleziono.
 */
export async function osmGeocode(
  query: string,
  opts: { expectedCity?: string | null; expectedVoivodeship?: string | null } = {},
): Promise<OsmGeocode | null> {
  lastAttempts = [];
  const rows = await nominatimSearch(query);
  const pick = rows.find((r) => nominatimMatches(r, opts.expectedCity, opts.expectedVoivodeship));
  // Nominatim blokuje sieci chmurowe (Cloudflare, Supabase) — zapasowo oficjalny
  // geokoder GUGiK (adresy w Polsce), potem Photon (dane OSM).
  if (!pick) {
    return (
      (await gugikGeocode(query, opts.expectedCity).catch(() => null)) ??
      (await photonGeocode(query, opts).catch(() => null))
    );
  }
  const lat = Number(pick.lat);
  const lng = Number(pick.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cityLevel = ["city", "town", "village", "municipality", "administrative", "county"];
  return {
    lat,
    lng,
    formattedAddress: pick.display_name,
    osmId: pick.osm_type && pick.osm_id ? `${pick.osm_type}/${pick.osm_id}` : null,
    approximate: cityLevel.includes(pick.addresstype ?? ""),
  };
}

// ── Punkty w okolicy (Overpass) ──────────────────────────────────────────────

/** Kategorie punktów → selektory tagów OSM. */
export const OSM_POI_CATEGORIES: Record<string, string[]> = {
  schools: ['["amenity"="school"]'],
  kindergartens: ['["amenity"="kindergarten"]'],
  groceryStores: ['["shop"~"^(supermarket|convenience|grocery|greengrocer)$"]'],
  pharmacies: ['["amenity"="pharmacy"]'],
  clinics: ['["amenity"~"^(clinic|doctors|hospital)$"]'],
  publicTransport: [
    '["highway"="bus_stop"]',
    '["railway"~"^(tram_stop|station|halt)$"]',
    '["station"="subway"]',
  ],
  parks: ['["leisure"="park"]'],
  restaurants: ['["amenity"~"^(restaurant|cafe|fast_food)$"]'],
  banks: ['["amenity"~"^(bank|atm)$"]'],
  shopping: ['["shop"~"^(mall|department_store)$"]'],
};

export interface OsmPlace {
  name?: string;
  vicinity?: string;
  types?: string[];
  distance?: number;
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Zapytanie Overpass: dla każdej kategorii osobny zbiór i osobne `out`
 * (limit na kategorię) — elementy przychodzą kolejno, a kategorię
 * rozpoznajemy po tagach (`categorizeTags`).
 */
export function buildOverpassQuery(
  lat: number,
  lng: number,
  radius: number,
  categories: string[],
  perCategory = 20,
): string {
  const around = `(around:${Math.round(radius)},${lat.toFixed(6)},${lng.toFixed(6)})`;
  const parts = categories.map((cat) => {
    const sels = (OSM_POI_CATEGORIES[cat] ?? []).map((s) => `nwr${around}${s};`).join("");
    return `(${sels});out tags center ${perCategory};`;
  });
  return `[out:json][timeout:25];${parts.join("")}`;
}

/** Kategoria punktu na podstawie tagów OSM (null = spoza listy). */
export function categorizeTags(tags: Record<string, string>): string | null {
  const a = tags.amenity;
  const shop = tags.shop;
  if (a === "school") return "schools";
  if (a === "kindergarten") return "kindergartens";
  if (a === "pharmacy") return "pharmacies";
  if (a === "clinic" || a === "doctors" || a === "hospital") return "clinics";
  if (a === "restaurant" || a === "cafe" || a === "fast_food") return "restaurants";
  if (a === "bank" || a === "atm") return "banks";
  if (shop && ["supermarket", "convenience", "grocery", "greengrocer"].includes(shop))
    return "groceryStores";
  if (shop === "mall" || shop === "department_store") return "shopping";
  if (tags.leisure === "park") return "parks";
  if (
    tags.highway === "bus_stop" ||
    ["tram_stop", "station", "halt"].includes(tags.railway ?? "") ||
    tags.station === "subway"
  )
    return "publicTransport";
  return null;
}

/** Punkty w promieniu `radius` m, pogrupowane po kategoriach (null = błąd Overpass). */
export async function osmNearby(
  lat: number,
  lng: number,
  radius: number,
  categories: string[] = Object.keys(OSM_POI_CATEGORIES),
  perCategory = 20,
): Promise<Record<string, OsmPlace[]> | null> {
  const query = buildOverpassQuery(lat, lng, radius, categories, perCategory);
  let res: Awaited<ReturnType<typeof registryGet>> | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    res = await registryGet(`${endpoint}?data=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      timeoutMs: 30_000,
      prefer: "direct",
    }).catch(() => null);
    if (res?.ok) break;
  }
  if (!res?.ok) return null;
  let elements: any[] = [];
  try {
    elements = JSON.parse(res.text)?.elements ?? [];
  } catch {
    return null;
  }
  const out: Record<string, OsmPlace[]> = Object.fromEntries(categories.map((c) => [c, []]));
  const seen = new Set<string>();
  for (const el of elements) {
    const tags = (el.tags ?? {}) as Record<string, string>;
    const cat = categorizeTags(tags);
    if (!cat || !out[cat]) continue;
    const key = `${el.type}/${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pLat = el.lat ?? el.center?.lat;
    const pLng = el.lon ?? el.center?.lon;
    out[cat].push({
      name: tags.name,
      vicinity:
        [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ") || undefined,
      types: [tags.amenity, tags.shop, tags.leisure, tags.highway, tags.railway].filter(
        (t): t is string => Boolean(t),
      ),
      distance:
        pLat != null && pLng != null ? Math.round(haversineM(lat, lng, pLat, pLng)) : undefined,
    });
  }
  return out;
}
