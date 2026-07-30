// Ochrona przed pętlami bot-bot na Messengerze / Instagramie.
// Wywoływane PRZED odpowiedzią auto-agenta na wiadomość przychodzącą.
// Odpowiednik email-guard.server.ts dla kanałów Meta (klucz: PSID/IGSID).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  looksLikeAutoMessage,
  isRepetitiveInbound,
  countFastPingPong,
} from "@/lib/bot-detection";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Progi dobrane tak, by nie łapać żywych ludzi piszących szybko:
const MAX_OUTBOUND_24H = 40; // twardy limit odpowiedzi agenta do jednego leada / 24h
const BURST_WINDOW_MIN = 10; // okno wykrywania lawiny wiadomości
const BURST_LIMIT = 20; // >=20 wiadomości (in+out) w oknie => pętla
const FAST_PINGPONG_LIMIT = 3; // >=3 odpowiedzi przychodzące <5s po naszej => bot
const AUTO_CONTENT_STRIKES = 2; // >=2 wiadomości z sygnaturą automatu w 24h => wyciszenie

/** Czy rozmówca (PSID/IGSID) jest wyciszony? Wpisy z expires_at w przeszłości ignorujemy. */
export async function isChannelSuppressed(channel: string, identifier: string): Promise<boolean> {
  const { data } = await admin()
    .from("comms_suppressions")
    .select("id, expires_at")
    .eq("channel", channel)
    .eq("identifier", identifier)
    .maybeSingle();
  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return false;
  return true;
}

export async function addChannelSuppression(opts: {
  channel: string;
  identifier: string;
  reason: string;
  metadata?: Record<string, any>;
  /** Po ilu godzinach wyciszenie wygasa; brak = bezterminowo. */
  expiresInHours?: number;
}): Promise<void> {
  const expires_at = opts.expiresInHours
    ? new Date(Date.now() + opts.expiresInHours * 60 * 60 * 1000).toISOString()
    : null;
  await admin()
    .from("comms_suppressions")
    .upsert(
      {
        channel: opts.channel,
        identifier: opts.identifier,
        reason: opts.reason,
        metadata: opts.metadata ?? {},
        expires_at,
      },
      { onConflict: "channel,identifier" },
    );
}

/**
 * Łączny test — czy auto-agent może odpowiedzieć na tę wiadomość z Messengera /
 * Instagrama. Wiadomość przychodząca jest już zalogowana (guard tylko blokuje
 * odpowiedź, nie gubi korespondencji — operator widzi wszystko w skrzynce).
 */
export async function shouldSkipMessengerAutoReply(params: {
  leadId: string;
  senderId: string;
  platform: "messenger" | "instagram";
  text: string;
}): Promise<{ skip: boolean; reason?: string }> {
  const { leadId, senderId, platform, text } = params;
  const s = admin();

  // 1) Wyciszony wcześniej (wykryty bot / decyzja operatora)
  if (await isChannelSuppressed(platform, senderId)) {
    return { skip: true, reason: "suppressed" };
  }

  // Jedna paczka danych do wszystkich heurystyk: ostatnie 24h rozmowy.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await s
    .from("lead_communications")
    .select("direction, content, created_at")
    .eq("lead_id", leadId)
    .eq("channel", "messenger")
    .gte("created_at", since24h)
    .order("created_at", { ascending: true })
    .limit(200);
  const rows = recent ?? [];
  const inbound = rows.filter((r) => r.direction === "inbound");
  const outboundCount = rows.filter((r) => r.direction === "outbound").length;

  const suppress = async (reason: string, hours: number, extra: Record<string, any> = {}) => {
    await addChannelSuppression({
      channel: platform,
      identifier: senderId,
      reason,
      expiresInHours: hours,
      metadata: { lead_id: leadId, detected_at: new Date().toISOString(), ...extra },
    });
  };

  // 2) Treść zdradza automat ("jestem botem", "automatyczna odpowiedź", …)
  const signal = looksLikeAutoMessage(text);
  if (signal) {
    // Powtarzający się automat wyciszamy na dobę; pojedynczy tylko pomijamy
    // (człowiek mógł np. zacytować stopkę autorespondera).
    const priorAutoCount = inbound
      .slice(0, -1)
      .filter((r) => looksLikeAutoMessage(r.content ?? "")).length;
    if (priorAutoCount + 1 >= AUTO_CONTENT_STRIKES) {
      await suppress("bot_detected", 24, { signal });
    }
    return { skip: true, reason: `bot_content:${signal}` };
  }

  // 3) Ta sama treść w kółko — klasyczna pętla
  if (isRepetitiveInbound(inbound.slice(-10).map((r) => r.content))) {
    await suppress("loop_detected", 24, { kind: "repeated_content" });
    return { skip: true, reason: "repeated_content" };
  }

  // 4) Seria błyskawicznych odpowiedzi (<5s po naszej wychodzącej)
  const fast = countFastPingPong(
    rows.slice(-16).map((r) => ({ direction: r.direction, createdAt: r.created_at })),
  );
  if (fast >= FAST_PINGPONG_LIMIT) {
    await suppress("bot_detected", 24, { kind: "fast_ping_pong", fast_replies: fast });
    return { skip: true, reason: "fast_ping_pong" };
  }

  // 5) Lawina wiadomości w krótkim oknie
  const sinceBurst = Date.now() - BURST_WINDOW_MIN * 60 * 1000;
  const burst = rows.filter((r) => new Date(r.created_at).getTime() >= sinceBurst).length;
  if (burst >= BURST_LIMIT) {
    await suppress("loop_detected", 1, { kind: "burst", messages_in_window: burst });
    return { skip: true, reason: "burst" };
  }

  // 6) Twardy dzienny limit wychodzących do jednego leada
  if (outboundCount >= MAX_OUTBOUND_24H) {
    return { skip: true, reason: "rate_limit_24h" };
  }

  return { skip: false };
}
