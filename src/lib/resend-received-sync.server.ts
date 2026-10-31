/**
 * Backfill Resend into Finance You's existing inbox and institution offer threads.
 * Import is deliberately passive: NO send, AI reply, lead creation, notifications,
 * contact enrichment or modification of investor preferences.
 *
 * The existing inbox already stores some duplicate Resend IDs. We keep those
 * records and detect them instead of adding a UNIQUE constraint that fails
 * existing migrations. Sequential admin sync is required; concurrent runs
 * should not be started (the UI prevents repeated clicks).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getReceivedEmail,
  headerValue,
  isFinanceYouMessage,
  listReceivedEmails,
  senderAddress,
  textFromHtml,
  type ResendReceivedMessage,
  type ResendReceivedSummary,
} from "./resend-receiving.server";

const db = supabaseAdmin as any;
const OFFER_ALIAS_RE = /oferta\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@financeyou\.pl/i;
const PARTNER_HINT_RE = /fundusz\s*korona|funduszkorona|mango|magnum|partner|przekierowa|nowe\s*wnioski/i;

export interface ResendSyncOptions {
  after?: string;
  pageSize?: number;
  maxPages?: number;
  /** Optional sender-address fragment, e.g. "funduszkorona.pl". */
  senderFilter?: string;
  /** Observe and search without storing messages. */
  dryRun?: boolean;
}
export interface ResendSyncResult {
  scanned: number;
  matchedFilter: number;
  imported: number;
  enriched: number;
  skipped: number;
  offerLinked: number;
  errors: string[];
  nextAfter: string | null;
  hasMore: boolean;
  relevant: Array<{
    id: string;
    from: string;
    date: string;
    subject: string;
    excerpt: string;
  }>;
}

function firstAddress(mail: ResendReceivedMessage): string {
  return [...(mail.to ?? []), ...(mail.received_for ?? [])]
    .map(senderAddress)
    .find(Boolean) ?? "";
}

function normalDate(v: string): string {
  const date = new Date(v);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Resend zwrócił błędną datę odebrania wiadomości.");
  }
  return date.toISOString();
}

function textBody(mail: ResendReceivedMessage): string {
  if (typeof mail.text === "string" && mail.text.trim()) return mail.text;
  return mail.html ? textFromHtml(mail.html) : "";
}

function selectedHeaders(mail: ResendReceivedMessage): Record<string, string | null> {
  return {
    in_reply_to: headerValue(mail.headers, "in-reply-to"),
    references: headerValue(mail.headers, "references"),
  };
}

async function priorInboxRecord(id: string, messageId: string | null) {
  // Existing webhook records carry metadata.email_id.
  const first = await db
    .from("lead_communications")
    .select("id, content, metadata")
    .eq("channel", "email")
    .eq("direction", "inbound")
    .contains("metadata", { email_id: id })
    .limit(1)
    .maybeSingle();
  if (first.error) throw new Error("Błąd odczytu istniejących maili: " + first.error.message);
  if (first.data) return first.data;

  // The webhook may have stored RFC Message-ID before Resend email_id.
  if (!messageId) return null;
  const second = await db
    .from("lead_communications")
    .select("id, content, metadata")
    .eq("channel", "email")
    .eq("direction", "inbound")
    .eq("external_id", messageId)
    .limit(1)
    .maybeSingle();
  if (second.error) throw new Error("Błąd deduplikacji wiadomości: " + second.error.message);
  return second.data ?? null;
}

