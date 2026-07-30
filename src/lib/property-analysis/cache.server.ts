// Pomocniczy cache w Supabase (server-only).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type CacheTable = "rcn_cache" | "gus_bdl_cache" | "nbp_real_estate_cache";

export async function getCached<T>(table: CacheTable, key: string): Promise<T | null> {
  const { data } = await supabaseAdmin
    .from(table)
    .select("payload, expires_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.payload as T;
}

export async function setCached<T>(
  table: CacheTable,
  key: string,
  payload: T,
  ttlDays = 30,
): Promise<void> {
  const expires = new Date(Date.now() + ttlDays * 24 * 3600 * 1000).toISOString();
  await supabaseAdmin.from(table).upsert(
    {
      cache_key: key,
      payload: payload as never,
      fetched_at: new Date().toISOString(),
      expires_at: expires,
    },
    { onConflict: "cache_key" },
  );
}

export async function withCache<T>(
  table: CacheTable,
  key: string,
  ttlDays: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = await getCached<T>(table, key);
  if (hit != null) return hit;
  const fresh = await fetcher();
  try {
    await setCached(table, key, fresh, ttlDays);
  } catch {
    /* ignore cache write errors */
  }
  return fresh;
}

export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
export function quartile(values: number[], q: 1 | 3): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * (q === 1 ? 0.25 : 0.75);
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base + 1] != null ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
}
export function filterIqrOutliers(values: number[]): number[] {
  if (values.length < 4) return values;
  const q1 = quartile(values, 1)!;
  const q3 = quartile(values, 3)!;
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return values.filter((v) => v >= lo && v <= hi);
}
