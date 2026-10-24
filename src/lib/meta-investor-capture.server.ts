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

  let smsSent = false;
  if (phoneNorm && !(await investorSmsAlreadySent(phoneNorm))) {
    try {
      const { sendSmsInternal } = await import("@/lib/voicebot.functions");
      const r = await sendSmsInternal({
        phone: phoneNorm,
        body: investorWelcomeSmsBody(first),
        source: INVESTOR_WELCOME_SMS_SOURCE,
        category: "automated",
        metadata: { source: INVESTOR_WELCOME_SMS_SOURCE, lead_role: "inwestor" },
      });
      smsSent = r.ok;
    } catch (e) {
      console.error("[meta-investor] welcome sms", e);
    }
  }

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
