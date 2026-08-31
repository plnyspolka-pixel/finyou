// Server functions zarządzania agentami procesowymi ElevenLabs (panel admina).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (roles ?? []).some((r: { role: string }) => r.role === "administrator");
  if (!ok) throw new Error("Brak uprawnień (wymagana rola administrator).");
}

/** Stan agentów procesowych: ID per powierzchnia (env lub voicebot_settings). */
export const getProcessAgentsState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { getAgentIdForSurface } = await import("@/lib/elevenlabs-agents.server");
    const [intake, investorInfo, investorPanel] = await Promise.all([
      getAgentIdForSurface("intake"),
      getAgentIdForSurface("investor_info"),
      getAgentIdForSurface("investor_panel"),
    ]);
    return {
      intake,
      investor_info: investorInfo,
      investor_panel: investorPanel,
      hasApiKey: Boolean(process.env.ELEVENLABS_API_KEY),
      hasToolsSecret: Boolean(process.env.AGENT_TOOLS_SECRET),
    };
  });

/** Tworzy brakujące agenty procesowe przez API ElevenLabs (idempotentne). */
export const provisionProcessAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { ensureElevenLabsProcessAgents } = await import("@/lib/elevenlabs-agents.server");
    return ensureElevenLabsProcessAgents();
  });
