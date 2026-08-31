// Silnik auto-dystrybucji: kwalifikuje KOMPLETNE wnioski (pusty brief braków,
// potencjał lokalizacyjny >= próg — brak score liczy się jak neutralne 40)
// i dopasowuje instytucje po ich kryteriach (widełki kwotowe, zawieszenia).
// ROZRUCH Z ZATWIERDZANIEM: silnik tylko PROPONUJE (auto_distribution_proposals),
// wysyłkę zatwierdza człowiek w /admin/auto-dystrybucja; sama wysyłka idzie
// rdzeniem distributeOfferToInvestors — dokładnie jak dystrybucja ręczna.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LEGACY_STATUS_MAP, normalizeLoanStatus } from "@/lib/loan-status";

/** Statusy, w których wniosek może kwalifikować się do dystrybucji. */
const CANDIDATE_STATUSES = new Set([
  "brak_kwoty",
  "brak_kw",
  "brak_zdjec_dokumentow",
  "kontakt",
  "kompletowanie_danych",
  "szukamy_inwestora",
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
  const settings = await loadAutoDistributionSettings();
  if (!settings.enabled) return { disabled: true };

  const result: SyncResult = {
    scanned: 0,
    eligible: 0,
    proposed: 0,
    refreshed: 0,
    skipped_no_matches: 0,
  };

  // 1) Kandydaci: nieusunięte wnioski z kwotą, w statusach „przed/na dystrybucji"
  //    — filtr statusu w SQL + najnowsze najpierw (stabilne okno limitu).
  const { data: loans, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, status, loan_amount, location_potential_score, deleted_at")
    .is("deleted_at", null)
    .not("loan_amount", "is", null)
    .in("status", CANDIDATE_DB_STATUSES as any)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const candidates = (loans ?? []).filter((l: any) =>
    CANDIDATE_STATUSES.has(normalizeLoanStatus(l.status)),
  );
  result.scanned = candidates.length;
  if (candidates.length === 0) return result;

  // 2) Kompletność: pusty brief braków (ten sam silnik co follow-upy).
  const { buildBriefBundles } = await import("@/lib/missing-info-follow-up/engine.server");
  const bundles = await buildBriefBundles(candidates.map((l: any) => l.id));

  // 3) Instytucje + kryteria (jednorazowo dla całego przebiegu).
  const [{ data: investors }, { data: criteriaRows }] = await Promise.all([
    supabaseAdmin
      .from("investors")
      .select("id, company_name, first_name, last_name, email")
      .eq("investor_type", "instytucjonalny")
      .eq("is_active", true),
    (supabaseAdmin as any)
      .from("investor_distribution_criteria")
      .select("investor_id, min_amount, max_amount, auto_send_enabled, accepting_applications, paused_until"),
  ]);
  const criteriaByInvestor = new Map<string, any>(
    ((criteriaRows ?? []) as any[]).map((c) => [c.investor_id, c]),
  );
  const activeInvestors = (investors ?? []).filter((i: any) => i.email);

  for (const loan of candidates as any[]) {
    const brief = bundles.get(loan.id)?.brief;
    if (!brief || brief.items.length > 0) continue; // niekompletny — nie kwalifikuje się

    const score = loan.location_potential_score == null ? 40 : Number(loan.location_potential_score);
    if (score < settings.min_location_score) continue;
    result.eligible += 1;

    // 4) Dopasowanie instytucji minus te, które już dostały ten temat.
    const { data: existing } = await supabaseAdmin
      .from("offer_distributions")
      .select("investor_id, distribution_status")
      .eq("loan_application_id", loan.id);
    const alreadySent = new Set(
      (existing ?? [])
        .filter((d: any) => !["szkic", "gotowe_do_wysylki"].includes(d.distribution_status))
        .map((d: any) => d.investor_id),
    );

    const matches: ProposalMatch[] = [];
    for (const inv of activeInvestors as any[]) {
      if (alreadySent.has(inv.id)) continue;
      const verdict = matchInvestorToAmount(
        criteriaByInvestor.get(inv.id) ?? null,
        Number(loan.loan_amount),
      );
      if (!verdict.ok) continue;
      matches.push({
        investor_id: inv.id,
        name:
          inv.company_name || [inv.first_name, inv.last_name].filter(Boolean).join(" ") || inv.id,
        reason: verdict.reason,
      });
    }
    if (matches.length === 0) {
      result.skipped_no_matches += 1;
      continue;
    }

    const eligibility = {
      loan_amount: Number(loan.loan_amount),
      location_score: loan.location_potential_score == null ? null : score,
      brief_empty: true,
      status: normalizeLoanStatus(loan.status),
    };

    // 5) Jedna otwarta propozycja per wniosek: nowa albo odświeżenie dopasowań.
    const { data: open } = await (supabaseAdmin as any)
      .from("auto_distribution_proposals")
      .select("id, matches")
      .eq("loan_application_id", loan.id)
      .eq("status", "proposed")
      .maybeSingle();

    if (open) {
      const prev = JSON.stringify(
        ((open.matches ?? []) as any[]).map((m) => m.investor_id).sort(),
      );
      const next = JSON.stringify(matches.map((m) => m.investor_id).sort());
      if (prev !== next) {
        await (supabaseAdmin as any)
          .from("auto_distribution_proposals")
          .update({ matches, eligibility })
          .eq("id", open.id);
        result.refreshed += 1;
      }
    } else {
      const { error: insErr } = await (supabaseAdmin as any)
        .from("auto_distribution_proposals")
        .insert({ loan_application_id: loan.id, matches, eligibility });
      if (!insErr) result.proposed += 1;
    }
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

/** Zatwierdzenie propozycji: wysyłka rdzeniem dystrybucji + zapis wyniku. */
export async function approveProposal(
  proposalId: string,
  decidedBy: string,
): Promise<{ ok: boolean; error?: string; sent?: string[]; skipped?: string[] }> {
  const { data: proposal } = await (supabaseAdmin as any)
    .from("auto_distribution_proposals")
    .select("id, loan_application_id, matches, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: "Nie znaleziono propozycji" };
  if (proposal.status !== "proposed") {
    return { ok: false, error: `Propozycja ma status ${proposal.status}` };
  }

  const settings = await loadAutoDistributionSettings();
  const sentToday = await approvedSendsLast24h();
  if (sentToday >= settings.daily_send_limit) {
    return {
      ok: false,
      error: `Limit dzienny wysyłek (${settings.daily_send_limit}) wyczerpany — spróbuj jutro albo podnieś limit w ustawieniach.`,
    };
  }

  const investorIds = ((proposal.matches ?? []) as ProposalMatch[]).map((m) => m.investor_id);
  if (investorIds.length === 0) return { ok: false, error: "Propozycja nie ma dopasowanych instytucji" };

  // Atomowe przejęcie propozycji — dwa równoległe zatwierdzenia nie mogą
  // wysłać maili podwójnie (update warunkowany statusem 'proposed').
  const { data: claimed } = await (supabaseAdmin as any)
    .from("auto_distribution_proposals")
    .update({ status: "sending", decided_by: decidedBy, decided_at: new Date().toISOString() })
    .eq("id", proposal.id)
    .eq("status", "proposed")
    .select("id");
  if (!claimed?.length) {
    return { ok: false, error: "Propozycja została już rozstrzygnięta przez kogoś innego." };
  }

  const { distributeOfferToInvestors } = await import("@/lib/offer-distribution-core.server");
  try {
    const sendResult = await distributeOfferToInvestors({
      applicationId: proposal.loan_application_id,
      investorIds,
    });
    await (supabaseAdmin as any)
      .from("auto_distribution_proposals")
      .update({
        status: "approved_sent",
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
        sent_result: sendResult,
      })
      .eq("id", proposal.id);
    return { ok: true, sent: sendResult.sent, skipped: sendResult.skipped };
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
