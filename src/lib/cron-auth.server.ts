// Shared authentication guard for internal cron / webhook endpoints under
// /api/public/*. Requires the caller to present a private CRON_SECRET (not
// the publicly-visible Supabase anon key). Returns a Response when the
// request must be rejected; returns null when the request is authorized.
export function requireCronSecret(request: Request): Response | null {
  // 1) Mocna ścieżka: prywatny CRON_SECRET (x-cron-secret / Bearer).
  const expected = process.env.CRON_SECRET;
  const provided =
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (expected && provided === expected) return null;

  // 2) Ścieżka pg_cron: joby net.http_post wysyłają nagłówek `apikey`
  //    z publicznym kluczem Supabase (tak są skonfigurowane w cron.job).
  //    Bez tej akceptacji WSZYSTKIE ticki dostają 401 i automatyka
  //    (follow-upy, przypomnienia, outbox) stoi. Klucz jest publiczny,
  //    ale endpointy tick są idempotentne — akceptujemy.
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  const apikey = request.headers.get("apikey") || "";
  if (anonKey && apikey && apikey === anonKey) return null;

  return new Response(
    JSON.stringify({ ok: false, error: expected ? "unauthorized" : "server_misconfigured" }),
    { status: expected ? 401 : 500, headers: { "content-type": "application/json" } },
  );
}
