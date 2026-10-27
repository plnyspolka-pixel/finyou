// Stan autopilota: ustawienia (singleton ai_growth_settings), wyłącznik
// awaryjny, zużycie (koszty, publikacje, błędy), strażnik anomalii i SMS
// alarmowy do właściciela. Każda decyzja → ai_growth_action_log (module=autopilot).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { formatDatePl, warsawDateParts } from "./date-context";
import { parseSplit, resolveProfiles, type AudienceProfile, type CadenceSplit } from "./profiles";
import {
  detectAnomalies,
  resolveLimits,
  type Anomaly,
  type AutopilotLimits,
  type AutopilotState,
  type AutopilotUsage,
} from "./safety";
import {
  AUTOPILOT_LOG_MODULE,
  AUTOPILOT_MODES,
  type AutopilotMode,
  type PublishPlatform,
  type Track,
} from "./types";

export interface AutopilotConfig {
  rowId: string | null;
  state: AutopilotState;
  profiles: Record<Track, AudienceProfile>;
  profileErrors: string[];
  split: CadenceSplit;
  splitUpdatedAt: string | null;
  limits: AutopilotLimits;
}

type SettingsRow = {
  id: string;
  target_audience: string | null;
  primary_cta_url: string | null;
  daily_ai_budget_pln: number | string | null;
  autopilot_mode?: string | null;
  autopilot_paused?: boolean | null;
  autopilot_paused_reason?: string | null;
  audience_profiles?: unknown;
  cadence_split?: unknown;
  cadence_split_updated_at?: string | null;
  autopilot_limits?: unknown;
};

const db = supabaseAdmin as unknown as {
  from: (t: string) => any;
};

export async function loadAutopilotConfig(): Promise<AutopilotConfig> {
  const { data } = await db.from("ai_growth_settings").select("*").limit(1).maybeSingle();
  const row = (data ?? null) as SettingsRow | null;
  const mode = (AUTOPILOT_MODES as readonly string[]).includes(String(row?.autopilot_mode))
    ? (row!.autopilot_mode as AutopilotMode)
    : "manual_review";
  const { profiles, errors } = resolveProfiles(row ?? {});
  return {
    rowId: row?.id ?? null,
    state: {
      mode,
      paused: !!row?.autopilot_paused,
      pausedReason: row?.autopilot_paused_reason ?? null,
    },
    profiles,
    profileErrors: errors,
    split: parseSplit(row?.cadence_split),
    splitUpdatedAt: row?.cadence_split_updated_at ?? null,
    limits: resolveLimits(
      row?.autopilot_limits,
      row?.daily_ai_budget_pln != null ? Number(row.daily_ai_budget_pln) : null,
    ),
  };
}

export async function logAutopilot(entry: {
  action: string;
  status?: "ok" | "warning" | "blocked" | "error";
  summary: string;
  payload?: Record<string, unknown>;
  costPln?: number;
  actor?: string | null;
}): Promise<void> {
  await db.from("ai_growth_action_log").insert({
    module: AUTOPILOT_LOG_MODULE,
    action: entry.action,
    status: entry.status ?? "ok",
    summary: entry.summary.slice(0, 500),
    payload: entry.payload ?? {},
    cost_pln: entry.costPln ?? 0,
    actor: entry.actor ?? null,
  });
}

/** Wyłącznik awaryjny (panel / MCP / strażnik anomalii). */
export async function setAutopilotPaused(opts: {
  paused: boolean;
  reason: string;
  by: string;
  actorId?: string | null;
}): Promise<AutopilotConfig> {
  const cfg = await loadAutopilotConfig();
  if (!cfg.rowId) throw new Error("Brak wiersza ai_growth_settings.");
  const { error } = await db
    .from("ai_growth_settings")
    .update({
      autopilot_paused: opts.paused,
      autopilot_paused_reason: opts.paused ? opts.reason.slice(0, 300) : null,
      autopilot_paused_at: opts.paused ? new Date().toISOString() : null,
      autopilot_paused_by: opts.paused ? opts.by : null,
    })
    .eq("id", cfg.rowId);
  if (error) throw new Error(error.message);
  await logAutopilot({
    action: opts.paused ? "kill_switch_on" : "kill_switch_off",
    status: opts.paused ? "warning" : "ok",
    summary: `${opts.paused ? "PAUZA" : "Wznowienie"} autopilota (${opts.by}): ${opts.reason}`,
    actor: opts.actorId ?? null,
  });
  return loadAutopilotConfig();
}

