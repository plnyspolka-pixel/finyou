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

/** Wersja publiczna `normalizePhone` — używana m.in. przez calculator-followup, żeby
 *  dedup i throttle widziały ten sam string co reszta toru voicebota. */
export function normalizePhoneForVoicebot(input: string): string {
  return normalizePhone(input);
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

/** Sztywne godziny dzwonienia: 8:00–22:00 czasu Warszawy, oprócz niedziel. */
export function getCallingWindow(now: Date = new Date()): {
  allowed: boolean;
  reason?: "sunday" | "outside_hours";
  hour: number;
  weekday: string;
  nextAllowedAt: Date;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const isSunday = weekday === "Sun";
  const inWindow = hour >= 8 && hour < 22;
  const allowed = !isSunday && inWindow;

  function warsawOffsetMinutes(at: Date): number {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Warsaw",
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return (asUtc - at.getTime()) / 60000;
  }
  function nextEightAm(from: Date): Date {
    let cursor = new Date(from.getTime());
    for (let i = 0; i < 8; i++) {
      const off = warsawOffsetMinutes(cursor);
      const local = new Date(cursor.getTime() + off * 60000);
      const ly = local.getUTCFullYear(), lm = local.getUTCMonth(), ld = local.getUTCDate();
      const lh = local.getUTCHours(), ldow = local.getUTCDay();
      let candidate = new Date(Date.UTC(ly, lm, ld, 8, 0, 0) - off * 60000);
      if (ldow !== 0 && lh < 8 && candidate.getTime() > from.getTime()) return candidate;
      const tomorrowDow = (ldow + 1) % 7;
      const addDays = tomorrowDow === 0 ? 2 : 1;
      candidate = new Date(Date.UTC(ly, lm, ld + addDays, 8, 0, 0) - off * 60000);
      if (candidate.getTime() > from.getTime()) return candidate;
      cursor = new Date(candidate.getTime() + 3600_000);
    }
    return new Date(from.getTime() + 12 * 3600_000);
  }

  return {
    allowed,
    reason: allowed ? undefined : isSunday ? "sunday" : "outside_hours",
    hour,
    weekday,
    nextAllowedAt: allowed ? now : nextEightAm(now),
  };
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

    try {
      const { logLeadCommunication } = await import("@/lib/lead-comms.server");
      await logLeadCommunication({
        phoneNormalized: phone,
        channel: "sms",
        direction: "outbound",
        status: res.ok ? "sent" : "failed",
        content: opts.body,
        externalId: json?.sid ?? null,
        metadata: { from, source: opts.source },
        errorMessage: res.ok ? null : (json?.message ?? `HTTP ${res.status}`),
      });
    } catch (e) {
      console.error("[sms] log lead comm failed", e);
    }

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
  /** Zmienne przekazywane do agenta jako conversation_initiation_client_data.dynamic_variables. */
  dynamicVariables?: Record<string, string> | null;
}): Promise<{ ok: boolean; conversationId?: string; callSid?: string; error?: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ok: false, error: "Brak ELEVENLABS_API_KEY" };

  const settings = await loadSettings();
  if (!settings?.agent_id || !settings?.agent_phone_number_id) {
    return { ok: false, error: "Brak konfiguracji voicebota (agent_id / phone_number_id)" };
  }

  const s = admin();
  const phone = normalizePhone(opts.phone);

  // GLOBALNY THROTTLE: max 1 telefon na 24 h per numer (z dowolnego źródła).
  // Niezależnie od tego, ile torów follow-upu próbuje dzwonić, Ania wybiera tylko raz dziennie.
  // Test (`source === "test"`) z panelu admina pomijamy.
  if (opts.source !== "test") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await s
      .from("call_queue")
      .select("id, started_at, created_at, source")
      .eq("phone_normalized", phone)
      .in("status", ["w_trakcie", "wykonane"])
      .gte("created_at", since)
      .neq("source", "test")
      .order("created_at", { ascending: false })
      .limit(1);
    if (recent && recent.length > 0) {
      const last = recent[0];
      const lastAt = new Date((last.started_at as string | null) ?? (last.created_at as string));
      const nextAllowedRaw = new Date(lastAt.getTime() + 24 * 60 * 60 * 1000);
      const win = getCallingWindow(nextAllowedRaw);
      const scheduledAt = (win.allowed ? nextAllowedRaw : win.nextAllowedAt).toISOString();
      await s.from("automation_events").insert({
        automation_type: "elevenlabs_outbound_call",
        status: "skipped",
        sent_payload: { phone, source: opts.source },
        response_payload: {
          throttled_daily: true,
          last_call_source: last.source,
          last_call_at: lastAt.toISOString(),
          next_allowed_at: scheduledAt,
        },
      });
      return {
        ok: false,
        error: `Daily throttle — ostatni telefon ${lastAt.toISOString()} (źródło: ${last.source}). Następny dozwolony: ${scheduledAt}`,
      };
    }
  }

  // SZTYWNE OGRANICZENIE: dzwonimy tylko 8:00–22:00 Europe/Warsaw, oprócz niedziel.
  // Test (`source === "test"`) z panelu admina wykonujemy zawsze.
  const window = getCallingWindow();
  if (!window.allowed && opts.source !== "test") {
    const nextIso = window.nextAllowedAt.toISOString();
    await s.from("call_queue").insert({
      phone_normalized: phone,
      client_id: opts.clientId ?? null,
      loan_application_id: opts.loanApplicationId ?? null,
      meta_lead_id: opts.metaLeadId ?? null,
      source: opts.source,
      agent_id: settings.agent_id,
      status: "oczekuje",
      scheduled_at: nextIso,
      result_summary: `Quiet hours (${window.reason}, godzina ${window.hour}:00 Warszawa) — zaplanowano na ${nextIso}`,
    });
    if (opts.loanApplicationId) {
      await s
        .from("loan_applications")
        .update({ next_reminder_at: nextIso, reminder_paused: false })
        .eq("id", opts.loanApplicationId);
    }
    await s.from("automation_events").insert({
      automation_type: "elevenlabs_outbound_call",
      status: "skipped",
      sent_payload: { phone, source: opts.source },
      response_payload: { quiet_hours: true, reason: window.reason, hour: window.hour, weekday: window.weekday, next_allowed_at: nextIso },
    });
    return { ok: false, error: `Quiet hours — połączenie zaplanowano na ${nextIso}` };
  }


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
    const body: Record<string, unknown> = {
      agent_id: settings.agent_id,
      agent_phone_number_id: settings.agent_phone_number_id,
      to_number: phone,
    };
    if (opts.dynamicVariables && Object.keys(opts.dynamicVariables).length > 0) {
      body.conversation_initiation_client_data = {
        dynamic_variables: opts.dynamicVariables,
      };
    }
    const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
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
      await maybeSendSms("on_failure", { phone, source: opts.source, firstName: opts.firstName }).catch(() => {});
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
    try {
      const { logLeadCommunication } = await import("@/lib/lead-comms.server");
      await logLeadCommunication({
        loanApplicationId: opts.loanApplicationId ?? null,
        clientId: opts.clientId ?? null,
        metaLeadId: opts.metaLeadId ?? null,
        phoneNormalized: phone,
        channel: "voicebot_call",
        direction: "outbound",
        status: "initiated",
        content: "Inicjacja rozmowy voicebota",
        externalId: conversationId ?? callSid ?? null,
        agentId: settings.agent_id,
        metadata: { source: opts.source, callSid },
      });
    } catch (e) {
      console.error("[voicebot] log init failed", e);
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

/** Test ręczny SMS z panelu admina. */
export const testSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      phone: z.string().min(5),
      body: z.string().min(1).max(1000).optional(),
      firstName: z.string().optional().nullable(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const settings = await loadSettings();
    const tpl = data.body || settings?.sms_template || "Test SMS z FinanceYou.";
    const body = renderTemplate(tpl, { first_name: data.firstName ?? "", phone: data.phone });
    return await sendSmsInternal({
      phone: data.phone,
      body,
      source: "test",
      from: settings?.sms_from ?? null,
    });
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
