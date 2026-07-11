// Shared authentication guard for internal cron / webhook endpoints under
// /api/public/*. The caller must present a private cron secret (never the
// publicly-visible Supabase anon key) via `x-cron-secret` or `Authorization:
// Bearer`.
//
// Two accepted sources of truth for the secret:
//  1. env CRON_SECRET (manual configuration),
//  2. the `cron_config` table (key='cron_secret') — generated automatically by
//     migration 20260711120000 and used by pg_cron jobs, so the whole
//     cron→endpoint path works without any manual env setup.
import { createClient } from "@supabase/supabase-js";

let dbSecretCache: { value: string | null; at: number } = { value: null, at: 0 };

async function getDbCronSecret(): Promise<string | null> {
  const now = Date.now();
  if (dbSecretCache.at && now - dbSecretCache.at < 60_000) return dbSecretCache.value;
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    const s = createClient(url, key);
    const { data } = await s.from("cron_config").select("value").eq("key", "cron_secret").maybeSingle();
    dbSecretCache = { value: (data as { value?: string } | null)?.value ?? null, at: now };
  } catch {
    dbSecretCache = { value: null, at: now };
  }
  return dbSecretCache.value;
}

/** Constant-time string comparison (no node:crypto — works on edge runtimes). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function extractProvided(request: Request): string {
  return (
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  );
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Async guard: checks env CRON_SECRET first, then the DB-provisioned secret.
 * Returns a Response when the request must be rejected; null when authorized.
 */
export async function requireCronAuth(request: Request): Promise<Response | null> {
  const provided = extractProvided(request);
  if (!provided) return unauthorized();
  const envSecret = process.env.CRON_SECRET;
  if (envSecret && safeEqual(provided, envSecret)) return null;
  const dbSecret = await getDbCronSecret();
  if (dbSecret && safeEqual(provided, dbSecret)) return null;
  return unauthorized();
}

/**
 * @deprecated Sync variant kept for backwards compatibility — checks only env
 * CRON_SECRET, so pg_cron jobs (which use the DB secret) fail here. Use
 * `await requireCronAuth(request)` instead.
 */
export function requireCronSecret(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return new Response(
      JSON.stringify({ ok: false, error: "server_misconfigured" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const provided = extractProvided(request);
  if (!provided || !safeEqual(provided, expected)) return unauthorized();
  return null;
}