/**
 * Pochodzenie wpisów kolejek, które ticki publikacji mogą teraz brać.
 * Pauza autopilota wstrzymuje WYŁĄCZNIE wpisy autopilota – ręczne publikacje
 * zespołu idą dalej. `null` = migracja autopilota jeszcze niewdrożona
 * (brak kolumny `origin`) – wtedy ticki działają jak dotąd, bez filtra.
 */
export async function allowedQueueOrigins(): Promise<string[] | null> {
  try {
    const { data } = await db.from("ai_growth_settings").select("*").limit(1).maybeSingle();
    if (!data || !("autopilot_paused" in data)) return null;
    const mode = String(data.autopilot_mode ?? "manual_review");
    return data.autopilot_paused || mode === "off" ? ["manual"] : ["manual", "autopilot"];
  } catch {
    return null;
  }
}

/**
 * Dokłada do zapytania o wymagalne wpisy filtr pochodzenia (wyłącznik
 * awaryjny). Zwraca zapytanie – `await withOriginFilter(q)` je wykonuje.
 */
export async function withOriginFilter<Q extends { in: (column: string, values: string[]) => Q }>(
  query: Q,
): Promise<Q> {
  const origins = await allowedQueueOrigins();
  return origins ? query.in("origin", origins) : query;
}

export function warsawDayStartIso(now: Date): string {
  const p = warsawDateParts(now);
  // Północ w Warszawie ≈ 22:00/23:00 UTC poprzedniego dnia – liczymy przez offset.
  const local = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const offsetMin =
    (new Date(now.toLocaleString("en-US", { timeZone: "Europe/Warsaw" })).getTime() -
      new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime()) /
    60_000;
  return new Date(local.getTime() - offsetMin * 60_000).toISOString();
}

const COST_MODULES = [AUTOPILOT_LOG_MODULE, "compliance_gate", "growth_agent"];

export async function loadUsage(now: Date = new Date()): Promise<AutopilotUsage> {
  const dayStart = warsawDayStartIso(now);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();

  const [costToday, cost7d, socialToday, ytToday, recentSocial, recentYt, signals, qc] =
    await Promise.all([
      db
        .from("ai_growth_action_log")
        .select("cost_pln")
        .in("module", COST_MODULES)
        .gte("created_at", dayStart),
      db
        .from("ai_growth_action_log")
        .select("cost_pln")
        .in("module", COST_MODULES)
        .gte("created_at", weekAgo)
        .lt("created_at", dayStart),
      db
        .from("social_publish_queue")
        .select("platform")
        .eq("status", "published")
        .gte("published_at", dayStart),
      db
        .from("youtube_publish_queue")
        .select("id")
        .eq("status", "published")
        .gte("published_at", dayStart),
      db
        .from("social_publish_queue")
        .select("status, updated_at")
        .in("status", ["published", "failed"])
        .order("updated_at", { ascending: false })
        .limit(20),
      db
        .from("youtube_publish_queue")
        .select("status, updated_at")
        .in("status", ["published", "failed"])
        .order("updated_at", { ascending: false })
        .limit(20),
      db
        .from("ai_growth_action_log")
        .select("id", { count: "exact", head: true })
        .eq("module", AUTOPILOT_LOG_MODULE)
        .eq("action", "platform_signal")
        .gte("created_at", dayAgo),
      db
        .from("ai_growth_action_log")
        .select("status")
        .eq("module", AUTOPILOT_LOG_MODULE)
        .eq("action", "qc_check")
        .gte("created_at", dayAgo),
    ]);

  const sum = (rows: { cost_pln: number | string | null }[] | null) =>
    (rows ?? []).reduce((a, r) => a + (Number(r.cost_pln) || 0), 0);

  const postsToday: Partial<Record<PublishPlatform, number>> = {};
  for (const r of (socialToday.data ?? []) as { platform: PublishPlatform }[]) {
    postsToday[r.platform] = (postsToday[r.platform] ?? 0) + 1;
  }
  postsToday.youtube = (ytToday.data ?? []).length;

  const merged = [
    ...((recentSocial.data ?? []) as any[]),
    ...((recentYt.data ?? []) as any[]),
  ].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  let consecutive = 0;
  for (const r of merged) {
    if (r.status === "failed") consecutive++;
    else break;
  }

  const qcRows = (qc.data ?? []) as { status: string }[];
  return {
    aiSpentTodayPln: Math.round(sum(costToday.data) * 100) / 100,
    aiSpentAvg7dPln: Math.round((sum(cost7d.data) / 7) * 100) / 100,
    postsToday,
    consecutivePublishFailures: consecutive,
    heygenRemainingCredits: null,
    adSpentMonthPln: { pozyczkobiorca: 0, inwestor: 0 },
    platformWarnings24h: signals.count ?? 0,
    qcChecks24h: qcRows.length,
    qcRejects24h: qcRows.filter((r) => r.status !== "ok").length,
  };
}

