// Agent wzrostu (social media) i wspólne narzędzia agentów przez MCP:
// stan i wyniki, ustawienia (wyłącznik, tryb szkiców, budżet), ręczny
// przebieg, akceptacja / anulowanie postów, strażnik prawdy dla dowolnego
// tekstu, prośby o możliwości i dziennik obserwacji agentów.
//
// Dane żyją w ai_growth_action_log (src/lib/agent-toolkit/store.server.ts),
// więc to, co tu widać, jest dokładnie tym, czym agent się kieruje.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  DESTRUCTIVE,
  SENDS,
  WRITE_IDEMPOTENT,
  actorId,
  handle,
  ok,
  requireRolesAdmin,
  requireTeam,
} from "../_helpers";

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const ADMIN = ["administrator"] as const;

const itemView = (r: any) => ({
  id: r.id,
  created_at: r.created_at,
  stage: r.payload?.stage,
  summary: r.summary,
  audience: r.payload?.plan?.audience,
  pillar: r.payload?.plan?.pillar,
  hook: r.payload?.plan?.hook,
  slot: r.payload?.plan?.slotIso,
  platforms: r.payload?.platforms,
  facebook: r.payload?.texts?.facebook,
  instagram: r.payload?.texts?.instagram,
  image_url: r.payload?.imageUrl,
  fb: r.payload?.fb,
  ig: r.payload?.ig,
  score: r.payload?.score ?? null,
  reward: r.payload?.reward ?? null,
  guard: Object.fromEntries(
    Object.entries((r.payload?.guard ?? {}) as Record<string, any[]>).map(([k, v]) => [
      k,
      v.map((x) => `${x.severity}:${x.code}`),
    ]),
  ),
  cost_pln: r.cost_pln,
});

export const growthAgentStatus = defineTool({
  name: "growth_agent_status",
  title: "Growth agent status",
  description:
    "Stan agenta wzrostu (social media): ustawienia, koszt z 24 h, ostatnie posty z etapem (szkic / zaplanowany / opublikowany / zmierzony / zablokowany) i wynikiem, czego się nauczył (bandyta: odbiorca, filar, haczyk, pora), wnioski (playbook), propozycje rozwoju i sprawy czekające na właściciela. Administrator/operator.",
  inputSchema: { limit: z.number().int().min(1).max(50).default(15) },
  annotations: READ,
  handler: ({ limit }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const st = await import("@/lib/growth-agent/state.server");
      const { summarizeArms } = await import("@/lib/growth-agent/strategy");
      const store = await import("@/lib/agent-toolkit/store.server");
      const { pendingOwnerItems } = await import("@/lib/agent-toolkit/capabilities.server");
      const [settings, spent, items, arms, playbook, proposals, replies, owner, lastReflection] =
        await Promise.all([
          st.getGrowthSettings(),
          st.spentLast24h(),
          st.listItems({ limit }),
          st.getArms(),
          st.getPlaybook(),
          store.listAgentActions({ module: "growth_agent", action: "proposal", limit: 10 }),
          store.listAgentActions({ module: "growth_agent", action: "reply", limit: 10 }),
          pendingOwnerItems(),
          store.getAgentState<string | null>("growth_last_reflection", null),
        ]);
      return ok({
        settings,
        spent_24h_pln: spent,
        items: items.map(itemView),
        learned: summarizeArms(arms).slice(0, 20),
        playbook,
        last_reflection: lastReflection,
        proposals: proposals.map((p) => ({
          id: p.id,
          at: p.created_at,
          summary: p.summary,
          stage: p.payload?.stage,
        })),
        recent_replies: replies.map((r) => ({
          at: r.created_at,
          platform: r.payload?.platform,
          comment: r.payload?.comment,
          reply: r.payload?.reply,
        })),
        waiting_for_owner: owner,
      });
    }),
});

