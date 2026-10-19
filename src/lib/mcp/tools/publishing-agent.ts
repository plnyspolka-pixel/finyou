// Agent publikujący (docs/agent-publikujacy/BRIEF_DLA_CLAUDE_CODE.md) przez MCP:
// stan modułu, wyłącznik awaryjny, ustawienia i profile torów, sprawdzenie
// treści bramką compliance, audyt decyzji i ręczny tick (raport).
//
// Reguł compliance NIE da się zmienić przez MCP — są w kodzie
// (src/lib/publishing-agent/compliance-rules.ts), zmiana = commit.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { actorId, fail, handle, ok, requireRolesAdmin, requireTeamAdmin } from "../_helpers";

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const WRITE_IDEMPOTENT = {
  readOnlyHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const WRITE = { readOnlyHint: false, idempotentHint: false, openWorldHint: true } as const;

const TRACK = z.enum(["pozyczkobiorca", "inwestor"]);
const KIND = z.enum([
  "video_script",
  "caption",
  "title",
  "comment_reply",
  "email",
  "lead_magnet",
  "page",
  "ad",
  "article",
]);

export const getPublishingAgentStatus = defineTool({
  name: "get_publishing_agent_status",
  title: "Get publishing agent status",
  description:
    "Stan agenta publikującego: tryb (off / manual_review / semi_auto / full_autopilot), wyłącznik awaryjny i automatyczna pauza, limity (budżet AI, publikacje na dobę, maile), wyłączone platformy, profile dwóch torów (pożyczkobiorca, inwestor), wydany dziś budżet AI i wersja reguł compliance. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { getAgentSettings, getAudienceProfiles, aiSpentTodayPln } =
        await import("@/lib/publishing-agent/agent-settings.server");
      const { COMPLIANCE_RULES_VERSION } = await import("@/lib/publishing-agent/compliance-rules");
      const { isAgentPaused } = await import("@/lib/publishing-agent/safeguards");
      const settings = await getAgentSettings();
      return ok({
        settings,
        paused: isAgentPaused(settings),
        profiles: await getAudienceProfiles(),
        ai_spent_today_pln: await aiSpentTodayPln(),
        compliance_rules_version: COMPLIANCE_RULES_VERSION,
        migration_applied: settings.available,
      });
    }),
});

export const setPublishingAgentKillSwitch = defineTool({
  name: "set_publishing_agent_kill_switch",
  title: "Publishing agent kill switch",
  description:
    "Wyłącznik awaryjny agenta publikującego. `on: true` natychmiast wstrzymuje cały moduł (planowanie, produkcja, publikacje wpisów agenta, odpowiedzi, maile, podbicia) — może włączyć administrator lub operator. `on: false` wznawia pracę i zdejmuje automatyczną pauzę — tylko administrator.",
  inputSchema: {
    on: z.boolean().describe("true = pauza całego modułu, false = wznowienie."),
    reason: z.string().max(500).optional().describe("Powód (trafia do dziennika i raportu)."),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      if (a.on) await requireTeamAdmin(ctx);
      else await requireRolesAdmin(ctx, ["administrator"]);
      const { setKillSwitch } = await import("@/lib/publishing-agent/agent-settings.server");
      const r = await setKillSwitch({ on: a.on, reason: a.reason ?? null, actor: actorId(ctx) });
      if (!r.ok) return fail(r.error ?? "Nie udało się zmienić wyłącznika.");
      return ok({ kill_switch: a.on });
    }),
});

export const updatePublishingAgentSettings = defineTool({
  name: "update_publishing_agent_settings",
  title: "Update publishing agent settings",
  description:
    "Zmienia ustawienia modułu agenta publikującego: tryb, dzienny budżet AI, limity publikacji i maili, wyłączone platformy (np. ['x']), progi anomalii, double opt-in, telefon i e-mail właściciela do alarmów i raportów, godzinę raportu. `full_autopilot` = agent publikuje, odpowiada i wysyła sam w limitach. Tylko administrator.",
  inputSchema: {
    mode: z.enum(["off", "manual_review", "semi_auto", "full_autopilot"]).optional(),
    daily_ai_budget_pln: z.number().min(0).max(5000).optional(),
    monthly_heygen_credit_limit: z.number().int().min(0).nullable().optional(),
    max_posts_per_day_per_platform: z.number().int().min(0).max(50).optional(),
    max_emails_per_recipient_per_week: z.number().int().min(0).max(20).optional(),
    disabled_platforms: z.array(z.string().min(1)).max(10).optional(),
    max_consecutive_publish_failures: z.number().int().min(1).max(50).optional(),
    cost_spike_factor: z.number().min(1).max(50).optional(),
    double_opt_in: z.boolean().optional(),
    owner_phone: z.string().max(30).nullable().optional(),
    owner_email: z.string().email().nullable().optional(),
    daily_report_hour: z.number().int().min(0).max(23).optional(),
    weekly_report_dow: z.number().int().min(0).max(6).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ["administrator"]);
      const patch = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
      if (Object.keys(patch).length === 0) return fail("Brak zmian.");
      const { data, error } = await s
        .from("publishing_agent_settings")
        .update({ ...patch, updated_by: actorId(ctx) })
        .eq("id", true)
        .select("*")
        .single();
      if (error) return fail(error.message);
      const { logAgentAction } = await import("@/lib/publishing-agent/agent-settings.server");
      await logAgentAction({
        action: "settings_update",
        status: "info",
        summary: `Zmiana ustawień agenta: ${Object.keys(patch).join(", ")}`,
        payload: { patch, actor: actorId(ctx) },
      });
      return ok({ settings: data });
    }),
});

