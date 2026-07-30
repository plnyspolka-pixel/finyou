import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Ręczna odpowiedź operatora w rozmowie z czatu na stronie (kanał "chat").
 * Loguje wiadomość jako outbound w lead_communications — widget klienta
 * pobiera ją przy najbliższym odświeżeniu (polling co 10 s) i pokazuje
 * jako wiadomość od konsultanta.
 */
export const sendChatReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      leadId: z.string().uuid(),
      body: z.string().min(1).max(4000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isOperator }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "administrator" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operator" }),
    ]);
    if (!isAdmin && !isOperator) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logLeadCommunication } = await import("./lead-comms.server");

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id, application_data")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) throw new Error("Lead nie istnieje");

    const appData = (lead.application_data ?? {}) as Record<string, any>;
    const sessionId = appData.chat_session_id ?? null;

    const id = await logLeadCommunication({
      leadId: data.leadId,
      channel: "chat",
      direction: "outbound",
      content: data.body,
      status: "sent",
      metadata: {
        chat_session_id: sessionId,
        sent_by: context.userId,
        source: "inbox_manual",
      },
    });

    return { ok: true, id };
  });
