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
  format: r.payload?.format ?? "post",
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
  reel: r.payload?.reel
    ? {
        title: r.payload.reel.title,
        script: r.payload.reel.script,
        studio_job_id: r.payload.reel.studioJobId,
        job_status: r.payload.reel.jobStatus,
        job_error: r.payload.reel.jobError,
        video_url: r.payload.reel.videoUrl,
        targets: r.payload.reel.targets,
        skipped: r.payload.reel.skipped,
        queue: [
          ...(r.payload.reel.social ?? []).map((x: any) => ({
            platform: x.platform,
            status: x.status,
            external_id: x.externalId,
            error: x.error,
          })),
          ...(r.payload.reel.youtube ?? []).map((x: any) => ({
            platform: "youtube",
            status: x.status,
            external_id: x.videoId,
            error: x.error,
          })),
        ],
      }
    : undefined,
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
    "Stan agenta wzrostu (social media): ustawienia, koszt z 24 h, ostatnie rolki i posty z etapem (szkic / w produkcji / zaplanowany / opublikowany / zmierzony / zablokowany), platformami i wynikiem, platformy wideo dostępne teraz (i pominięte z powodem), czego się nauczył osobno dla rolek i postów (odbiorca, filar, haczyk, pora), wnioski (playbook), propozycje rozwoju i sprawy czekające na właściciela. Administrator/operator.",
  inputSchema: { limit: z.number().int().min(1).max(50).default(15) },
  annotations: READ,
  handler: ({ limit }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const st = await import("@/lib/growth-agent/state.server");
      const { summarizeArms } = await import("@/lib/growth-agent/strategy");
      const store = await import("@/lib/agent-toolkit/store.server");
      const { pendingOwnerItems } = await import("@/lib/agent-toolkit/capabilities.server");
      const [
        settings,
        spent,
        items,
        arms,
        reelArms,
        playbook,
        proposals,
        replies,
        owner,
        lastReflection,
      ] = await Promise.all([
        st.getGrowthSettings(),
        st.spentLast24h(),
        st.listItems({ limit }),
        st.getArms("post"),
        st.getArms("reel"),
        st.getPlaybook(),
        store.listAgentActions({ module: "growth_agent", action: "proposal", limit: 10 }),
        store.listAgentActions({ module: "growth_agent", action: "reply", limit: 10 }),
        pendingOwnerItems(),
        store.getAgentState<string | null>("growth_last_reflection", null),
      ]);
      const { reelPlatformChoice } = await import("@/lib/growth-agent/reel.server");
      const reelPlatforms = await reelPlatformChoice(settings, new Date()).catch((e) => ({
        error: e instanceof Error ? e.message : String(e),
      }));
      return ok({
        settings: {
          ...settings,
          tiktokPostOptions: settings.tiktokPostOptions ? "ustawione" : null,
        },
        spent_24h_pln: spent,
        reel_platforms_now: reelPlatforms,
        items: items.map(itemView),
        learned_reels: summarizeArms(reelArms).slice(0, 20),
        learned_posts: summarizeArms(arms).slice(0, 20),
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
    "Zmienia ustawienia agenta wzrostu: enabled (wyłącznik), mode (auto = publikuje sam, draft = szkice do akceptacji), reels_per_day (0–2, główny produkt: codzienna rolka na wszystkie dostępne platformy), reel_platforms („auto” albo lista: instagram_reels, facebook_reels, youtube, tiktok, x), tiktok_privacy + tiktok_* (ustawienia posta TikToka wybrane przez właściciela — bez nich agent pomija TikToka; tiktok_privacy=null czyści), posts_per_day (0–4, posty tekstowe), platforms (posty: facebook, instagram), engage (odpowiedzi na komentarze IG/YouTube), max_replies_per_run, daily_budget_pln. Tylko administrator.",
  inputSchema: {
    enabled: z.boolean().optional(),
    mode: z.enum(["auto", "draft"]).optional(),
    reels_per_day: z.number().int().min(0).max(2).optional(),
    reel_platforms: z
      .union([
        z.literal("auto"),
        z.array(z.enum(["instagram_reels", "facebook_reels", "youtube", "tiktok", "x"])).min(1),
      ])
      .optional(),
    tiktok_privacy: z
      .enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"])
      .nullable()
      .optional(),
    tiktok_disable_comment: z.boolean().optional(),
    tiktok_disable_duet: z.boolean().optional(),
    tiktok_disable_stitch: z.boolean().optional(),
    tiktok_brand_organic: z.boolean().optional(),
    tiktok_branded_content: z.boolean().optional(),
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
      if (a.reels_per_day !== undefined) patch.reelsPerDay = a.reels_per_day;
      if (a.reel_platforms !== undefined) patch.reelPlatforms = a.reel_platforms;
      if (a.tiktok_privacy === null) patch.tiktokPostOptions = null;
      else if (a.tiktok_privacy !== undefined) {
        // Ten sam walidator co ekran publikacji Studia (wymóg audytu TikToka).
        const { parseTiktokPostOptions } = await import("@/lib/tiktok-upload");
        patch.tiktokPostOptions = parseTiktokPostOptions({
          privacyLevel: a.tiktok_privacy,
          disableComment: a.tiktok_disable_comment,
          disableDuet: a.tiktok_disable_duet,
          disableStitch: a.tiktok_disable_stitch,
          brandOrganic: a.tiktok_brand_organic,
          brandedContent: a.tiktok_branded_content,
        });
      }
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
    "Uruchamia przebieg agenta wzrostu teraz. `force` wymusza fazy: reel (nowa rolka mimo rolki na dziś — w trybie auto zleca render w HeyGen i publikację na wszystkie dostępne platformy!), create (nowy post — w trybie auto zaplanuje publikację!), engage (odpowiedzi na komentarze — realne odpowiedzi publiczne), improve (refleksja + kontrola stóp NBP). `dry_run=true` tylko planuje i pisze treść, nic nie zapisuje, nie zleca renderu ani nie publikuje. Tylko administrator.",
  inputSchema: {
    force: z
      .array(z.enum(["publish", "reel", "measure", "warm", "create", "engage", "improve"]))
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
    "Decyzja o poście albo rolce agenta wzrostu: approve (szkic posta → zaplanowana publikacja, termin z przeszłości przesuwa się na za 15 minut; szkic rolki → zlecenie renderu w Studiu i publikacja po renderze) albo cancel (anuluje szkic, rolkę w produkcji albo zaplanowaną publikację i jej wpisy w kolejkach). Tylko administrator.",
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
        if (payload?.format === "reel") {
          const { startReelProduction } = await import("@/lib/growth-agent/reel.server");
          const next = await startReelProduction(item_id, payload);
          return ok({
            item_id,
            stage: next.stage,
            studio_job_id: next.reel?.studioJobId,
            note: "Render trwa zwykle 10–40 minut; publikacja o zaplanowanej porze (albo zaraz po renderze, gdy pora minęła).",
          });
        }
        const { scheduleItem } = await import("@/lib/growth-agent/create.server");
        const next = await scheduleItem(item_id, payload);
        return ok({ item_id, stage: next.stage, slot: next.plan.slotIso, fb: next.fb });
      }
      if (!["awaiting_approval", "scheduled", "producing"].includes(payload?.stage)) {
        throw new Error(
          `Wpis jest na etapie „${payload?.stage}” — anulować można szkic, rolkę w produkcji albo zaplanowany.`,
        );
      }
      if (payload?.format === "reel") {
        const socialIds = (payload.reel?.social ?? []).map((x: any) => x.id);
        const ytIds = (payload.reel?.youtube ?? []).map((x: any) => x.id);
        if (socialIds.length)
          await s
            .from("social_publish_queue")
            .update({ status: "cancelled" })
            .in("id", socialIds)
            .in("status", ["pending"]);
        if (ytIds.length)
          await s
            .from("youtube_publish_queue")
            .update({ status: "cancelled" })
            .in("id", ytIds)
            .in("status", ["pending"]);
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
