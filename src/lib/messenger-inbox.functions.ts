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
    z.object({
      leadId: z.string().uuid(),
      body: z.string().min(1).max(1900),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isOperator }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "administrator" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operator" }),
    ]);
    if (!isAdmin && !isOperator) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMetaMessage } = await import("./meta-send.server");
    const { logLeadCommunication } = await import("./lead-comms.server");

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id, messenger_psid, instagram_igsid")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) throw new Error("Lead nie istnieje");

    const platform: "messenger" | "instagram" = lead.messenger_psid
      ? "messenger"
      : lead.instagram_igsid
      ? "instagram"
      : "messenger";
    const recipientId = lead.messenger_psid ?? lead.instagram_igsid;
    if (!recipientId) throw new Error("Ten lead nie ma zapisanego identyfikatora Messenger/Instagram.");

    const send = await sendMetaMessage({ recipientId, text: data.body, platform });

    await logLeadCommunication({
      leadId: data.leadId,
      channel: platform,
      direction: "outbound",
      content: data.body,
      externalId: send.messageId ?? null,
      metadata: {
        platform,
        sender_id: recipientId,
        sent_by: context.userId,
        source: "inbox_manual",
      },
      status: send.ok ? "sent" : "error",
      errorMessage: send.ok ? null : send.error,
    });

    if (!send.ok) throw new Error(send.error ?? "send_failed");
    return { ok: true, messageId: send.messageId };
  });

/**
 * Podpisane URL-e do załączników z DM (bucket `documents` jest prywatny —
 * bez signed URL podgląd/pobranie w skrzynce zwracał 404).
 * Dostęp: administrator lub operator (ta sama para ról co odpowiadanie).
 */
export const getLeadAttachmentUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      paths: z.array(z.string().min(1).max(500)).min(1).max(50),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isOperator }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "administrator" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operator" }),
    ]);
    if (!isAdmin && !isOperator) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const urls: Record<string, string> = {};
    const { data: signed, error } = await supabaseAdmin.storage
      .from("documents")
      .createSignedUrls(data.paths, 3600);
    if (error) throw error;
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) urls[s.path] = s.signedUrl;
    }
    return { urls };
  });
