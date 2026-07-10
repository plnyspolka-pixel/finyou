import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const ok = (roles ?? []).some((r) => r.role === "administrator" || r.role === "operator");
  if (!ok) throw new Error("Brak uprawnień");
}

/**
 * Generuje szkic wiadomości (mail lub DM) tym samym botem co auto-odpowiadanie
 * (prompt z /admin/text-agent + RAG + kontekst leada, model Gemini Pro).
 * Nic nie wysyła — zwraca gotowy tekst do wklejenia/edycji przez operatora.
 */
export const generateAgentDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        channel: z.enum(["email", "messenger", "instagram"]),
        mode: z.enum(["reply", "compose"]).default("reply"),
        leadId: z.string().uuid().nullish(),
        incomingMessage: z.string().max(8000).nullish(),
        instruction: z.string().max(2000).nullish(),
        subject: z.string().max(500).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { runAgentDraft } = await import("./elevenlabs-text-agent.server");
    return await runAgentDraft({
      channel: data.channel,
      mode: data.mode,
      leadId: data.leadId ?? null,
      incomingMessage: data.incomingMessage ?? null,
      instruction: data.instruction ?? null,
      subject: data.subject ?? null,
    });
  });
