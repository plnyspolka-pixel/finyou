/**
 * Rdzeń korespondencji — jedno źródło prawdy dla czytania i wysyłki wiadomości
 * do klientów i inwestorów. Używają go zarówno ekrany panelu (skrzynka,
 * Messenger, czat, dystrybucja ofert), jak i narzędzia asystenta panelu
 * (`comms_*` w `ai-admin.server.ts`).
 *
 * Uprawnienia sprawdza WOŁAJĄCY (server function albo `runTool`) — tu jesteśmy
 * już „za bramką" i pracujemy na `supabaseAdmin`.
 *
 * Kanały:
 *  - `lead_communications` — zunifikowana korespondencja per lead (email,
 *    messenger/instagram, czat na stronie, czat inwestora, SMS, voicebot, notatki),
 *  - `offer_distribution_messages` — wątki mailowe z instytucjami finansującymi
 *    (dystrybucja oferty konkretnego wniosku).
 */

export type CommsThread = {
  lead_id: string | null;
  who: string;
  email: string | null;
  phone: string | null;
  lead_type: string | null;
  lead_status: string | null;
  channels: string[];
  messages: number;
  last_at: string;
  last_direction: string;
  last_channel: string;
  /** Ostatnia wiadomość jest od klienta/inwestora i nie ma po niej odpowiedzi. */
  awaiting_reply: boolean;
  last_snippet: string;
};

export type CommsMessage = {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  content: string;
  status: string | null;
  created_at: string;
  attachments: string[];
  /** Id do użycia jako `replyToCommunicationId` przy odpowiedzi mailem. */
  reply_to_id: string | null;
};

/** Kanały, które w skrzynce są „korespondencją" (bez logów technicznych). */
const CONVERSATION_CHANNELS = [
  "email",
  "messenger",
  "chat",
  "chat_inwestor",
  "sms",
  "whatsapp",
] as const;

function snippet(s: string | null, len = 220): string {
  return (s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, len);
}

function attachmentNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (a && typeof a === "object") {
        const o = a as Record<string, unknown>;
        return String(o.name ?? o.filename ?? "");
      }
      return "";
    })
    .filter(Boolean);
}

function personLabel(lead: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_raw?: string | null;
}): string {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  return name || lead.email || lead.phone_raw || "(bez nazwy)";
}

/**
 * Lista wątków korespondencji, najświeższe pierwsze. Grupujemy po leadzie —
 * jeden wątek = jedna osoba/instytucja niezależnie od kanału, tak jak w skrzynce.
 */
