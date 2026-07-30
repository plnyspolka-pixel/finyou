// Moduł „Follow-up braków" — silnik (service role, wyłącznie serwer).
//
// Dwa kroki wywoływane z crona (missing-info-follow-up-tick):
//   1. syncMissingInfoEnrollments() — znajduje wnioski kwalifikujące się do
//      dopytywania, liczy im brief braków i utrzymuje wiersze stanu
//      (missing_info_follow_ups): nowe zapisuje, kompletne zamyka.
//   2. processMissingInfoFollowUps() — wysyła zaległe follow-upy wg kadencji,
//      rotując kanały e-mail / SMS / Messenger z poszanowaniem opt-outów,
//      okien godzinowych i okna 24h Meta.
//
// Podział odpowiedzialności między silnikami (nie dublować!):
//   * `nowy_lead` i `brak_kontaktu` → nurture „Ania" + drip 120 szablonów.
//   * Ten moduł: wnioski PO kontakcie z konkretnymi brakami lub pytaniami
//     z analizy KW (dług na hipotece, zgody współwłaścicieli itd.).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { evaluateApplicationCore, type CompletenessResult } from "@/lib/application-completeness";
import { computeLoanProgress, type ProgressResult } from "@/lib/loan-progress";
import { normalizeLoanStatus } from "@/lib/loan-status";
import type { ResolutionState } from "@/lib/kw-analysis/types";
import { logLeadCommunication, findLeadId } from "@/lib/lead-comms.server";
import { buildMissingInfoBrief, type BriefKwFinding, type MissingInfoBrief } from "./brief";
import {
  composeEmailSubject,
  composeEmailText,
  composeEmailHtml,
  composeSms,
  composeMessenger,
  type ComposeVars,
} from "./templates";

// ── Konfiguracja ─────────────────────────────────────────────────────────────

/** Statusy kwalifikujące do dopytywania (kanoniczne, po normalizacji). */
export const MISSING_INFO_ELIGIBLE_STATUSES = [
  "brak_kwoty",
  "brak_kw",
  "brak_zdjec_dokumentow",
  "kontakt",
  "kompletowanie_danych",
  // „Do korekty": status kompletny, ale brief wykrywa braki / otwarte pytania KW.
  "szukamy_inwestora",
] as const;

/** Odstępy (dni) między kolejnymi próbami; po wyczerpaniu — ostatnia wartość. */
const OFFSETS_DAYS = [2, 3, 4, 7, 7, 14, 14, 30, 30] as const;
const MAX_ATTEMPTS = 12;

/** Kolejność preferencji kanałów; start rotacji przesuwa się z próbą. */
const CHANNEL_ORDER = ["email", "sms", "messenger"] as const;
export type MissingInfoChannel = (typeof CHANNEL_ORDER)[number];

const BATCH_LIMIT = 25;
const ENROLL_LIMIT = 400;

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL || process.env.SITE_URL || "https://financeyou.pl";
}

// ── Okna czasowe (Europe/Warsaw) ─────────────────────────────────────────────

function warsawParts(d: Date): { hour: number; weekday: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Warsaw",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  return { hour, weekday };
}

/** Ogólne okno modułu: 7–21, pon–sob. */
export function isWithinSendWindow(d = new Date()): boolean {
  const { hour, weekday } = warsawParts(d);
  if (weekday === "Sun") return false;
  return hour >= 7 && hour < 21;
}

/** Węższe okno SMS: 8–20, pon–sob. */
function isWithinSmsWindow(d = new Date()): boolean {
  const { hour, weekday } = warsawParts(d);
  if (weekday === "Sun") return false;
  return hour >= 8 && hour < 20;
}

// ── Budowa briefu dla zestawu wniosków ───────────────────────────────────────

type LoanRow = {
  id: string;
  status: string;
  loan_amount: number | null;
  preferred_period_months: number | null;
  current_form_step: number | null;
  return_link_token: string | null;
  reminder_email_unsubscribed: boolean | null;
  reminder_email_last_sent_at: string | null;
  automation_paused: boolean | null;
  client: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    phone_normalized: string | null;
    do_not_email: boolean | null;
    do_not_sms: boolean | null;
  } | null;
};

export type ApplicationBriefBundle = {
  loan: LoanRow;
  core: CompletenessResult;
  progress: ProgressResult | null;
  brief: MissingInfoBrief;
};

const LOAN_SELECT = `
  id, status, loan_amount, preferred_period_months, current_form_step,
  return_link_token, reminder_email_unsubscribed, reminder_email_last_sent_at,
  automation_paused,
  client:clients(id, first_name, last_name, email, phone, phone_normalized, do_not_email, do_not_sms)
`;

