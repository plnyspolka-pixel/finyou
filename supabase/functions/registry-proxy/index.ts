// supabase/functions/registry-proxy/index.ts
//
// Aplikacja działa na Cloudflare Workers. Brama Akamai przed hurtownią danych
// CEIDG (dane.biznes.gov.pl) odrzuca żądania z sieci Cloudflare — Worker
// dostaje stronę HTML „Access Denied" (HTTP 403) zanim żądanie dotrze do API
// i tokenu (od ~4.09.2026; wcześniej CEIDG odpowiadało). Ta Edge Function
// wykonuje żądanie z sieci Supabase (inny zakres IP) i zwraca odpowiedź 1:1 —
// jak tpay-proxy dla Tpay.
//
// Także OpenStreetMap (Nominatim, Overpass) — publiczne API bez klucza.
//
// Bezpieczeństwo: wyłącznie GET, wyłącznie hosty rejestrów publicznych
// z listy poniżej, bez podążania za przekierowaniami. Token CEIDG przychodzi
// w nagłówku Authorization od aplikacji — funkcja go nie przechowuje.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-proxy-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Rejestry publiczne, do których wolno przekazać żądanie. */
const ALLOWED_HOSTS = new Set([
  "dane.biznes.gov.pl", // CEIDG — hurtownia danych (API v3)
  "wl-api.mf.gov.pl", // wykaz podatników VAT MF
  "api-krs.ms.gov.pl", // KRS — odpisy
  "nominatim.openstreetmap.org", // OSM — geokodowanie adresów
  "overpass-api.de", // OSM — punkty w okolicy
  "services.gugik.gov.pl", // GUGiK — geokodowanie adresów (UUG)
  "photon.komoot.io", // Photon — geokodowanie (dane OSM)
]);

/** Nagłówki przekazywane do rejestru (reszta odrzucana). */
const FORWARDED_HEADERS = new Set(["authorization", "accept", "accept-language", "user-agent"]);

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function allowedUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// Opcjonalny wspólny sekret (jak w tpay-proxy): gdy PROXY_SHARED_SECRET jest
// ustawiony, każde żądanie musi go podać w nagłówku `x-proxy-secret`.
function checkSharedSecret(req: Request): boolean {
  const expected = Deno.env.get("PROXY_SHARED_SECRET");
  if (!expected) return true;
  return req.headers.get("x-proxy-secret") === expected;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!checkSharedSecret(req)) return json(401, { error: "Unauthorized" });

  let payload: { url?: string; headers?: Record<string, string> };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON payload" });
  }
  if (!payload?.url || !allowedUrl(payload.url)) return json(400, { error: "Forbidden host" });

  const headers: Record<string, string> = { "User-Agent": BROWSER_UA };
  for (const [k, v] of Object.entries(payload.headers ?? {})) {
    if (FORWARDED_HEADERS.has(k.toLowerCase())) headers[k] = v;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const upstream = await fetch(payload.url, {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "manual",
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "x-registry-proxy": "1",
      },
    });
  } catch (e) {
    console.error("[registry-proxy]", e instanceof Error ? e.message : e);
    return json(502, { error: "proxy error" });
  } finally {
    clearTimeout(timeout);
  }
});
