// Inflacja CPI r/r (średnioroczna) z GUS BDL dla kalkulatora inwestora.
// Zmienna wyszukiwana po oficjalnej nazwie wskaźnika („wskaźniki cen towarów
// i usług konsumpcyjnych", rok poprzedni = 100) na poziomie Polski, bo BDL
// nie gwarantuje stabilności identyfikatorów między aktualizacjami słowników.
// Gdy GUS jest nieosiągalny, używamy awaryjnego snapshotu (jak w nbp-rates.server).

export interface InflationIndicator {
  cpiYoYPct: number; // inflacja CPI rok do roku (%), np. 3.6
  period: string; // okres, którego dotyczy wskaźnik, np. "2025 (średnioroczna)"
  source: "gus" | "fallback";
  citations: string[];
}

// Awaryjny snapshot — średnioroczny CPI GUS za 2025 r.
const FALLBACK: InflationIndicator = {
  cpiYoYPct: 3.6,
  period: "2025 (średnioroczna)",
  source: "fallback",
  citations: [],
};

const BDL_BASE = "https://bdl.stat.gov.pl/api/v1";
const POLAND_UNIT_ID = "000000000000";
const CPI_VARIABLE_NAME = "wskaźniki cen towarów i usług konsumpcyjnych";

let CACHE: { value: InflationIndicator; expiresAt: number } | null = null;
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

function bdlHeaders(): HeadersInit {
  const key = process.env.GUS_BDL_API_KEY;
  return key ? { "X-ClientId": key, Accept: "application/json" } : { Accept: "application/json" };
}

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁ]/g, "l")
    .toLowerCase();
}

interface BdlVariable {
  id: number | string;
  n1?: string;
  n2?: string;
  n3?: string;
  n4?: string;
  n5?: string;
  measureUnitName?: string;
}

async function findCpiVariableId(): Promise<string | null> {
  const url = `${BDL_BASE}/variables/search?name=${encodeURIComponent(CPI_VARIABLE_NAME)}&format=json&page-size=100`;
  const res = await fetch(url, { headers: bdlHeaders() });
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: BdlVariable[] };
  const list = json.results ?? [];
  if (!list.length) return null;
  const label = (v: BdlVariable) =>
    norm([v.n1, v.n2, v.n3, v.n4, v.n5].filter(Boolean).join(" | "));
  // Preferuj wskaźnik „rok poprzedni = 100" dla kategorii ogółem — to on daje
  // średnioroczną inflację r/r. Dalsze fallbacki: dowolny „rok poprzedni", pierwszy wynik.
  const yoy = list.filter((v) => label(v).includes("rok poprzedni"));
  const picked = yoy.find((v) => label(v).includes("ogolem")) ?? yoy[0] ?? list[0];
  return picked ? String(picked.id) : null;
}

async function fetchLatestCpiForPoland(
  varId: string,
): Promise<{ value: number; year: string } | null> {
  const url = `${BDL_BASE}/data/by-unit/${POLAND_UNIT_ID}?var-id=${varId}&format=json&page-size=50`;
  const res = await fetch(url, { headers: bdlHeaders() });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    results?: Array<{ values?: Array<{ val?: number; year?: string }> }>;
  };
  const values = (json.results?.[0]?.values ?? [])
    .filter((v) => typeof v.val === "number")
    .sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0));
  const top = values[0];
  if (!top || top.val == null || !top.year) return null;
  return { value: top.val, year: top.year };
}

async function fetchFromGus(): Promise<InflationIndicator | null> {
  try {
    const varId = await findCpiVariableId();
    if (!varId) return null;
    const point = await fetchLatestCpiForPoland(varId);
    if (!point) return null;
    // BDL podaje indeks (rok poprzedni = 100), np. 103,6 → inflacja 3,6% r/r.
    const cpiYoYPct = Math.round((point.value - 100) * 10) / 10;
    if (point.value < 50 || point.value > 200 || !Number.isFinite(cpiYoYPct)) return null;
    return {
      cpiYoYPct,
      period: `${point.year} (średnioroczna)`,
      source: "gus",
      citations: [`${BDL_BASE} (GUS BDL, zmienna ${varId}, Polska)`],
    };
  } catch {
    return null;
  }
}

export async function getInflationCached(): Promise<InflationIndicator> {
  const now = Date.now();
  if (CACHE && CACHE.expiresAt > now) return CACHE.value;
  const fresh = await fetchFromGus();
  const value = fresh ?? FALLBACK;
  CACHE = { value, expiresAt: now + TTL_MS };
  return value;
}