/** Liczy briefy braków dla podanych wniosków (batch — stała liczba zapytań). */
export async function buildBriefBundles(
  loanIds: string[],
): Promise<Map<string, ApplicationBriefBundle>> {
  const out = new Map<string, ApplicationBriefBundle>();
  if (loanIds.length === 0) return out;
  const s = admin();
  const sb = s as any;

  const [{ data: loans }, { data: props }, { data: docs }, { data: analyses }, { data: coowners }] =
    await Promise.all([
      s.from("loan_applications").select(LOAN_SELECT).in("id", loanIds),
      s
        .from("properties")
        .select(
          "loan_application_id, property_type, city, voivodeship, land_register_number, area_sqm, photos, mpzp_info, land_registry_extract",
        )
        .in("loan_application_id", loanIds),
      s
        .from("documents")
        .select("id, loan_application_id, document_type, file_name")
        .in("loan_application_id", loanIds),
      sb
        .from("kw_land_register_analyses")
        .select("id, loan_application_id, result_json, created_at")
        .in("loan_application_id", loanIds)
        .order("created_at", { ascending: false }),
      sb
        .from("coowner_registry_checks")
        .select("application_id, result_json")
        .in("application_id", loanIds),
    ]);

  const propsByLoan = new Map<string, any[]>();
  for (const p of (props as any[]) ?? []) {
    const arr = propsByLoan.get(p.loan_application_id) ?? [];
    arr.push(p);
    propsByLoan.set(p.loan_application_id, arr);
  }
  const docsByLoan = new Map<string, any[]>();
  for (const d of (docs as any[]) ?? []) {
    const arr = docsByLoan.get(d.loan_application_id) ?? [];
    arr.push(d);
    docsByLoan.set(d.loan_application_id, arr);
  }
  // Najnowsza analiza KW per wniosek (wyniki są posortowane malejąco).
  const latestAnalysisByLoan = new Map<string, any>();
  for (const a of (analyses as any[]) ?? []) {
    if (a.loan_application_id && !latestAnalysisByLoan.has(a.loan_application_id)) {
      latestAnalysisByLoan.set(a.loan_application_id, a);
    }
  }
  const coownersByLoan = new Map<string, any>();
  for (const c of (coowners as any[]) ?? []) coownersByLoan.set(c.application_id, c);

  // Najświeższy stan rozwiązania per finding (insert-only audyt → pierwszy wpis
  // w porządku malejącym wygrywa).
  const analysisIds = Array.from(latestAnalysisByLoan.values()).map((a) => a.id);
  const resolutionsByAnalysis = new Map<string, Record<string, ResolutionState>>();
  if (analysisIds.length > 0) {
    const { data: resolutions } = await sb
      .from("kw_finding_resolutions")
      .select("analysis_id, finding_id, resolution_state, changed_at")
      .in("analysis_id", analysisIds)
      .order("changed_at", { ascending: false });
    for (const r of (resolutions as any[]) ?? []) {
      const map = resolutionsByAnalysis.get(r.analysis_id) ?? {};
      if (!(r.finding_id in map)) map[r.finding_id] = r.resolution_state as ResolutionState;
      resolutionsByAnalysis.set(r.analysis_id, map);
    }
  }

  for (const loan of (loans as unknown as LoanRow[]) ?? []) {
    const properties = propsByLoan.get(loan.id) ?? [];
    const documents = docsByLoan.get(loan.id) ?? [];
    const core = evaluateApplicationCore({
      loan_amount: loan.loan_amount,
      client: loan.client,
      properties,
      docCount: documents.length,
    });
    const property = properties[0] ?? null;
    const progress = property
      ? computeLoanProgress({
          loan: {
            id: loan.id,
            current_form_step: loan.current_form_step,
            status: loan.status,
            loan_amount: loan.loan_amount,
            preferred_period_months: loan.preferred_period_months,
          },
          client: loan.client,
          property,
          documents,
        })
      : null;

    const analysis = latestAnalysisByLoan.get(loan.id) ?? null;
    const kwFindings: BriefKwFinding[] = (analysis?.result_json?.findings ??
      []) as BriefKwFinding[];
    const kwResolutionByFindingId = analysis ? (resolutionsByAnalysis.get(analysis.id) ?? {}) : {};
    const coownersTotal = coownersByLoan.get(loan.id)?.result_json?.totalOwnersInKw ?? null;

    const brief = buildMissingInfoBrief({
      core,
      progress,
      kwFindings,
      kwResolutionByFindingId,
      coownersTotalInKw: coownersTotal,
    });
    out.set(loan.id, { loan, core, progress, brief });
  }
  return out;
}

