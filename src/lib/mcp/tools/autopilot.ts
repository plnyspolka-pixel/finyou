// Autopilot agenta publikującego przez MCP (brief 2.1, 5.7, 5.8):
// status i zużycie, wyłącznik awaryjny, profile torów, limity, tryb,
// sprawdzenie treści bramką compliance i raport. Zmiana trybu / limitów /
// wznowienie po pauzie – tylko administrator (właściciel).
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
import { AUTOPILOT_MODES, CONTENT_KINDS, PUBLISH_PLATFORMS, TRACKS } from "@/lib/autopilot/types";
import { audienceProfilesPatchSchema } from "@/lib/autopilot/profiles";
import { autopilotLimitsSchema } from "@/lib/autopilot/safety";

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const ADMIN = ["administrator"] as const;

const db = async (ctx: ToolContext, admin = false) =>
  (admin ? await requireRolesAdmin(ctx, ADMIN) : await requireTeamAdmin(ctx)) as unknown as {
    from: (t: string) => any;
  };

export const autopilotStatus = defineTool({
  name: "autopilot_status",
  title: "Autopilot status",
  description:
    "Stan autopilota agenta publikującego: tryb (off / manual_review / semi_auto / full_autopilot), wyłącznik awaryjny, profile dwóch torów (pożyczkobiorca, inwestor), podział kadencji, limity, dzisiejsze zużycie (koszt AI, publikacje, błędy z rzędu) i wykryte anomalie. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { loadAutopilotConfig, loadUsage } = await import("@/lib/autopilot/state.server");
      const { detectAnomalies, evaluateGuards } = await import("@/lib/autopilot/safety");
      const cfg = await loadAutopilotConfig();
      const usage = await loadUsage();
      return ok({
        ...cfg,
        usage,
        anomalies: detectAnomalies(cfg.limits, usage),
        can_publish_now: evaluateGuards(cfg.state, cfg.limits, usage, { kind: "publish" }),
      });
    }),
});

export const autopilotKillSwitch = defineTool({
  name: "autopilot_kill_switch",
  title: "Autopilot kill switch",
  description:
    "Wyłącznik awaryjny autopilota: `paused: true` natychmiast wstrzymuje produkcję i publikację wpisów autopilota (ręczne publikacje zespołu działają dalej); `paused: false` wznawia (tylko administrator). Podaj powód – trafia do dziennika.",
  inputSchema: {
    paused: z.boolean(),
    reason: z.string().min(3).max(300),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      // Pauzę może włączyć każdy z zespołu, wznowić – tylko administrator.
      if (a.paused) await requireTeamAdmin(ctx);
      else await requireRolesAdmin(ctx, ADMIN);
      const { setAutopilotPaused } = await import("@/lib/autopilot/state.server");
      const cfg = await setAutopilotPaused({
        paused: a.paused,
        reason: a.reason,
        by: `mcp:${ctx.getUserEmail() ?? actorId(ctx)}`,
        actorId: actorId(ctx),
      });
      return ok({ state: cfg.state });
    }),
});

export const autopilotSetMode = defineTool({
  name: "autopilot_set_mode",
  title: "Set autopilot mode",
  description:
    "Zmienia tryb modułu autopilota (off / manual_review / semi_auto / full_autopilot). Decyzja właściciela – tylko administrator, wymaga `confirm: true`. Nie zmienia ai_growth_settings.automation_mode innych silników.",
  inputSchema: {
    mode: z.enum(AUTOPILOT_MODES),
    confirm: z.literal(true),
    reason: z.string().min(3).max(300),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await db(ctx, true);
      const { loadAutopilotConfig, logAutopilot } = await import("@/lib/autopilot/state.server");
      const cfg = await loadAutopilotConfig();
      if (!cfg.rowId) return fail("Brak wiersza ai_growth_settings.");
      const { error } = await s
        .from("ai_growth_settings")
        .update({ autopilot_mode: a.mode })
        .eq("id", cfg.rowId);
      if (error) return fail(error.message);
      await logAutopilot({
        action: "mode_change",
        status: "warning",
        summary: `Tryb autopilota: ${cfg.state.mode} → ${a.mode} (${a.reason})`,
        actor: actorId(ctx),
      });
      return ok({ previous: cfg.state.mode, mode: a.mode });
    }),
});

