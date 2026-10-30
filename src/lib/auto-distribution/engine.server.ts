// Silnik auto-dystrybucji: kwalifikuje KOMPLETNE wnioski (pusty brief braków,
// potencjał lokalizacyjny >= próg — brak score liczy się jak neutralne 40)
// i dopasowuje instytucje po ich kryteriach (widełki kwotowe, zawieszenia).
// ROZRUCH Z ZATWIERDZANIEM: silnik tylko PROPONUJE (auto_distribution_proposals),
// wysyłkę zatwierdza człowiek w /admin/auto-dystrybucja; sama wysyłka idzie
// rdzeniem distributeOfferToInvestors — dokładnie jak dystrybucja ręczna.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LEGACY_STATUS_MAP } from "@/lib/loan-status";

/** Statusy, w których wniosek może kwalifikować się do dystrybucji. */
const CANDIDATE_STATUSES = new Set([
  "braki_w_dokumentach",
  "do_kontaktu",
  "w_follow_upie",
  "wniosek_kompletny",
  "do_analizy",
  "rokuje",
  "wyslany_do_inwestorow",
]);

/** Lista wartości enuma w bazie (kanoniczne + legacy mapowane na kandydatów) —
 *  filtr statusu MUSI być w SQL, inaczej limit okna zapycha się zamkniętymi. */
export const CANDIDATE_DB_STATUSES: string[] = [
  ...CANDIDATE_STATUSES,
  ...Object.entries(LEGACY_STATUS_MAP)
    .filter(([, canonical]) => CANDIDATE_STATUSES.has(canonical))
    .map(([legacy]) => legacy),
];

export interface AutoDistributionSettings {
  enabled: boolean;
  min_location_score: number;
  daily_send_limit: number;
}

export interface ProposalMatch {
  investor_id: string;
  name: string;
  reason: string;
}

export async function loadAutoDistributionSettings(): Promise<AutoDistributionSettings> {
  const { data } = await (supabaseAdmin as any)
    .from("auto_distribution_settings")
    .select("enabled, min_location_score, daily_send_limit")
    .eq("id", 1)
    .maybeSingle();
  return {
    enabled: false, // Automatyczna dystrybucja zablokowana niezależnie od ustawień bazy.
    min_location_score: Number(data?.min_location_score ?? 40),
    daily_send_limit: Number(data?.daily_send_limit ?? 20),
  };
}

/** Dopasowanie instytucji do kwoty wniosku wg kryteriów. */
export function matchInvestorToAmount(
  criteria: {
    min_amount: number | null;
    max_amount: number | null;
    auto_send_enabled: boolean;
    accepting_applications: boolean;
    paused_until: string | null;
  } | null,
  loanAmount: number,
  now = new Date(),
): { ok: boolean; reason: string } {
  if (!criteria) return { ok: true, reason: "brak zdefiniowanych kryteriów — bez ograniczeń" };
  if (!criteria.auto_send_enabled) return { ok: false, reason: "auto-wysyłka wyłączona" };
  if (!criteria.accepting_applications) return { ok: false, reason: "nie przyjmuje wniosków" };
  if (criteria.paused_until && new Date(criteria.paused_until) > now) {
    return { ok: false, reason: `zawieszone do ${criteria.paused_until.slice(0, 10)}` };
  }
  if (criteria.min_amount != null && loanAmount < Number(criteria.min_amount)) {
    return { ok: false, reason: `kwota poniżej progu ${criteria.min_amount}` };
  }
  if (criteria.max_amount != null && loanAmount > Number(criteria.max_amount)) {
    return { ok: false, reason: `kwota powyżej limitu ${criteria.max_amount}` };
  }
  const bounds = [
    criteria.min_amount != null ? `od ${criteria.min_amount}` : null,
    criteria.max_amount != null ? `do ${criteria.max_amount}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { ok: true, reason: bounds ? `kwota w widełkach ${bounds}` : "bez ograniczeń kwotowych" };
}

export interface SyncResult {
  scanned: number;
  eligible: number;
  proposed: number;
  refreshed: number;
  skipped_no_matches: number;
}

/**
 * Przegląd wniosków i tworzenie/odświeżanie propozycji wysyłki.
 * Wywoływane przez cron tick; idempotentne (jedna otwarta propozycja per wniosek).
 */
export async function syncAutoDistributionProposals(): Promise<SyncResult | { disabled: true }> {
  // Twarda blokada na serwerze: cron i ręczne wywołania nie tworzą propozycji.
  return { disabled: true };
}

/** Liczba wysyłek zatwierdzonych w ostatniej dobie (bezpiecznik dzienny). */
export async function approvedSendsLast24h(): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await (supabaseAdmin as any)
    .from("auto_distribution_proposals")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved_sent")
    .gte("decided_at", since);
  return count ?? 0;
}

/** Zatwierdzenie propozycji: wysyłka rdzeniem dystrybucji + zapis wyniku. */
export async function approveProposal(
  _proposalId: string,
  _decidedBy: string,
): Promise<{ ok: boolean; error?: string; sent?: string[]; skipped?: string[] }> {
  return { ok: false, error: "Automatyczna dystrybucja jest wyłączona. Prowadź każdą sprawę indywidualnie." };
}
