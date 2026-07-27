// Ochrona przed pętlami mailowymi i niechcianymi adresatami.
// Używane PRZED każdą odpowiedzią auto-agenta i (opcjonalnie) przed wysyłką maila.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const SYSTEM_PREFIXES = [
  "noreply@",
  "no-reply@",
  "no_reply@",
  "donotreply@",
  "do-not-reply@",
  "mailer-daemon@",
  "postmaster@",
  "bounce@",
  "bounces@",
  "notifications@",
  "notification@",
  "auto-reply@",
  "autoreply@",
  "support-noreply@",
];

/** Zwraca lowercased headers map z dowolnego inputu (Headers/object/array) */
export function normalizeHeaders(h: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (Array.isArray(h)) {
    for (const it of h) {
      const name = String((it as any)?.name ?? "").toLowerCase();
      const value = String((it as any)?.value ?? "");
      if (name) out[name] = value;
    }
    return out;
  }
  if (typeof h === "object") {
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
      out[k.toLowerCase()] = String(v ?? "");
    }
  }
  return out;
}

export function isAutoReplyHeaders(headers: Record<string, string>): boolean {
  const get = (k: string) => (headers[k.toLowerCase()] ?? "").toLowerCase().trim();
  const autoSubmitted = get("auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (get("x-auto-response-suppress")) return true;
  if (get("x-autoreply")) return true;
  if (get("x-autorespond")) return true;
  const precedence = get("precedence");
  if (["auto_reply", "auto-reply", "bulk", "list", "junk"].includes(precedence)) return true;
  if (get("list-unsubscribe") && get("list-id")) return true;
  if (get("x-mailer")?.includes("autoresponder")) return true;
  return false;
}

export function isSystemSender(email: string | null | undefined): boolean {
  if (!email) return true;
  const e = email.toLowerCase();
  return SYSTEM_PREFIXES.some((p) => e.startsWith(p) || e.includes(`<${p}`));
}

export async function isSuppressed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const s = admin();
  const { data } = await s
    .from("suppressed_emails")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return !!data;
}

export async function addSuppression(
  email: string,
  reason: string,
  metadata: Record<string, any> = {},
): Promise<void> {
  if (!email) return;
  const s = admin();
  await s
    .from("suppressed_emails")
    .upsert({ email: email.toLowerCase(), reason, metadata }, { onConflict: "email" });
}

/** Liczba wiadomości wychodzących do leada w ostatnich 24h */
export async function outboundCount24h(leadId: string): Promise<number> {
  const s = admin();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await s
    .from("lead_communications")
    .select("*", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("direction", "outbound")
    .gte("created_at", since);
  return count ?? 0;
}

/** Liczba wiadomości w wątku (inbound+outbound) w ostatnich N minutach */
export async function threadCountSince(opts: {
  leadId: string;
  threadIds: (string | null | undefined)[];
  minutes: number;
}): Promise<number> {
  const s = admin();
  const since = new Date(Date.now() - opts.minutes * 60 * 1000).toISOString();
  const ids = opts.threadIds.filter(Boolean) as string[];
  let q = s
    .from("lead_communications")
    .select("*", { count: "exact", head: true })
    .eq("lead_id", opts.leadId)
    .gte("created_at", since);
  if (ids.length > 0) q = q.in("external_id", ids);
  const { count } = await q;
  return count ?? 0;
}

/** Łączny test — czy wolno odpowiedzieć autoresponderem na ten mail. */
export async function shouldSkipAutoReply(params: {
  leadId: string;
  fromEmail: string | null;
  headers: Record<string, string>;
  threadIds?: (string | null | undefined)[];
}): Promise<{ skip: boolean; reason?: string }> {
  const { leadId, fromEmail, headers, threadIds = [] } = params;
  if (isSystemSender(fromEmail)) return { skip: true, reason: "system_sender" };
  if (isAutoReplyHeaders(headers)) return { skip: true, reason: "auto_reply_headers" };
  if (await isSuppressed(fromEmail)) return { skip: true, reason: "suppressed" };
  if ((await outboundCount24h(leadId)) >= 10) return { skip: true, reason: "rate_limit_24h" };

  // Wykrywanie pętli: >=3 wiadomości w tym samym wątku w 5 minut
  if (threadIds.filter(Boolean).length > 0) {
    const recent = await threadCountSince({ leadId, threadIds, minutes: 5 });
    if (recent >= 3) {
      if (fromEmail) {
        await addSuppression(fromEmail, "loop_detected", {
          lead_id: leadId,
          detected_at: new Date().toISOString(),
          thread_ids: threadIds.filter(Boolean),
        });
      }
      return { skip: true, reason: "loop_detected" };
    }
  }
  return { skip: false };
}