export const autopilotUpdateProfiles = defineTool({
  name: "autopilot_update_profiles",
  title: "Update autopilot audience profiles",
  description:
    "Zmienia profile torów (pożyczkobiorca / inwestor): grupa docelowa, ton, CTA, tematy, frazy zakazane, sloty, rolki/tydz., budżet AI toru, wartość leada. Pola podane nadpisują zapisane; budżet reklam (`monthlyAdBudgetPln`) zmienia tylko administrator przez `autopilot_update_limits`. Tylko administrator/operator.",
  inputSchema: { profiles: audienceProfilesPatchSchema },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await db(ctx);
      const { loadAutopilotConfig, logAutopilot } = await import("@/lib/autopilot/state.server");
      const { resolveProfiles } = await import("@/lib/autopilot/profiles");
      const cfg = await loadAutopilotConfig();
      if (!cfg.rowId) return fail("Brak wiersza ai_growth_settings.");
      const { data: row } = await s
        .from("ai_growth_settings")
        .select("audience_profiles")
        .eq("id", cfg.rowId)
        .single();
      const current = (row?.audience_profiles ?? {}) as Record<string, Record<string, unknown>>;
      const next: Record<string, Record<string, unknown>> = { ...current };
      for (const t of TRACKS) {
        const p = a.profiles[t];
        if (!p) continue;
        const { monthlyAdBudgetPln: _ignored, ...rest } = p;
        next[t] = { ...(current[t] ?? {}), ...rest };
      }
      const check = resolveProfiles({ audience_profiles: next });
      if (check.errors.length) return fail(check.errors.join(" | "));
      const { error } = await s
        .from("ai_growth_settings")
        .update({ audience_profiles: next })
        .eq("id", cfg.rowId);
      if (error) return fail(error.message);
      await logAutopilot({
        action: "profiles_update",
        summary: `Profile torów: ${Object.keys(a.profiles).join(", ")}`,
        payload: { patch: a.profiles },
        actor: actorId(ctx),
      });
      return ok({ profiles: check.profiles });
    }),
});

export const autopilotUpdateLimits = defineTool({
  name: "autopilot_update_limits",
  title: "Update autopilot limits",
  description:
    "Limity bezpieczników autopilota: dzienny budżet AI, minimum kredytów HeyGen, budżet podbić per tor i miesiąc, maks. publikacji/dobę/platformę, maks. maili/odbiorcę/tydzień, progi auto-pauzy. Tylko administrator (decyzja właściciela).",
  inputSchema: { limits: autopilotLimitsSchema.partial() },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await db(ctx, true);
      const { loadAutopilotConfig, logAutopilot } = await import("@/lib/autopilot/state.server");
      const cfg = await loadAutopilotConfig();
      if (!cfg.rowId) return fail("Brak wiersza ai_growth_settings.");
      const { data: row } = await s
        .from("ai_growth_settings")
        .select("autopilot_limits")
        .eq("id", cfg.rowId)
        .single();
      const next = { ...((row?.autopilot_limits ?? {}) as object), ...a.limits };
      const { error } = await s
        .from("ai_growth_settings")
        .update({ autopilot_limits: next })
        .eq("id", cfg.rowId);
      if (error) return fail(error.message);
      await logAutopilot({
        action: "limits_update",
        status: "warning",
        summary: `Limity: ${Object.keys(a.limits).join(", ")}`,
        payload: { patch: a.limits },
        actor: actorId(ctx),
      });
      return ok({ limits: (await loadAutopilotConfig()).limits });
    }),
});

