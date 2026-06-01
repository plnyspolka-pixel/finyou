import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";

function normalizePhone(input: string): string {
  const s = String(input ?? "").replace(/\s|-/g, "");
  if (s.startsWith("+")) return s;
  const d = s.replace(/\D/g, "");
  if (d.length === 9) return `+48${d}`;
  if (d.length === 11 && d.startsWith("48")) return `+${d}`;
  return s.startsWith("+") ? s : `+${d}`;
}

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

async function loadSettings() {
  const s = admin();
  const { data } = await s.from("voicebot_settings").select("*").eq("id", 1).maybeSingle();
  return data;
}

function renderTemplate(tpl: string, vars: Record<string, string | null | undefined>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "").toString());
}

/** Wysyła SMS przez Twilio (connector gateway). */
export async function sendSmsInternal(opts: {
  phone: string;
  body: string;
  source: string;
  from?: string | null;
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  if (!lovableKey) return { ok: false, error: "Brak LOVABLE_API_KEY" };
  if (!twilioKey) return { ok: false, error: "Twilio nie jest podłączony (brak TWILIO_API_KEY)" };

  const settings = await loadSettings();
  const from = opts.from || settings?.sms_from;
  if (!from) return { ok: false, error: "Brak nadawcy SMS (sms_from)" };

  const phone = normalizePhone(opts.phone);
  const s = admin();

  try {
    const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": twilioKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, From: from, Body: opts.body }),
    });
    const json: any = await res.json().catch(() => ({}));

    await s.from("automation_events").insert({
      automation_type: "twilio_sms",
      status: res.ok ? "sent" : "error",
      sent_payload: { to: phone, from, body: opts.body, source: opts.source },
      response_payload: json,
      error_message: res.ok ? null : (json?.message ?? `HTTP ${res.status}`),
    });

    if (!res.ok) return { ok: false, error: json?.message ?? `Twilio HTTP ${res.status}` };
    return { ok: true, sid: json?.sid };
  } catch (e: any) {
    await s.from("automation_events").insert({
      automation_type: "twilio_sms",
      status: "error",
      sent_payload: { to: phone, from, body: opts.body, source: opts.source },
      error_message: e?.message ?? "exception",
    });
    return { ok: false, error: e?.message ?? "exception" };
  }
}

async function maybeSendSms(
  trigger: "before_call" | "after_call" | "on_failure",
  ctx: { phone: string; source: string; firstName?: string | null }
) {
  const settings = await loadSettings();
  if (!settings?.sms_enabled) return;
  if ((settings.sms_trigger ?? "off") !== trigger) return;
  const tpl = (settings.sms_template ?? "").trim();
  if (!tpl) return;
  const body = renderTemplate(tpl, {
    first_name: ctx.firstName ?? "",
    phone: ctx.phone,
  });
  await sendSmsInternal({ phone: ctx.phone, body, source: ctx.source, from: settings.sms_from });
}

