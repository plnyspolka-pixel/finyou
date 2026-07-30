import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTextAgentSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // gate: must be administrator
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "administrator");
    if (!isAdmin) throw new Error("Brak uprawnień");

    const { data } = await supabaseAdmin
      .from("text_agent_settings")
      .select("system_prompt, first_message, updated_at")
      .eq("id", 1)
      .maybeSingle();
    return {
      systemPrompt: data?.system_prompt ?? "",
      firstMessage: data?.first_message ?? "",
      updatedAt: data?.updated_at ?? null,
    };
  });

export const saveTextAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { systemPrompt: string; firstMessage?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "administrator");
    if (!isAdmin) throw new Error("Brak uprawnień");

    const { error } = await supabaseAdmin.from("text_agent_settings").upsert({
      id: 1,
      system_prompt: data.systemPrompt ?? "",
      first_message: data.firstMessage ?? null,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
