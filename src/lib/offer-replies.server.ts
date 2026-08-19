// Routing odpowiedzi inwestorów instytucjonalnych na maile dystrybucji ofert.
//
// Każdy mail dystrybucji wychodzi z Reply-To: oferta+<distribution_id>@<domena>,
// więc odpowiedź instytucji trafia na inbound webhook (Resend/Mailgun) i tu
// dopasowujemy ją do konkretnej dystrybucji:
//   1) po aliasie oferta+<uuid>@ w adresacie,
//   2) zapasowo po In-Reply-To/References vs message_id naszych maili wychodzących.
// Dopasowana odpowiedź ląduje w offer_distribution_messages i jest od razu
// widoczna w panelu admina na karcie wniosku (zakładka Dystrybucja).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { resolveAppBaseUrl } from "@/lib/access/urls.server";

/** Publiczny adres Karty oferty dla danego tokenu. */
export function offerCardUrl(token: string): string {
  return `${resolveAppBaseUrl()}/karta/${token}`;
}

const OFFER_ALIAS_RE = /oferta\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;

/**
 * Domena odbioru odpowiedzi — ta sama, którą mamy w Resend (financeyou.pl,
 * Receiving włączony). Alias oferta+<uuid>@financeyou.pl łapie każdy adres
 * na domenie, więc nie trzeba zakładać skrzynek.
 */
export function offerReplyDomain(): string {
  return process.env.OFFER_REPLY_DOMAIN ?? process.env.RESEND_FROM_DOMAIN ?? "financeyou.pl";
}

/** Adres Reply-To dla konkretnej dystrybucji. */
export function offerReplyAddress(distributionId: string): string {
  return `oferta+${distributionId}@${offerReplyDomain()}`;
}

export type InboundOfferReply = {
  /** Wszyscy adresaci (To/Cc/Delivered-To) — szukamy aliasu oferta+<uuid>@. */
  recipients: string[];
  fromEmail: string;
  fromName?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  /** Załączniki jako bufory (Mailgun) lub URL-e do pobrania (Resend). */
  attachments?: Array<{
    name: string;
    mime?: string | null;
    buffer?: Uint8Array;
    url?: string | null;
    authHeader?: Record<string, string>;
  }>;
};

function extractDistributionIdFromRecipients(recipients: string[]): string | null {
  for (const r of recipients) {
    const m = String(r ?? "").match(OFFER_ALIAS_RE);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/**
 * Darmowe skrzynki — domena nadawcy nic nie mówi o instytucji, więc
 * dopasowanie po domenie stosujemy tylko dla adresów firmowych.
 */
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "yahoo.com",
  "yahoo.pl",
  "proton.me",
  "protonmail.com",
  "wp.pl",
  "o2.pl",
  "op.pl",
  "onet.pl",
  "onet.eu",
  "interia.pl",
  "interia.eu",
  "poczta.fm",
  "gazeta.pl",
  "tlen.pl",
  "vp.pl",
  "spoko.pl",
]);

/**
 * Dopasowanie NADAWCY do inwestora: najpierw dokładny adres, a dla adresów
 * firmowych także sama domena — instytucje często odpisują z osobistych
 * skrzynek pracowników (imie.nazwisko@instytucja.pl), których nie mamy
 * w bazie, a mamy adres ogólny (biuro@instytucja.pl) na tej samej domenie.
 */
