// Autopilot agenta publikującego przez MCP (docs/agent-publikujacy):
// stan, wyłącznik awaryjny, ustawienia modułu i limitów, profile dwóch torów,
// test treści na bramce compliance, raport na żądanie.
//
// Bezpieczeństwo: włączyć wyłącznik może każdy członek zespołu
// (administrator/operator) — zatrzymanie jest zawsze bezpieczne. Zwolnienie
// wyłącznika, zmiana trybu, limitów i profili — tylko administrator.
// Reguł twardych compliance NIE da się zmienić przez MCP (są w kodzie).
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  fail,
  handle,
  ok,
  requireRolesAdmin,
  requireTeamAdmin,
} from "../_helpers";

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const MODES = ["off", "manual_review", "semi_auto", "full_autopilot"] as const;
const PLATFORMS = [
  "youtube",
  "instagram_reels",
  "facebook_reels",
  "facebook_post",
  "tiktok",
  "x",
] as const;

export const getAutopilotStatus = defineTool({
  name: "get_autopilot_status",
  title: "Get publishing autopilot status",
  description:
    "Stan autopilota agenta publikującego: tryb modułu wideo/kanału (off / manual_review / semi_auto / full_autopilot), wyłącznik awaryjny i jego powód, wyłączone kanały, limity (posty/dobę, budżet AI, HeyGen, maile), profile dwóch torów (pożyczkobiorca, inwestor) ze slotami i budżetami, wersja reguł compliance, ostatnie decyzje z dziennika i blokady bramki. Tylko administrator/operator.",
  inputSchema: {
    log_limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Ile ostatnich wpisów dziennika (domyślnie 20)."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { COMPLIANCE_RULES_VERSION } = await import("@/lib/autopilot/compliance-rules");
      const { loadAutopilotSettings, loadAudienceProfiles } =
        await import("@/lib/autopilot/state.server");
      const [settings, profiles, log, checks] = await Promise.all([
        loadAutopilotSettings(),
        loadAudienceProfiles(),
        s
          .from("ai_growth_action_log")
          .select("module,action,status,summary,created_at")
          .in("module", [
            "publishing_autopilot",
            "compliance_gate",
            "agent_owner",
            "seo_content_engine",
          ])
          .order("created_at", { ascending: false })
          .limit(a.log_limit ?? 20),
        s
          .from("ai_compliance_checks")
          .select(
            "content_kind,track,result,iterations,ref_table,ref_id,created_at,hard_violations",
          )
          .in("result", ["rejected", "blocked"])
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      return ok({
        settings,
        profiles,
        compliance_rules_version: COMPLIANCE_RULES_VERSION,
        recent_log: log.data ?? [],
        recent_compliance_blocks: checks.data ?? [],
      });
    }),
});

export const setAutopilotKillSwitch = defineTool({
  name: "set_autopilot_kill_switch",
  title: "Set publishing autopilot kill switch",
  description:
    "Wyłącznik awaryjny autopilota: on=true zatrzymuje produkcję i publikację wpisów autopilota (ręczne publikacje działają dalej) — może każdy członek zespołu. on=false wznawia — tylko administrator. Decyzja trafia do dziennika.",
  inputSchema: {
    on: z.boolean(),
    reason: z.string().min(3).max(500),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      if (a.on) await requireTeamAdmin(ctx);
      else await requireRolesAdmin(ctx, ["administrator"]);
      const { setKillSwitch } = await import("@/lib/autopilot/state.server");
      const settings = await setKillSwitch({
        on: a.on,
        reason: a.reason,
        actor: actorId(ctx),
        source: "mcp",
      });
      return ok({ ok: true, kill_switch: settings.killSwitch, reason: settings.killSwitchReason });
    }),
});

export const updateAutopilotSettings = defineTool({
  name: "update_autopilot_settings",
  title: "Update publishing autopilot settings",
  description:
    "Ustawienia autopilota agenta publikującego: tryb modułu (video_module_mode — full_autopilot = agent produkuje i publikuje sam), wyłączone kanały, limity (posty na dobę na konto, maile na odbiorcę tygodniowo, filmy HeyGen na dobę, próg serii błędów do automatycznej pauzy), numer SMS i e-mail właściciela do alarmów i raportów. Tylko administrator.",
  inputSchema: {
    video_module_mode: z.enum(MODES).optional(),
    disabled_platforms: z.array(z.enum(PLATFORMS)).max(6).optional(),
    max_posts_per_day_per_account: z.number().int().min(0).max(50).optional(),
    max_emails_per_recipient_per_week: z.number().int().min(0).max(14).optional(),
    heygen_daily_videos_limit: z.number().int().min(0).max(100).optional(),
    anomaly_failures_threshold: z.number().int().min(1).max(50).optional(),
    owner_alert_phone: z
      .string()
      .regex(/^\+?\d{9,15}$/)
      .nullable()
      .optional(),
    owner_report_email: z.string().email().nullable().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ["administrator"]);
      const patch = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
      if (!Object.keys(patch).length) return fail("Podaj co najmniej jedno pole do zmiany.");
      const { data: row } = await s.from("ai_growth_settings").select("id").limit(1).maybeSingle();
      if (!row) return fail("Brak rekordu ai_growth_settings.");
      const { error } = await s
        .from("ai_growth_settings")
        .update({ ...patch, updated_by: actorId(ctx) })
        .eq("id", (row as { id: string }).id);
      if (error) return fail(error.message);
      const { logAutopilotAction } = await import("@/lib/autopilot/state.server");
      await logAutopilotAction({
        action: "settings_update",
        summary: `Zmiana ustawień autopilota: ${Object.keys(patch).join(", ")}`,
        payload: { patch },
        actor: actorId(ctx),
      });
      return ok({ ok: true, updated: Object.keys(patch) });
    }),
});

