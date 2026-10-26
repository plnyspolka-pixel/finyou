// Ścieżka leada INWESTORSKIEGO z formularza błyskawicznego Meta.
// Wspólna dla webhooka i pull-synca. Lead inwestorski:
//  - zapis w meta_leads (bez wniosku) i w leads z type = "inwestorski",
//  - bez klienta, wniosku, konta pożyczkobiorcy i kadencji follow-up,
//  - SMS powitalny inwestora zamiast SMS-a pożyczkowego (raz na numer),
//  - telefon agenta A2P (głos) z kontekstem leada; godziny, throttle 24 h
//    i opt-out pilnuje placeOutboundCallInternal / sendSmsInternal.
// Działa wyłącznie dla nowych leadów — nic nie robi z historycznymi.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  A2P_VOICE_AGENT_ID,
  INVESTOR_LEAD_SOURCE,
  investorWelcomeSmsBody,
  leadDynamicVariables,
} from "@/lib/ania-lead-context";
import {
  cleanName,
  extractField,
  extractLeadAmount,
  extractPhone,
  normPhone,
  splitName,
  type PoleFormularza,
} from "@/lib/meta-lead-fields";

export const INVESTOR_WELCOME_SMS_SOURCE = "lead_welcome_investor";
import { investorFirstMessage } from "./ania-text-policy";

/** Rodzaj wiersza harmonogramu dla SMS-a powitalnego inwestora wstrzymanego przez okno wysyłki. */
export const INVESTOR_WELCOME_SMS_KIND = "lead_welcome_investor";

/**
 * SMS powitalny inwestora. Idempotentny per numer. Gdy lead wpadł w nocy albo
 * w niedzielę (hamulec SMS: quiet_hours / sunday), SMS nie przepada — planujemy
 * go na najbliższe okno wysyłki (obsługuje go follow-up-tick).
 */
export async function sendInvestorWelcomeSms(opts: {
  phone: string;
  leadId: string | null;
  firstName: string;
  amount: string | number | null | undefined;
  createdAt: string | null | undefined;
}): Promise<{ ok: boolean; reason?: string; skipped?: boolean; error?: string }> {
  if (await investorSmsAlreadySent(opts.phone)) return { ok: false, skipped: true, reason: "already_sent" };
  try {
    const { sendSmsInternal } = await import("@/lib/voicebot.functions");
    const vars = leadDynamicVariables({
      firstName: opts.firstName,
      source: "meta_ads",
      role: "inwestor",
      amount: opts.amount as any,
      createdAt: opts.createdAt as any,
    });
    const r: any = await sendSmsInternal({
      phone: opts.phone,
      body: investorFirstMessage(vars) ?? investorWelcomeSmsBody(opts.firstName),
      source: INVESTOR_WELCOME_SMS_SOURCE,
      category: "automated",
      metadata: { source: INVESTOR_WELCOME_SMS_SOURCE, lead_role: "inwestor" },
    });
    if (!r.ok && (r.reason === "quiet_hours" || r.reason === "sunday") && opts.leadId) {
      const { WELCOME_SMS_STEP_INDEX, nextWindowOpenAt } = await import("@/lib/follow-up-plan.server");
      await supabaseAdmin.from("lead_follow_up_schedule").upsert(
        {
          lead_id: opts.leadId,
          channel: "sms",
          step_index: WELCOME_SMS_STEP_INDEX,
          status: "pending",
          scheduled_at: nextWindowOpenAt(new Date()).toISOString(),
          metadata: { kind: INVESTOR_WELCOME_SMS_KIND, created_at: opts.createdAt ?? null },
        } as any,
        { onConflict: "lead_id,channel,step_index" },
      );
    }
    return { ok: !!r.ok, reason: r.reason, skipped: r.skipped, error: r.error };
  } catch (e: any) {
    console.error("[meta-investor] welcome sms", e);
    return { ok: false, error: e?.message ?? "send error" };
  }
}

export interface InvestorLeadInput {
  leadgenId: string;
  formId: string | null;
  campaignId: string | null;
  createdTime: string | null;
  fieldData: PoleFormularza[];
  /** Pozwolenie na telefon (globalny call_trigger + voicebot_enabled formularza). */
  allowCall: boolean;
}

export interface InvestorCaptureResult {
  handled: true;
  duplicate: boolean;
  leadId: string | null;
  smsSent: boolean;
  callResult: string;
}