// ── Krok 1: enrollment ───────────────────────────────────────────────────────

export async function syncMissingInfoEnrollments(): Promise<{
  scanned: number;
  enrolled: number;
  completed: number;
}> {
  const s = admin();
  const sb = s as any;

  const { data: candidates } = await s
    .from("loan_applications")
    .select("id, status")
    .in("status", MISSING_INFO_ELIGIBLE_STATUSES as unknown as string[])
    .order("updated_at", { ascending: false })
    .limit(ENROLL_LIMIT);
  const ids = ((candidates as any[]) ?? [])
    .filter((c) => MISSING_INFO_ELIGIBLE_STATUSES.includes(normalizeLoanStatus(c.status) as any))
    .map((c) => c.id);

  const bundles = await buildBriefBundles(ids);

  const { data: existing } = await sb
    .from("missing_info_follow_ups")
    .select("id, loan_application_id, status, brief_hash, next_send_at, attempt_count")
    .in("loan_application_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const stateByLoan = new Map<string, any>();
  for (const r of (existing as any[]) ?? []) stateByLoan.set(r.loan_application_id, r);

  let enrolled = 0;
  let completed = 0;
  const nowIso = new Date().toISOString();

  for (const [loanId, bundle] of bundles) {
    const state = stateByLoan.get(loanId);
    const empty = bundle.brief.items.length === 0;

    if (!state) {
      if (empty) continue; // nic nie brakuje — nie zapisujemy pustych wierszy
      await sb.from("missing_info_follow_ups").insert({
        loan_application_id: loanId,
        status: "active",
        brief_json: bundle.brief,
        brief_hash: bundle.brief.hash,
        next_send_at: nowIso,
      });
      enrolled += 1;
      continue;
    }

    if (empty) {
      if (state.status !== "complete") {
        await sb
          .from("missing_info_follow_ups")
          .update({ status: "complete", brief_json: bundle.brief, brief_hash: bundle.brief.hash })
          .eq("id", state.id);
        completed += 1;
      }
      continue;
    }

    const patch: Record<string, any> = {
      brief_json: bundle.brief,
      brief_hash: bundle.brief.hash,
    };
    // Wniosek znów ma braki (np. nowe pytania z KW) — wznów zamknięty wpis.
    if (state.status === "complete") {
      patch.status = "active";
      patch.next_send_at = nowIso;
    } else if (state.brief_hash && state.brief_hash !== bundle.brief.hash) {
      // Zestaw braków się ZMIENIŁ — przyspiesz następną wysyłkę (min. za 1h),
      // ale nie cofaj licznika prób.
      const soon = new Date(Date.now() + 3600_000).toISOString();
      if (!state.next_send_at || state.next_send_at > soon) patch.next_send_at = soon;
    }
    await sb.from("missing_info_follow_ups").update(patch).eq("id", state.id);
  }

  return { scanned: ids.length, enrolled, completed };
}

// ── Krok 2: wysyłka ──────────────────────────────────────────────────────────

async function ensureReturnToken(loanId: string, current: string | null): Promise<string> {
  if (current) return current;
  const s = admin();
  const token =
    (globalThis.crypto as any)?.randomUUID?.()?.replace(/-/g, "") ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  await s.from("loan_applications").update({ return_link_token: token }).eq("id", loanId);
  return token;
}

/** Ostatni inbound klienta (dowolny kanał) w ostatnich `hours` godzinach? */
async function hasRecentInbound(leadId: string | null, hours: number): Promise<boolean> {
  if (!leadId) return false;
  const s = admin();
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { count } = await s
    .from("lead_communications")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("direction", "inbound")
    .gte("created_at", since);
  return (count ?? 0) > 0;
}

/** Okno 24h Meta: inbound na Messengerze/IG w ostatniej dobie. */
async function isMetaWindowOpen(leadId: string | null): Promise<boolean> {
  if (!leadId) return false;
  const s = admin();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await s
    .from("lead_communications")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .in("channel", ["messenger", "instagram"])
    .eq("direction", "inbound")
    .gte("created_at", since);
  return (count ?? 0) > 0;
}

export type SendOutcome = {
  loanApplicationId: string;
  channel?: MissingInfoChannel;
  ok: boolean;
  skipped?: string;
  error?: string;
};

/**
 * Wysyła jeden follow-up dla wiersza stanu. Zwraca wynik; aktualizuje stan
 * (attempt_count, next_send_at) tylko przy realnej wysyłce/kolejce.
 */
async function sendForState(
  state: any,
  opts?: { forceChannel?: MissingInfoChannel },
): Promise<SendOutcome> {
  const s = admin();
  const sb = s as any;
  const loanId: string = state.loan_application_id;

  // Świeży brief + dane wniosku (enrollment mógł być chwilę temu).
  const bundles = await buildBriefBundles([loanId]);
  const bundle = bundles.get(loanId);
  if (!bundle) return { loanApplicationId: loanId, ok: false, skipped: "loan_not_found" };
  const { loan, brief } = bundle;

  if (brief.items.length === 0) {
    await sb
      .from("missing_info_follow_ups")
      .update({ status: "complete", brief_json: brief, brief_hash: brief.hash })
      .eq("id", state.id);
    return { loanApplicationId: loanId, ok: false, skipped: "brief_empty" };
  }
  if (loan.automation_paused) {
    return { loanApplicationId: loanId, ok: false, skipped: "automation_paused" };
  }

  const leadId = await findLeadId({ loanApplicationId: loanId, clientId: loan.client?.id ?? null });

  // Klient niedawno odpisał — rozmowę prowadzi człowiek/Ania; przesuń o dobę.
  if (!opts?.forceChannel && (await hasRecentInbound(leadId, 24))) {
    await sb
      .from("missing_info_follow_ups")
      .update({ next_send_at: new Date(Date.now() + 24 * 3600_000).toISOString() })
      .eq("id", state.id);
    return { loanApplicationId: loanId, ok: false, skipped: "recent_inbound" };
  }

  // Dostępność kanałów.
  const emailOk =
    !!loan.client?.email &&
    loan.client?.do_not_email !== true &&
    loan.reminder_email_unsubscribed !== true &&
    // Nie nakładaj się z dripem 120 szablonów (jeden mail scenariuszowy naraz).
    !(
      loan.reminder_email_last_sent_at &&
      Date.now() - new Date(loan.reminder_email_last_sent_at).getTime() < 20 * 3600_000
    );
  const phone = loan.client?.phone_normalized || loan.client?.phone || null;
  const smsOk = !!phone && loan.client?.do_not_sms !== true && isWithinSmsWindow();
  let messengerOk = false;
  if (leadId) {
    const { data: lead } = await s
      .from("leads")
      .select("id, messenger_psid, instagram_igsid")
      .eq("id", leadId)
      .maybeSingle();
    messengerOk =
      !!(lead?.messenger_psid || lead?.instagram_igsid) && (await isMetaWindowOpen(leadId));
  }

  const availability: Record<MissingInfoChannel, boolean> = {
    email: emailOk,
    sms: smsOk,
    messenger: messengerOk,
  };

  let channel: MissingInfoChannel | null = null;
  if (opts?.forceChannel) {
    channel = availability[opts.forceChannel] ? opts.forceChannel : null;
  } else {
    // Rotacja: start od (attempt_count mod 3), pierwszy dostępny wygrywa.
    const start = (state.attempt_count ?? 0) % CHANNEL_ORDER.length;
    for (let i = 0; i < CHANNEL_ORDER.length; i++) {
      const c = CHANNEL_ORDER[(start + i) % CHANNEL_ORDER.length];
      if (availability[c]) {
        channel = c;
        break;
      }
    }
  }
  if (!channel) {
    // Żaden kanał niedostępny (opt-outy / okna) — spróbuj za 12h.
    await sb
      .from("missing_info_follow_ups")
      .update({
        next_send_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
        last_error: "no_channel_available",
      })
      .eq("id", state.id);
    return { loanApplicationId: loanId, ok: false, skipped: "no_channel_available" };
  }

  const attempt = (state.attempt_count ?? 0) + 1;
  const token = await ensureReturnToken(loanId, loan.return_link_token);
  const vars: ComposeVars = {
    firstName: loan.client?.first_name ?? null,
    link: `${baseUrl()}/wniosek/${token}`,
    attempt,
  };

  // Wiersz logu najpierw (id potrzebne do linku wypisu w mailu).
  const { data: sendRow } = await sb
    .from("missing_info_follow_up_sends")
    .insert({
      follow_up_id: state.id,
      loan_application_id: loanId,
      channel,
      attempt_number: attempt,
      brief_json: brief,
      status: "queued",
    })
    .select("id")
    .maybeSingle();
  const sendId: string | null = sendRow?.id ?? null;

  let ok = false;
  let externalId: string | null = null;
  let errorMsg: string | null = null;
  let subject: string | null = null;
  let content = "";

  if (channel === "email") {
    subject = composeEmailSubject(brief, vars);
    content = composeEmailText(brief, vars);
    const html = composeEmailHtml(brief, vars);
    const { sendResendEmail } = await import("@/lib/resend-send.server");
    const res = await sendResendEmail({
      to: loan.client!.email!,
      subject,
      text: content,
      html,
      replyTo: "kontakt@app.financeyou.pl",
      unsubscribeUrl: sendId ? `${baseUrl()}/email/unsubscribe?m=${sendId}` : undefined,
      showReplyHint: true,
    });
    ok = res.ok;
    externalId = res.id ?? null;
    errorMsg = res.error ?? null;
    await logLeadCommunication({
      leadId,
      loanApplicationId: loanId,
      email: loan.client?.email ?? null,
      channel: "email",
      direction: "outbound",
      subject,
      content,
      externalId,
      status: ok ? "sent" : "error",
      errorMessage: ok ? null : errorMsg,
      metadata: { source: "missing_info_follow_up", attempt, brief_hash: brief.hash },
    });
  } else if (channel === "sms") {
    content = composeSms(brief, vars);
    const { sendSmsInternal } = await import("@/lib/voicebot.functions");
    // sendSmsInternal sam loguje do automation_events i lead_communications.
    const res = await sendSmsInternal({
      phone: phone!,
      body: content,
      source: "missing_info_follow_up",
    });
    ok = res.ok;
    externalId = res.sid ?? null;
    errorMsg = res.error ?? null;
  } else {
    content = composeMessenger(brief, vars);
    // Kolejka messenger_outbox — wysyła ją follow-up-tick (co 15 min);
    // log lead_communications robi worker outboxa przy realnej wysyłce.
    const { error } = await sb.from("messenger_outbox").insert({ lead_id: leadId, body: content });
    ok = !error;
    errorMsg = error?.message ?? null;
  }

  if (sendId) {
    await sb
      .from("missing_info_follow_up_sends")
      .update({
        subject,
        content,
        status: ok ? (channel === "messenger" ? "queued" : "sent") : "error",
        external_id: externalId,
        error_message: errorMsg,
      })
      .eq("id", sendId);
  }

  const offsetDays = OFFSETS_DAYS[Math.min(attempt - 1, OFFSETS_DAYS.length - 1)];
  const exhausted = attempt >= MAX_ATTEMPTS;
  await sb
    .from("missing_info_follow_ups")
    .update({
      attempt_count: attempt,
      last_channel: channel,
      last_sent_at: new Date().toISOString(),
      next_send_at: new Date(Date.now() + offsetDays * 24 * 3600_000).toISOString(),
      last_error: ok ? null : errorMsg,
      ...(exhausted ? { status: "stopped" } : {}),
    })
    .eq("id", state.id);

  return { loanApplicationId: loanId, channel, ok, error: errorMsg ?? undefined };
}

export async function processMissingInfoFollowUps(opts?: {
  force?: boolean;
  onlyLoanId?: string;
  forceChannel?: MissingInfoChannel;
}): Promise<{
  ok: boolean;
  skipped?: string;
  processed: number;
  sent: number;
  results: SendOutcome[];
}> {
  if (!opts?.force && !isWithinSendWindow()) {
    return { ok: true, skipped: "outside_send_window", processed: 0, sent: 0, results: [] };
  }
  const sb = admin() as any;

  let q = sb
    .from("missing_info_follow_ups")
    .select("id, loan_application_id, status, paused, attempt_count, brief_hash, next_send_at")
    .order("next_send_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (opts?.onlyLoanId) {
    // Ręczne „wyślij teraz" z panelu — działa też dla wierszy paused/stopped.
    q = q.eq("loan_application_id", opts.onlyLoanId);
  } else {
    q = q.eq("status", "active").eq("paused", false).lte("next_send_at", new Date().toISOString());
  }

  const { data: due } = await q;
  const results: SendOutcome[] = [];
  let sent = 0;
  for (const state of (due as any[]) ?? []) {
    try {
      const r = await sendForState(state, { forceChannel: opts?.forceChannel });
      results.push(r);
      if (r.ok) sent += 1;
    } catch (e: any) {
      console.error("[missing-info-follow-up] send error", state.loan_application_id, e?.message);
      results.push({ loanApplicationId: state.loan_application_id, ok: false, error: e?.message });
    }
  }
  return { ok: true, processed: results.length, sent, results };
}
