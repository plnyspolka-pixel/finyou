// Shared authentication guard for internal cron / webhook endpoints under
// /api/public/*. Requires the caller to present a private CRON_SECRET (not
// the publicly-visible Supabase anon key). Returns a Response when the
// request must be rejected; returns null when the request is authorized.
export function requireCronSecret(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return new Response(
      JSON.stringify({ ok: false, error: "server_misconfigured" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const provided =
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!provided || provided !== expected) {
    return new Response(
      JSON.stringify({ ok: false, error: "unauthorized" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  return null;
}
