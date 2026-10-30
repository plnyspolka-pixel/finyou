// Oddzielny kanał B2B: automatyczna wysyłka do WSZYSTKICH aktywnych
// inwestorów instytucjonalnych, jeżeli rzeczywisty score lokalizacji > 50.
// Bez doboru 1:1 w Tinderze, bez manualnego zatwierdzenia wysyłki.
// Wysyłka następuje przy najbliższym cronie (domyślnie co 30 minut).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LEGACY_STATUS_MAP, normalizeLoanStatus } from "@/lib/loan-status";

/** Statusy, w których wniosek może kwalifikować się do dystrybucji. */
const CANDIDATE_STATUSES = new Set([
  "nowy_lead",
  "w_trakcie_uzupelniania",
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
    enabled: data?.enabled ?? true,
    min_location_score: 50, // zgodnie z decyzją: wysyłka tylko przy score > 50
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
  sent: number;
  sent_cases: number;
  failed: number;
  skipped_in_progress: number;
}

/**
 * Jedyny próg jakościowy dla wysyłki instytucjonalnej to wynik lokalizacji > 50.
 * Nie stosujemy widełek kwotowych instytucji ani oceny kompletności briefu.
 * Cel gospodarczy, istnienie kwoty i aktywny status to minimalne bramki B2B.
 */
export const INSTITUTIONAL_LOCATION_SCORE_THRESHOLD = 50;
export function qualifiesForInstitutionalDistribution(loan: {
  location_potential_score: number | null;
  business_purpose_declared: boolean;
  loan_amount: number | null;
}): boolean {
  const score = Number(loan.location_potential_score);
  return loan.business_purpose_declared === true &&
    loan.loan_amount != null && Number(loan.loan_amount) > 0 &&
    loan.location_potential_score != null &&
    Number.isFinite(score) &&
    score > INSTITUTIONAL_LOCATION_SCORE_THRESHOLD;
}

/** Limit spraw obsłużonych w jednym przebiegu cron (nie limit odbiorców). */
const MAX_AUTO_CASES_PER_TICK = 3;

/**
 * Cron co 30 minut. Dla każdego kwalifikującego się wniosku:
 * - ustala wszystkich aktywnych inwestorów instytucjonalnych z e-mailem;
 * - pomija tych, którym już wysłano tę sprawę;
 * - tworzy wpis audytowy w auto_distribution_proposals;
 * - ATOMOWO przejmuje propozycję i od razu wysyła bez kliknięcia operatora.
 * Status 'sending' blokuje drugi równoległy cron; nie dublujemy wiadomości.
 */
export async function syncAutoDistributionProposals(): Promise<SyncResult | { disabled: true }> {
  const settings = await loadAutoDistributionSettings();
  if (!settings.enabled) return { disabled: true };

  const result: SyncResult = {
    scanned: 0, eligible: 0, proposed: 0, refreshed: 0,
    skipped_no_matches: 0, sent: 0, sent_cases: 0, failed: 0, skipped_in_progress: 0,
  };
  const { data: investors, error: investorsErr } = await supabaseAdmin
    .from("investors")
    .select("id, company_name, first_name, last_name, email")
    .eq("investor_type", "instytucjonalny")
    .eq("is_active", true);
  if (investorsErr) throw new Error(investorsErr.message);
  const recipients = (investors ?? []).filter((i: any) => Boolean(i.email?.trim()));
  if (recipients.length === 0) return result;

  // Ograniczamy liczbę spraw (nie adresatów) wysyłanych w jednym wywołaniu.
  // Dotychczasowy dzienny limit spraw pozostaje bezpiecznikiem przepustowości.
  const sentToday = await approvedSendsLast24h();
  const capacity = Math.min(MAX_AUTO_CASES_PER_TICK, Math.max(0, settings.daily_send_limit - sentToday));
  if (capacity === 0) return result;

  // Paginacja, aby starsze wnioski nie znikały z wyszukiwania po 500 rekordach.
  const pageSize = 200;
  for (let offset = 0; offset < 10_000 && result.sent_cases < capacity; offset += pageSize) {
    const { data: loans, error } = await supabaseAdmin
      .from("loan_applications")
      .select("id, status, loan_amount, location_potential_score, business_purpose_declared")
      .is("deleted_at", null)
      .gt("location_potential_score", INSTITUTIONAL_LOCATION_SCORE_THRESHOLD)
      .eq("business_purpose_declared", true)
      .not("loan_amount", "is", null)
      .in("status", CANDIDATE_DB_STATUSES as any)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const candidates = loans ?? [];
    result.scanned += candidates.length;

    for (const loan of candidates as any[]) {
      if (!CANDIDATE_STATUSES.has(normalizeLoanStatus(loan.status))) continue;
      if (!qualifiesForInstitutionalDistribution(loan)) continue;
      result.eligible += 1;

      const { data: existing, error: existingErr } = await supabaseAdmin
        .from("offer_distributions")
        .select("investor_id, distribution_status, email_status")
        .eq("loan_application_id", loan.id);
      if (existingErr) throw new Error(existingErr.message);
      const alreadySent = new Set((existing ?? [])
        .filter((d: any) =>
          !["szkic", "gotowe_do_wysylki"].includes(d.distribution_status) &&
          d.email_status !== "error",
        )
        .map((d: any) => d.investor_id));
      const missing = recipients.filter((i: any) => !alreadySent.has(i.id));
      if (missing.length === 0) {
        result.skipped_no_matches += 1;
        continue;
      }

      const { data: inFlight, error: inFlightErr } = await (supabaseAdmin as any)
        .from("auto_distribution_proposals")
        .select("id, status")
        .eq("loan_application_id", loan.id)
        .in("status", ["proposed", "sending"])
        .order("proposed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (inFlightErr) throw new Error(inFlightErr.message);
      if (inFlight?.status === "sending") {
        result.skipped_in_progress += 1;
        continue;
      }

      let proposalId = inFlight?.id as string | undefined;
      const matches: ProposalMatch[] = missing.map((i: any) => ({
        investor_id: i.id,
        name: i.company_name || [i.first_name, i.last_name].filter(Boolean).join(" ") || i.id,
        reason: "aktywny inwestor instytucjonalny; lokalizacja > 50 pkt",
      }));
      const eligibility = {
        loan_amount: Number(loan.loan_amount),
        location_score: Number(loan.location_potential_score),
        business_purpose_declared: true,
        recipient_count: matches.length,
        source: "cron_institutional_auto",
      };

      if (proposalId) {
        const { error: updErr } = await (supabaseAdmin as any)
          .from("auto_distribution_proposals")
          .update({ matches, eligibility })
          .eq("id", proposalId)
          .eq("status", "proposed");
        if (updErr) throw new Error(updErr.message);
        result.refreshed += 1;
      } else {
        const { data: inserted, error: insertErr } = await (supabaseAdmin as any)
          .from("auto_distribution_proposals")
          .insert({ loan_application_id: loan.id, matches, eligibility })
          .select("id")
          .single();
        // Równoległy cron mógł już przejąć tę samą sprawę.
        if (insertErr) {
          if (insertErr.code === "23505") { result.skipped_in_progress += 1; continue; }
          throw new Error(insertErr.message);
        }
        proposalId = inserted.id;
        result.proposed += 1;
      }

      const sent = await approveProposal(proposalId!, null);
      if (!sent.ok) {
        result.failed += 1;
        continue;
      }
      result.sent_cases += 1;
      result.sent += sent.sent?.length ?? 0;
      result.failed += sent.failed?.length ?? 0;
      if (result.sent_cases >= capacity) break;
    }
    if (candidates.length < pageSize) break;
  }
  return result;
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

/** Atomowe zatwierdzenie SYSTEMOWE; jedynym warunkiem biznesowym jest score >50. */
export async function approveProposal(
  proposalId: string,
  decidedBy: string | null,
): Promise<{ ok: boolean; error?: string; sent?: string[]; skipped?: string[]; failed?: Array<{ investorId: string; error: string }> }> {
  const { data: proposal, error: proposalErr } = await (supabaseAdmin as any)
    .from("auto_distribution_proposals")
    .select("id, loan_application_id, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (proposalErr) throw new Error(proposalErr.message);
  if (!proposal) return { ok: false, error: "Nie znaleziono propozycji" };
  if (proposal.status !== "proposed") return { ok: false, error: "Propozycja jest już przetwarzana lub zamknięta" };

  // Weryfikacja w chwili samej wysyłki — administrator nie omija progu score.
  const { data: loan, error: loanErr } = await supabaseAdmin
    .from("loan_applications")
    .select("id, status, deleted_at, loan_amount, location_potential_score, business_purpose_declared")
    .eq("id", proposal.loan_application_id)
    .maybeSingle();
  if (loanErr) throw new Error(loanErr.message);
  if (!loan || loan.deleted_at || !CANDIDATE_STATUSES.has(normalizeLoanStatus(loan.status)) ||
      !qualifiesForInstitutionalDistribution(loan as any)) {
    await (supabaseAdmin as any)
      .from("auto_distribution_proposals")
      .update({ status: "stale", error: "Wniosek nie spełnia kryteriów: B2B, poprawna kwota, lokalizacja > 50" })
      .eq("id", proposalId).eq("status", "proposed");
    return { ok: false, error: "Wniosek nie spełnia warunków automatycznej dystrybucji." };
  }

  // CAS: tylko jedno wywołanie może objąć propozycję.
  const { data: claimed, error: claimErr } = await (supabaseAdmin as any)
    .from("auto_distribution_proposals")
    .update({ status: "sending", decided_by: decidedBy, decided_at: new Date().toISOString() })
    .eq("id", proposal.id)
    .eq("status", "proposed")
    .select("id");
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed?.length) return { ok: false, error: "Propozycja jest już wysyłana przez inny proces." };

  const { distributeOfferToInvestors } = await import("@/lib/offer-distribution-core.server");
  try {
    // Brak investorIds oznacza WSZYSTKIE aktywne instytucje, nie pojedynczego inwestora.
    const sendResult = await distributeOfferToInvestors({
      applicationId: proposal.loan_application_id,
    });
    await (supabaseAdmin as any)
      .from("auto_distribution_proposals")
      .update({
        status: "approved_sent",
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
        sent_result: sendResult,
        error: sendResult.failed.length
          ? `Częściowa wysyłka: ${sendResult.failed.length} nieudanych prób`
          : null,
      })
      .eq("id", proposal.id);
    return { ok: true, sent: sendResult.sent, skipped: sendResult.skipped, failed: sendResult.failed };
  } catch (e: any) {
    await (supabaseAdmin as any)
      .from("auto_distribution_proposals")
      .update({
        status: "failed",
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
        error: e?.message ?? "błąd wysyłki",
      })
      .eq("id", proposal.id);
    return { ok: false, error: e?.message ?? "błąd wysyłki" };
  }
}
