// Wysyłka sekwencji powitalnych (z ticka autopilota). Działa WYŁĄCZNIE
// w trybie full_autopilot bez pauzy – w innych trybach nic nie wysyła.
// Wypis, bounce i skargi pilnuje sendResendEmail (kategoria `automated`),
// limit maili na odbiorcę/tydzień – bezpieczniki autopilota.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendResendEmail } from "@/lib/resend-send.server";
import {
  SEQUENCE_WINDOW_DAYS,
  nextSequenceStep,
  renderStep,
  type SequenceCandidate,
} from "./sequences";
import { loadAutopilotConfig, logAutopilot } from "./state.server";

const db = supabaseAdmin as unknown as { from: (t: string) => any };
const SEQUENCE = (track: string) => `welcome:${track}`;
export const MAX_SEQUENCE_SENDS_PER_RUN = 25;

export async function runWelcomeSequences(now: Date = new Date()): Promise<{
  ran: boolean;
  sent: number;
  blocked: number;
  reason?: string;
}> {
  const cfg = await loadAutopilotConfig();
  if (cfg.state.mode !== "full_autopilot" || cfg.state.paused) {
    return {
      ran: false,
      sent: 0,
      blocked: 0,
      reason: `tryb ${cfg.state.mode}${cfg.state.paused ? " (pauza)" : ""}`,
    };
  }
  const since = new Date(now.getTime() - SEQUENCE_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: subs } = await db
    .from("email_subscribers")
    .select("id, email, first_name, tags, created_at")
    .eq("status", "active")
    .overlaps("tags", ["lead-magnet", "narzedzie"])
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(500);
  const list = (subs ?? []) as Array<{
    id: string;
    email: string;
    first_name: string | null;
    tags: string[];
    created_at: string;
  }>;
  if (!list.length) return { ran: true, sent: 0, blocked: 0 };

  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data: sends } = await db
    .from("email_sequence_sends")
    .select("subscriber_id, sequence, step, sent_at")
    .in(
      "subscriber_id",
      list.map((s) => s.id),
    );
  const bySub = new Map<string, Array<{ sequence: string; step: number; sent_at: string }>>();
  for (const r of (sends ?? []) as Array<{
    subscriber_id: string;
    sequence: string;
    step: number;
    sent_at: string;
  }>) {
    bySub.set(r.subscriber_id, [...(bySub.get(r.subscriber_id) ?? []), r]);
  }

  let sent = 0;
  let blocked = 0;
  for (const s of list) {
    if (sent >= MAX_SEQUENCE_SENDS_PER_RUN) break;
    const rows = bySub.get(s.id) ?? [];
    const candidate: SequenceCandidate = {
      subscriberId: s.id,
      tags: s.tags ?? [],
      createdAt: s.created_at,
      sentSteps: rows.map((r) => r.step),
      sentLast7d: rows.filter((r) => r.sent_at >= weekAgo).length,
      lastSentAt:
        rows
          .map((r) => r.sent_at)
          .sort()
          .pop() ?? null,
    };
    const next = nextSequenceStep(candidate, now, cfg.limits.maxEmailsPerRecipientPerWeek);
    if (!next) continue;
    // Najpierw rezerwacja kroku (UNIQUE) – równoległy tick go nie wyśle drugi raz.
    const { data: claim, error: claimErr } = await db
      .from("email_sequence_sends")
      .insert({ subscriber_id: s.id, sequence: SEQUENCE(next.track), step: next.step.step })
      .select("id")
      .single();
    if (claimErr || !claim) continue;
    const res = await sendResendEmail({
      to: s.email,
      subject: next.step.subject,
      text: renderStep(next.track, next.step, s.first_name),
      category: "automated",
    });
    if (res.ok) sent++;
    else {
      blocked++;
      await db
        .from("email_sequence_sends")
        .update({
          status: res.error?.startsWith("blocked:") ? "blocked" : "error",
          error: res.error ?? null,
        })
        .eq("id", claim.id);
    }
  }
  if (sent || blocked) {
    await logAutopilot({
      action: "welcome_sequence",
      summary: `Sekwencje powitalne: wysłano ${sent}, zablokowano/błąd ${blocked}.`,
      payload: { sent, blocked },
    });
  }
  return { ran: true, sent, blocked };
}
