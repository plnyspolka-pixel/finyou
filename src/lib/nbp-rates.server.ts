// Pobieranie aktualnych podstawowych stóp procentowych NBP bezpośrednio z oficjalnego
// źródła NBP: https://static.nbp.pl/dane/stopy/stopy_procentowe.xml
// (publiczny, bez klucza; ten sam plik, który zasila stronę nbp.pl/stopy-procentowe).

export interface NbpRates {
  referenceRate: number; // stopa referencyjna NBP (%)
  lombardRate: number | null; // stopa lombardowa (%)
  depositRate: number | null; // stopa depozytowa (%)
  rediscountRate: number | null;
  effectiveFrom: string | null; // data obowiązywania (ISO)
  fetchedAt: string; // kiedy pobraliśmy
  source: "nbp" | "fallback";
  citations: string[];
}

// Awaryjny snapshot — używany tylko gdy NBP jest nieosiągalny.
const FALLBACK: NbpRates = {
  referenceRate: 3.75,
  lombardRate: 4.25,
  depositRate: 3.25,
  rediscountRate: 3.8,
  effectiveFrom: null,
  fetchedAt: new Date(0).toISOString(),
  source: "fallback",
  citations: [],
};

let CACHE: { value: NbpRates; expiresAt: number } | null = null;
const TTL_MS = 12 * 60 * 60 * 1000; // 12h
const NBP_URL = "https://static.nbp.pl/dane/stopy/stopy_procentowe.xml";

function parsePct(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function pickPozycja(xml: string, id: string): { rate: number | null; from: string | null } {
  // Dopasuj <pozycja ... id="X" ... /> z dowolną kolejnością atrybutów.
  const re = new RegExp(`<pozycja\\b[^/]*id="${id}"[^/]*/>`, "i");
  const m = xml.match(re);
  if (!m) return { rate: null, from: null };
  const block = m[0];
  const rate = parsePct(block.match(/oprocentowanie="([^"]+)"/i)?.[1]);
  const from = block.match(/obowiazuje_od="([^"]+)"/i)?.[1] ?? null;
  return { rate, from };
}

async function fetchFromNbp(): Promise<NbpRates | null> {
  try {
    const res = await fetch(NBP_URL, {
      headers: { "User-Agent": "FinanceYou/1.0", Accept: "application/xml,text/xml,*/*" },
    });
    if (!res.ok) return null;
    const xml = await res.text();

    const ref = pickPozycja(xml, "ref");
    if (ref.rate == null || ref.rate <= 0 || ref.rate > 30) return null;

    const lom = pickPozycja(xml, "lom");
    const dep = pickPozycja(xml, "dep");
    const red = pickPozycja(xml, "red");

    return {
      referenceRate: ref.rate,
      lombardRate: lom.rate,
      depositRate: dep.rate,
      rediscountRate: red.rate,
      effectiveFrom: ref.from,
      fetchedAt: new Date().toISOString(),
      source: "nbp",
      citations: [NBP_URL],
    };
  } catch {
    return null;
  }
}

export async function getNbpRatesCached(): Promise<NbpRates> {
  const now = Date.now();
  if (CACHE && CACHE.expiresAt > now) return CACHE.value;
  const fresh = await fetchFromNbp();
  const value = fresh ?? FALLBACK;
  CACHE = { value, expiresAt: now + TTL_MS };
  return value;
}
