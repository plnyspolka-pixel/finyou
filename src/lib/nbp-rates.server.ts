// Pobieranie aktualnych podstawowych stóp procentowych NBP.
// NBP nie udostępnia publicznego JSON-a ze stopami (strony są chronione przez WAF),
// więc używamy Perplexity (sonar) z filtrem domeny nbp.pl jako wiarygodnego źródła.

export interface NbpRates {
  referenceRate: number;        // stopa referencyjna NBP (%)
  lombardRate: number | null;   // stopa lombardowa (%)
  depositRate: number | null;   // stopa depozytowa (%)
  rediscountRate: number | null;
  effectiveFrom: string | null; // data obowiązywania (ISO)
  fetchedAt: string;            // kiedy pobraliśmy
  source: "perplexity" | "fallback";
  citations: string[];
}

// Fallback — stan na 2026-06 (NBP ref. 3.75%). Używany tylko gdy Perplexity zawiedzie.
// UWAGA: stopa referencyjna zmienia się z każdą decyzją RPP — wartość poniżej jest tylko
// awaryjna; produkcyjnie pobieramy stopę na żywo (api/perplexity) i pozwalamy ją nadpisać
// ręcznie w kalkulatorze inwestora.
const FALLBACK: NbpRates = {
  referenceRate: 3.75,
  lombardRate: 4.25,
  depositRate: 3.25,
  rediscountRate: 3.80,
  effectiveFrom: null,
  fetchedAt: new Date(0).toISOString(),
  source: "fallback",
  citations: [],
};

let CACHE: { value: NbpRates; expiresAt: number } | null = null;
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

function extractJson(s: string): any | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function fetchFromPerplexity(): Promise<NbpRates | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "Odpowiadasz wyłącznie poprawnym JSON-em, bez backticków." },
          { role: "user", content:
            `Podaj aktualne podstawowe stopy procentowe Narodowego Banku Polskiego. ` +
            `Zwróć wyłącznie JSON: { "referenceRate": number, "lombardRate": number, ` +
            `"depositRate": number, "rediscountRate": number, "effectiveFrom": "YYYY-MM-DD" }. ` +
            `Wartości w procentach (np. 5.75 dla 5,75%). Źródło: nbp.pl.`,
          },
        ],
        temperature: 0,
        search_recency_filter: "month",
        search_domain_filter: ["nbp.pl"],
      }),
    });

    if (!res.ok) return null;
    const j: any = await res.json();
    const content: string = j?.choices?.[0]?.message?.content ?? "";
    const citations: string[] = Array.isArray(j?.citations) ? j.citations : [];
    const parsed = extractJson(content);
    if (!parsed) return null;

    const ref = Number(parsed.referenceRate);
    if (!Number.isFinite(ref) || ref <= 0 || ref > 30) return null;

    return {
      referenceRate: ref,
      lombardRate: Number.isFinite(Number(parsed.lombardRate)) ? Number(parsed.lombardRate) : null,
      depositRate: Number.isFinite(Number(parsed.depositRate)) ? Number(parsed.depositRate) : null,
      rediscountRate: Number.isFinite(Number(parsed.rediscountRate)) ? Number(parsed.rediscountRate) : null,
      effectiveFrom: typeof parsed.effectiveFrom === "string" ? parsed.effectiveFrom : null,
      fetchedAt: new Date().toISOString(),
      source: "perplexity",
      citations,
    };
  } catch {
    return null;
  }
}

export async function getNbpRatesCached(): Promise<NbpRates> {
  const now = Date.now();
  if (CACHE && CACHE.expiresAt > now) return CACHE.value;
  const fresh = await fetchFromPerplexity();
  const value = fresh ?? FALLBACK;
  CACHE = { value, expiresAt: now + TTL_MS };
  return value;
}
