// Pobranie listy ostrzeżeń publicznych KNF (jedna strona HTML, robots.txt: Allow /).
// Pamięć podręczna 12 h w procesie — jedno zapytanie na wiele analiz.
import { KNF_WARNINGS_URL, parseKnfWarnings, type KnfWarningEntry } from "./knf-warnings";

const TTL_MS = 12 * 3600_000;
let cache: { at: number; entries: KnfWarningEntry[] } | null = null;
let inflight: Promise<KnfWarningEntry[] | null> | null = null;

export async function loadKnfWarnings(): Promise<{
  entries: KnfWarningEntry[] | null;
  note: string;
}> {
  if (cache && Date.now() - cache.at < TTL_MS)
    return {
      entries: cache.entries,
      note: `Lista ostrzeżeń publicznych KNF (${cache.entries.length} wpisów, pobrana ${new Date(cache.at).toISOString().slice(0, 16).replace("T", " ")} UTC).`,
    };
  inflight ??= (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(KNF_WARNINGS_URL, {
        headers: {
          "User-Agent": "FinanceYou-KYC/1.0 (+https://financeyou.pl)",
          Accept: "text/html",
          "Accept-Language": "pl-PL",
        },
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const entries = parseKnfWarnings(await res.text());
      // Ochrona przed zmianą układu strony: pusta lista to błąd, nie „brak ostrzeżeń”.
      if (entries.length < 50) return null;
      cache = { at: Date.now(), entries };
      return entries;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
  })();
  const entries = await inflight;
  return entries
    ? {
        entries,
        note: `Lista ostrzeżeń publicznych KNF (${entries.length} wpisów, pobrana teraz).`,
      }
    : {
        entries: null,
        note: "Lista ostrzeżeń publicznych KNF niedostępna (błąd pobrania lub zmiana układu strony) — sprawdź ręcznie na knf.gov.pl.",
      };
}