const slotSchema = z.object({
  platform: z.enum(PLATFORMS),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
});

export const updateAudienceProfile = defineTool({
  name: "update_audience_profile",
  title: "Update audience profile (track)",
  description:
    "Profil toru odbiorców autopilota: pozyczkobiorca (wyłącznie firmy, cel gospodarczy) albo inwestor — grupa docelowa, ton, CTA, dozwolone tematy, serie, sloty publikacji (czas Warszawy), udział w kadencji, cel rolek/tydz., budżet AI/dzień i budżet reklam/mies. (0 = podbicia wyłączone). Tylko administrator.",
  inputSchema: {
    track: z.enum(["pozyczkobiorca", "inwestor"]),
    target_audience: z.string().min(10).max(1000).optional(),
    tone: z.string().max(1000).optional(),
    cta_url: z.string().url().optional(),
    cta_label: z.string().max(120).optional(),
    allowed_topics: z.array(z.string().max(200)).max(50).optional(),
    series: z.array(z.string().max(120)).max(30).optional(),
    slots: z.array(slotSchema).max(30).optional(),
    cadence_share: z.number().min(0).max(1).optional(),
    weekly_reels_target: z.number().int().min(0).max(50).optional(),
    daily_ai_budget_pln: z.number().min(0).max(1000).optional(),
    ads_monthly_budget_pln: z.number().min(0).max(100000).optional(),
    active: z.boolean().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ["administrator"]);
      const { track, ...rest } = a;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (!Object.keys(patch).length) return fail("Podaj co najmniej jedno pole do zmiany.");
      const { error } = await s
        .from("ai_audience_profiles")
        .update({ ...patch, updated_by: actorId(ctx) })
        .eq("track", track);
      if (error) return fail(error.message);
      const { logAutopilotAction } = await import("@/lib/autopilot/state.server");
      await logAutopilotAction({
        action: "profile_update",
        summary: `Zmiana profilu toru ${track}: ${Object.keys(patch).join(", ")}`,
        payload: { track, patch },
        actor: actorId(ctx),
      });
      return ok({ ok: true, track, updated: Object.keys(patch) });
    }),
});

export const checkContentCompliance = defineTool({
  name: "check_content_compliance",
  title: "Check content against compliance gate",
  description:
    "Sprawdza tekst (scenariusz, podpis, tytuł, mail, stronę, reklamę) regułami twardymi bramki compliance (wersjonowane w kodzie) i pokazuje, co bramka doklei obowiązkowo (etykieta AI, linia ryzyka, KRS). Opcjonalnie recenzent LLM (zużywa kredyty AI). Nic nie zapisuje i nie publikuje. Tylko administrator/operator.",
  inputSchema: {
    text: z.string().min(1).max(20000),
    kind: z.enum([
      "video_script",
      "video_caption",
      "post_caption",
      "title",
      "comment_reply",
      "email",
      "lead_magnet",
      "landing",
      "ad",
      "blog_article",
    ]),
    track: z.enum(["pozyczkobiorca", "inwestor", "oba"]).optional(),
    with_reviewer: z.boolean().optional().describe("Także recenzent LLM (domyślnie nie)."),
  },
  annotations: { ...READ, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const rules = await import("@/lib/autopilot/compliance-rules");
      const track = a.track ?? rules.inferTrack(a.text);
      const violations = rules.checkHardRules(a.text, { track, kind: a.kind });
      const mandatory = rules.applyMandatoryElements(a.text, { track, kind: a.kind });
      let reviewer: unknown = null;
      if (a.with_reviewer && !violations.length) {
        const { reviewWithLlm } = await import("@/lib/autopilot/compliance.server");
        reviewer = await reviewWithLlm(a.text, { track, kind: a.kind });
      }
      return ok({
        rules_version: rules.COMPLIANCE_RULES_VERSION,
        track,
        passes_hard_rules: violations.length === 0,
        violations,
        mandatory_added: mandatory.added,
        text_after_mandatory: mandatory.text,
        reviewer,
      });
    }),
});

export const runAutopilotReport = defineTool({
  name: "get_autopilot_report",
  title: "Get publishing autopilot report",
  description:
    "Raport autopilota na żądanie (bez wysyłki SMS/maila): publikacje per tor, nieudane, blokady compliance, zapisy z lead magnetów, nowi subskrybenci, leady, wyniki per tor i outliery (≥ 3× mediany). Tylko administrator/operator.",
  inputSchema: { days: z.number().int().min(1).max(90).optional() },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { loadAutopilotSettings } = await import("@/lib/autopilot/state.server");
      const { buildReport } = await import("@/lib/autopilot/autopilot.server");
      const report = await buildReport(await loadAutopilotSettings(), a.days ?? 7);
      return ok(report);
    }),
});

export const runAutopilotTickNow = defineTool({
  name: "run_autopilot_tick",
  title: "Run publishing autopilot tick now",
  description:
    "Uruchamia przebieg autopilota teraz (to samo co cron co godzinę): anomalie, import metryk, raport (jeśli należny), a w trybie full_autopilot bez wyłącznika — planowanie gotowych rolek w slotach po bramce compliance. Tylko administrator.",
  inputSchema: {},
  annotations: WRITE,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ["administrator"]);
      const { runAutopilotTick } = await import("@/lib/autopilot/autopilot.server");
      return ok(await runAutopilotTick());
    }),
});

export const autopilotTools = [
  getAutopilotStatus,
  setAutopilotKillSwitch,
  updateAutopilotSettings,
  updateAudienceProfile,
  checkContentCompliance,
  runAutopilotReport,
  runAutopilotTickNow,
];
