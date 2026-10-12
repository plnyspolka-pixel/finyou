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
import type { StudioPlatform } from "@/lib/studio-platforms";
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
  /** Rolki dziennie — główny produkt agenta (0 wyłącza rolki). */
  reelsPerDay: number;
  /** „auto” = wszystkie połączone platformy wideo; albo jawna lista. */
  reelPlatforms: "auto" | StudioPlatform[];
  /**
   * Ustawienia posta TikToka wybrane przez właściciela (prywatność, interakcje,
   * oznaczenia). Bez nich agent pomija TikToka — wymóg audytu TikToka.
   */
  tiktokPostOptions: Record<string, unknown> | null;
}

export const DEFAULT_GROWTH_SETTINGS: GrowthSettings = {
  enabled: true,
  mode: "auto",
  // Główny produkt to codzienna rolka; post tekstowy raz dziennie to dodatek.
  postsPerDay: 1,
  platforms: ["facebook", "instagram"],
  engage: true,
  maxRepliesPerRun: 5,
  dailyBudgetPln: 5,
  reelsPerDay: 1,
  reelPlatforms: "auto",
  tiktokPostOptions: null,
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
  merged.reelsPerDay = Math.max(0, Math.min(2, Math.round(Number(merged.reelsPerDay) || 0)));
  if (merged.reelPlatforms !== "auto" && !Array.isArray(merged.reelPlatforms))
    merged.reelPlatforms = "auto";
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
  /** Rolka: zlecona w Studiu, czeka na render i napisy. */
  | "producing"
  | "scheduled"
  | "published"
  | "measured"
  | "blocked"
  | "failed"
  | "cancelled";

export interface ReelPayload {
  script: string;
  title: string;
  caption: string;
  short: string;
  studioJobId: string | null;
  videoUrl: string | null;
  jobStatus?: string | null;
  jobError?: string | null;
  /** Ile razy ponowiono render (Studio: napisy albo pełny render). */
  retries?: number;
  /** Platformy wybrane przy zleceniu (i pominięte z powodem). */
  targets: StudioPlatform[];
  skipped: Array<{ platform: StudioPlatform; reason: string }>;
  social: Array<{
    id: string;
    platform: StudioPlatform;
    status?: string;
    externalId?: string | null;
    error?: string | null;
  }>;
  youtube: Array<{ id: string; status?: string; videoId?: string | null; error?: string | null }>;
  queuedAt?: string | null;
}

export interface GrowthItemPayload {
  /** Rodzaj treści; brak = post (zapisy sprzed rolek). */
  format?: "post" | "reel";
  reel?: ReelPayload;
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

export type ContentFormat = "post" | "reel";
const armsKey = (format: ContentFormat) => (format === "reel" ? "growth_arms_reel" : "growth_arms");

/** Bandyta osobno dla postów i rolek — inne pory, inne zachowanie widzów. */
export const getArms = (format: ContentFormat = "post") =>
  getAgentState<ArmTable>(armsKey(format), {});
export const saveArms = (arms: ArmTable, format: ContentFormat = "post") =>
  setAgentState(armsKey(format), arms, `bandyta (${format}): ${Object.keys(arms).length} ramion`);

export const isReel = (payload: unknown): boolean =>
  (payload as GrowthItemPayload | null)?.format === "reel";
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