async function persistInInbox(mail: ResendReceivedMessage): Promise<"imported" | "enriched" | "skipped"> {
  const messageId = mail.message_id || null;
  const existing = await priorInboxRecord(mail.id, messageId);
  const text = textBody(mail);
  const html = typeof mail.html === "string" ? mail.html : null;
  const headers = selectedHeaders(mail);
  const metadata = {
    ...(existing?.metadata ?? {}),
    provider: "resend",
    email_id: mail.id,
    html,
    from_name: mail.from,
    received_for: mail.received_for ?? [],
    recipients: mail.to ?? [],
    cc: mail.cc ?? [],
    message_id: messageId,
    in_reply_to: headers.in_reply_to,
    references: headers.references,
    // Attachment metadata only; original files remain in Resend.
    received_attachments: (mail.attachments ?? []).map((a) => ({
      id: a.id,
      filename: a.filename,
      content_type: a.content_type,
      size: a.size,
    })),
    synced_from_resend_at: new Date().toISOString(),
  };

  if (existing) {
    // Repair truncated/missing webhook bodies and preserve any existing lead link.
    if ((existing.content ?? "").trim().length >= text.trim().length &&
        existing.metadata?.email_id === mail.id) {
      return "skipped";
    }
    const patch = { content: text || existing.content || "", metadata };
    const { error } = await db.from("lead_communications").update(patch).eq("id", existing.id);
    if (error) throw new Error("Błąd aktualizacji e-maila: " + error.message);
    return "enriched";
  }

  const from = senderAddress(mail.from);
  if (!from) throw new Error("Nieprawidłowy nadawca w wiadomości Resend " + mail.id);

  const { error } = await db.from("lead_communications").insert({
    lead_id: null,
    email: from,
    channel: "email",
    direction: "inbound",
    status: "received",
    subject: mail.subject || "(bez tematu)",
    content: text,
    external_id: messageId || mail.id,
    thread_external_id: headers.in_reply_to || messageId || mail.id,
    metadata,
    attachments: [], // do not invent storage paths for Resend attachments
    created_at: normalDate(mail.created_at),
  });
  if (error) throw new Error("Błąd zapisu do skrzynki: " + error.message);
  return "imported";
}

async function preserveOfferThread(mail: ResendReceivedMessage): Promise<boolean> {
  const recipientStrings = [
    ...(mail.to ?? []),
    ...(mail.cc ?? []),
    ...(mail.received_for ?? []),
  ];
  const match = recipientStrings.map((s) => OFFER_ALIAS_RE.exec(s)).find(Boolean);
  const distributionId = match?.[1]?.toLowerCase();
  if (!distributionId) return false;

  const { data: distribution, error: distErr } = await db
    .from("offer_distributions")
    .select("id, investor_id, loan_application_id")
    .eq("id", distributionId)
    .maybeSingle();
  if (distErr) throw new Error("Błąd powiązania wątku oferty: " + distErr.message);
  if (!distribution) return false;

  // Do not reinsert any message already received through Resend/Mailgun webhook.
  if (mail.message_id) {
    const { data: existing, error: checkErr } = await db
      .from("offer_distribution_messages")
      .select("id")
      .eq("direction", "inbound")
      .eq("message_id", mail.message_id)
      .limit(1)
      .maybeSingle();
    if (checkErr) throw new Error("Błąd sprawdzenia wątku: " + checkErr.message);
    if (existing) return false;
  }
  const header = selectedHeaders(mail);
  const { error: insertErr } = await db
    .from("offer_distribution_messages")
    .insert({
      distribution_id: distribution.id,
      loan_application_id: distribution.loan_application_id,
      investor_id: distribution.investor_id,
      direction: "inbound",
      subject: mail.subject || "(bez tematu)",
      content: textBody(mail),
      html: typeof mail.html === "string" ? mail.html : null,
      from_email: senderAddress(mail.from),
      to_email: firstAddress(mail),
      message_id: mail.message_id || mail.id,
      in_reply_to: header.in_reply_to,
      attachments: [], // no remote file URLs are exposed
      created_at: normalDate(mail.created_at),
    });
  if (insertErr) throw new Error("Błąd zapisu wątku instytucji: " + insertErr.message);
  return true;
}