/** Wywołuje wychodzące połączenie ElevenLabs (Twilio outbound). */
export async function placeOutboundCallInternal(opts: {
  phone: string;
  source: string;
  clientId?: string | null;
  loanApplicationId?: string | null;
  metaLeadId?: string | null;
  firstName?: string | null;
}): Promise<{ ok: boolean; conversationId?: string; callSid?: string; error?: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ok: false, error: "Brak ELEVENLABS_API_KEY" };

  const settings = await loadSettings();
  if (!settings?.agent_id || !settings?.agent_phone_number_id) {
    return { ok: false, error: "Brak konfiguracji voicebota (agent_id / phone_number_id)" };
  }

  const s = admin();
  const phone = normalizePhone(opts.phone);

  // SMS before call (jeśli włączone)
  await maybeSendSms("before_call", { phone, source: opts.source, firstName: opts.firstName }).catch(() => {});

  // Wpis do kolejki — status w_trakcie
  const { data: queueRow } = await s
    .from("call_queue")
    .insert({
      phone_normalized: phone,
      client_id: opts.clientId ?? null,
      loan_application_id: opts.loanApplicationId ?? null,
      meta_lead_id: opts.metaLeadId ?? null,
      source: opts.source,
      agent_id: settings.agent_id,
      status: "w_trakcie",
      started_at: new Date().toISOString(),
      attempts: 1,
    })
    .select("id")
    .single();

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        agent_id: settings.agent_id,
        agent_phone_number_id: settings.agent_phone_number_id,
        to_number: phone,
      }),
    });
    const json: any = await res.json().catch(() => ({}));

    await s.from("automation_events").insert({
      automation_type: "elevenlabs_outbound_call",
      status: res.ok ? "sent" : "error",
      sent_payload: { phone, source: opts.source, agent_id: settings.agent_id },
      response_payload: json,
      error_message: res.ok ? null : (json?.detail?.message ?? json?.message ?? `HTTP ${res.status}`),
    });

    if (!res.ok || json?.success === false) {
      if (queueRow) {
        await s
          .from("call_queue")
          .update({
            status: "blad",
            finished_at: new Date().toISOString(),
            result_summary: json?.message ?? json?.detail?.message ?? `HTTP ${res.status}`,
            raw_result: json,
          })
          .eq("id", queueRow.id);
      }
      return {
        ok: false,
        error: json?.message ?? json?.detail?.message ?? `ElevenLabs HTTP ${res.status}`,
      };
    }

    const conversationId = json.conversation_id ?? json.conversationId;
    const callSid = json.callSid ?? json.call_sid;
    if (queueRow) {
      await s
        .from("call_queue")
        .update({
          conversation_id: conversationId ?? null,
          agent_id: conversationId ?? settings.agent_id,
          raw_result: json,
        })
        .eq("id", queueRow.id);
    }
    return { ok: true, conversationId, callSid };
  } catch (e: any) {
    if (queueRow) {
      await s
        .from("call_queue")
        .update({
          status: "blad",
          finished_at: new Date().toISOString(),
          result_summary: e?.message ?? "exception",
        })
        .eq("id", queueRow.id);
    }
    return { ok: false, error: e?.message ?? "exception" };
  }
}

/** Odpalany po zebraniu danych w kroku 2 wniosku — tworzy lead i (jeśli auto) dzwoni. */
export const captureLeadFromApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        loanApplicationId: z.string().uuid(),
        phone: z.string().min(5),
        firstName: z.string().optional().nullable(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const settings = await loadSettings();
    const trigger = settings?.call_trigger ?? "auto";

    if (trigger === "manual") {
      // Tylko zapis w kolejce, bez połączenia
      const s = admin();
      await s.from("call_queue").insert({
        phone_normalized: normalizePhone(data.phone),
        client_id: client?.id ?? null,
        loan_application_id: data.loanApplicationId,
        source: "wniosek_krok2",
        agent_id: settings?.agent_id ?? null,
        status: "oczekuje",
      });
      return { ok: true, queued: true };
    }

    const result = await placeOutboundCallInternal({
      phone: data.phone,
      source: "wniosek_krok2",
      clientId: client?.id ?? null,
      loanApplicationId: data.loanApplicationId,
      firstName: data.firstName ?? null,
    });
    return result;
  });

/** Test ręczny z panelu admina. */
export const testOutboundCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ phone: z.string().min(5) }).parse(input))
  .handler(async ({ data }) => {
    return await placeOutboundCallInternal({ phone: data.phone, source: "test" });
  });

/** Pobranie ustawień. */
export const getVoicebotSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const data = await loadSettings();
    return data;
  });

/** Zapis ustawień (admin). */
export const updateVoicebotSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        agent_id: z.string().nullable().optional(),
        agent_phone_number_id: z.string().nullable().optional(),
        call_trigger: z.enum(["auto", "manual", "auto_retry"]).optional(),
        call_delay_seconds: z.number().int().min(0).max(86400).optional(),
        retry_count: z.number().int().min(0).max(10).optional(),
        retry_delay_minutes: z.number().int().min(1).max(1440).optional(),
        sms_enabled: z.boolean().optional(),
        sms_from: z.string().nullable().optional(),
        sms_template: z.string().max(1000).nullable().optional(),
        sms_delay_seconds: z.number().int().min(0).max(86400).optional(),
        sms_trigger: z.enum(["before_call", "after_call", "on_failure", "off"]).optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("voicebot_settings")
      .upsert({ id: 1, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
