import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import { sendResendEmail } from "./resend-send.server";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// Harmonogram do klienta może wysłać tylko zalogowany pośrednik / operator / administrator.
async function requireBrokerOrStaff(userId: string) {
  const { data } = await admin().from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  const allowed = ["administrator", "operator", "posrednik"];
  if (!roles.some((r: string) => allowed.includes(r))) {
    throw new Error("Brak uprawnień do wysyłki harmonogramu (pośrednik/operator/administrator).");
  }
}

/**
 * Wysyła klientowi wygenerowany harmonogram spłat (HTML) e-mailem przez Resend.
 * html to gotowy fragment treści (tabela + podsumowanie) — zostaje obrandowany szablonem Finance You.
 */
export const sendLoanScheduleToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        to: z.string().email("Nieprawidłowy adres e-mail klienta"),
        clientName: z.string().max(200).optional().nullable(),
        subject: z.string().min(1).max(200),
        html: z.string().min(1).max(200_000),
        text: z.string().min(1).max(50_000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireBrokerOrStaff(context.userId);
    const res = await sendResendEmail({
      to: data.to,
      subject: data.subject,
      html: data.html,
      text: data.text,
      fromName: "Finance You",
      showReplyHint: true,
    });
    if (!res.ok) throw new Error(res.error ?? "Nie udało się wysłać e-maila.");
    return { ok: true as const, id: res.id ?? null };
  });
