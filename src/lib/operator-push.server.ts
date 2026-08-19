// Powiadomienia push dla zespołu (operator / administrator) o kluczowych
// zdarzeniach w systemie. Każde powiadomienie niesie link do miejsca
// w panelu, w którym można obsłużyć zdarzenie.
//
// Subskrypcje: tabela push_subscriptions (zapis przez src/lib/push.functions.ts).
// Wysyłka: WebCrypto Web Push (src/lib/web-push.server.ts) — bez zależności,
// działa w Node i na Cloudflare Workers.
//
// Konfiguracja (sekrety środowiska):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  — para kluczy VAPID
//     (wygeneruj: npx tsx scripts/generate-vapid-keys.ts)
//   VAPID_SUBJECT — opcjonalnie, domyślnie mailto:kontakt@financeyou.pl
// Bez skonfigurowanych kluczy wysyłka jest cicho pomijana (feature-flag).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendWebPush, type VapidKeys } from "./web-push.server";
import faviconAsset from "@/assets/favicon.png.asset.json";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export function getVapidKeys(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT || "mailto:kontakt@financeyou.pl",
  };
}

export type OperatorPushInput = {
  /** Identyfikator typu zdarzenia, np. "lead:new", "comm:inbound:email" */
  event: string;
  title: string;
  body?: string;
  /** Ścieżka w aplikacji (relatywna), np. /operator/leady/<id> */
  url: string;
  /** Grupowanie powiadomień w systemie operacyjnym (nadpisywanie starszych o tym samym tagu) */
  tag?: string;
  /** Docelowe role — domyślnie operator + administrator */
  roles?: Array<"operator" | "operator_wewnetrzny" | "administrator">;
  /** Zamiast ról: konkretni odbiorcy (np. tylko wywołujący test) */
  targetUserIds?: string[];
  urgency?: "very-low" | "low" | "normal" | "high";
};

export type OperatorPushResult = {
  sent: number;
  failed: number;
  removed: number;
  skipped?: "no_vapid_keys" | "no_recipients" | "no_subscriptions";
};

/** Wyślij powiadomienie push do zespołu. Nigdy nie rzuca — błędy tylko loguje. */
export async function sendOperatorPush(input: OperatorPushInput): Promise<OperatorPushResult> {
  try {
    const vapid = getVapidKeys();
    if (!vapid) {
      console.warn("[operator-push] brak VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY — pomijam wysyłkę");
      return { sent: 0, failed: 0, removed: 0, skipped: "no_vapid_keys" };
    }
    const s = admin();

    let userIds = input.targetUserIds ?? [];
    if (userIds.length === 0) {
      const roles = input.roles ?? ["operator", "administrator"];
      const { data: roleRows, error } = await s
        .from("user_roles")
        .select("user_id")
        .in("role", roles);
      if (error) {
        console.error("[operator-push] user_roles error", error.message);
        return { sent: 0, failed: 0, removed: 0, skipped: "no_recipients" };
      }
      const rows = (roleRows ?? []) as { user_id: string }[];
      userIds = [...new Set(rows.map((r) => r.user_id))];
    }
    if (userIds.length === 0) return { sent: 0, failed: 0, removed: 0, skipped: "no_recipients" };

    const { data: subs, error: subErr } = await s
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);
    if (subErr) {
      console.error("[operator-push] push_subscriptions error", subErr.message);
      return { sent: 0, failed: 0, removed: 0, skipped: "no_subscriptions" };
    }
    const subRows = (subs ?? []) as Array<{
      id: string;
      user_id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }>;
    if (subRows.length === 0) {
      return { sent: 0, failed: 0, removed: 0, skipped: "no_subscriptions" };
    }

    const payload = JSON.stringify({
      title: input.title,
      body: input.body ?? "",
      url: input.url,
      tag: input.tag ?? input.event,
      event: input.event,
      icon: faviconAsset.url,
      timestamp: Date.now(),
    });

    let sent = 0;
    let failed = 0;
    const goneIds: string[] = [];
    const okIds: string[] = [];
    await Promise.all(
      subRows.map(async (sub) => {
        const res = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
          vapid,
          { urgency: input.urgency ?? "normal" },
        );
        if (res.ok) {
          sent++;
          okIds.push(sub.id);
        } else if (res.gone) {
          goneIds.push(sub.id);
        } else {
          failed++;
          console.error(`[operator-push] wysyłka nieudana (status ${res.status})`, res.error ?? "");
          await s
            .from("push_subscriptions")
            .update({ last_error: res.error ?? `HTTP ${res.status}` })
            .eq("id", sub.id);
        }
      }),
    );
    if (okIds.length > 0) {
      await s
        .from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString(), last_error: null })
        .in("id", okIds);
    }
    if (goneIds.length > 0) {
      await s.from("push_subscriptions").delete().in("id", goneIds);
    }
    return { sent, failed, removed: goneIds.length };
  } catch (e) {
    console.error("[operator-push] error", e);
    return { sent: 0, failed: 0, removed: 0 };
  }
}