export async function listCommsThreads(args: {
  channel?: string;
  /** Fraza: imię, nazwisko, e-mail, telefon albo treść wiadomości. */
  query?: string;
  /** Tylko wątki, w których ostatnie słowo należy do klienta (czekają na nas). */
  onlyAwaitingReply?: boolean;
  /** Ile dni wstecz (domyślnie 90). */
  days?: number;
  limit?: number;
}): Promise<{ threads: CommsThread[]; scanned: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limit = Math.max(1, Math.min(60, args.limit ?? 25));
  const since = new Date(Date.now() - (args.days ?? 90) * 86_400_000).toISOString();

  let q = supabaseAdmin
    .from("lead_communications")
    .select("id, lead_id, channel, direction, subject, content, status, created_at, email")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1500);
  if (args.channel) q = q.eq("channel", args.channel);
  else q = q.in("channel", [...CONVERSATION_CHANNELS]);

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  const comms = rows ?? [];

  // Grupowanie po leadzie; wiersze bez leada (np. mail od nieznanego adresu)
  // trafiają do własnych wątków po adresie e-mail.
  const groups = new Map<string, typeof comms>();
  for (const c of comms) {
    const key = c.lead_id ?? `email:${(c.email ?? "").toLowerCase() || c.id}`;
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }

  const leadIds = [...new Set(comms.map((c) => c.lead_id).filter((v): v is string => !!v))];
  const leads = new Map<
    string,
    {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone_raw: string | null;
      type: string;
      status: string;
    }
  >();
  for (let i = 0; i < leadIds.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name, email, phone_raw, type, status")
      .in("id", leadIds.slice(i, i + 200));
    for (const l of data ?? []) leads.set(l.id, l);
  }

  const needle = args.query?.trim().toLowerCase();
  const threads: CommsThread[] = [];
  for (const [key, msgs] of groups) {
    const sorted = [...msgs].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const last = sorted[0];
    const leadId = last.lead_id ?? null;
    const lead = leadId ? leads.get(leadId) : undefined;
    const who = lead ? personLabel(lead) : (last.email ?? key);

    if (needle) {
      const haystack = [
        who,
        lead?.email ?? last.email ?? "",
        lead?.phone_raw ?? "",
        ...sorted.slice(0, 20).map((m) => `${m.subject ?? ""} ${m.content ?? ""}`),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) continue;
    }

    const awaiting = last.direction === "inbound";
    if (args.onlyAwaitingReply && !awaiting) continue;

    threads.push({
      lead_id: leadId,
      who,
      email: lead?.email ?? last.email ?? null,
      phone: lead?.phone_raw ?? null,
      lead_type: lead?.type ?? null,
      lead_status: lead?.status ?? null,
      channels: [...new Set(sorted.map((m) => m.channel))],
      messages: sorted.length,
      last_at: last.created_at,
      last_direction: last.direction,
      last_channel: last.channel,
      awaiting_reply: awaiting,
      last_snippet: snippet(last.subject ? `${last.subject} — ${last.content}` : last.content),
    });
  }

  threads.sort((a, b) => b.last_at.localeCompare(a.last_at));
  return { threads: threads.slice(0, limit), scanned: comms.length };
}

