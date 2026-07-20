// Klient Dilisense (screening sankcyjny/PEP/kryminalny).
// Wywołania WYŁĄCZNIE po stronie serwera — klucz DILISENSE_API_KEY żyje
// w sekretach środowiska i nigdy nie trafia do frontendu.
// Wyniki cache'ujemy w tabeli dilisense_cache (TTL 24h), żeby nie płacić
// wielokrotnie za ten sam odpyt.
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE_URL = "https://api.dilisense.com/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface DilisenseQuery {
  names: string;
  dob?: string; // format wymagany przez Dilisense: DD.MM.YYYY lub YYYY
}

export interface DilisenseResult {
  totalHits: number;
  foundRecords: unknown[];
  raw: unknown;
  fromCache: boolean;
}

function cacheKey(searchType: string, q: DilisenseQuery): string {
  return createHash("sha256")
    .update(JSON.stringify({ searchType, names: q.names.trim().toLowerCase(), dob: q.dob ?? null }))
    .digest("hex");
}

async function readCache(key: string): Promise<DilisenseResult | null> {
  const { data } = await supabaseAdmin
    .from("dilisense_cache")
    .select("result, total_hits, expires_at, error_code")
    .eq("cache_key", key)
    .maybeSingle();
  if (!data || data.error_code || !data.result) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  const raw = data.result as { found_records?: unknown[]; total_hits?: number };
  return {
    totalHits: data.total_hits ?? raw.total_hits ?? 0,
    foundRecords: raw.found_records ?? [],
    raw,
    fromCache: true,
  };
}

async function writeCache(
  key: string,
  searchType: string,
  q: DilisenseQuery,
  result: unknown,
  totalHits: number,
  error?: { code: string; message: string },
) {
  await supabaseAdmin.from("dilisense_cache").upsert({
    cache_key: key,
    search_type: searchType,
    query: q as never,
    result: (result ?? null) as never,
    total_hits: totalHits,
    fetched_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    error_code: error?.code ?? null,
    error_message: error?.message ?? null,
  });
}

async function callDilisense(
  endpoint: "checkIndividual" | "checkEntity",
  q: DilisenseQuery,
): Promise<DilisenseResult> {
  const apiKey = process.env.DILISENSE_API_KEY;
  if (!apiKey) {
    throw new Error("Brak klucza DILISENSE_API_KEY w sekretach środowiska.");
  }

  const key = cacheKey(endpoint, q);
  const cached = await readCache(key);
  if (cached) return cached;

  const params = new URLSearchParams({ names: q.names, fuzzy_search: "1" });
  if (q.dob) params.set("dob", q.dob);

  const res = await fetch(`${BASE_URL}/${endpoint}?${params.toString()}`, {
    method: "GET",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    await writeCache(key, endpoint, q, null, 0, {
      code: String(res.status),
      message: body.slice(0, 500),
    });
    throw new Error(`Dilisense ${endpoint} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { total_hits?: number; found_records?: unknown[] };
  const totalHits = json.total_hits ?? json.found_records?.length ?? 0;
  await writeCache(key, endpoint, q, json, totalHits);
  return { totalHits, foundRecords: json.found_records ?? [], raw: json, fromCache: false };
}

/** Screening osoby fizycznej: GET /v1/checkIndividual (names, dob, fuzzy_search=1). */
export function checkIndividual(q: DilisenseQuery): Promise<DilisenseResult> {
  return callDilisense("checkIndividual", q);
}

/** Screening podmiotu: GET /v1/checkEntity (names, fuzzy_search=1). */
export function checkEntity(q: { names: string }): Promise<DilisenseResult> {
  return callDilisense("checkEntity", q);
}

/**
 * Odcisk danych screeningu — zmiana danych klienta, reprezentantów albo
 * beneficjentów przed podpisaniem umowy unieważnia screening (porównujemy
 * fingerprint zapisany przy screeningu z bieżącym).
 */
export function screeningFingerprint(input: {
  name: string;
  dob?: string | null;
  representatives?: { name: string }[];
  beneficialOwners?: { name: string }[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        name: input.name.trim().toLowerCase(),
        dob: input.dob ?? null,
        reps: (input.representatives ?? []).map((r) => r.name.trim().toLowerCase()).sort(),
        ubos: (input.beneficialOwners ?? []).map((b) => b.name.trim().toLowerCase()).sort(),
      }),
    )
    .digest("hex");
}