async function investorSmsAlreadySent(phone: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("lead_communications")
    .select("id")
    .eq("phone_normalized", phone)
    .eq("channel", "sms")
    .eq("direction", "outbound")
    .eq("metadata->>source", INVESTOR_WELCOME_SMS_SOURCE)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function captureMetaInvestorLead(
  input: InvestorLeadInput,
): Promise<InvestorCaptureResult> {
  const fd = input.fieldData ?? [];
  // Idempotencja: webhook i pull-sync mogą wejść na tego samego leada.
  const { data: dup } = await supabaseAdmin
    .from("meta_leads")
    .select("id")
    .eq("meta_lead_id", input.leadgenId)
    .maybeSingle();
  if (dup) {
    return { handled: true, duplicate: true, leadId: null, smsSent: false, callResult: "duplicate" };
  }

  const email = extractField(fd, ["email"]);
  const rawName = extractField(fd, ["name", "imię", "imie"]);
  const phone = extractPhone(fd, rawName);
  const name = cleanName(rawName);
  const phoneNorm = phone ? normPhone(phone) : null;
  const { first, last } = splitName(name);
  const amount = extractLeadAmount(fd);
  const createdAt = input.createdTime ?? new Date().toISOString();

  const { data: ml } = await supabaseAdmin
    .from("meta_leads")
    .upsert(
      {
        meta_lead_id: input.leadgenId,
        meta_form_id: input.formId,
        meta_campaign_id: input.campaignId,
        full_name: name,
        email,
        phone,
        field_data: fd as any,
        received_at: createdAt,
        lead_application_id: null,
      },
      { onConflict: "meta_lead_id" },
    )
    .select("id")
    .single();

  // Lead w ujednoliconej tabeli. Istniejącego leada (np. pożyczkobiorcy z tym
  // samym numerem) nie przestawiamy na inwestora — dopinamy tylko brakujące pola.
  const { findLeadId, upsertLeadFromSource } = await import("@/lib/lead-comms.server");
  const existing = await findLeadId({
    metaLeadId: ml?.id ?? null,
    phoneNormalized: phoneNorm,
    email,
  });
  let leadId: string | null = null;
  if (existing) {
    leadId = existing;
  } else {
    leadId = await upsertLeadFromSource({
      type: "inwestorski",
      source: "meta_ads",
      firstName: first,
      lastName: last,
      email,
      phoneRaw: phone,
      phoneNormalized: phoneNorm,
      metaLeadId: ml?.id ?? null,
      metaFormId: input.formId,
      metaCampaignId: input.campaignId,
      applicationData: { meta_field_data: fd, lead_role: "inwestor", lead_amount: amount },
    });
    // Formularz Meta wymaga zgód — jak w ścieżce pożyczkowej, tylko dla nowego leada.
    if (leadId) {
      await supabaseAdmin
        .from("leads")
        .update({
          consent_rodo: true,
          consent_email: true,
          consent_marketing: true,
          consent_phone: true,
          consent_sms: true,
        })
        .eq("id", leadId);
    }
  }

  const smsResult = phoneNorm
    ? await sendInvestorWelcomeSms({ phone: phoneNorm, leadId: leadId ?? null, firstName: first, amount, createdAt })
    : { ok: false };
  const smsSent = smsResult.ok;

  let callResult = "skipped";
  if (phoneNorm && input.allowCall) {
    try {
      const { placeOutboundCallInternal } = await import("@/lib/voicebot.functions");
      const r = await placeOutboundCallInternal({
        phone: phoneNorm,
        source: INVESTOR_LEAD_SOURCE,
        metaLeadId: ml?.id ?? null,
        firstName: first,
        agentIdOverride: A2P_VOICE_AGENT_ID,
        dynamicVariables: {
          ...leadDynamicVariables({
            firstName: first,
            source: "meta_ads",
            role: "inwestor",
            amount,
            createdAt,
            callDirection: "outbound",
          }),
          lead_id: leadId ?? "",
          last_name: last === "—" ? "" : last,
          email: email ?? "",
          phone: phoneNorm,
        },
      });
      callResult = r.ok ? "dispatched" : (r.error ?? "error");
    } catch (e: any) {
      callResult = e?.message ?? "exception";
    }
  }

  await supabaseAdmin.from("automation_events").insert({
    automation_type: "meta_lead_capture",
    status: "sent",
    sent_payload: { leadgenId: input.leadgenId, formId: input.formId, lead_role: "inwestor" },
    response_payload: { lead_id: leadId, sms_sent: smsSent, call: callResult },
  });

  return { handled: true, duplicate: false, leadId, smsSent, callResult };
}

/** Wczytuje formularz i rozstrzyga rolę leada. */
export async function loadFormRole(
  formId: string | null,
  fetchFormName?: () => Promise<string | null>,
): Promise<{
  role: "klient" | "inwestor";
  voicebotEnabled: boolean;
}> {
  const { resolveLeadRole } = await import("@/lib/ania-lead-context");
  if (!formId) return { role: "klient", voicebotEnabled: true };
  const { data } = await supabaseAdmin
    .from("meta_lead_forms")
    .select("lead_role, assigned_role, form_name, voicebot_enabled")
    .eq("meta_form_id", String(formId))
    .maybeSingle();
  let form: any = data;
  if (!form?.form_name && !form?.lead_role && fetchFormName) {
    const name = await fetchFormName().catch(() => null);
    form = { ...(form ?? {}), form_name: name };
  }
  return {
    role: resolveLeadRole(form),
    voicebotEnabled: (data as any)?.voicebot_enabled !== false,
  };
}