export const autopilotCheckCompliance = defineTool({
  name: "autopilot_check_compliance",
  title: "Check content with compliance gate",
  description:
    "Sprawdza treść bramką compliance autopilota. `mode: rules` – tylko reguły twarde (bez kosztu); `mode: full` – reguły + niezależny recenzent LLM + pętla poprawek (maks. 3), decyzja zapisana w dzienniku. Zwraca status (passed / rewritten / rejected), finalny tekst i uwagi. Tylko administrator/operator.",
  inputSchema: {
    text: z.string().min(3).max(20000),
    kind: z.enum(CONTENT_KINDS),
    track: z.enum(TRACKS).optional(),
    platform: z.enum(PUBLISH_PLATFORMS).optional(),
    mode: z.enum(["rules", "full"]).default("rules"),
  },
  annotations: { ...WRITE, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const ctxRule = { kind: a.kind, track: a.track ?? null, platform: a.platform ?? null };
      if (a.mode === "rules") {
        const { evaluateCompliance, applyRequiredElements, COMPLIANCE_RULES_VERSION } =
          await import("@/lib/autopilot/compliance-rules");
        const r = evaluateCompliance(a.text, ctxRule);
        return ok({
          rules_version: COMPLIANCE_RULES_VERSION,
          ...r,
          with_required_elements: applyRequiredElements(a.text, ctxRule),
        });
      }
      const { runComplianceGate } = await import("@/lib/autopilot/compliance-gate.server");
      const r = await runComplianceGate({
        text: a.text,
        ctx: ctxRule,
        ref: { source: "mcp", by: actorId(ctx) },
      });
      return ok(r);
    }),
});

export const autopilotReport = defineTool({
  name: "autopilot_report",
  title: "Autopilot report",
  description:
    "Raport autopilota za ostatnie N dni (1 = dzienny, 7 = tygodniowy): publikacje, mediana wyświetleń, zapisy na listę, leady i koszt per tor, outliery, zmiany agenta i alarmy. Nic nie wysyła. Tylko administrator/operator.",
  inputSchema: { days: z.number().int().min(1).max(90).default(7) },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { buildAutopilotReport } = await import("@/lib/autopilot/report.server");
      return ok(await buildAutopilotReport({ days: a.days }));
    }),
});

export const autopilotCalculators = defineTool({
  name: "autopilot_calculators",
  title: "Lead-magnet calculators",
  description:
    "Narzędzia-lead-magnety budowane z konfiguracji (silnik kalkulatorów na zweryfikowanych funkcjach systemu): lista konfiguracji z wynikiem kontroli jakości, opcjonalnie obliczenie dla podanych danych (`slug` + `input`). Tylko administrator/operator.",
  inputSchema: {
    slug: z.string().optional(),
    input: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { STARTER_CALCULATORS } = await import("@/lib/autopilot/calculators");
      const { runCalculator, verifyCalculator } = await import("@/lib/autopilot/calculator-engine");
      if (a.slug) {
        const cfg = STARTER_CALCULATORS.find((c) => c.slug === a.slug);
        if (!cfg) return fail(`Nie ma narzędzia ${a.slug}.`);
        return ok({
          config: cfg,
          result: a.input ? runCalculator(cfg, a.input, { unlocked: true }) : null,
        });
      }
      return ok({
        calculators: STARTER_CALCULATORS.map((c) => ({
          slug: c.slug,
          track: c.track,
          keyword: c.keyword,
          title: c.title,
          qc: verifyCalculator(c),
        })),
      });
    }),
});

export const autopilotProvisionTools = defineTool({
  name: "autopilot_provision_tools",
  title: "Provision lead-magnet tools",
  description:
    "Zakłada albo aktualizuje rekordy lead magnetów dla narzędzi-kalkulatorów (/narzedzie/<slug>, hasła ILE / RATA / LTV): kontrola jakości formuł i reguły compliance, zgoda RODO i automat „komentarz z hasłem → link” z mechanizmu lead magnetów. `publish: true` otwiera zapisy i reakcje na hasło (tylko administrator). W trybie full_autopilot tick robi to sam.",
  inputSchema: { publish: z.boolean().default(false) },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      if (a.publish) await requireRolesAdmin(ctx, ADMIN);
      else await requireTeamAdmin(ctx);
      const { ensureToolMagnets } = await import("@/lib/autopilot/tools.server");
      return ok({ tools: await ensureToolMagnets({ publish: a.publish, actor: actorId(ctx) }) });
    }),
});

export const autopilotTools = [
  autopilotStatus,
  autopilotKillSwitch,
  autopilotSetMode,
  autopilotUpdateProfiles,
  autopilotUpdateLimits,
  autopilotCheckCompliance,
  autopilotReport,
  autopilotCalculators,
  autopilotProvisionTools,
];
