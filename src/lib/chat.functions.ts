import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Moderacja wiadomości: blokuje numery telefonów, e-maile, linki kontaktowe
function moderate(body: string): { filtered: string; flags: string[]; blocked: boolean } {
  const flags: string[] = [];
  let filtered = body;
  const phoneRe = /(\+?\d[\d\s\-().]{7,}\d)/g;
  const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const urlRe = /(https?:\/\/\S+|www\.\S+)/gi;
  const messengerRe = /\b(whatsapp|telegram|signal|messenger|viber|skype)\b/gi;
  if (phoneRe.test(body)) {
    flags.push("phone");
    filtered = filtered.replace(phoneRe, "[numer ukryty]");
  }
  if (emailRe.test(body)) {
    flags.push("email");
    filtered = filtered.replace(emailRe, "[e-mail ukryty]");
  }
  if (urlRe.test(body)) {
    flags.push("url");
    filtered = filtered.replace(urlRe, "[link ukryty]");
  }
  if (messengerRe.test(body)) {
    flags.push("messenger");
    filtered = filtered.replace(messengerRe, "[komunikator ukryty]");
  }
  return { filtered, flags, blocked: false };
}

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        threadId: z.string().uuid(),
        senderRole: z.enum(["klient", "inwestor"]),
        body: z.string().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const m = moderate(data.body);
    const { error, data: row } = await context.supabase
      .from("chat_messages")
      .insert({
        thread_id: data.threadId,
        sender_role: data.senderRole,
        sender_user_id: context.userId,
        body: data.body,
        body_filtered: m.filtered,
        moderation_flags: m.flags,
        blocked: m.blocked,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase
      .from("chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.threadId);
    return { ok: true, message: row, flags: m.flags };
  });

export const openOrCreateThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        loanApplicationId: z.string().uuid(),
        investorId: z.string().uuid(),
        clientId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("chat_threads")
      .select("id")
      .eq("loan_application_id", data.loanApplicationId)
      .eq("investor_id", data.investorId)
      .maybeSingle();
    if (existing) return { threadId: existing.id };
    const { data: created, error } = await context.supabase
      .from("chat_threads")
      .insert({
        loan_application_id: data.loanApplicationId,
        investor_id: data.investorId,
        client_id: data.clientId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { threadId: created.id };
  });