export const updateAudienceProfile = defineTool({
  name: "update_audience_profile",
  title: "Update audience track profile",
  description:
    "Zmienia profil toru odbiorców agenta (pożyczkobiorca — firmy, cel gospodarczy; inwestor): grupa docelowa, ton, CTA, tematy, zakazane frazy (dokładane do reguł twardych w kodzie, nie zamiast nich), sloty publikacji, udział w kadencji, cele tygodniowe, miesięczny budżet reklam toru. Tylko administrator.",
  inputSchema: {
    track: TRACK,
    target_audience: z.string().min(10).max(1000).optional(),
    tone: z.string().min(10).max(2000).optional(),
    primary_cta_url: z.string().url().optional(),
    allowed_topics: z.array(z.string().min(2)).max(50).optional(),
    forbidden_phrases: z.array(z.string().min(2)).max(100).optional(),
    publish_slots: z.record(z.array(z.string().regex(/^\d{2}:\d{2}$/))).optional(),
    cadence_share_pct: z.number().min(0).max(100).optional(),
    weekly_reels_target: z.number().int().min(0).max(50).optional(),
    weekly_long_target: z.number().int().min(0).max(10).optional(),
    monthly_ads_budget_pln: z.number().min(0).optional(),
    active: z.boolean().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ["administrator"]);
      const { track, ...rest } = a;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (Object.keys(patch).length === 0) return fail("Brak zmian.");
      const { data, error } = await s
        .from("ai_audience_profiles")
        .update({ ...patch, updated_by: actorId(ctx) })
        .eq("track", track)
        .select("*")
        .single();
      if (error) return fail(error.message);
      return ok({ profile: data });
    }),
});

export const checkContentCompliance = defineTool({
  name: "check_content_compliance",
  title: "Check content with compliance gate",
  description:
    "Sprawdza tekst bramką compliance agenta (reguły twarde w kodzie, wersjonowane): obietnice zysku, gwarancje, stopy zwrotu, ceny w wideo, zamknięte grupy, kierowanie do konsumentów, presja czasu, dane osobowe itd. Zwraca naruszenia z podpowiedzią poprawki oraz brakujące elementy obowiązkowe (oznaczenie AI, KRS, linia ryzyka). `with_reviewer: true` dokłada ocenę niezależnego recenzenta LLM (zużywa kredyty AI). Nic nie zapisuje. Tylko administrator/operator.",
  inputSchema: {
    text: z.string().min(1).max(20000),
    kind: KIND.default("caption"),
    track: TRACK.optional(),
    ai_generated: z.boolean().default(true),
    with_reviewer: z.boolean().default(false),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const rules = await import("@/lib/publishing-agent/compliance-rules");
      const c = { kind: a.kind, track: a.track ?? null, aiGenerated: a.ai_generated };
      const violations = rules.checkHardRules(a.text, c);
      const missing = rules.missingMandatoryElements(a.text, c);
      let reviewer = null;
      if (a.with_reviewer && violations.length === 0) {
        const { reviewWithLlm } = await import("@/lib/publishing-agent/compliance-gate.server");
        reviewer = await reviewWithLlm(a.text, c);
      }
      return ok({
        rules_version: rules.COMPLIANCE_RULES_VERSION,
        passes_hard_rules: violations.length === 0,
        violations,
        missing_mandatory: missing,
        reviewer,
      });
    }),
});

export const listComplianceChecks = defineTool({
  name: "list_compliance_checks",
  title: "List compliance gate decisions",
  description:
    "Audyt bramki compliance agenta: każda decyzja (pass / fixed / rewrite / reject) z wersją reguł, naruszeniami, dopisanymi elementami, oceną recenzenta i finalnym tekstem. Filtry: decyzja, obiekt (np. social_publish_queue), od kiedy. Tylko administrator/operator.",
  inputSchema: {
    decision: z.enum(["pass", "fixed", "rewrite", "reject"]).optional(),
    subject_type: z.string().min(1).optional(),
    subject_id: z.string().min(1).optional(),
    since: z.string().optional().describe("ISO 8601 / YYYY-MM-DD"),
    limit: z.number().int().min(1).max(100).default(20),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      let q = s
        .from("ai_compliance_checks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(a.limit);
      if (a.decision) q = q.eq("decision", a.decision);
      if (a.subject_type) q = q.eq("subject_type", a.subject_type);
      if (a.subject_id) q = q.eq("subject_id", a.subject_id);
      if (a.since) q = q.gte("created_at", a.since);
      const { data, error } = await q;
      if (error) return fail(error.message);
      return ok({ checks: data });
    }),
});

export const runPublishingAgentTickTool = defineTool({
  name: "run_publishing_agent_tick",
  title: "Run publishing agent tick",
  description:
    "Uruchamia od ręki tick agenta publikującego: wykrywanie anomalii (z automatyczną pauzą i alarmem SMS), import metryk publikacji i opcjonalnie raport (`report: daily | weekly`, wysyłany e-mailem do właściciela). Nie publikuje niczego. Tylko administrator/operator.",
  inputSchema: { report: z.enum(["daily", "weekly"]).optional() },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { runPublishingAgentTick } = await import("@/lib/publishing-agent/agent-tick.server");
      return ok(await runPublishingAgentTick({ forceReport: a.report }));
    }),
});

export const publishingAgentTools = [
  getPublishingAgentStatus,
  setPublishingAgentKillSwitch,
  updatePublishingAgentSettings,
  updateAudienceProfile,
  checkContentCompliance,
  listComplianceChecks,
  runPublishingAgentTickTool,
];
