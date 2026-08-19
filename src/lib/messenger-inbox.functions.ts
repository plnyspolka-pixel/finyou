import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Manualna odpowiedź operatora do rozmowy Messenger / Instagram Direct.
 * Wysyła wiadomość przez Meta Graph API i loguje ją w lead_communications
 * jako outbound (channel="messenger"), aby pojawiła się w skrzynce.
 */
export const sendMessengerReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        leadId: z.string().uuid(),
        body: z.string().min(1).max(1900),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isOperator }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "administrator" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operator" }),
    ]);
    if (!isAdmin && !isOperator) throw new Error("Forbidden");

    // Rdzeń w comms-agent.server.ts — wspólny ze skrzynką i asystentem panelu.
    const { sendMessengerReplyToLead } = await import("./comms-agent.server");
    const r = await sendMessengerReplyToLead({
      leadId: data.leadId,
      body: data.body,
      actorUserId: context.userId,
      source: "inbox_manual",
    });
    return { ok: true, messageId: r.messageId };
  });

/**
 * Ręczne uzupełnienie historii wstecz (przycisk w skrzynce). Ta sama
 * logika działa automatycznie z crona (follow-up-tick) — patrz
 * messenger-backfill.server.ts. Idempotentne.
 */
export const backfillMessengerData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: isAdmin }, { data: isOperator }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "administrator" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operator" }),
    ]);
    if (!isAdmin && !isOperator) throw new Error("Forbidden");

    const { backfillLeadNames, backfillOrphanAttachments, markAttachmentsBackfillDone } =
      await import("./messenger-backfill.server");
    const { syncMessengerConversations, backfillGraphSyncAttachments } =
      await import("./messenger-sync.server");

    let sync = {
      conversationsSeen: 0,
      messagesNew: 0,
      leadsCreated: 0,
      errors: [] as string[],
      webhook: [] as Array<{
        page: string;
        subscribed: boolean;
        fields: string[];
        note: string | null;
      }>,
    };
    try {
      const r = await syncMessengerConversations({ platform: "both" });
      sync = {
        conversationsSeen: r.conversationsSeen,
        messagesNew: r.messagesNew,
        leadsCreated: r.leadsCreated,
        errors: r.errors,
        webhook: r.webhook,
      };
    } catch (e: any) {
      console.warn("[backfill] messenger conversation sync error", e);
      sync.errors.push(String(e?.message ?? e));
    }

    let docSync = { messagesProcessed: 0, attachmentsDownloaded: 0, ocrProcessed: 0, kwFound: 0 };
    try {
      const r = await backfillGraphSyncAttachments();
      docSync = {
        messagesProcessed: r.messagesProcessed,
        attachmentsDownloaded: r.attachmentsDownloaded,
        ocrProcessed: r.ocrProcessed,
        kwFound: r.kwFound,
      };
      if (r.errors.length) sync.errors.push(...r.errors.slice(0, 3));
    } catch (e: any) {
      console.warn("[backfill] messenger attachment sync error", e);
      sync.errors.push(String(e?.message ?? e));
    }

    const names = await backfillLeadNames({ force: true });
    const atts = await backfillOrphanAttachments();
    try {
      await markAttachmentsBackfillDone();
    } catch (e) {
      console.warn("[backfill] marker upload error", e);
    }

    return { ok: true, ...names, ...atts, ...sync, ...docSync };
  });
