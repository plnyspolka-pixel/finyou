// Planowanie telefonu „Ania oddzwania", gdy klient o to poprosił (rozmowa albo SMS).
//
// Wpis ląduje w `call_queue` jako `oczekuje` ze źródłem `client_callback`; wykonuje go
// cron `process-scheduled-calls` (co minutę). `placeOutboundCallInternal` dla tego
// źródła omija dobowy throttle (klient sam poprosił o telefon) i otwiera rozmowę
// pytaniem, czy może już rozmawiać (patrz `CALLBACK_FIRST_MESSAGE`).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const CLIENT_CALLBACK_SOURCE = "client_callback";
/** Ile telefonów „na prośbę klienta" na numer w 24 h (łącznie z ponowieniami). */
export const CALLBACK_MAX_PER_24H = 3;
/** Odstęp ponowienia, gdy klient znów nie odebrał. */
export const CALLBACK_RETRY_DELAY_MS = 3 * 3600_000;

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export interface ScheduleCallbackInput {
  phone: string;
  dueAt: Date;
  via: "voice" | "sms" | "retry";
  clientId?: string | null;
  loanApplicationId?: string | null;
  metaLeadId?: string | null;
  /** Wypowiedź klienta, z której wynikła prośba — do podglądu w panelu. */
  evidence?: string | null;
}

export type ScheduleCallbackResult =
  | { ok: true; scheduledAt: Date; updated: boolean }
  | { ok: false; skipped: "do_not_call" | "limit_24h" | "error"; error?: string };

/** Termin w oknie telefonów (8–22, bez niedzieli) — poza oknem przesuwamy na najbliższe 8:00. */
async function insideCallingWindow(due: Date): Promise<Date> {
  const { getCallingWindow } = await import("@/lib/voicebot.functions");
  const win = getCallingWindow(due);
  return win.allowed ? due : win.nextAllowedAt;
}

export async function scheduleClientCallback(
  input: ScheduleCallbackInput,
): Promise<ScheduleCallbackResult> {
  const s = admin();
  try {
    // Klient z blokadą telefonów (RODO / „nie dzwońcie") — nie planujemy nic.
    const { data: client } = await s
      .from("clients")
      .select("id, do_not_call")
      .eq("phone_normalized", input.phone)
      .limit(1)
      .maybeSingle();
    if (client?.do_not_call === true) return { ok: false, skipped: "do_not_call" };

    const clientId = input.clientId ?? (client?.id as string | undefined) ?? null;
    let loanApplicationId = input.loanApplicationId ?? null;
    if (!loanApplicationId && clientId) {
      const { data: loan } = await s
        .from("loan_applications")
        .select("id")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      loanApplicationId = (loan?.id as string | undefined) ?? null;
    }

    const scheduledAt = await insideCallingWindow(input.dueAt);
    const note =
      input.via === "retry"
        ? "Ponowienie telefonu na prośbę klienta (nie odebrał)"
        : `Klient prosił o oddzwonienie (${input.via === "sms" ? "SMS" : "rozmowa"})${
            input.evidence ? `: „${input.evidence}"` : ""
          }`;

    // Jedna oczekująca prośba na numer — nowa zastępuje poprzednią (klient mógł zmienić porę).
    const { data: pending } = await s
      .from("call_queue")
      .select("id")
      .eq("phone_normalized", input.phone)
      .eq("source", CLIENT_CALLBACK_SOURCE)
      .eq("status", "oczekuje")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pending?.id && input.via !== "retry") {
      await s
        .from("call_queue")
        .update({ scheduled_at: scheduledAt.toISOString(), result_summary: note })
        .eq("id", pending.id);
      return { ok: true, scheduledAt, updated: true };
    }

    // Bezpiecznik: nie więcej niż CALLBACK_MAX_PER_24H telefonów „na prośbę" na numer.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await s
      .from("call_queue")
      .select("id", { count: "exact", head: true })
      .eq("phone_normalized", input.phone)
      .eq("source", CLIENT_CALLBACK_SOURCE)
      .gte("created_at", since);
    if ((count ?? 0) >= CALLBACK_MAX_PER_24H) return { ok: false, skipped: "limit_24h" };

    const { error } = await s.from("call_queue").insert({
      phone_normalized: input.phone,
      client_id: clientId,
      loan_application_id: loanApplicationId,
      meta_lead_id: input.metaLeadId ?? null,
      source: CLIENT_CALLBACK_SOURCE,
      status: "oczekuje",
      scheduled_at: scheduledAt.toISOString(),
      attempts: 0,
      result_summary: note,
    });
    if (error) return { ok: false, skipped: "error", error: error.message };

    await s.from("automation_events").insert({
      automation_type: "client_callback_scheduled",
      status: "sent",
      sent_payload: { phone: input.phone, via: input.via },
      response_payload: {
        scheduled_at: scheduledAt.toISOString(),
        evidence: input.evidence ?? null,
      },
    });
    return { ok: true, scheduledAt, updated: false };
  } catch (e) {
    return { ok: false, skipped: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