const INBOUND_CHANNEL_INFO: Record<
  string,
  { label: string; url: (leadId: string | null) => string }
> = {
  chat: { label: "Czat na stronie", url: () => "/operator/czat" },
  chat_inwestor: {
    label: "Czat inwestora",
    url: (leadId) => (leadId ? `/operator/leady/${leadId}` : "/operator/leady"),
  },
  messenger: { label: "Messenger", url: () => "/operator/messenger" },
  email: { label: "E-mail", url: () => "/operator/skrzynka" },
  sms: {
    label: "SMS",
    url: (leadId) => (leadId ? `/operator/leady/${leadId}` : "/operator/leady"),
  },
  whatsapp: {
    label: "WhatsApp",
    url: (leadId) => (leadId ? `/operator/leady/${leadId}` : "/operator/leady"),
  },
  voicebot_call: {
    label: "Połączenie przychodzące",
    url: (leadId) => (leadId ? `/operator/leady/${leadId}` : "/operator/leady"),
  },
};

/** Ile minut ciszy między powiadomieniami o kolejnych wiadomościach tego samego leada na tym samym kanale. */
const INBOUND_THROTTLE_MINUTES = 3;

/**
 * Powiadomienie o wiadomości przychodzącej od leada (czat / e-mail / Messenger /
 * SMS / telefon). Throttling per lead+kanał, żeby ożywiona rozmowa nie
 * zasypała operatora dziesiątkami powiadomień.
 */
export async function pushInboundCommNotification(opts: {
  commId: string | null;
  leadId: string | null;
  channel: string;
  subject?: string | null;
  content?: string | null;
}): Promise<void> {
  try {
    const info = INBOUND_CHANNEL_INFO[opts.channel];
    if (!info) return;
    if (!getVapidKeys()) return; // szybkie wyjście zanim dotkniemy bazy

    const s = admin();

    if (opts.leadId) {
      const since = new Date(Date.now() - INBOUND_THROTTLE_MINUTES * 60_000).toISOString();
      let q = s
        .from("lead_communications")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", opts.leadId)
        .eq("channel", opts.channel)
        .eq("direction", "inbound")
        .gte("created_at", since);
      if (opts.commId) q = q.neq("id", opts.commId);
      const { count } = await q;
      if ((count ?? 0) > 0) return; // niedawno już powiadomiliśmy o tej rozmowie
    }

    let who = "Nowy kontakt";
    if (opts.leadId) {
      const { data: lead } = await s
        .from("leads")
        .select("first_name, last_name, email, phone_raw")
        .eq("id", opts.leadId)
        .maybeSingle();
      if (lead) {
        who =
          [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() ||
          lead.email ||
          lead.phone_raw ||
          who;
      }
    }

    const snippet = (opts.subject || opts.content || "").replace(/\s+/g, " ").trim().slice(0, 140);
    await sendOperatorPush({
      event: `comm:inbound:${opts.channel}`,
      title: `${info.label}: wiadomość od ${who}`,
      body: snippet,
      url: info.url(opts.leadId),
      tag: `comm-${opts.channel}-${opts.leadId ?? "unknown"}`,
    });
  } catch (e) {
    console.error("[operator-push] inbound comm notification error", e);
  }
}
