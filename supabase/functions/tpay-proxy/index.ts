// supabase/functions/tpay-proxy/index.ts
//
// Aplikacja działa na Cloudflare Workers. Wychodzące żądania do API Tpay
// (openapi.tpay.com), które również stoi za Cloudflare, są blokowane przez
// Bot Fight Mode po stronie Tpay — Worker dostaje 403 "Attention Required"
// zanim żądanie dotrze do API. Ta Edge Function wykonuje żądanie z sieci
// Supabase (inny zakres IP, nie Cloudflare) i zwraca odpowiedź 1:1.
//
// Bezpieczeństwo: przepuszczamy wyłącznie żądania na host *.tpay.com.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function isTpayHost(urlStr: string): boolean {
  try {
    const h = new URL(urlStr).hostname.toLowerCase();
    return h === "tpay.com" || h.endsWith(".tpay.com");
  } catch {
    return false;
  }
}

type ProxyPayload = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
};

// Dozwolone metody — proxy obsługuje wyłącznie odczyt/utworzenie transakcji
// Tpay. Blokujemy PUT/DELETE/PATCH itd., by nie dało się użyć proxy do
// dowolnych operacji po stronie Tpay.
const ALLOWED_METHODS = new Set(["GET", "POST"]);

// Opcjonalny wspólny sekret. Jeśli ustawiony (PROXY_SHARED_SECRET), każdy
// request musi go podać w nagłówku `x-proxy-secret`. Gdy nieustawiony —
// zachowanie bez zmian (kompatybilność wsteczna).
function checkSharedSecret(req: Request): boolean {
  const expected = Deno.env.get("PROXY_SHARED_SECRET");
  if (!expected) return true;
  return req.headers.get("x-proxy-secret") === expected;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!checkSharedSecret(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: ProxyPayload;
  try {
    payload = (await req.json()) as ProxyPayload;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!payload?.url || !isTpayHost(payload.url)) {
    return new Response(JSON.stringify({ error: "Forbidden host" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const method = (payload.method ?? "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    // redirect:"manual" — host jest walidowany tylko dla pierwszego URL;
    // podążanie za 3xx pozwoliłoby ominąć allowlistę i uderzyć w dowolny
    // (także wewnętrzny) host. Odpowiedzi przekierowań nie propagujemy dalej.
    const upstream = await fetch(payload.url, {
      method,
      headers: payload.headers ?? {},
      body: payload.body ?? undefined,
      signal: controller.signal,
      redirect: "manual",
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e) {
    console.error("[tpay-proxy]", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "proxy error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timeout);
  }
});
