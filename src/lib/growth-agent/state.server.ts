// Stan agenta wzrostu na istniejącej tabeli ai_growth_action_log
// (agent-toolkit/store.server.ts). Wpisy:
//   module = "growth_agent", action = "item"      — jeden post (payload.stage = etap)
//   module = "growth_agent", action = "run"       — przebieg ticka (koszt, wynik faz)
//   module = "growth_agent", action = "reply"     — odpowiedź na komentarz
//   module = "growth_agent", action = "proposal"  — pomysł agenta na rozwój
//   module = "agent_state",  action = "growth_*"  — ustawienia, bandyta, playbook
import {
  getAgentState,
  hoursAgoIso,
  listAgentActions,
  setAgentState,
} from "@/lib/agent-toolkit/store.server";
import type { ArmTable, PostPlan } from "./strategy";
import type { GuardViolation } from "./truth-guard";
import type { PostMetrics } from "./scoring";

export type GrowthPlatform = "facebook" | "instagram";

export interface GrowthSettings {
  enabled: boolean;
  /** auto — publikuje sam; draft — przygotowuje szkice do akceptacji (MCP). */
  mode: "auto" | "draft";
  postsPerDay: number;
  platforms: GrowthPlatform[];
  /** Odpowiedzi na komentarze pod postami. */
  engage: boolean;
  maxRepliesPerRun: number;
  /** Dzienny budżet na modele i grafiki (PLN). */
  dailyBudgetPln: number;
}

export const DEFAULT_GROWTH_SETTINGS: GrowthSettings = {
  enabled: true,
  mode: "auto",
  // Mały profil: jakość > ilość. Codzienna rolka 15:00 i tak idzie osobno.
  postsPerDay: 1,
  platforms: ["facebook", "instagram"],
  engage: true,
  maxRepliesPerRun: 5,
  dailyBudgetPln: 5,
};

export async function getGrowthSettings(): Promise<GrowthSettings> {
  const s = await getAgentState<Partial<GrowthSettings>>("growth_settings", {});
  const merged = { ...DEFAULT_GROWTH_SETTINGS, ...s };
  merged.postsPerDay = Math.max(0, Math.min(4, Math.round(merged.postsPerDay)));
  merged.maxRepliesPerRun = Math.max(0, Math.min(20, Math.round(merged.maxRepliesPerRun)));
  merged.dailyBudgetPln = Math.max(0, Math.min(100, merged.dailyBudgetPln));
  merged.platforms = (merged.platforms ?? []).filter(
    (p): p is GrowthPlatform => p === "facebook" || p === "instagram",
  );
  return merged;
}

export async function saveGrowthSettings(
  patch: Partial<GrowthSettings>,
  by: string,
): Promise<GrowthSettings> {
  const current = await getGrowthSettings();
  const next = { ...current, ...patch };
  await setAgentState("growth_settings", next, `ustawienia agenta wzrostu (${by})`);
  return getGrowthSettings();
}

export type ItemStage =
  | "awaiting_approval"
  | "scheduled"
  | "published"
  | "measured"
  | "blocked"
  | "failed"
  | "cancelled";

export interface GrowthItemPayload {
  stage: ItemStage;
  plan: PostPlan;
  texts: { facebook: string; instagram: string };
  summary: string;
  imagePrompt: string;
  imageUrl: string | null;
  altText: string;
  guard: Record<string, GuardViolation[]>;
  platforms: GrowthPlatform[];
  fb?: { queueId?: string | null; postId?: string | null; error?: string | null };
  ig?: { mediaId?: string | null; error?: string | null };
  publishedAt?: string | null;
  metrics?: Record<string, PostMetrics>;
  score?: number | null;
  reward?: number | null;
  measuredAt?: string | null;
  measureAttempts?: number;
}

export async function listItems(
  opts: { stage?: ItemStage | ItemStage[]; sinceIso?: string; limit?: number } = {},
) {
  return listAgentActions({
    module: "growth_agent",
    action: "item",
    stage: opts.stage,
    sinceIso: opts.sinceIso,
    limit: opts.limit ?? 100,
  });
}

export const getArms = () => getAgentState<ArmTable>("growth_arms", {});
export const saveArms = (arms: ArmTable) =>
  setAgentState("growth_arms", arms, `bandyta: ${Object.keys(arms).length} ramion`);
export const getPlaybook = () => getAgentState<string[]>("growth_playbook", []);
export const savePlaybook = (lessons: string[]) =>
  setAgentState("growth_playbook", lessons.slice(0, 12), `playbook: ${lessons.length} wniosków`);

/** Koszt agenta wzrostu w ostatnich 24 h (PLN). */
export async function spentLast24h(): Promise<number> {
  const rows = await listAgentActions({
    module: "growth_agent",
    sinceIso: hoursAgoIso(24),
    limit: 500,
  });
  return Math.round(rows.reduce((s, r) => s + (Number(r.cost_pln) || 0), 0) * 100) / 100;
}
