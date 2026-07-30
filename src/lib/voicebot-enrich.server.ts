// Pobiera szczegóły rozmowy z ElevenLabs Conversational AI i uzupełnia bazę.
// Używane przez:
// 1) cron /api/public/hooks/voicebot-enrich-tick (co 2 min)
// 2) ręczny przycisk "Odśwież z ElevenLabs" w panelu admina
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type CallOutcome = "answered" | "no_answer" | "busy" | "voicemail" | "failed" | "completed";

export function classifyOutcome(opts: {
  callSuccessful?: string | null;
  callStatus?: string | null;
  disconnectionReason?: string | null;
  durationSec?: number | null;
}): { outcome: CallOutcome; label: string } {
  const d = (opts.disconnectionReason || "").toLowerCase();
  const s = (opts.callStatus || "").toLowerCase();
  const succ = (opts.callSuccessful || "").toLowerCase();
  const dur = opts.durationSec ?? 0;
  if (d.includes("no_answer") || d.includes("noanswer") || s === "no-answer")
    return { outcome: "no_answer", label: "Nieodebrana" };
  if (d.includes("busy")) return { outcome: "busy", label: "Zajęte" };
  if (d.includes("voicemail") || d.includes("machine"))
    return { outcome: "voicemail", label: "Poczta głosowa" };
  if (d.includes("failed") || s === "failed" || succ === "failure")
    return { outcome: "failed", label: "Błąd połączenia" };
  if (dur < 5 && (d || s)) return { outcome: "no_answer", label: "Nieodebrana" };
  if (succ === "success" || dur >= 5) return { outcome: "answered", label: "Odebrana" };
  return { outcome: "completed", label: "Zakończona" };
}

function outcomeToQueueStatus(outcome: CallOutcome): string {
  switch (outcome) {
    case "answered":
      return "wykonane";
    case "no_answer":
    case "busy":
      return "nieodebrana";
    case "voicemail":
      return "poczta_glosowa";
    case "failed":
      return "blad";
    default:
      return "wykonane";
  }
}

type EnrichResult =
  | { ok: true; outcome: CallOutcome; duration: number | null; cost: number | null }
  | { ok: false; status: number; error: string };

