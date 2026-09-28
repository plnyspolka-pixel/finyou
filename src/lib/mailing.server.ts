// Wysyłka maili kampanii (serwer). Wyniesione z mailing.functions.ts:
// helper spoza handlera z `await import("…email-marketing.server")` tworzył
// w bundlu przeglądarki osobny chunk z modułem serwerowym, a ten ciągnął
// email-unsubscribe.server (node:crypto) i wywracał `vite build`.
// Handlery importują ten moduł dynamicznie — kompilator TanStack Start
// wycina ciała handlerów z bundla klienta, więc nic z tego nie trafia do
// przeglądarki.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllPaged } from "@/lib/supabase-paging.server";

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

// ============ AUDIENCE ============
// Odbiorcy kampanii wg grupy (leady / klienci / inwestorzy / wszyscy) albo
// segmentu subskrybentów (`segment`, `audience_filter.segment_id`) — wspólne
// dla panelu Mailing i narzędzi MCP.
// Wszystkie odczyty audiencji idą stronami — jedno zapytanie na kilka tysięcy
// wierszy potrafiło wpaść w `statement timeout` i wywrócić całą wysyłkę.
function clientsPage(from: number, to: number) {
  return supabaseAdmin
    .from("clients")
    .select("email, first_name, last_name, consent_marketing")
    .not("email", "is", null)
    .order("id", { ascending: true })
    .range(from, to);
}

function investorsPage(from: number, to: number) {
  return supabaseAdmin
    .from("investors")
    .select("email, first_name, last_name, company_name")
    .not("email", "is", null)
    .order("id", { ascending: true })
    .range(from, to);
}

export async function fetchCampaignAudience(type: string, filter: Record<string, unknown>) {
  if (type === "leady") {
    const rows = await fetchAllPaged((from, to) =>
      supabaseAdmin
        .from("loan_applications")
        .select(
          "id, client_id, status, clients!inner(email, first_name, last_name, consent_email, consent_marketing)",
        )
        .order("id", { ascending: true })
        .range(from, to),
    );
    return rows
      .filter((r: any) => r.clients?.email && r.clients?.consent_marketing !== false)
      .map((r: any) => ({
        email: r.clients.email,
        name: `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim(),
      }));
  }
  if (type === "klienci") {
    const rows = await fetchAllPaged(clientsPage);
    return rows
      .filter((c) => c.consent_marketing !== false)
      .map((c) => ({ email: c.email!, name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() }));
  }
  if (type === "inwestorzy") {
    const rows = await fetchAllPaged(investorsPage);
    return rows.map((i) => ({
      email: i.email!,
      name: i.company_name ?? `${i.first_name ?? ""} ${i.last_name ?? ""}`.trim(),
    }));
  }
  if (type === "segment") {
    const { resolveSegmentRecipients } = await import("./email-marketing.server");
    let segFilters: Record<string, unknown> = {};
    const segmentId = typeof filter.segment_id === "string" ? filter.segment_id : null;
    if (segmentId) {
      const { data: seg } = await supabaseAdmin
        .from("email_segments")
        .select("filters")
        .eq("id", segmentId)
        .maybeSingle();
      segFilters = ((seg?.filters as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    }
    const rows = await resolveSegmentRecipients(segFilters as never);
    return rows.map((r) => ({
      email: r.email,
      name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    }));
  }
  if (type === "wszyscy") {
    const [a, b] = await Promise.all([fetchAllPaged(clientsPage), fetchAllPaged(investorsPage)]);
    const list: { email: string; name: string }[] = [];
    a.filter((x) => x.consent_marketing !== false).forEach((x) =>
      list.push({ email: x.email!, name: `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim() }),
    );
    b.forEach((x) =>
      list.push({
        email: x.email!,
        name: x.company_name ?? `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim(),
      }),
    );
    // dedup
    const map = new Map<string, { email: string; name: string }>();
    list.forEach((x) => map.set(x.email.toLowerCase(), x));
    return [...map.values()];
  }
  return [];
}

/**
 * Planuje wysyłkę kampanii: zamraża listę odbiorców w email_campaign_recipients
 * i przełącza status na `zaplanowana` (cron dispatchScheduledCampaigns wysyła
 * po terminie). `sendNow` ustawia termin na teraz. Tylko szkice.
 */
export async function scheduleCampaignSend(
  campaignId: string,
  opts: { sendNow?: boolean; scheduledAt?: string | null } = {},
): Promise<{ ok: true; count: number; scheduled_at: string }> {
  const { data: c } = await supabaseAdmin
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!c) throw new Error("Kampania nie znaleziona");
  if (c.status !== "szkic") throw new Error("Tylko szkice mogą być zaplanowane");

  const recipients = await fetchCampaignAudience(
    c.audience_type,
    ((c.audience_filter as Record<string, unknown>) ?? {}) as Record<string, unknown>,
  );
  if (!recipients.length) throw new Error("Brak odbiorców w wybranym segmencie");

  const rows = recipients.map((r) => ({
    campaign_id: campaignId,
    recipient_email: r.email,
    recipient_name: r.name,
    status: "oczekuje",
  }));
  // batch insert
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin
      .from("email_campaign_recipients")
      .insert(rows.slice(i, i + 500));
    if (error) throw new Error(`email_campaign_recipients: ${error.message}`);
  }
  const when = opts.sendNow
    ? new Date().toISOString()
    : (opts.scheduledAt ?? c.scheduled_at ?? new Date().toISOString());
  const { error } = await supabaseAdmin
    .from("email_campaigns")
    .update({ status: "zaplanowana", scheduled_at: when, recipients_total: rows.length })
    .eq("id", campaignId);
  if (error) throw new Error(`email_campaigns: ${error.message}`);
  return { ok: true, count: rows.length, scheduled_at: when };
}

/** Mail testowy kampanii na jeden adres (z podstawionymi zmiennymi). */
export async function sendCampaignTest(campaignId: string, toEmail: string): Promise<void> {
  const { data: c } = await supabaseAdmin
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!c) throw new Error("Kampania nie znaleziona");
  await sendViaLovable({
    to: toEmail,
    from: c.from_email!,
    fromName: c.from_name,
    subject: `[TEST] ${c.subject}`,
    html: renderTemplate(c.html_body, { imie: "Janie", firma: "Test sp. z o.o." }),
    text: c.text_body,
  });
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
