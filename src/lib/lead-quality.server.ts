// Lead Quality Scoring + Meta Conversions API (CAPI) sender.
// Optymalizacja ODWROTNA: im mniejsza kwota wniosku, tym wyższa wartość eventu.

import { createHash } from "crypto";

const GRAPH = "https://graph.facebook.com/v21.0";
const PIXEL_ID_FALLBACK = "999846322426205"; // "Klienci app"

// ---------- SCORING ----------

export type Tier = "A" | "B" | "C" | "D";

export interface LeadForScoring {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_normalized?: string | null;
  consent_rodo?: boolean | null;
  loan_application_id?: string | null;
  marked_bad_lead?: boolean | null;
  application_data?: any;
}

export interface LoanForScoring {
  loan_amount?: number | null;
  property_quality?: string | null;
  status?: string | null;
  /** typ nieruchomości z tabeli properties (mieszkanie/dom/...) */
  property_type?: string | null;
  /** czy istnieje wpis w properties dla wniosku */
  has_property_record?: boolean | null;
}

/**
 * Klasyfikuje lead na A/B/C/D — priorytet: MIESZKANIE jako zabezpieczenie.
 *   D — oznaczony ręcznie jako spam/zły.
 *   A — komplet danych + MIESZKANIE + kwota < 100k (najlepszy lead).
 *   A (90) — komplet danych + mieszkanie (bez progu kwoty).
 *   B — komplet + jakakolwiek inna nieruchomość (dom/lokal/działka…).
 *   B (50) — wypełniony wniosek bez nieruchomości.
 *   C — tylko podstawowe dane kontaktowe.
 */
export function scoreLead(
  lead: LeadForScoring,
  loan: LoanForScoring | null,
): {
  tier: Tier;
  score: number;
  reason: string;
} {
  if (lead.marked_bad_lead) {
    return { tier: "D", score: 0, reason: "Oznaczony ręcznie jako zły/spam" };
  }

  const hasContact = Boolean(lead.email && lead.phone_normalized);
  const hasName = Boolean(lead.first_name && lead.last_name);
  const hasLoan = Boolean(lead.loan_application_id);
  const hasAnyProperty = Boolean(
    loan?.has_property_record || loan?.property_type || loan?.property_quality,
  );
  const isFlat = (loan?.property_type ?? "").toLowerCase() === "mieszkanie";
  const amount = Number(loan?.loan_amount ?? 0);
  const smallAmount = amount > 0 && amount < 100_000;
  const completeProfile = hasContact && hasName && hasLoan;

  if (completeProfile && isFlat && smallAmount) {
    return {
      tier: "A",
      score: 100,
      reason: `Mieszkanie + komplet danych + ${Math.round(amount / 1000)}k zł`,
    };
  }
  if (completeProfile && isFlat) {
    return { tier: "A", score: 90, reason: "Mieszkanie jako zabezpieczenie + komplet danych" };
  }
  if (completeProfile && hasAnyProperty && smallAmount) {
    return {
      tier: "B",
      score: 75,
      reason: `Nieruchomość (${loan?.property_type ?? "inna"}) + komplet + ${Math.round(amount / 1000)}k zł`,
    };
  }
  if (completeProfile && hasAnyProperty) {
    return {
      tier: "B",
      score: 65,
      reason: `Nieruchomość (${loan?.property_type ?? "inna"}) + komplet danych`,
    };
  }
  if (hasLoan && loan?.status && loan.status !== "draft") {
    return { tier: "B", score: 50, reason: "Wypełniony wniosek (bez nieruchomości)" };
  }
  if (hasContact) {
    return { tier: "C", score: 30, reason: "Podstawowe dane kontaktowe" };
  }
  return { tier: "C", score: 10, reason: "Tylko źródło Meta" };
}

/**
 * ODWROTNA wartość: mniejsza pożyczka = wyższy value (Meta optymalizuje pod tych).
 *   10k  → ~91
 *   50k  → ~20
 *   100k → ~10
 *   500k → ~2
 */
export function inverseValue(amountPln: number | null | undefined): number {
  const a = Number(amountPln ?? 0);
  if (!a || a <= 0) return 50; // brak kwoty → neutralna wartość
  const k = a / 1000;
  return Math.round((1000 / (k + 10)) * 100) / 100;
}

// ---------- CAPI ----------

function sha256(s: string): string {
  return createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
}

function buildUserData(lead: LeadForScoring): Record<string, string[] | string> {
  const ud: Record<string, string[] | string> = {};
  if (lead.email) ud.em = [sha256(lead.email)];
  if (lead.phone_normalized) {
    const digits = lead.phone_normalized.replace(/[^\d]/g, "");
    if (digits) ud.ph = [sha256(digits)];
  }
  if (lead.first_name) ud.fn = [sha256(lead.first_name)];
  if (lead.last_name) ud.ln = [sha256(lead.last_name)];
  ud.country = [sha256("pl")];
  return ud;
}

export type CapiEventName = "Lead" | "SubmitApplication" | "Purchase" | "BadLead"; // custom — sygnał negatywny