/** Pobiera pojedynczą rozmowę z ElevenLabs i aktualizuje call_queue + lead_communications. */
export async function enrichVoicebotConversation(conversationId: string): Promise<EnrichResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ok: false, status: 500, error: "ELEVENLABS_API_KEY missing" };

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    {
      headers: { "xi-api-key": apiKey, accept: "application/json" },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: text.slice(0, 400) || `HTTP ${res.status}` };
  }
  const body: any = await res.json();

  const meta = body?.metadata ?? {};
  const analysis = body?.analysis ?? {};
  const phoneCall = meta?.phone_call ?? {};
  const startUnix: number | null = meta?.start_time_unix_secs ?? null;
  const durationSec: number | null = meta?.call_duration_secs ?? null;
  const disconnectionReason: string | null = meta?.termination_reason ?? null;
  const callStatus: string | null = body?.status ?? null;
  const callSuccessful: string | null = analysis?.call_successful ?? null;
  const summary: string | null = analysis?.transcript_summary ?? null;
  const transcriptArr: any[] = Array.isArray(body?.transcript) ? body.transcript : [];
  const transcriptText = transcriptArr
    .map((t: any) => `${t.role ?? t.speaker ?? ""}: ${t.message ?? t.text ?? ""}`.trim())
    .filter(Boolean)
    .join("\n");

  const costCredits: number | null =
    meta?.cost ?? meta?.charging?.dev_cost ?? meta?.charging?.cost ?? null;

  const phone: string | null = phoneCall?.external_number ?? null;
  const hasAudio: boolean = body?.has_audio === true || body?.audio_path != null;

  const { outcome, label } = classifyOutcome({
    callSuccessful,
    callStatus,
    disconnectionReason,
    durationSec,
  });

  const s = admin();

  // Spróbuj znaleźć wiersz w kolejce po conversation_id (najpewniejszy klucz)
  const { data: queueRow } = await s
    .from("call_queue")
    .select("*")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (queueRow) {
    const update: Record<string, unknown> = {
      status: outcomeToQueueStatus(outcome),
      raw_result: body,
      result_summary: summary ?? queueRow.result_summary ?? null,
      transcript: transcriptText || queueRow.transcript || null,
    };
    if (startUnix && !queueRow.started_at)
      update.started_at = new Date(startUnix * 1000).toISOString();
    if (durationSec != null && startUnix)
      update.finished_at = new Date((startUnix + durationSec) * 1000).toISOString();
    else if (durationSec != null && !queueRow.finished_at)
      update.finished_at = new Date().toISOString();
    await s.from("call_queue").update(update).eq("id", queueRow.id);
  }

  // Aktualizuj lead_communications po external_id; jeśli nie istnieje, dodaj.
  const { data: existingComm } = await s
    .from("lead_communications")
    .select("id, lead_id")
    .eq("external_id", conversationId)
    .maybeSingle();

  const commMetadata: Record<string, unknown> = {
    source: "elevenlabs_enrich",
    call_outcome: outcome,
    call_outcome_label: label,
    call_successful: callSuccessful,
    call_status: callStatus,
    disconnection_reason: disconnectionReason,
    transcript_full: transcriptArr,
    summary,
    cost_credits: costCredits,
    has_audio: hasAudio,
    analysis,
    evaluation_criteria_results: analysis?.evaluation_criteria_results ?? null,
    start_time_unix_secs: startUnix,
  };

  if (existingComm) {
    await s
      .from("lead_communications")
      .update({
        status: label,
        content: summary || transcriptText || null,
        transcript: transcriptArr.length
          ? transcriptArr
          : transcriptText
            ? { text: transcriptText }
            : null,
        duration_seconds: durationSec,
        metadata: commMetadata,
      })
      .eq("id", existingComm.id);
  } else {
    const { logLeadCommunication } = await import("@/lib/lead-comms.server");
    await logLeadCommunication({
      loanApplicationId: queueRow?.loan_application_id ?? null,
      clientId: queueRow?.client_id ?? null,
      metaLeadId: queueRow?.meta_lead_id ?? null,
      phoneNormalized: queueRow?.phone_normalized ?? phone ?? null,
      channel: "voicebot_call",
      direction: "outbound",
      status: label,
      subject: summary ? "Rozmowa voicebota" : `Próba połączenia — ${label}`,
      content: summary || transcriptText || null,
      transcript: transcriptArr.length ? transcriptArr : null,
      durationSeconds: durationSec,
      externalId: conversationId,
      agentId: body?.agent_id ?? queueRow?.agent_id ?? null,
      metadata: commMetadata,
    });
  }

  return { ok: true, outcome, duration: durationSec, cost: costCredits };
}

/** Wybiera niegotowe rozmowy z ostatnich 30 dni i wzbogaca każdą. */
export async function enrichPendingConversations(limit = 30): Promise<{
  checked: number;
  updated: number;
  errors: Array<{ conversationId: string; error: string }>;
}> {
  const s = admin();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await s
    .from("call_queue")
    .select("id, conversation_id, status, raw_result, finished_at")
    .not("conversation_id", "is", null)
    .gte("created_at", thirtyDaysAgo)
    .or("status.eq.w_trakcie,raw_result.is.null,finished_at.is.null")
    .order("created_at", { ascending: false })
    .limit(limit);
  let updated = 0;
  const errors: Array<{ conversationId: string; error: string }> = [];
  for (const r of rows ?? []) {
    const convId = r.conversation_id as string;
    try {
      const res = await enrichVoicebotConversation(convId);
      if (res.ok) updated++;
      else if (res.status === 404) {
        // Rozmowa jeszcze nie istnieje po stronie EL — pomijamy bez błędu.
      } else {
        errors.push({ conversationId: convId, error: `${res.status}: ${res.error}` });
      }
    } catch (e: any) {
      errors.push({ conversationId: convId, error: e?.message ?? "exception" });
    }
  }
  return { checked: (rows ?? []).length, updated, errors };
}