async function findInvestorIdByEmail(fromEmail: string): Promise<string | null> {
  const email = (fromEmail ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  const { data: exact } = await supabaseAdmin
    .from("investors")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (exact) return exact.id;
  const domain = email.split("@")[1];
  if (!domain || FREE_MAIL_DOMAINS.has(domain)) return null;
  const { data: byDomain } = await supabaseAdmin
    .from("investors")
    .select("id")
    .eq("investor_type", "instytucjonalny")
    .ilike("email", `%@${domain}`)
    .limit(1)
    .maybeSingle();
  return byDomain?.id ?? null;
}

/**
 * Zapasowe dopasowanie do dystrybucji po inwestorze: odpisał z pominięciem
 * aliasu oferta+<uuid>@ i bez nagłówków wątku (nowy mail na ogólny adres,
 * klient pocztowy ucinający In-Reply-To/References). Bierzemy jego najnowszą
 * dystrybucję z ostatnich 60 dni — lepiej, żeby wiadomość trafiła na kartę
 * właściwego wniosku (człowiek zweryfikuje), niż do ścieżki leadowej.
 */
async function findDistributionByInvestorId(investorId: string): Promise<string | null> {
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("offer_distributions")
    .select("id")
    .eq("investor_id", investorId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function findDistributionByThread(
  inReplyTo: string | null | undefined,
  references: string | null | undefined,
): Promise<string | null> {
  const ids = [...(inReplyTo ? [inReplyTo] : []), ...(references ? references.split(/\s+/) : [])]
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return null;
  const { data } = await supabaseAdmin
    .from("offer_distribution_messages")
    .select("distribution_id")
    .eq("direction", "outbound")
    .in("message_id", ids)
    .not("distribution_id", "is", null)
    .limit(1)
    .maybeSingle();
  return data?.distribution_id ?? null;
}

async function storeReplyAttachments(
  storageKey: string,
  attachments: NonNullable<InboundOfferReply["attachments"]>,
): Promise<Array<{ name: string; mime: string; size: number; path: string }>> {
  const stored: Array<{ name: string; mime: string; size: number; path: string }> = [];
  for (const a of attachments) {
    try {
      let buf = a.buffer ?? null;
      let mime = a.mime ?? null;
      if (!buf && a.url) {
        const res = await fetch(a.url, { headers: a.authHeader });
        if (!res.ok) continue;
        buf = new Uint8Array(await res.arrayBuffer());
        mime = mime ?? res.headers.get("content-type");
      }
      if (!buf) continue;
      const safeName = (a.name || `plik-${Date.now()}`).replace(/[^\w.\-]+/g, "_");
      const path = `offer-replies/${storageKey}/${Date.now()}-${safeName}`;
      const { error } = await supabaseAdmin.storage.from(CLIENT_FILES_BUCKET).upload(path, buf, {
        contentType: mime ?? "application/octet-stream",
        upsert: false,
      });
      if (error) {
        console.error("[offer-replies] upload error", error);
        continue;
      }
      stored.push({
        name: safeName,
        mime: mime ?? "application/octet-stream",
        size: buf.byteLength,
        path,
      });
    } catch (e) {
      console.error("[offer-replies] attachment error", e);
    }
  }
  return stored;
}

/**
 * Próbuje dopasować przychodzący mail do dystrybucji oferty lub do znanego
 * inwestora instytucjonalnego. Mail od inwestora NIGDY nie trafia do ścieżki
 * leadowej: gdy nie da się wskazać dystrybucji, wiadomość i tak zapisujemy
 * w offer_distribution_messages (bez wniosku), żeby była widoczna w zakładce
 * Oferty. Zwraca true, gdy mail został obsłużony — webhook powinien wtedy
 * POMINĄĆ ścieżkę leadową i auto-odpowiedź agenta AI.
 */
export async function routeInboundOfferReply(mail: InboundOfferReply): Promise<boolean> {
  let distributionId = extractDistributionIdFromRecipients(mail.recipients);
  if (!distributionId) {
    distributionId = await findDistributionByThread(mail.inReplyTo, mail.references);
  }
  let investorId: string | null = null;
  if (!distributionId) {
    investorId = await findInvestorIdByEmail(mail.fromEmail);
    if (investorId) distributionId = await findDistributionByInvestorId(investorId);
  }
  if (!distributionId && !investorId) return false;

  let dist: { id: string; loan_application_id: string | null; investor_id: string | null } | null =
    null;
  if (distributionId) {
    const { data } = await supabaseAdmin
      .from("offer_distributions")
      .select("id, loan_application_id, investor_id")
      .eq("id", distributionId)
      .maybeSingle();
    dist = data ?? null;
  }
  if (!dist && !investorId) {
    investorId = await findInvestorIdByEmail(mail.fromEmail);
    if (!investorId) return false;
  }

  const stored = mail.attachments?.length
    ? await storeReplyAttachments(
        dist?.loan_application_id ?? `inwestor-${dist?.investor_id ?? investorId}`,
        mail.attachments,
      )
    : [];

  const { error: msgError } = await supabaseAdmin.from("offer_distribution_messages").insert({
    distribution_id: dist?.id ?? null,
    loan_application_id: dist?.loan_application_id ?? null,
    investor_id: dist?.investor_id ?? investorId,
    direction: "inbound",
    subject: mail.subject || null,
    content: mail.text || null,
    html: mail.html ?? null,
    from_email: mail.fromEmail,
    to_email: mail.recipients[0] ?? null,
    message_id: mail.messageId ?? null,
    in_reply_to: mail.inReplyTo ?? null,
    attachments: stored as any,
  });
  if (msgError) {
    console.error("[offer-replies] insert message failed:", msgError.message);
    return false;
  }

  if (dist) {
    const summary = (mail.text || mail.subject || "").replace(/\s+/g, " ").trim().slice(0, 500);
    const { error: updError } = await supabaseAdmin
      .from("offer_distributions")
      .update({
        distribution_status: "odpowiedz_otrzymana" as any,
        responded_at: new Date().toISOString(),
        response_summary: summary || null,
      })
      .eq("id", dist.id);
    if (updError) console.error("[offer-replies] update distribution failed:", updError.message);
  }

  return true;
}