export async function sendCapiEvent(opts: {
  supabaseAdmin: any;
  lead: LeadForScoring;
  loan: LoanForScoring | null;
  eventName: CapiEventName;
  tier: Tier;
  pixelId?: string;
  testEventCode?: string;
}): Promise<{ ok: boolean; eventId: string; error?: string }> {
  const token = process.env.FB_PIXEL_ACCESS_TOKEN;
  if (!token) return { ok: false, eventId: "", error: "FB_PIXEL_ACCESS_TOKEN missing" };

  const pixelId = opts.pixelId || PIXEL_ID_FALLBACK;
  const eventId = `${opts.eventName}_${opts.lead.id}_${Date.now()}`;
  const loanAmount = Number(opts.loan?.loan_amount ?? 0);
  const value = inverseValue(loanAmount);

  const payload: any = {
    data: [
      {
        event_name: opts.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "system_generated",
        user_data: buildUserData(opts.lead),
        custom_data: {
          currency: "PLN",
          value,
          lead_tier: opts.tier,
          loan_amount_pln: loanAmount || null,
        },
      },
    ],
  };
  if (opts.testEventCode) payload.test_event_code = opts.testEventCode;

  // Insert pending row first (UNIQUE event_id → safe dedupe)
  const { error: insErr } = await opts.supabaseAdmin.from("meta_capi_events").insert({
    lead_id: opts.lead.id,
    event_name: opts.eventName,
    event_id: eventId,
    pixel_id: pixelId,
    value,
    currency: "PLN",
    loan_amount: loanAmount || null,
    tier: opts.tier,
    payload,
    status: "pending",
  });
  if (insErr) return { ok: false, eventId, error: `db insert: ${insErr.message}` };

  try {
    const res = await fetch(
      `${GRAPH}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const json: any = await res.json().catch(() => ({}));
    const ok = res.ok && !json?.error;

    await opts.supabaseAdmin
      .from("meta_capi_events")
      .update({
        status: ok ? "sent" : "failed",
        response: json,
        error: ok ? null : JSON.stringify(json?.error ?? json).slice(0, 500),
      })
      .eq("event_id", eventId);

    if (ok) {
      await opts.supabaseAdmin
        .from("leads")
        .update({
          meta_capi_last_event: opts.eventName,
          meta_capi_last_sent_at: new Date().toISOString(),
        })
        .eq("id", opts.lead.id);
    }

    return {
      ok,
      eventId,
      error: ok ? undefined : JSON.stringify(json?.error ?? json).slice(0, 300),
    };
  } catch (e: any) {
    await opts.supabaseAdmin
      .from("meta_capi_events")
      .update({ status: "failed", error: String(e?.message ?? e).slice(0, 500) })
      .eq("event_id", eventId);
    return { ok: false, eventId, error: String(e?.message ?? e) };
  }
}

/**
 * Pełna ścieżka: pobierz lead + loan, oblicz tier, zapisz, wyślij event do Mety.
 */
export async function rescoreAndSend(opts: {
  supabaseAdmin: any;
  leadId: string;
  forceEvent?: CapiEventName;
}): Promise<{ tier: Tier; score: number; reason: string; capi?: { ok: boolean; error?: string } }> {
  const { data: lead, error: lErr } = await opts.supabaseAdmin
    .from("leads")
    .select(
      "id, first_name, last_name, email, phone_normalized, consent_rodo, loan_application_id, marked_bad_lead, application_data",
    )
    .eq("id", opts.leadId)
    .single();
  if (lErr || !lead) throw new Error(`Lead not found: ${lErr?.message ?? opts.leadId}`);

  let loan: LoanForScoring | null = null;
  if (lead.loan_application_id) {
    const { data: la } = await opts.supabaseAdmin
      .from("loan_applications")
      .select("loan_amount, property_quality, status")
      .eq("id", lead.loan_application_id)
      .single();
    loan = la ?? null;

    // Dociągnij property_type z tabeli properties (priorytet: mieszkanie)
    const { data: props } = await opts.supabaseAdmin
      .from("properties")
      .select("property_type")
      .eq("loan_application_id", lead.loan_application_id);
    if (props && props.length > 0) {
      const types = props.map((p: any) => String(p.property_type ?? "").toLowerCase());
      const chosen = types.includes("mieszkanie") ? "mieszkanie" : types[0];
      loan = { ...(loan ?? {}), property_type: chosen, has_property_record: true };
    }
  }

  const result = scoreLead(lead, loan);

  await opts.supabaseAdmin
    .from("leads")
    .update({
      quality_tier: result.tier,
      quality_score: result.score,
      quality_reason: result.reason,
    })
    .eq("id", lead.id);

  // Decide which event to send
  let eventName: CapiEventName | null = opts.forceEvent ?? null;
  if (!eventName) {
    if (result.tier === "D") eventName = "BadLead";
    else if (result.tier === "A") eventName = "SubmitApplication";
    else if (result.tier === "B") eventName = "SubmitApplication";
    else eventName = "Lead";
  }

  const capi = await sendCapiEvent({
    supabaseAdmin: opts.supabaseAdmin,
    lead,
    loan,
    eventName,
    tier: result.tier,
  });

  // Ostatni krok lejka bota: tier A/B = lead kwalifikowany. To on jest
  // mianownikiem CPQL w optymalizatorze reklam (ad-optimizer.server).
  if (result.tier === "A" || result.tier === "B") {
    try {
      const { logFunnelStep } = await import("./bot-funnel.server");
      await logFunnelStep(opts.leadId, "qualified");
    } catch (e) {
      console.error("[lead-quality] funnel qualified", e);
    }
  }

  return { ...result, capi: { ok: capi.ok, error: capi.error } };
}
