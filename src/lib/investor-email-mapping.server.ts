// Mapowanie przychodzącej korespondencji od inwestorów (w tym instytucji)
// z powrotem do konkretnego wniosku pożyczkowego.
//
// Skąd wiemy, którego wniosku dotyczy odpowiedź (w kolejności pewności):
//  1. Tag w adresie odbiorcy — oferty wychodzą z reply-to
//     `kontakt+la-<uuid-bez-myslnikow>@financeyou.pl`, więc odpowiedź wraca
//     z tym tagiem niezależnie od klienta pocztowego instytucji.
//  2. Nagłówki wątku (In-Reply-To / References) → nasza wychodząca wiadomość
//     w lead_communications i jej loan_application_id.
//  3. Ostatnia oferta wysłana do tego inwestora (investor_id + loan_application_id).
//
// Odpowiedzi inwestorów NIE przechodzą przez ścieżkę leadów pożyczkowych:
// bez tworzenia fałszywego leada, bez auto-odpowiedzi klienckiego agenta AI,
// bez promocji lead→klient. Wcześniej każda odpowiedź banku/funduszu stawała
// się „nowym leadem" i dostawała odpowiedź bota dla pożyczkobiorców.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logLeadCommunication, findLeadId } from "@/lib/lead-comms.server";
import type { StoredAttachment } from "@/lib/inbound-attachments.server";

/** Wyciąga UUID wniosku z adresów typu kontakt+la-<32hex>@financeyou.pl. */
export function extractLaTag(recipients: Array<string | null | undefined>): string | null {
  for (const r of recipients) {
    if (!r) continue;
    const m = String(r).toLowerCase().match(/\+la-?([0-9a-f]{32})@/);
    if (m) {
      const h = m[1];
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
  }
  return null;
}

export type InvestorInboundArgs = {
  fromEmail: string;
  fromName?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  /** Wszystkie adresy odbiorców (to/cc/delivered-to) — do wykrycia tagu +la-. */
  recipients: Array<string | null | undefined>;
  provider: "resend" | "mailgun";
  emailId?: string | null;
  attachments?: StoredAttachment[];
};

/**
 * Jeśli nadawca jest inwestorem (albo mail przyszedł na adres z tagiem
 * wniosku), loguje korespondencję przy wniosku/inwestorze i zwraca true —
 * webhook powinien wtedy ZAKOŃCZYĆ przetwarzanie (bez ścieżki leadowej).
 */
export async function tryHandleInvestorInbound(args: InvestorInboundArgs): Promise<boolean> {
  const laFromTag = extractLaTag(args.recipients);

  const { data: investor } = await supabaseAdmin
    .from("investors")
    .select("id, first_name, last_name, company_name, email, investor_type")
    .ilike("email", args.fromEmail)
    .maybeSingle();

  if (!investor && !laFromTag) return false;

  // Ustal wniosek, którego dotyczy odpowiedź.
  let loanApplicationId: string | null = laFromTag;

  // 2) nagłówki wątku → nasza wychodząca wiadomość
  if (!loanApplicationId) {
    const threadIds = [args.inReplyTo, ...(args.references ?? "").split(/\s+/)]
      .map((x) => (x ?? "").trim())
      .filter(Boolean);
    if (threadIds.length) {
      const { data: parent } = await supabaseAdmin
        .from("lead_communications")
        .select("loan_application_id")
        .in("external_id", threadIds)
        .not("loan_application_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      loanApplicationId = (parent as any)?.loan_application_id ?? null;
    }
  }

  // 3) ostatnia oferta do tego inwestora
  if (!loanApplicationId && investor) {
    const { data: lastOffer } = await supabaseAdmin
      .from("lead_communications")
      .select("loan_application_id")
      .eq("investor_id", investor.id)
      .eq("direction", "outbound")
      .not("loan_application_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    loanApplicationId = (lastOffer as any)?.loan_application_id ?? null;
  }

  const investorLeadId = investor ? await findLeadId({ investorId: investor.id }) : null;

  const commId = await logLeadCommunication({
    leadId: investorLeadId,
    loanApplicationId,
    investorId: investor?.id ?? null,
    channel: "email",
    direction: "inbound",
    subject: args.subject,
    content: args.text,
    externalId: args.messageId ?? null,
    threadExternalId: args.inReplyTo ?? args.messageId ?? null,
    email: args.fromEmail,
    status: "received",
    attachments: args.attachments?.length ? (args.attachments as any[]) : null,
    metadata: {
      kind: "investor_reply",
      from_name: args.fromName ?? null,
      investor_name: investor
        ? investor.company_name || `${investor.first_name ?? ""} ${investor.last_name ?? ""}`.trim()
        : null,
      investor_type: investor?.investor_type ?? null,
      in_reply_to: args.inReplyTo ?? null,
      references: args.references ?? null,
      message_id_header: args.messageId ?? null,
      provider: args.provider,
      email_id: args.emailId ?? null,
      html: args.html ?? null,
      matched_by: laFromTag ? "la_tag" : undefined,
    },
  });

  // Załączniki od inwestora → dokumenty wniosku (widoczne przy sprawie).
  if (loanApplicationId && args.attachments?.length) {
    try {
      await supabaseAdmin.from("documents").insert(
        args.attachments.map((a) => ({
          loan_application_id: loanApplicationId!,
          document_type: "attachment_investor_email",
          file_name: a.name,
          file_path: a.path,
          file_url: a.path,
          status: "received",
          visibility_level: "pelne" as const,
        })),
      );
    } catch (e) {
      console.error("[investor-inbound] documents insert error", e);
    }
  }

  console.log(
    `[investor-inbound] mapped reply from ${args.fromEmail} → investor=${investor?.id ?? "-"} loan=${loanApplicationId ?? "-"} comm=${commId ?? "-"}`,
  );
  return true;
}