// ── Mail do właściciela (alarmy i raporty) ──────────────────────────────────
// Decyzja właściciela 27.10.2026: raporty i alarmy autopilota idą MAILEM, nie
// SMS-em. Adres: OWNER_ALERT_EMAIL albo integration_settings „autopilot_raporty”
// (owner-email.ts). Limit dobowy chroni skrzynkę przed pętlą ticków.

export const OWNER_EMAIL_MAX_PER_DAY = 6;

async function ownerEmailAddress(): Promise<string | null> {
  const { AUTOPILOT_REPORTS_INTEGRATION, ownerReportEmail } = await import("./owner-email");
  try {
    const { data } = await db
      .from("integration_settings")
      .select("is_enabled, configuration")
      .eq("integration_name", AUTOPILOT_REPORTS_INTEGRATION)
      .maybeSingle();
    return ownerReportEmail(data, process.env.OWNER_ALERT_EMAIL);
  } catch {
    return ownerReportEmail(null, process.env.OWNER_ALERT_EMAIL);
  }
}

export async function emailOwner(
  mail: { subject: string; text: string },
  kind: "alarm" | "report",
): Promise<{ sent: boolean; reason?: string }> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db
    .from("ai_growth_action_log")
    .select("id", { count: "exact", head: true })
    .eq("module", AUTOPILOT_LOG_MODULE)
    .eq("action", "owner_email")
    .gte("created_at", since);
  if ((count ?? 0) >= OWNER_EMAIL_MAX_PER_DAY)
    return { sent: false, reason: "Limit maili do właściciela na dobę." };
  const to = await ownerEmailAddress();
  if (!to) {
    await logAutopilot({
      action: "owner_email",
      status: "warning",
      summary: `Mail (${kind}) nie wysłany: brak adresu (OWNER_ALERT_EMAIL / integration_settings „autopilot_raporty”).`,
      payload: { subject: mail.subject },
    });
    return { sent: false, reason: "Brak adresu e-mail właściciela." };
  }
  const { sendResendEmail } = await import("@/lib/resend-send.server");
  const res = await sendResendEmail({
    to,
    subject: mail.subject,
    text: mail.text,
    fromName: "Autopilot Finance You",
  });
  await logAutopilot({
    action: "owner_email",
    status: res.ok ? "ok" : "error",
    summary:
      `Mail (${kind}) ${res.ok ? "wysłany" : `nie wysłany: ${res.error ?? "?"}`}: ${mail.subject}`.slice(
        0,
        500,
      ),
    payload: { to, subject: mail.subject, text: mail.text },
  });
  return { sent: res.ok, reason: res.error };
}

/**
 * Strażnik anomalii (co tick): anomalia → automatyczna pauza + mail alarmowy.
 * Nie wznawia sam – wznowienie jest decyzją właściciela.
 */
export async function runAutopilotWatchdog(now: Date = new Date()): Promise<{
  paused: boolean;
  anomalies: Anomaly[];
  usage: AutopilotUsage;
}> {
  const cfg = await loadAutopilotConfig();
  const usage = await loadUsage(now);
  // Strażnik działa tylko, gdy autopilot w ogóle coś robi.
  if (cfg.state.mode === "off" || cfg.state.mode === "manual_review") {
    return { paused: cfg.state.paused, anomalies: [], usage };
  }
  const anomalies = detectAnomalies(cfg.limits, usage);
  if (anomalies.length && !cfg.state.paused) {
    const reason = anomalies.map((a) => a.message).join(" ");
    await setAutopilotPaused({
      paused: true,
      reason: `Automatyczna pauza: ${reason}`,
      by: "watchdog",
    });
    const { buildAlarmEmail } = await import("./owner-email");
    await emailOwner(buildAlarmEmail(reason), "alarm");
    return { paused: true, anomalies, usage };
  }
  return { paused: cfg.state.paused, anomalies, usage };
}

export function reportPeriodLabel(now: Date): string {
  return formatDatePl(now);
}
