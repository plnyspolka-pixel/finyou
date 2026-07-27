// Parser GML z publicznego zbioru RCN (deweloperuch/rejestr-cen-nieruchomosci, CC0).
// Moduł czysty (bez zależności serwerowych) — używany przez skrypt importu oraz testy.
//
// Zbiór to eksport RCN w formacie GML. Struktura pól bywa różna między powiatami,
// dlatego ekstrakcja jest DEFENSYWNA: spłaszczamy każdy obiekt do par (etykieta→wartość)
// i wyszukujemy pola po fragmentach nazw (cena / powierzchnia / data / współrzędne).
// Geometria jest w EPSG:2180 (PUWG 1992) — reprojekcja do WGS84 (lat/lng) przez proj4.
//
// UWAGA: mapowanie pól zweryfikuj na realnym pliku GML z tego zbioru i w razie potrzeby
// dostrój listy fragmentów nazw poniżej (PRICE_KEYS / AREA_KEYS / DATE_KEYS / …).

import proj4 from "proj4";
import { XMLParser } from "fast-xml-parser";

proj4.defs(
  "EPSG:2180",
  "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);

export type RcnPropertyKind = "lokal" | "budynek" | "dzialka" | "inne";

export interface RcnGmlRecord {
  externalId: string | null;
  propertyKind: RcnPropertyKind;
  /** WGS84. */
  lat: number;
  lng: number;
  txDate: string | null; // ISO yyyy-mm-dd
  pricePln: number | null;
  areaM2: number | null;
  areaHa: number | null;
  pricePerM2: number | null;
  pricePerHa: number | null;
  landUse: string | null;
}

// Granice Polski (WGS84) do walidacji reprojekcji / kolejności osi.
const PL_LAT = [48.5, 55.5] as const;
const PL_LNG = [13.5, 24.6] as const;

const PRICE_KEYS = [
  "cena_brutto",
  "cenatransakcji",
  "cena_transakcji",
  "cenanieruchomosci",
  "cena",
];
const AREA_KEYS = [
  "pole_powierzchni",
  "polepowierzchni",
  "powierzchnia_uzytkowa",
  "powierzchniauzytkowa",
  "powierzchnia",
  "obszar",
  "pole",
];
const DATE_KEYS = [
  "data_zawarcia",
  "datazawarcia",
  "data_transakcji",
  "datatransakcji",
  "data_aktu",
  "dataaktu",
  "data_czynnosci",
  "data",
];
const LANDUSE_KEYS = [
  "sposob_korzystania",
  "sposobkorzystania",
  "funkcja",
  "rodzaj_uzytku",
  "przeznaczenie",
];
const KIND_KEYS = ["rodzaj_nieruchomosci", "rodzajnieruchomosci", "rodzaj", "typ", "przedmiot"];

const COMBINING = new RegExp("[\\u0300-\\u036f]", "g");
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(COMBINING, "");
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const cleaned = v
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toIsoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

type Leaf = { key: string; value: string };

// Spłaszcza obiekt do listy liści (etykieta→wartość) — rekurencyjnie, po tablicach.
function flattenLeaves(node: unknown, out: Leaf[], keyHint = ""): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const n of node) flattenLeaves(n, out, keyHint);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith("@_") || k === "#text") {
        if (k === "#text") out.push({ key: norm(keyHint), value: String(v) });
        continue;
      }
      flattenLeaves(v, out, k);
    }
    return;
  }
  // wartość skalarna
  out.push({ key: norm(keyHint), value: String(node) });
}

function findByKeys(leaves: Leaf[], keys: string[]): string | null {
  for (const k of keys) {
    const hit = leaves.find(
      (l) =>
        l.key.includes(k) && !l.key.includes("slownie") && l.value.trim() && l.value.trim() !== "-",
    );
    if (hit) return hit.value;
  }
  return null;
}

// Znajdź współrzędne w liściach — pola pos/coordinates/corner z geometrii GML (EPSG:2180).
function findCoords(leaves: Leaf[]): [number, number] | null {
  const geomLeaf = leaves.find(
    (l) =>
      /(^|_)(pos|coordinates|lowercorner|uppercorner|point)($|_)/.test(l.key) ||
      l.key.endsWith("pos") ||
      l.key.includes("coord"),
  );
  const candidates = geomLeaf
    ? [geomLeaf.value]
    : leaves.filter((l) => /^-?\d{5,7}[\s,]+-?\d{5,7}/.test(l.value.trim())).map((l) => l.value);
  for (const raw of candidates) {
    const nums = raw
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter(Number.isFinite);
    if (nums.length < 2) continue;
    const [a, b] = nums;
    // Spróbuj obu kolejności osi (easting,northing) i (northing,easting) — wybierz tę,
    // która po reprojekcji trafia w granice Polski.
    for (const [easting, northing] of [
      [a, b],
      [b, a],
    ] as Array<[number, number]>) {
      try {
        const [lng, lat] = proj4("EPSG:2180", "EPSG:4326", [easting, northing]) as [number, number];
        if (lat >= PL_LAT[0] && lat <= PL_LAT[1] && lng >= PL_LNG[0] && lng <= PL_LNG[1]) {
          return [Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6];
        }
      } catch {
        /* próbuj dalej */
      }
    }
  }
  return null;
}