function relevantExcerpt(mail: ResendReceivedMessage): string {
  const text = textBody(mail);
  // A partner's name may appear deep in a long reply thread; prioritize the
  // surrounding passage instead of blindly returning the first 2400 chars.
  const partnerAt = text.search(/mango|magnum|partner|przekierow|kierowa[cć]|zwraca[cć]\s+si[eę]/i);
  if (partnerAt >= 0) return text.slice(Math.max(0, partnerAt - 350), partnerAt + 2050);
  if (PARTNER_HINT_RE.test(mail.from + " " + mail.subject)) return text.slice(0, 2400);
  const at = text.search(PARTNER_HINT_RE);
  return at < 0 ? "" : text.slice(Math.max(0, at - 350), at + 2050);
}

/**
 * Scans pages newest-to-oldest. Resend 'after' cursor points to older mail.
 * Returns a continuation cursor for subsequent calls so an API invocation
 * cannot exhaust a server request timeout on large inboxes.
 */
export async function synchronizeResendReceived(
  options: ResendSyncOptions = {},
): Promise<ResendSyncResult> {
  const requestedPageSize = options.pageSize ?? 20;
  const requestedMaxPages = options.maxPages ?? 1;
  if (!Number.isFinite(requestedPageSize) || !Number.isFinite(requestedMaxPages)) {
    throw new Error("Nieprawidłowe limity synchronizacji.");
  }
  const pageSize = Math.max(1, Math.min(30, Math.floor(requestedPageSize)));
  const maxPages = Math.max(1, Math.min(5, Math.floor(requestedMaxPages)));
  const filter = (options.senderFilter ?? "").trim().toLowerCase();
  if (filter.length > 100) throw new Error("Filtr nadawcy jest za długi.");

  const result: ResendSyncResult = {
    scanned: 0,
    matchedFilter: 0,
    imported: 0,
    enriched: 0,
    skipped: 0,
    offerLinked: 0,
    errors: [],
    nextAfter: options.after ?? null,
    hasMore: false,
    relevant: [],
  };

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const page = await listReceivedEmails({
      limit: pageSize,
      after: result.nextAfter || undefined,
    });
    if (page.data.length === 0) {
      result.hasMore = false;
      break;
    }
    for (const item of page.data) {
      // Advance cursor ONLY after processing or intentionally skipping a message.
      // If Resend returns an error, next sync will retry the failed email.
      const moveOn = () => {
        result.nextAfter = item.id;
        result.scanned += 1;
      };
      if (!isFinanceYouMessage(item)) {
        result.skipped += 1;
        moveOn();
        continue;
      }
      if (filter && !senderAddress(item.from).includes(filter)) {
        result.skipped += 1;
        moveOn();
        continue;
      }
      result.matchedFilter += 1;
      try {
        const existing = !options.dryRun
          ? await priorInboxRecord(item.id, item.message_id ?? null)
          : null;
        // Don't call Resend for messages already fully persisted. The user can
        // still search them in the existing Finance You inbox.
        const offerAlias = [...(item.to ?? []), ...(item.cc ?? [])]
          .some((address) => OFFER_ALIAS_RE.test(address));
        if (existing && (existing.content ?? "").trim().length > 80 &&
            existing.metadata?.email_id === item.id && !offerAlias && !filter) {
          result.skipped += 1;
          moveOn();
          continue;
        }
        const full = await getReceivedEmail(item.id);
        if (options.dryRun) {
          result.skipped += 1;
        } else {
          const saved = await persistInInbox(full);
          if (saved === "imported") result.imported += 1;
          else if (saved === "enriched") result.enriched += 1;
          else result.skipped += 1;
          if (await preserveOfferThread(full)) result.offerLinked += 1;
        }
        const excerpt = relevantExcerpt(full);
        if (excerpt && result.relevant.length < 30) {
          result.relevant.push({
            id: full.id,
            from: senderAddress(full.from),
            date: full.created_at,
            subject: full.subject || "",
            excerpt,
          });
        }
      } catch (e) {
        result.errors.push(
          item.id + ": " + (e instanceof Error ? e.message : "błąd importu"),
        );
        result.hasMore = true;
        return result;
      }
      moveOn();
    }
    result.hasMore = page.has_more;
    if (!page.has_more) break;
  }
  return result;
}
