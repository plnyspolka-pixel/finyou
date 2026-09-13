import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AgentVariant } from "@/lib/elevenlabs-text-agent.server";

// id wiersza w text_agent_settings per wariant (CHECK id IN (1,2,3)).
const VARIANT_ID: Record<AgentVariant, number> = { klient: 1, inwestor: 2, inwestor_prywatny: 3 };

function variantId(variant?: AgentVariant): number {
  return VARIANT_ID[variant ?? "klient"] ?? 1;
}

export const getTextAgentSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { variant?: AgentVariant } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // gate: must be administrator
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "administrator");
    if (!isAdmin) throw new Error("Brak uprawnień");

    const { data: row } = await supabaseAdmin
      .from("text_agent_settings")
      .select("system_prompt, first_message, updated_at")
      .eq("id", variantId(data?.variant))
      .maybeSingle();
    return {
      systemPrompt: row?.system_prompt ?? "",
      firstMessage: row?.first_message ?? "",
      updatedAt: row?.updated_at ?? null,
    };
  });

export const saveTextAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { systemPrompt: string; firstMessage?: string; variant?: AgentVariant }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "administrator");
    if (!isAdmin) throw new Error("Brak uprawnień");

    const { error } = await supabaseAdmin.from("text_agent_settings").upsert({
      id: variantId(data.variant),
      system_prompt: data.systemPrompt ?? "",
      first_message: data.firstMessage ?? null,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);

    // Zapis promptu = natychmiastowa wysyłka do agentów ElevenLabs. Bez tego
    // nowa treść działa tylko w naszym silniku tekstowym, a Messenger i telefon
    // (prowadzone przez agenta) zostają na starej wersji do następnej rozmowy.
    let syncedToElevenLabs = false;
    let syncError: string | null = null;
    try {
      const { clearAgentPromptCache } = await import("@/lib/elevenlabs-text-agent.server");
      clearAgentPromptCache(data.variant);
      const { ensureAgentPromptsFresh } = await import("@/lib/elevenlabs-agents.server");
      await ensureAgentPromptsFresh(true);
      syncedToElevenLabs = true;
    } catch (e: any) {
      syncError = e?.message ?? "nie udało się wysłać promptu do ElevenLabs";
      console.error("[text-agent-settings] sync promptu", e);
    }

    return { ok: true, syncedToElevenLabs, syncError };
  });
