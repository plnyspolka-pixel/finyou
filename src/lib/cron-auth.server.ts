// Shared authentication guard for internal cron / webhook endpoints under
// /api/public/*. Requires the caller to present a private CRON_SECRET (not
// the publicly-visible Supabase anon key). Returns a Response when the
// request must be rejected; returns null when the request is authorized.
import { timingSafeEqual } from "node:crypto";

// Constant-time string comparison. Guards against timing side-channels on
// secret comparisons. Returns false on any length mismatch without leaking
// the compared length beyond the boolean result.
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// True only when the caller presents the PRIVATE CRON_SECRET (x-cron-secret
// or Bearer). This is the strong signal used to gate sensitive bypasses
// (e.g. `?force=1`) that the public anon-key path must NOT unlock.
export function hasPrivateCronSecret(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const provided =
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  return provided.length > 0 && safeEqual(provided, expected);
}

// Guard for external webhooks authenticated by a shared secret header
// (`x-webhook-secret`), e.g. ElevenLabs conversational-AI callbacks. Fails
// closed: 500 when the secret is not configured, 401 when it does not match.
// Returns null when authorized. Comparison is constant-time.
export function requireWebhookSecret(request: Request, envVar: string): Response | null {
  const expected = process.env[envVar];
  if (!expected) {
    return new Response(JSON.stringify({ ok: false, error: "server_misconfigured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const provided = request.headers.get("x-webhook-secret") || "";
  if (!provided || !safeEqual(provided, expected)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}

export function requireCronSecret(request: Request): Response | null {
  // 1) Mocna ścieżka: prywatny CRON_SECRET (x-cron-secret / Bearer).
  if (hasPrivateCronSecret(request)) return null;

  const expected = process.env.CRON_SECRET;

  // 2) Ścieżka pg_cron: joby net.http_post wysyłają nagłówek `apikey`
  //    z publicznym kluczem Supabase (tak są skonfigurowane w cron.job).
  //    Bez tej akceptacji WSZYSTKIE ticki dostają 401 i automatyka
  //    (follow-upy, przypomnienia, outbox) stoi. Klucz jest publiczny,
  //    ale endpointy tick są idempotentne — akceptujemy jako słabszy sygnał.
  //    UWAGA: ta ścieżka NIE odblokowuje wrażliwych bypassów (patrz
  //    hasPrivateCronSecret) — służy wyłącznie do rutynowego tick'owania.
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  const apikey = request.headers.get("apikey") || "";
  if (anonKey && apikey && safeEqual(apikey, anonKey)) return null;

  return new Response(
    JSON.stringify({ ok: false, error: expected ? "unauthorized" : "server_misconfigured" }),
    { status: expected ? 401 : 500, headers: { "content-type": "application/json" } },
  );
}
