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

    // Rdzeń w comms-agent.server.ts — wspólny ze skrzynką i asystentem panelu.
    const { sendChatReplyToLead } = await import("./comms-agent.server");
    const { id } = await sendChatReplyToLead({
      leadId: data.leadId,
      body: data.body,
      actorUserId: context.userId,
      channel: "chat",
      source: "inbox_manual",
    });

    return { ok: true, id };
  });
