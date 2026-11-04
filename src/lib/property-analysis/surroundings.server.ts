// Otoczenie nieruchomości z otwartych źródeł (EEA, OSM Overpass, ULDK, GUS BDL).
import { registryGet } from "@/lib/registry-fetch.server";
import { BDL, getJson as bdlJson } from "@/lib/risk-assessment/regional-longevity.server";
import { fetchBuildingByPoint } from "./uldk.server";
import {
  PL_DESIGNATION_LABEL,
  natura2000Type,
  nearestNuisances,
  type NuisancesInfo,
  type PowiatStats,
  type ProtectedAreaHit,
  type ProtectedAreasInfo,
  type SurroundingsInfo,
} from "./surroundings";

const UA = "FinanceYou-Analysis/1.0 (+https://financeyou.pl)";
const EEA = "https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites";

async function getJson(url: string, timeoutMs = 20_000): Promise<any> {
  const r = await registryGet(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeoutMs,
    prefer: "direct",
  }).catch(() => null);
  if (!r?.ok) return null;
  try {
    return JSON.parse(r.text);
  } catch {
    return null;
  }
}

export async function fetchProtectedAreas(lat: number, lng: number): Promise<ProtectedAreasInfo> {
  const point = `${lng},${lat}`;
  const natura = new URLSearchParams({
    geometry: point,
    geometryType: "esriGeometryPoint",
    sr: "4326",
    layers: "all",
    tolerance: "0",
    mapExtent: "14,49,24,55",
    imageDisplay: "1000,1000,96",
    returnGeometry: "false",
    f: "json",
  });
  const national = new URLSearchParams({
    geometry: point,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "siteName,designationTypeCode,iucnDescri",
    returnGeometry: "false",
    f: "json",
  });
  const [n2k, cdda] = await Promise.all([
    getJson(`${EEA}/Natura2000Sites/MapServer/identify?${natura}`),
    getJson(`${EEA}/CDDA_Dyna_WM/MapServer/3/query?${national}`),
  ]);
  if (!n2k && !cdda) {
    return {
      status: "unavailable",
      areas: [],
      note: "Usługi EEA (Natura 2000, krajowe formy ochrony) nie odpowiedziały — sprawdź w Geoserwisie GDOŚ.",
    };
  }
  const areas: ProtectedAreaHit[] = [];
  const seen = new Set<string>();
  for (const r of n2k?.results ?? []) {
    const a = r.attributes ?? {};
    const code = a.SITECODE ?? null;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    areas.push({
      kind: "natura2000",
      code,
      name: String(a.SITENAME ?? code),
      type: natura2000Type(a.SITETYPE, String(r.layerName ?? "")),
    });
  }
  for (const f of cdda?.features ?? []) {
    const a = f.attributes ?? {};
    const name = String(a.siteName ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    areas.push({
      kind: "krajowa",
      code: a.designationTypeCode ?? null,
      name,
      type: PL_DESIGNATION_LABEL[a.designationTypeCode] ?? "Forma ochrony przyrody",
    });
  }
  return {
    status: "checked",
    areas,
    note: areas.length
      ? "Nieruchomość w granicach obszaru chronionego — możliwe ograniczenia zabudowy i użytkowania (plan ochrony, ocena oddziaływania na środowisko)."
      : "Punkt poza obszarami Natura 2000 i krajowymi formami ochrony przyrody (dane EEA zgłoszone przez Polskę).",
  };
}

export async function fetchNuisances(
  lat: number,
  lng: number,
  radiusM = 2000,
): Promise<NuisancesInfo> {
  const a = `(around:${radiusM},${lat},${lng})`;
  const q =
    `[out:json][timeout:25];(` +
    `way${a}["highway"~"^(motorway|trunk|primary)$"];` +
    `way${a}["railway"="rail"];` +
    `nwr${a}["aeroway"="aerodrome"];` +
    `way${a}["power"="line"];` +
    `nwr${a}["landuse"~"^(industrial|landfill|cemetery)$"];` +
    `nwr${a}["man_made"="wastewater_plant"];` +
    `node${a}["power"="generator"]["generator:source"="wind"];` +
    `);out tags geom 400;`;
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];
  for (const ep of endpoints) {
    const d = await getJson(`${ep}?data=${encodeURIComponent(q)}`, 30_000);
    if (d?.elements) {
      const hits = nearestNuisances(lat, lng, d.elements);
      return {
        status: "checked",
        radiusM,
        hits,
        note: hits.some((h) => h.alert)
          ? "W bliskiej odległości są uciążliwości, które mogą obniżać wartość i płynność (hałas, widok, strefy ochronne)."
          : "Brak istotnych uciążliwości w najbliższym otoczeniu (OpenStreetMap — dane mogą być niekompletne).",
      };
    }
  }
  return {
    status: "unavailable",
    radiusM,
    hits: [],
    note: "OpenStreetMap (Overpass) nie odpowiedział.",
  };
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase("pl-PL")
    .replace(/^\s*(powiat|m\.?\s*st\.?|m\.)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();

function latest(values: any[] | undefined): { year: string; val: number } | null {
  const v = (values ?? []).filter((x) => typeof x?.val === "number").at(-1);
  return v ? { year: String(v.year), val: Number(v.val) } : null;
}

/** Zmienne BDL (powiat): ludność, saldo migracji, stopa bezrobocia, wynagrodzenia (PL=100). */
const VAR = { population: 72305, migration: 1365234, unemployment: 60270, wages: 64429 };

export async function fetchPowiatStats(county: string | null): Promise<PowiatStats> {
  const empty = (note: string): PowiatStats => ({
    status: "unavailable",
    unitName: null,
    year: null,
    population: null,
    populationChange5yPct: null,
    migrationPer1000: null,
    unemploymentPct: null,
    unemploymentPolandPct: null,
    wageIndexPl100: null,
    note,
  });
  if (!county) return empty("Brak powiatu nieruchomości — statystyk GUS nie pobrano.");
  const q = norm(county);
  const s = await bdlJson(
    `${BDL}/units/search?name=${encodeURIComponent(q)}&level=5&format=json&page-size=20`,
  );
  const hits: any[] = s?.results ?? [];
  const unit =
    hits.find((u) => norm(String(u.name)) === q) ??
    hits.find((u) => norm(String(u.name)).endsWith(q)) ??
    (hits.length === 1 ? hits[0] : null);
  if (!unit) return empty(`Nie znaleziono powiatu „${county}” w GUS BDL.`);
  const vars = Object.values(VAR)
    .map((v) => `var-id=${v}`)
    .join("&");
  const [d, pl] = await Promise.all([
    bdlJson(`${BDL}/data/by-unit/${unit.id}?${vars}&format=json`),
    bdlJson(`${BDL}/data/by-unit/000000000000?var-id=${VAR.unemployment}&format=json`),
  ]);
  if (!d?.results) return empty("GUS BDL nie zwrócił danych powiatu.");
  const byVar = new Map<number, any[]>((d.results as any[]).map((r) => [Number(r.id), r.values]));
  const pop = latest(byVar.get(VAR.population));
  const popHist = (byVar.get(VAR.population) ?? []).filter((x: any) => typeof x?.val === "number");
  const pop5 = pop ? popHist.find((x: any) => Number(x.year) === Number(pop.year) - 5) : null;
  const mig = latest(byVar.get(VAR.migration));
  const unemp = latest(byVar.get(VAR.unemployment));
  const unempPl = latest(pl?.results?.[0]?.values);
  const wages = latest(byVar.get(VAR.wages));
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    status: "checked",
    unitName: String(unit.name),
    year: pop?.year ?? unemp?.year ?? null,
    population: pop?.val ?? null,
    populationChange5yPct: pop && pop5 ? r1(((pop.val - pop5.val) / pop5.val) * 100) : null,
    migrationPer1000: mig && pop ? r1((mig.val / pop.val) * 1000) : null,
    unemploymentPct: unemp?.val ?? null,
    unemploymentPolandPct: unempPl?.val ?? null,
    wageIndexPl100: wages?.val ?? null,
    note: "GUS — Bank Danych Lokalnych (powiat nieruchomości).",
  };
}

/** Komplet danych o otoczeniu — każde źródło niezależnie (błąd jednego nie blokuje reszty). */
export async function fetchSurroundings(args: {
  lat: number | null;
  lng: number | null;
  exactPoint: boolean;
  county: string | null;
}): Promise<SurroundingsInfo> {
  const { lat, lng } = args;
  const has = lat != null && lng != null;
  const [protectedAreas, nuisances, building, powiat] = await Promise.all([
    has ? fetchProtectedAreas(lat!, lng!).catch(() => null) : Promise.resolve(null),
    has && args.exactPoint ? fetchNuisances(lat!, lng!).catch(() => null) : Promise.resolve(null),
    has && args.exactPoint
      ? fetchBuildingByPoint(lat!, lng!).catch(() => null)
      : Promise.resolve(null),
    fetchPowiatStats(args.county).catch(() => null),
  ]);
  return { protectedAreas, nuisances, building, powiat };
}
