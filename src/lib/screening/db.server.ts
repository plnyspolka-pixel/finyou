// Wspólne elementy serwerowe modułu screeningu: klient service_role, ustawienia,
// log audytowy, skróty i stronicowanie odczytów.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_SCORING, type ScoringSettings } from "./scoring";
import type { SourceKey } from "./sources/types";

// Tabele modułu nie są jeszcze w wygenerowanych typach Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sdb = supabaseAdmin as any;

export interface SourceConfig {
  enabled: boolean;
  url?: string;
  base_url?: string;
  endpoint?: string;
  sdn_url?: string;
  alt_url?: string;
  terms_back?: number;
  page_size?: number;
  krs_numbers?: string[];
}

export interface ScreeningSettings {
  possible_match_threshold: number;
  strong_match_threshold: number;
  dob_exact_bonus: number;
  dob_year_bonus: number;
  dob_mismatch_penalty: number;
  nationality_bonus: number;
  pep_grace_months: number;
  wikidata_min_end_year: number;
  candidate_min_similarity: number;
  candidate_limit: number;
  aml_officer_emails: string[];
  board_emails: string[];
  sources: Partial<Record<SourceKey, SourceConfig>>;
  frequencies: Record<string, string>;
  import_alert_failed_cycles: number;
  declaration_text_version: string;
  http_user_agent: string;
}

export const DEFAULT_SETTINGS: ScreeningSettings = {
  possible_match_threshold: 70,
  strong_match_threshold: 90,
  dob_exact_bonus: 10,
  dob_year_bonus: 5,
  dob_mismatch_penalty: 25,
  nationality_bonus: 3,
  pep_grace_months: 12,
  wikidata_min_end_year: 2000,
  candidate_min_similarity: 0.35,
  candidate_limit: 60,
  aml_officer_emails: [],
  board_emails: [],
  sources: {},
  frequencies: {},
  import_alert_failed_cycles: 2,
  declaration_text_version: "pep-2026-10-v1",
  http_user_agent: "FinanceYouAMLScreening/1.0 (+https://financeyou.pl; aml)",
};

export async function getScreeningSettings(): Promise<ScreeningSettings> {
  const { data, error } = await sdb.from("screening_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(`screening_settings: ${error.message}`);
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as ScreeningSettings;
}

export function scoringFrom(s: ScreeningSettings): ScoringSettings {
  return {
    ...DEFAULT_SCORING,
    possibleThreshold: s.possible_match_threshold,
    strongThreshold: s.strong_match_threshold,
    dobExactBonus: s.dob_exact_bonus,
    dobYearBonus: s.dob_year_bonus,
    dobMismatchPenalty: s.dob_mismatch_penalty,
    nationalityBonus: s.nationality_bonus,
  };
}

export type AuditEntity = "run" | "case" | "hit" | "subject" | "declaration" | "import" | "settings" | "catalog" | "queue";

/** Wpis do nieusuwalnego logu audytowego. Błąd zapisu logujemy głośno, ale nie przerywamy operacji. */
export async function screeningAudit(entry: {
  eventType: string;
  entityType: AuditEntity;
  entityId?: string | null;
  subjectId?: string | null;
  actorId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await sdb.from("screening_audit_log").insert({
    event_type: entry.eventType,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    subject_id: entry.subjectId ?? null,
    actor_id: entry.actorId ?? null,
    actor_kind: entry.actorId ? "user" : "system",
    details: entry.details ?? {},
  });
  if (error) console.error("[screening audit] nie zapisano wpisu:", error.message, entry.eventType);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stabilna serializacja (posortowane klucze) — do odcisków i hashy rekordów. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Odczyt wszystkich wierszy zapytania stronami po 1000 (limit PostgREST). */
export async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Data ostatniego udanego (lub „bez zmian”) importu każdego źródła — wersje źródeł dla przebiegu. */
export async function sourcesVersions(): Promise<Record<string, string>> {
  const { data } = await sdb
    .from("screening_source_imports")
    .select("source, finished_at, status")
    .in("status", ["success", "unchanged"])
    .order("finished_at", { ascending: false })
    .limit(500);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as Array<{ source: string; finished_at: string }>) {
    if (!out[r.source]) out[r.source] = r.finished_at;
  }
  return out;
}
