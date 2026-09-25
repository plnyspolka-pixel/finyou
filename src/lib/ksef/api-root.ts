// Automatyczne wykrywanie adresu API KSeF 2.0.
//
// Ministerstwo zmieniało już adresację (RC6.1: nowe hosty api*.ksef.mf.gov.pl,
// aktualna specyfikacja OpenAPI podaje ścieżkę `/v2`, starsze integracje używają
// `/api/v2`). Zamiast wpisywać ścieżkę na sztywno, sprawdzamy publiczny endpoint
// kluczy MF pod kolejnymi kandydatami i zapamiętujemy pierwszy działający.
// Gdy MF zmieni adres, system przełączy się sam (najpóźniej po godzinie albo
// od razu po błędzie 404), bez zmian w kodzie.
//
// Awaryjnie ścieżkę można wymusić zmienną środowiskową KSEF_API_PATH (np. "/v3"),
// która jest sprawdzana jako pierwsza.

/** Kandydaci: aktualna specyfikacja, potem dotychczasowa ścieżka. */
const DEFAULT_PREFIXES = ["/v2", "/api/v2"];
const TTL_MS = 60 * 60 * 1000;

const cache = new Map<string, { root: string; at: number }>();

function prefixes(): string[] {
  const forced = (typeof process !== "undefined" ? process.env.KSEF_API_PATH : undefined)?.trim();
  const list = forced
    ? [forced.startsWith("/") ? forced : `/${forced}`, ...DEFAULT_PREFIXES]
    : DEFAULT_PREFIXES;
  return [...new Set(list.map((p) => p.replace(/\/+$/, "")))];
}

/**
 * Zwraca działający katalog główny API (np. `https://api.ksef.mf.gov.pl/v2`)
 * dla hosta środowiska. Wynik jest zapamiętywany na godzinę.
 */
export async function resolveKsefApiRoot(
  host: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.root;
  const tried: string[] = [];
  for (const p of prefixes()) {
    const root = `${host}${p}`;
    try {
      const res = await fetchFn(`${root}/security/public-key-certificates`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (Array.isArray(body) && body.length) {
          cache.set(host, { root, at: Date.now() });
          return root;
        }
        tried.push(`${p}: nieoczekiwana odpowiedź`);
      } else {
        await res.text().catch(() => "");
        tried.push(`${p}: HTTP ${res.status}`);
      }
    } catch (e) {
      tried.push(`${p}: ${(e as Error).message}`);
    }
  }
  throw new Error(
    `Nie znaleziono działającego adresu API KSeF pod ${host} (${tried.join("; ")}). Jeśli MF zmieniło adres, ustaw zmienną KSEF_API_PATH.`,
  );
}

/** Zapomina zapamiętany adres (po 404 — następne wywołanie wykryje go od nowa). */
export function forgetKsefApiRoot(host?: string) {
  if (host) cache.delete(host);
  else cache.clear();
}