/** Pełna korespondencja jednego leada (klienta lub inwestora), od najstarszej. */
export async function readCommsThread(args: {
  leadId: string;
  channel?: string;
  limit?: number;
}): Promise<{
  lead: {
    id: string;
    who: string;
    email: string | null;
    phone: string | null;
    type: string;
    status: string;
    messenger: boolean;
    instagram: boolean;
  } | null;
  messages: CommsMessage[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limit = Math.max(1, Math.min(200, args.limit ?? 60));

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select(
      "id, first_name, last_name, email, phone_raw, type, status, messenger_psid, instagram_igsid",
    )
    .eq("id", args.leadId)
    .maybeSingle();

  let q = supabaseAdmin
    .from("lead_communications")
    .select("id, channel, direction, subject, content, status, created_at, attachments")
    .eq("lead_id", args.leadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (args.channel) q = q.eq("channel", args.channel);

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const messages: CommsMessage[] = (rows ?? [])
    .slice()
    .reverse()
    .map((m) => ({
      id: m.id,
      channel: m.channel,
      direction: m.direction,
      subject: m.subject,
      content: snippet(m.content, 4000),
      status: m.status,
      created_at: m.created_at,
      attachments: attachmentNames(m.attachments),
      // Odpowiadając mailem trzeba wskazać wiadomość, do której się nawiązuje —
      // stąd nagłówki In-Reply-To / References i sklejony wątek u odbiorcy.
      reply_to_id: m.channel === "email" ? m.id : null,
    }));

  return {
    lead: lead
      ? {
          id: lead.id,
          who: personLabel(lead),
          email: lead.email,
          phone: lead.phone_raw,
          type: lead.type,
          status: lead.status,
          messenger: !!lead.messenger_psid,
          instagram: !!lead.instagram_igsid,
        }
      : null,
    messages,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Prosty HTML maila — treść tekstowa z zachowanymi łamaniami linii. */
function plainHtml(body: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;white-space:pre-wrap">${escapeHtml(
    body,
  )}</div>`;
}

/**
 * Wysyłka maila ze skrzynki (nowy wątek albo odpowiedź). Kontynuacja wątku
 * dzieje się przez nagłówki In-Reply-To / References odczytane z wiadomości
 * wskazanej w `replyToCommunicationId`. Każdy mail trafia do
 * `lead_communications` jako outbound, więc jest widoczny w skrzynce.
 */
export async function sendEmailFromInbox(args: {
  to: string;
  subject: string;
  body: string;
  replyToCommunicationId?: string | null;
  attachments?: OutboundAttachmentRef[];
  actorUserId: string;
  /** Ślad w metadanych: kto wysłał — ekran skrzynki czy asystent. */
  source?: string;
  leadId?: string | null;
}): Promise<{
  ok: boolean;
  sent: number;
  total: number;
  results: Array<{ email: string; ok: boolean; id?: string; error?: string }>;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let leadId: string | null = args.leadId ?? null;
  let threadId: string | null = null;
  let inReplyTo: string | null = null;
  let references: string | null = null;
  if (args.replyToCommunicationId) {
    const { data: parent } = await supabaseAdmin
      .from("lead_communications")
      .select("id, lead_id, thread_external_id, external_id, metadata")
      .eq("id", args.replyToCommunicationId)
      .maybeSingle();
    if (parent) {
      leadId = parent.lead_id ?? leadId;
      threadId = parent.thread_external_id ?? null;
      const meta = (parent.metadata ?? {}) as Record<string, unknown>;
      inReplyTo = (meta.message_id_header as string | undefined) ?? parent.external_id ?? null;
      references = (meta.references as string | undefined) ?? inReplyTo;
    }
  }

  const emails = args.to
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalid = emails.filter((e) => !emailRe.test(e));
  if (!emails.length) throw new Error("Brak odbiorców");
  if (invalid.length) throw new Error(`Nieprawidłowe adresy: ${invalid.join(", ")}`);

  const { sendResendEmail } = await import("./resend-send.server");
  const { logLeadCommunication } = await import("./lead-comms.server");

  // Załączniki: pobierz pliki raz (Storage/URL → base64) i dołącz je do maila
  // jako prawdziwe pliki. Jeśli któregoś nie da się pobrać — nie wysyłaj
  // "po cichu" maila bez załącznika, tylko zgłoś błąd nadawcy.
  let resolvedAttachments: Array<{ filename: string; content: string; contentType?: string }> = [];
  const attachmentRefs = args.attachments ?? [];
  if (attachmentRefs.length) {
    const { resolveOutboundAttachments } = await import("./outbound-attachments.server");
    const { attachments, errors } = await resolveOutboundAttachments(attachmentRefs);
    if (errors.length) throw new Error(errors.join(" "));
    resolvedAttachments = attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    }));
  }

  const html = plainHtml(args.body);
  const results: Array<{ email: string; ok: boolean; id?: string; error?: string }> = [];
  for (const to of emails) {
    const res = await sendResendEmail({
      to,
      subject: args.subject,
      text: args.body,
      html,
      inReplyTo,
      references,
      replyTo: "kontakt@financeyou.pl",
      showReplyHint: true,
      attachments: resolvedAttachments.length ? resolvedAttachments : undefined,
    });
    results.push({ email: to, ok: res.ok, id: res.id, error: res.error });
    try {
      await logLeadCommunication({
        leadId,
        email: to,
        channel: "email",
        direction: "outbound",
        status: res.ok ? "sent" : "failed",
        subject: args.subject,
        content: args.body,
        externalId: res.id ?? null,
        metadata: {
          source: args.source ?? "inbox_manual",
          sent_by: args.actorUserId,
          thread_id: threadId,
          in_reply_to: inReplyTo,
        },
        attachments: attachmentRefs.length
          ? attachmentRefs.map((a) => ({
              name: a.name,
              path: a.path ?? null,
              url: a.url ?? null,
              mime: a.mime ?? null,
              size: a.size ?? null,
            }))
          : null,
      });
    } catch (e) {
      console.error("[comms] log comm error", e);
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  if (okCount === 0) throw new Error(results[0]?.error ?? "send_failed");
  return { ok: true, sent: okCount, total: results.length, results };
}

/** Odpowiedź w Messengerze / Instagram Direct (Meta Graph API) + log w skrzynce. */
export async function sendMessengerReplyToLead(args: {
  leadId: string;
  body: string;
  actorUserId: string;
  source?: string;
}): Promise<{ ok: boolean; messageId?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendMetaMessage } = await import("./meta-send.server");
  const { logLeadCommunication } = await import("./lead-comms.server");

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id, messenger_psid, instagram_igsid")
    .eq("id", args.leadId)
    .maybeSingle();
  if (leadErr) throw new Error(leadErr.message);
  if (!lead) throw new Error("Lead nie istnieje");

  const platform: "messenger" | "instagram" = lead.messenger_psid
    ? "messenger"
    : lead.instagram_igsid
      ? "instagram"
      : "messenger";
  const recipientId = lead.messenger_psid ?? lead.instagram_igsid;
  if (!recipientId)
    throw new Error("Ten lead nie ma zapisanego identyfikatora Messenger/Instagram.");

  const send = await sendMetaMessage({ recipientId, text: args.body, platform });

  await logLeadCommunication({
    leadId: args.leadId,
    channel: "messenger",
    direction: "outbound",
    content: args.body,
    externalId: send.messageId ?? null,
    metadata: {
      platform,
      sender_id: recipientId,
      sent_by: args.actorUserId,
      source: args.source ?? "inbox_manual",
    },
    status: send.ok ? "sent" : "error",
    errorMessage: send.ok ? null : send.error,
  });

  if (!send.ok) throw new Error(send.error ?? "send_failed");
  return { ok: true, messageId: send.messageId };
}

/**
 * Odpowiedź w czacie na stronie (`chat`) albo w czacie inwestora
 * (`chat_inwestor`). Wysyłka polega na zapisaniu wiadomości jako outbound —
 * widget klienta dociąga ją pollingiem.
 */
export async function sendChatReplyToLead(args: {
  leadId: string;
  body: string;
  actorUserId: string;
  channel?: "chat" | "chat_inwestor";
  source?: string;
}): Promise<{ ok: boolean; id: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { logLeadCommunication } = await import("./lead-comms.server");

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id, application_data")
    .eq("id", args.leadId)
    .maybeSingle();
  if (leadErr) throw new Error(leadErr.message);
  if (!lead) throw new Error("Lead nie istnieje");

  const appData = (lead.application_data ?? {}) as Record<string, unknown>;
  const sessionId = (appData.chat_session_id as string | undefined) ?? null;

  const id = await logLeadCommunication({
    leadId: args.leadId,
    channel: args.channel ?? "chat",
    direction: "outbound",
    content: args.body,
    status: "sent",
    metadata: {
      chat_session_id: sessionId,
      sent_by: args.actorUserId,
      source: args.source ?? "inbox_manual",
    },
  });

  return { ok: true, id };
}

/** Wątki mailowe z instytucjami finansującymi (dystrybucja ofert). */
export async function listOfferThreads(args: {
  applicationId?: string;
  investorId?: string;
  limit?: number;
}): Promise<{
  distributions: Array<{
    distribution_id: string;
    loan_application_id: string;
    investor: string;
    investor_email: string | null;
    status: string;
    sent_at: string | null;
    responded_at: string | null;
    messages: Array<{
      direction: string;
      subject: string | null;
      content: string;
      from_email: string | null;
      to_email: string | null;
      created_at: string;
      attachments: string[];
    }>;
  }>;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limit = Math.max(1, Math.min(50, args.limit ?? 15));

  let dq = supabaseAdmin
    .from("offer_distributions")
    .select(
      "id, loan_application_id, investor_id, distribution_status, sent_at, responded_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (args.applicationId) dq = dq.eq("loan_application_id", args.applicationId);
  if (args.investorId) dq = dq.eq("investor_id", args.investorId);

  const { data: dists, error } = await dq;
  if (error) throw new Error(error.message);
  const distributions = dists ?? [];
  if (distributions.length === 0) return { distributions: [] };

  const [{ data: investors }, { data: msgs }] = await Promise.all([
    supabaseAdmin
      .from("investors")
      .select("id, company_name, first_name, last_name, email")
      .in("id", [...new Set(distributions.map((d) => d.investor_id))]),
    supabaseAdmin
      .from("offer_distribution_messages")
      .select(
        "distribution_id, direction, subject, content, from_email, to_email, created_at, attachments",
      )
      .in(
        "distribution_id",
        distributions.map((d) => d.id),
      )
      .order("created_at", { ascending: true }),
  ]);

  const investorById = new Map(
    (investors ?? []).map((i) => [
      i.id,
      {
        name:
          i.company_name ||
          [i.first_name, i.last_name].filter(Boolean).join(" ") ||
          "(bez nazwy)",
        email: i.email,
      },
    ]),
  );

  return {
    distributions: distributions.map((d) => {
      const inv = investorById.get(d.investor_id);
      return {
        distribution_id: d.id,
        loan_application_id: d.loan_application_id,
        investor: inv?.name ?? "(nieznana instytucja)",
        investor_email: inv?.email ?? null,
        status: String(d.distribution_status),
        sent_at: d.sent_at,
        responded_at: d.responded_at,
        messages: (msgs ?? [])
          .filter((m) => m.distribution_id === d.id)
          .map((m) => ({
            direction: m.direction,
            subject: m.subject,
            content: snippet(m.content, 4000),
            from_email: m.from_email,
            to_email: m.to_email,
            created_at: m.created_at,
            attachments: attachmentNames(m.attachments),
          })),
      };
    }),
  };
}

/**
 * Odpowiedź w wątku z instytucją. Adres zwrotny to alias dystrybucji, więc
 * kolejna odpowiedź instytucji wraca na tę samą kartę wniosku.
 */
export async function replyToOfferDistribution(args: {
  distributionId: string;
  subject: string;
  body: string;
  actorUserId: string;
}): Promise<{ ok: boolean; id: string | null; to: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendResendEmail } = await import("./resend-send.server");
  const { offerReplyAddress } = await import("./offer-replies.server");

  const { data: dist, error: distErr } = await supabaseAdmin
    .from("offer_distributions")
    .select("id, loan_application_id, investor_id")
    .eq("id", args.distributionId)
    .maybeSingle();
  if (distErr || !dist) throw new Error("Nie znaleziono dystrybucji");

  const { data: investor } = await supabaseAdmin
    .from("investors")
    .select("email")
    .eq("id", dist.investor_id)
    .maybeSingle();
  const to = investor?.email ?? null;
  if (!to) throw new Error("Instytucja nie ma zapisanego adresu e-mail");

  // Wątek: In-Reply-To = ostatnia wiadomość z message_id, References = kilka
  // ostatnich (klienty pocztowe sklejają po nich konwersację).
  const { data: prior } = await supabaseAdmin
    .from("offer_distribution_messages")
    .select("message_id, created_at")
    .eq("distribution_id", args.distributionId)
    .not("message_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(20);
  const chain = (prior ?? []).map((m) => m.message_id).filter((id): id is string => !!id);
  const inReplyTo = chain.length ? chain[chain.length - 1] : null;
  const references = chain.length ? chain.slice(-10).join(" ") : null;

  const html = plainHtml(args.body);
  const replyTo = offerReplyAddress(dist.id);

  const send = await sendResendEmail({
    to,
    subject: args.subject,
    text: args.body,
    html,
    inReplyTo,
    references,
    replyTo,
    showReplyHint: true,
  });
  if (!send.ok) throw new Error(send.error ?? "Nie udało się wysłać wiadomości");

  const { error: msgErr } = await supabaseAdmin.from("offer_distribution_messages").insert({
    distribution_id: dist.id,
    loan_application_id: dist.loan_application_id,
    investor_id: dist.investor_id,
    direction: "outbound",
    subject: args.subject,
    content: args.body,
    html,
    from_email: replyTo,
    to_email: to,
    message_id: send.id ?? null,
    in_reply_to: inReplyTo,
  });
  if (msgErr) console.error("[comms] offer reply log failed:", msgErr.message);

  return { ok: true, id: send.id ?? null, to };
}
