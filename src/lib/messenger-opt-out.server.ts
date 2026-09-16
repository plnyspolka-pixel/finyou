// Strażnik „dość to dość" dla Messengera i Instagram Direct.
// Odpowiednik email-unsubscribe.server.ts dla kanałów Meta: klucz to PSID/IGSID,
// a listą blokad jest `comms_suppressions` (ta sama, której używa bot-loop-guard).
//
// Messenger nie ma stopki, w której dałoby się schować link „wypisz mnie", więc
// rolę linku pełni zdanie dopisywane do wiadomości proaktywnych („napisz STOP")
// oraz rozpoznawanie odmowy w treści — dokładnie tymi samymi regułami co
// w poczcie (`opt-out.ts`).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decideSend, detectOptOut, type SendCategory, type OptOutMatch } from "./opt-out";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type MetaPlatform = "messenger" | "instagram";

/** Zdanie dopisywane do wiadomości proaktywnych — odpowiednik stopki w mailu. */
export const OPT_OUT_HINT = "Napisz STOP, jeśli nie chcesz więcej wiadomości.";

/** Czy wiadomość już mówi, jak przestać ją dostawać? */
export function hasOptOutHint(text: string): boolean {
  return /napisz\s+stop/i.test(text);
}

/**
 * Dopisuje informację o wypisie do wiadomości proaktywnej (follow-up, nudge,
 * outbox). Odpowiedzi w trwającej rozmowie i wiadomości pisane ręcznie przez
 * operatora zostawiamy bez dopisku — klient właśnie z nami rozmawia.
 */
export function withOptOutHint(text: string): string {
  const body = (text ?? "").trim();
  if (!body || hasOptOutHint(body)) return body;
  return `${body}\n\n${OPT_OUT_HINT}`;
}

export interface ChannelSendDecision {
  allowed: boolean;
  reason?: string;
  detail?: string;
}

/**
 * Czy wolno wysłać wiadomość na ten profil? `transactional` to wiadomość pisana
 * ręcznie przez operatora — przechodzi mimo zwykłego wyciszenia, bo to decyzja
 * człowieka; twarda blokada (RODO, skarga) zatrzymuje również ją.
 *
 * Wyciszenia techniczne (`bot_detected`, `loop_detected` z bot-loop-guard)
 * traktujemy jak zwykły wypis: automat milczy, człowiek może napisać. To nie są
 * decyzje klienta, tylko heurystyki — nie mogą zamykać drogi operatorowi.
 */
export async function canSendMetaMessage(
  platform: MetaPlatform,
  recipientId: string | null | undefined,
  category: SendCategory = "automated",
): Promise<ChannelSendDecision> {
  const id = String(recipientId ?? "").trim();
  if (!id) return { allowed: false, reason: "missing_recipient" };

  const { data } = await admin()
    .from("comms_suppressions")
    .select("reason, metadata, expires_at")
    .eq("channel", platform)
    .eq("identifier", id)
    .maybeSingle();

  if (!data) return { allowed: true };
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return { allowed: true };

  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const hard = meta.hard === true;
  const unblocked = !!meta.unblocked_at;
  const rawReason = String(data.reason ?? "opt_out");

  const decision = decideSend({
    suppression: { reason: hard ? "complaint" : "unsubscribe", hard, unblocked },
    category,
  });
  if (decision.allowed) return { allowed: true };
  return { allowed: false, reason: `suppressed:${rawReason}`, detail: decision.detail };
}

export interface ChannelOptOutInput {
  platform: MetaPlatform;
  senderId: string;
  leadId?: string | null;
  strength?: OptOutMatch["strength"];
  signal?: string | null;
  phrase?: string | null;
  source?: string;
}

/**
 * Wycisza rozmówcę na kanale Meta i — jak w poczcie — przenosi „dość" na
 * pozostałe kanały tego samego leada: e-mail (pełny wypis) oraz SMS
 * (`clients.do_not_sms`). Klient prosi o spokój od nas, a nie od jednej apki.
 * Telefonów nie ruszamy: „przestańcie pisać" to nie to samo co „nie dzwońcie".
 */