export const growthAgentSettings = defineTool({
  name: "growth_agent_settings",
  title: "Update growth agent settings",
  description:
    "Zmienia ustawienia agenta wzrostu: enabled (wyłącznik), mode (auto = publikuje sam, draft = szkice do akceptacji), posts_per_day (0–4), platforms (facebook, instagram), engage (odpowiedzi na komentarze IG/YouTube), max_replies_per_run, daily_budget_pln. Tylko administrator.",
  inputSchema: {
    enabled: z.boolean().optional(),
    mode: z.enum(["auto", "draft"]).optional(),
    posts_per_day: z.number().int().min(0).max(4).optional(),
    platforms: z.array(z.enum(["facebook", "instagram"])).optional(),
    engage: z.boolean().optional(),
    max_replies_per_run: z.number().int().min(0).max(20).optional(),
    daily_budget_pln: z.number().min(0).max(100).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN);
      const st = await import("@/lib/growth-agent/state.server");
      const patch: Record<string, unknown> = {};
      if (a.enabled !== undefined) patch.enabled = a.enabled;
      if (a.mode !== undefined) patch.mode = a.mode;
      if (a.posts_per_day !== undefined) patch.postsPerDay = a.posts_per_day;
      if (a.platforms !== undefined) patch.platforms = a.platforms;
      if (a.engage !== undefined) patch.engage = a.engage;
      if (a.max_replies_per_run !== undefined) patch.maxRepliesPerRun = a.max_replies_per_run;
      if (a.daily_budget_pln !== undefined) patch.dailyBudgetPln = a.daily_budget_pln;
      return ok({
        settings: await st.saveGrowthSettings(patch, ctx.getUserEmail() ?? actorId(ctx)),
      });
    }),
});

export const growthAgentRun = defineTool({
  name: "growth_agent_run",
  title: "Run growth agent now",
  description:
    "Uruchamia przebieg agenta wzrostu teraz. `force` wymusza fazy: create (nowy post — w trybie auto zaplanuje publikację!), engage (odpowiedzi na komentarze — realne odpowiedzi publiczne), improve (refleksja + kontrola stóp NBP). `dry_run=true` tylko planuje i pisze treść, nic nie zapisuje ani nie publikuje. Tylko administrator.",
  inputSchema: {
    force: z
      .array(z.enum(["publish", "measure", "warm", "create", "engage", "improve"]))
      .default([]),
    dry_run: z.boolean().default(true),
  },
  annotations: SENDS,
  handler: ({ force, dry_run }, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN);
      const { runGrowthTick } = await import("@/lib/growth-agent/tick.server");
      return ok(await runGrowthTick({ force, dryRun: dry_run }));
    }),
});

export const growthAgentDecide = defineTool({
  name: "growth_agent_decide",
  title: "Approve or cancel growth agent post",
  description:
    "Decyzja o poście agenta wzrostu: approve (szkic → zaplanowana publikacja; termin z przeszłości przesuwa się na za 15 minut) albo cancel (anuluje zaplanowany post i wpis w kolejce publikacji). Tylko administrator.",
  inputSchema: { item_id: z.string().uuid(), decision: z.enum(["approve", "cancel"]) },
  annotations: DESTRUCTIVE,
  handler: ({ item_id, decision }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN);
      const { data: row, error } = await s
        .from("ai_growth_action_log")
        .select("id, payload")
        .eq("id", item_id)
        .eq("module", "growth_agent")
        .eq("action", "item")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Nie znaleziono posta agenta.");
      const payload = (row as any).payload;
      const store = await import("@/lib/agent-toolkit/store.server");
      if (decision === "approve") {
        if (payload?.stage !== "awaiting_approval")
          throw new Error(
            `Post jest na etapie „${payload?.stage}” — akceptować można tylko szkic.`,
          );
        const { scheduleItem } = await import("@/lib/growth-agent/create.server");
        const next = await scheduleItem(item_id, payload);
        return ok({ item_id, stage: next.stage, slot: next.plan.slotIso, fb: next.fb });
      }
      if (!["awaiting_approval", "scheduled"].includes(payload?.stage)) {
        throw new Error(
          `Post jest na etapie „${payload?.stage}” — anulować można szkic albo zaplanowany.`,
        );
      }
      if (payload?.fb?.queueId) {
        await s
          .from("social_publish_queue")
          .update({ status: "cancelled" })
          .eq("id", payload.fb.queueId)
          .in("status", ["pending"]);
      }
      await store.updateAgentAction(item_id, { payload: { ...payload, stage: "cancelled" } });
      return ok({ item_id, stage: "cancelled" });
    }),
});

