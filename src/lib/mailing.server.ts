// Wysyłka maili kampanii (serwer). Wyniesione z mailing.functions.ts:
// helper spoza handlera z `await import("…email-marketing.server")` tworzył
// w bundlu przeglądarki osobny chunk z modułem serwerowym, a ten ciągnął
// email-unsubscribe.server (node:crypto) i wywracał `vite build`.
// Handlery importują ten moduł dynamicznie — kompilator TanStack Start
// wycina ciała handlerów z bundla klienta, więc nic z tego nie trafia do
// przeglądarki.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SENDER_DOMAIN = "notify.financeyou.pl";
const DEFAULT_FROM = "no-reply@financeyou.pl";
const DEFAULT_FROM_NAME = "FinanceYou";

function htmlToText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Enqueue email to Lovable transactional_emails pgmq queue.
 * The process-email-queue cron drains it within seconds, sending via notify.financeyou.pl.
 * From: header uses @financeyou.pl (root), while DNS/DKIM lives on the notify. subdomain.
 */
export async function sendViaLovable(args: {
  to: string;
  toName?: string | null;
  from?: string | null;
  fromName?: string | null;
  subject: string;
  html: string;
  text?: string | null;
  label?: string;
  idempotencyKey?: string;
}) {
  const fromAddr = args.from || DEFAULT_FROM;
  const fromName = args.fromName || DEFAULT_FROM_NAME;
  const messageId = crypto.randomUUID();
  const payload = {
    run_id: crypto.randomUUID(),
    to: args.toName ? `${args.toName} <${args.to}>` : args.to,
    from: `${fromName} <${fromAddr}>`,
    sender_domain: SENDER_DOMAIN,
    subject: args.subject,
    html: args.html,
    text: args.text || htmlToText(args.html),
    purpose: "transactional",
    label: args.label || "mailing_campaign",
    idempotency_key: args.idempotencyKey || messageId,
    message_id: messageId,
    queued_at: new Date().toISOString(),
  };
  // Wysyłka bezpośrednio przez działającą bramkę Resend — RPC enqueue_email
  // wskazywał nieistniejącą kolejkę i maile ginęły (poprawka z sandboxa
  // Lovable, 2026-09-04; przeniesiona do repo).
  const { sendViaResend } = await import("@/lib/email-marketing.server");
  await sendViaResend({
    from: payload.from,
    to: args.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    tags: [{ name: "label", value: String(payload.label).slice(0, 60) }],
    headers: { "X-Entity-Ref-ID": String(payload.idempotency_key) },
  });
  return { messageId };
}

export function renderTemplate(html: string, vars: Record<string, string>) {
  return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

// ============ DISPATCH (used by cron) ============
export async function dispatchScheduledCampaigns(maxPerRun = 200) {
  const now = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from("email_campaigns")
    .select("*")
    .eq("status", "zaplanowana")
    .lte("scheduled_at", now)
    .order("scheduled_at")
    .limit(5);

  let processed = 0;
  for (const c of due ?? []) {
    await supabaseAdmin
      .from("email_campaigns")
      .update({ status: "wysylana", started_at: c.started_at ?? now })
      .eq("id", c.id);
    const { data: queue } = await supabaseAdmin
      .from("email_campaign_recipients")
      .select("*")
      .eq("campaign_id", c.id)
      .eq("status", "oczekuje")
      .limit(maxPerRun);
    for (const r of queue ?? []) {
      try {
        await sendViaLovable({
          to: r.recipient_email,
          toName: r.recipient_name,
          from: c.from_email!,
          fromName: c.from_name,
          subject: c.subject,
          html: renderTemplate(c.html_body, { imie: (r.recipient_name ?? "").split(" ")[0] ?? "" }),
          text: c.text_body,
        });
        await supabaseAdmin
          .from("email_campaign_recipients")
          .update({ status: "wyslany", sent_at: new Date().toISOString() })
          .eq("id", r.id);
        await supabaseAdmin
          .from("email_campaigns")
          .update({ sent_count: (c.sent_count ?? 0) + 1 })
          .eq("id", c.id);
        c.sent_count = (c.sent_count ?? 0) + 1;
        processed++;
      } catch (e: any) {
        await supabaseAdmin
          .from("email_campaign_recipients")
          .update({ status: "blad", error_message: String(e.message).slice(0, 500) })
          .eq("id", r.id);
        await supabaseAdmin
          .from("email_campaigns")
          .update({ failed_count: (c.failed_count ?? 0) + 1 })
          .eq("id", c.id);
        c.failed_count = (c.failed_count ?? 0) + 1;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    // check if any pending left
    const { count: pending } = await supabaseAdmin
      .from("email_campaign_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .eq("status", "oczekuje");
    if (!pending) {
      await supabaseAdmin
        .from("email_campaigns")
        .update({ status: "wyslana", finished_at: new Date().toISOString() })
        .eq("id", c.id);
    }
  }
  return { processed, campaigns: (due ?? []).length };
}