export async function applyChannelOptOut(input: ChannelOptOutInput): Promise<{
  ok: boolean;
  applied: string[];
}> {
  const { platform, senderId, leadId } = input;
  const strength = input.strength ?? "soft";
  const applied: string[] = [];
  const s = admin();
  const now = new Date().toISOString();
  const metadata = {
    source: input.source ?? `inbound_${platform}`,
    signal: input.signal ?? null,
    phrase: input.phrase ?? null,
    hard: strength === "hard",
    lead_id: leadId ?? null,
    opted_out_at: now,
  };

  // 1) Wyciszenie kanału — bezterminowe (wyciszenia botowe wygasają, wola
  //    klienta nie).
  try {
    await s.from("comms_suppressions").upsert(
      {
        channel: platform,
        identifier: senderId,
        reason: "opt_out",
        metadata,
        expires_at: null,
      },
      { onConflict: "channel,identifier" },
    );
    applied.push("comms_suppressions");
  } catch (e) {
    console.error("[messenger-opt-out] suppression failed", e);
  }

  // 2) Lead: notatka, wycofana zgoda marketingowa, sprawa do człowieka.
  let lead: { id: string; email: string | null; phone_normalized: string | null } | null = null;
  if (leadId) {
    try {
      const { data } = await s
        .from("leads")
        .select("id, email, phone_normalized, notes")
        .eq("id", leadId)
        .maybeSingle();
      lead = (data as any) ?? null;
      const note =
        strength === "hard"
          ? `[AI] Klient zażądał zaprzestania kontaktu na ${platform} (${input.signal ?? "opt_out"}) — TWARDA blokada. Cytat: ${input.phrase ?? "—"}`
          : `[AI] Klient poprosił o zaprzestanie wiadomości na ${platform} (${input.signal ?? "opt_out"}). Cytat: ${input.phrase ?? "—"}`;
      await s
        .from("leads")
        .update({
          status: "wymaga_kontaktu",
          consent_marketing: false,
          notes: [(data as any)?.notes, note].filter(Boolean).join("\n"),
        })
        .eq("id", leadId);
      applied.push("leads");
    } catch (e) {
      console.error("[messenger-opt-out] lead update failed", e);
    }
  }

  // 3) Kaskada na pozostałe kanały pisane.
  if (lead?.email) {
    try {
      const { applyOptOut } = await import("./email-unsubscribe.server");
      await applyOptOut({
        email: lead.email,
        source: `inbound_${platform}`,
        strength,
        signal: input.signal ?? null,
        phrase: input.phrase ?? null,
        metadata: { lead_id: leadId ?? null, channel: platform },
      });
      applied.push("email");
    } catch (e) {
      console.error("[messenger-opt-out] email cascade failed", e);
    }
  }
  if (lead?.phone_normalized) {
    try {
      const { error } = await s
        .from("clients")
        .update({ do_not_sms: true })
        .eq("phone_normalized", lead.phone_normalized);
      if (!error) applied.push("clients.do_not_sms");
    } catch (e) {
      console.error("[messenger-opt-out] sms cascade failed", e);
    }
  }

  try {
    await s.from("automation_events").insert({
      automation_type: "channel_opt_out",
      status: strength === "hard" ? "hard_block" : "opted_out",
      sent_payload: { platform, sender_id: senderId, lead_id: leadId ?? null },
      response_payload: { signal: input.signal ?? null, phrase: input.phrase ?? null, applied },
    });
  } catch (e) {
    console.error("[messenger-opt-out] automation_events failed", e);
  }

  console.warn(`[messenger-opt-out] opt-out ${platform}:${senderId} (${strength})`, applied);
  return { ok: true, applied };
}

/**
 * STRAŻNIK na wejściu: czy ta wiadomość z Messengera/Instagrama to prośba
 * o zaprzestanie? Jeśli tak — wyciszamy rozmówcę i oddajemy sprawę człowiekowi.
 */
export async function handleInboundChannelOptOut(params: {
  platform: MetaPlatform;
  senderId: string;
  leadId?: string | null;
  text: string | null | undefined;
}): Promise<{ optedOut: boolean; signal?: string; strength?: OptOutMatch["strength"] }> {
  const match = detectOptOut({ text: params.text });
  if (!match) return { optedOut: false };

  await applyChannelOptOut({
    platform: params.platform,
    senderId: params.senderId,
    leadId: params.leadId ?? null,
    strength: match.strength,
    signal: match.signal,
    phrase: match.phrase,
  });
  return { optedOut: true, signal: match.signal, strength: match.strength };
}
