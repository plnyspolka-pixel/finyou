// Zapytania do rejestrów publicznych (CEIDG, wykaz VAT MF, KRS) z serwera.
//
// Aplikacja działa na Cloudflare Workers, a brama Akamai przed CEIDG
// odrzuca żądania z sieci Cloudflare („Access Denied", HTTP 403). Dlatego —
// jak Tpay (tpay.server.ts) — idziemy przez Edge Function `registry-proxy`
// w sieci Supabase. Gdy funkcji nie ma (nie wdrożona) albo SUPABASE_URL jest
// pusty (testy/lokalnie), wykonujemy żądanie bezpośrednio.
import { BROWSER_HEADERS } from "@/lib/web-fetch.server";

export interface RegistryResponse {
  ok: boolean;
  status: number;
  text: string;
  /** Odpowiedź przeszła przez registry-proxy (sieć Supabase). */
  viaProxy: boolean;
}

/** Strona odmowy bramy (Akamai) zamiast odpowiedzi API. */
export function isGatewayDenial(status: number, text: string): boolean {
  return status === 403 && /access denied/i.test(text);
}

async function direct(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<RegistryResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_HEADERS["User-Agent"],
        "Accept-Language": BROWSER_HEADERS["Accept-Language"],
        ...headers,
      },
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text, viaProxy: false };
  } finally {
    clearTimeout(timer);
  }
}

async function viaProxy(
  base: string,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<RegistryResponse | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs + 5_000);
  try {
    const secret = process.env.PROXY_SHARED_SECRET;
    const res = await fetch(`${base}/functions/v1/registry-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-proxy-secret": secret } : {}),
      },
      body: JSON.stringify({ url, headers }),
      signal: ctrl.signal,
    });
    // Odpowiedź rejestru ma nagłówek x-registry-proxy; jego brak = błąd samej
    // funkcji (np. 404 — nie wdrożona) → wracamy do żądania bezpośredniego.
    if (!res.headers.get("x-registry-proxy")) return null;
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text, viaProxy: true };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Odpowiedź wygląda na blokadę sieci/serwera, a nie na wynik zapytania. */
export function isBlockedResponse(status: number): boolean {
  return status === 403 || status === 406 || status === 429 || status >= 500;
}

/**
 * GET do rejestru. Domyślnie przez registry-proxy (CEIDG blokuje Cloudflare
 * Workers), a gdy funkcji brak — bezpośrednio. `prefer: "direct"` odwraca
 * kolejność: najpierw bezpośrednio, a przy blokadzie (403/406/429/5xx, błąd
 * sieci) przez registry-proxy — dla serwisów, które blokują sieć Supabase
 * (OpenStreetMap: Nominatim odpowiada funkcji 403).
 */
export async function registryGet(
  url: string,
  opts: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    prefer?: "proxy" | "direct";
  } = {},
): Promise<RegistryResponse> {
  const headers = opts.headers ?? {};
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const base = process.env.SUPABASE_URL;
  if (opts.prefer === "direct") {
    const first = await direct(url, headers, timeoutMs).catch(() => null);
    if (first && !isBlockedResponse(first.status)) return first;
    const proxied = base ? await viaProxy(base, url, headers, timeoutMs) : null;
    if (proxied && !isBlockedResponse(proxied.status)) return proxied;
    return first ?? proxied ?? { ok: false, status: 0, text: "", viaProxy: false };
  }
  if (base) {
    const proxied = await viaProxy(base, url, headers, timeoutMs);
    if (proxied) return proxied;
  }
  return direct(url, headers, timeoutMs);
}