export const growthAgentCheckText = defineTool({
  name: "growth_agent_check_text",
  title: "Truth guard check",
  description:
    "Sprawdza dowolny tekst (post, opis, odpowiedź) strażnikiem prawdy agentów: blokady (gwarancja zysku, „bez ryzyka”, prowizja/LTV/odsetki/abonament niezgodne z umowami, stawki miesięczne, cele prywatne, obce dane kontaktowe, długość), automatyczne poprawki (zastrzeżenie inwestycyjne, „link w bio”) i ostrzeżenia. Nic nie zapisuje.",
  inputSchema: {
    text: z.string().min(1).max(10000),
    audience: z.enum(["inwestor", "klient", "ogolny"]).default("ogolny"),
    platform: z
      .enum(["facebook_post", "instagram", "x", "youtube", "tiktok", "comment_reply", "generic"])
      .default("generic"),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const { guardContent } = await import("@/lib/growth-agent/truth-guard");
      return ok(guardContent({ text: a.text, audience: a.audience, platform: a.platform }));
    }),
});

export const requestAgentCapability = defineTool({
  name: "request_agent_capability",
  title: "Request agent capability",
  description:
    "Zgłasza prośbę o nową możliwość dla agentów (narzędzie, konektor, źródło danych, kanał). Darmowe i możliwe kodem — przyznawane od razu (np. publiczne źródło z dozwolonej domeny); płatne albo wymagające człowieka — zapis + SMS do właściciela z darmowymi alternatywami (limit 2 SMS/dobę, ta sama sprawa raz na 7 dni). `notify=false` zapisuje bez SMS-a. Tylko administrator.",
  inputSchema: {
    description: z.string().min(5).max(500),
    key: z.string().max(60).optional(),
    url: z.string().url().optional(),
    why: z.string().max(300).optional(),
    notify: z.boolean().default(false),
  },
  annotations: SENDS,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN);
      const { requestCapability } = await import("@/lib/agent-toolkit/capabilities.server");
      return ok(
        await requestCapability(
          {
            description: a.description,
            key: a.key ?? null,
            url: a.url ?? null,
            why: a.why ?? null,
          },
          { requester: `mcp:${ctx.getUserEmail() ?? actorId(ctx)}`, notify: a.notify },
        ),
      );
    }),
});

export const listAgentInsights = defineTool({
  name: "list_agent_insights",
  title: "List agent insights and audit",
  description:
    "Dziennik agentów: obserwacje z rozmów (pytania bez odpowiedzi, obiekcje, pilne sprawy, komentarze wymagające człowieka), audyt wywołań narzędzi (kto, co, wynik), prośby o możliwości i SMS-y do właściciela. Administrator/operator.",
  inputSchema: {
    kind: z
      .enum(["agent_insights", "agent_tools", "agent_capabilities", "agent_owner", "growth_agent"])
      .default("agent_insights"),
    action: z.string().max(80).optional(),
    days: z.number().int().min(1).max(90).default(14),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const store = await import("@/lib/agent-toolkit/store.server");
      const rows = await store.listAgentActions({
        module: a.kind,
        action: a.action,
        sinceIso: new Date(Date.now() - a.days * 86_400_000).toISOString(),
        limit: a.limit,
      });
      return ok({
        rows: rows.map((r) => ({
          id: r.id,
          at: r.created_at,
          action: r.action,
          status: r.status,
          summary: r.summary,
          stage: r.payload?.stage ?? null,
          cost_pln: r.cost_pln,
        })),
      });
    }),
});

export const growthAgentTools = [
  growthAgentStatus,
  growthAgentSettings,
  growthAgentRun,
  growthAgentDecide,
  growthAgentCheckText,
  requestAgentCapability,
  listAgentInsights,
];