function inferKind(leaves: Leaf[], typeName: string): RcnPropertyKind {
  const explicit = findByKeys(leaves, KIND_KEYS);
  const blob =
    norm(typeName) +
    " " +
    (explicit ? norm(explicit) + " " : "") +
    leaves.map((l) => l.key).join(" ");
  if (/lokal/.test(blob)) return "lokal";
  if (/budynek|budynkow/.test(blob)) return "budynek";
  if (/dzialk|dzialek|grunt|parcela|dzialkowa/.test(blob)) return "dzialka";
  return "inne";
}

interface FeatureNode {
  node: unknown;
  typeName: string;
}

// Zbiera obiekty-cechy z drzewa GML (featureMember / member / *Member) wraz z nazwą
// typu (elementu-owijki), która niesie rodzaj nieruchomości (Lokal/Budynek/Działka).
function collectFeatureNodes(root: unknown): FeatureNode[] {
  const nodes: FeatureNode[] = [];
  const visit = (node: unknown) => {
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (/member$/i.test(k)) {
        const members = Array.isArray(v) ? v : [v];
        for (const m of members) {
          // featureMember zwykle owija jeden obiekt-cechę (klucz = nazwa typu).
          if (m && typeof m === "object" && !Array.isArray(m)) {
            const childKeys = Object.keys(m as Record<string, unknown>).filter(
              (kk) => !kk.startsWith("@_"),
            );
            if (childKeys.length === 1)
              nodes.push({ node: (m as any)[childKeys[0]], typeName: childKeys[0] });
            else nodes.push({ node: m, typeName: k });
          } else nodes.push({ node: m, typeName: k });
        }
      } else {
        visit(v);
      }
    }
  };
  visit(root);
  return nodes;
}

export function parseRcnGml(xml: string): RcnGmlRecord[] {
  if (!xml || !/<[^>]+>/.test(xml)) return [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseAttributeValue: false,
    trimValues: true,
  });
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }

  const featureNodes = collectFeatureNodes(doc);
  // Fallback: brak *member — potraktuj dzieci-tablice korzenia jako cechy.
  if (featureNodes.length === 0 && doc && typeof doc === "object") {
    for (const [rk, v] of Object.entries(doc as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        for (const [ck, vv] of Object.entries(v as Record<string, unknown>)) {
          if (Array.isArray(vv)) vv.forEach((n) => featureNodes.push({ node: n, typeName: ck }));
        }
        void rk;
      }
    }
  }

  const out: RcnGmlRecord[] = [];
  for (const { node, typeName } of featureNodes) {
    const leaves: Leaf[] = [];
    flattenLeaves(node, leaves);
    if (leaves.length === 0) continue;
    const attrId =
      node && typeof node === "object" && !Array.isArray(node)
        ? ((node as any)["@_id"] ?? (node as any)["@_gml:id"] ?? null)
        : null;

    const coords = findCoords(leaves);
    if (!coords) continue; // bez lokalizacji rekord bezużyteczny do zapytań przestrzennych
    const [lat, lng] = coords;

    const kind = inferKind(leaves, typeName);
    const pricePln = toNumber(findByKeys(leaves, PRICE_KEYS));
    const areaRaw = toNumber(findByKeys(leaves, AREA_KEYS));
    const txDate = toIsoDate(findByKeys(leaves, DATE_KEYS));
    const landUse = findByKeys(leaves, LANDUSE_KEYS);

    // Dla działek powierzchnia to grunt (m²) → także w ha; dla lokali/budynków — m² użytkowe.
    const areaM2 = areaRaw != null && areaRaw > 0 ? areaRaw : null;
    const areaHa = kind === "dzialka" && areaM2 != null ? areaM2 / 10_000 : null;
    const pricePerM2 =
      pricePln != null && areaM2 != null && areaM2 > 0 && kind !== "dzialka"
        ? pricePln / areaM2
        : null;
    const pricePerHa = pricePln != null && areaHa != null && areaHa > 0 ? pricePln / areaHa : null;

    const idLeaf = leaves.find((l) => /(^|_)(id|identyfikator|lokalnyid|idiip)($|_)/.test(l.key));
    out.push({
      externalId: (attrId ? String(attrId) : null) ?? idLeaf?.value ?? null,
      propertyKind: kind,
      lat,
      lng,
      txDate,
      pricePln,
      areaM2,
      areaHa,
      pricePerM2,
      pricePerHa,
      landUse: landUse ? landUse.trim().slice(0, 120) : null,
    });
  }
  return out;
}
