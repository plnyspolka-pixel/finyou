// Stan autopilota agenta publikującego: ustawienia (ai_growth_settings),
// profile torów (ai_audience_profiles), wyłącznik awaryjny, dziennik decyzji
// (ai_growth_action_log) i alarm SMS do właściciela. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Track } from "./compliance-rules";

/** Nazwa modułu w ai_growth_action_log dla wszystkich decyzji autopilota. */
export const AUTOPILOT_MODULE = "publishing_autopilot";
export const COMPLIANCE_MODULE = "compliance_gate";

export type AutopilotMode = "off" | "manual_review" | "semi_auto" | "full_autopilot";

export type AutopilotSettings = {
  id: string;
  videoModuleMode: AutopilotMode;
  killSwitch: boolean;
  killSwitchReason: string | null;
  disabledPlatforms: string[];
  dailyAiBudgetPln: number;
  maxPostsPerDayPerAccount: number;
  maxEmailsPerRecipientPerWeek: number;
  heygenDailyVideosLimit: number;
  anomalyFailuresThreshold: number;
  ownerAlertPhone: string | null;
  lastDailyReportOn: string | null;
  lastWeeklyReportOn: string | null;
};

export type AudienceProfile = {
  track: Track;
  label: string;
  targetAudience: string;
  tone: string;
  ctaUrl: string;
  ctaLabel: string;
  leadMagnetAudience: "klient" | "inwestor";
  blogAudience: "borrower" | "investor";
  series: string[];
  slots: { platform: string; time: string; weekdays: number[] }[];
  cadenceShare: number;
  weeklyReelsTarget: number;
  dailyAiBudgetPln: number;
  adsMonthlyBudgetPln: number;
  active: boolean;
};

/** Wartości bezpieczne, gdy migracja jeszcze nie weszła (kolumn brak). */
const SAFE_DEFAULTS: Omit<AutopilotSettings, "id"> = {
  videoModuleMode: "off",
  killSwitch: false,
  killSwitchReason: null,
  disabledPlatforms: ["x"],
  dailyAiBudgetPln: 50,
  maxPostsPerDayPerAccount: 4,
  maxEmailsPerRecipientPerWeek: 3,
  heygenDailyVideosLimit: 4,
  anomalyFailuresThreshold: 3,
  ownerAlertPhone: null,
  lastDailyReportOn: null,
  lastWeeklyReportOn: null,
};

export async function loadAutopilotSettings(): Promise<AutopilotSettings> {
  const { data } = await supabaseAdmin.from("ai_growth_settings").select("*").limit(1).maybeSingle();
  const r = (data ?? {}) as Record<string, any>;
  const mode = r.video_module_mode as AutopilotMode | undefined;
  return {
    id: String(r.id ?? ""),
    videoModuleMode: mode ?? SAFE_DEFAULTS.videoModuleMode,
    killSwitch: r.kill_switch === true,
    killSwitchReason: r.kill_switch_reason ?? null,
    disabledPlatforms: Array.isArray(r.disabled_platforms)
      ? r.disabled_platforms
      : SAFE_DEFAULTS.disabledPlatforms,
    dailyAiBudgetPln: Number(r.daily_ai_budget_pln ?? SAFE_DEFAULTS.dailyAiBudgetPln),
    maxPostsPerDayPerAccount: Number(
      r.max_posts_per_day_per_account ?? SAFE_DEFAULTS.maxPostsPerDayPerAccount,
    ),
    maxEmailsPerRecipientPerWeek: Number(
      r.max_emails_per_recipient_per_week ?? SAFE_DEFAULTS.maxEmailsPerRecipientPerWeek,
    ),
    heygenDailyVideosLimit: Number(
      r.heygen_daily_videos_limit ?? SAFE_DEFAULTS.heygenDailyVideosLimit,
    ),
    anomalyFailuresThreshold: Number(
      r.anomaly_failures_threshold ?? SAFE_DEFAULTS.anomalyFailuresThreshold,
    ),
    ownerAlertPhone: r.owner_alert_phone ?? null,
    lastDailyReportOn: r.last_daily_report_on ?? null,
    lastWeeklyReportOn: r.last_weekly_report_on ?? null,
  };
}

export async function loadAudienceProfiles(): Promise<AudienceProfile[]> {
  const { data, error } = await supabaseAdmin.from("ai_audience_profiles").select("*");
  if (error) return [];
  return (data ?? []).map((r) => ({
    track: r.track as Track,
    label: r.label,
    targetAudience: r.target_audience,
    tone: r.tone,
    ctaUrl: r.cta_url,
    ctaLabel: r.cta_label,
    leadMagnetAudience: r.lead_magnet_audience as "klient" | "inwestor",
    blogAudience: r.blog_audience as "borrower" | "investor",
    series: r.series ?? [],
    slots: Array.isArray(r.slots) ? (r.slots as AudienceProfile["slots"]) : [],
    cadenceShare: Number(r.cadence_share),
    weeklyReelsTarget: Number(r.weekly_reels_target),
    dailyAiBudgetPln: Number(r.daily_ai_budget_pln),
    adsMonthlyBudgetPln: Number(r.ads_monthly_budget_pln),
    active: r.active,
  }));
}

/** Autopilot może produkować/publikować sam tylko w full_autopilot i bez kill switcha. */
export function autopilotMayAct(s: AutopilotSettings): boolean {
  return s.videoModuleMode === "full_autopilot" && !s.killSwitch;
}

export async function logAutopilotAction(entry: {
  module?: string;
  action: string;
  status?: "ok" | "blocked" | "error" | "warning" | "skipped";
  summary: string;
  payload?: Record<string, unknown>;
  costPln?: number;
  actor?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("ai_growth_action_log").insert({
    module: entry.module ?? AUTOPILOT_MODULE,
    action: entry.action,
    status: entry.status ?? "ok",
    summary: entry.summary.slice(0, 1000),
    payload: (entry.payload ?? {}) as never,
    cost_pln: entry.costPln ?? 0,
    actor: entry.actor ?? null,
  });
  if (error) console.warn(`[autopilot] log: ${error.message}`);
}

/**
 * Wyłącznik awaryjny (panel / MCP / automatyczna pauza przy anomalii).
 * Włączenie zatrzymuje produkcję i publikację wpisów autopilota; ręczne
 * publikacje z kolejek działają dalej.
 */
export async function setKillSwitch(opts: {
  on: boolean;
  reason: string;
  actor?: string | null;
  source: "panel" | "mcp" | "anomaly";
}): Promise<AutopilotSettings> {
  const s = await loadAutopilotSettings();
  if (!s.id) throw new Error("Brak rekordu ai_growth_settings");
  const { error } = await supabaseAdmin
    .from("ai_growth_settings")
    .update({
      kill_switch: opts.on,
      kill_switch_reason: opts.on ? opts.reason.slice(0, 500) : null,
      kill_switch_at: new Date().toISOString(),
      ...(opts.actor ? { updated_by: opts.actor } : {}),
    })
    .eq("id", s.id);
  if (error) throw new Error(error.message);
  await logAutopilotAction({
    action: opts.on ? "kill_switch_on" : "kill_switch_off",
    status: opts.on ? "blocked" : "ok",
    summary: `${opts.on ? "Wyłącznik awaryjny WŁĄCZONY" : "Wyłącznik awaryjny zwolniony"} (${opts.source}): ${opts.reason}`,
    payload: { source: opts.source },
    actor: opts.actor ?? null,
  });
  return { ...s, killSwitch: opts.on, killSwitchReason: opts.on ? opts.reason : null };
}

/**
 * SMS do właściciela — tylko alarmy i raport dzienny (brief 5.8). Bez numeru
 * w `owner_alert_phone` nic nie wysyła (wpis w dzienniku zostaje).
 */
export async function notifyOwner(
  body: string,
  kind: "alarm" | "report",
): Promise<{ sent: boolean; reason?: string }> {
  const s = await loadAutopilotSettings();
  if (!s.ownerAlertPhone) {
    await logAutopilotAction({
      module: "agent_owner",
      action: kind === "alarm" ? "alarm_not_sent" : "report_not_sent",
      status: "skipped",
      summary: `Brak owner_alert_phone — SMS nie wysłany: ${body}`,
    });
    return { sent: false, reason: "no_phone" };
  }
  const { sendSmsInternal } = await import("@/lib/voicebot.functions");
  const res = await sendSmsInternal({
    phone: s.ownerAlertPhone,
    body: body.slice(0, 600),
    source: `autopilot_${kind}`,
    category: "critical",
  });
  await logAutopilotAction({
    module: "agent_owner",
    action: "sms",
    status: res.ok ? "ok" : "error",
    summary: `SMS do właściciela (${kind}): ${body}`.slice(0, 1000),
    payload: { error: res.error ?? null, sid: res.sid ?? null },
  });
  return { sent: res.ok, reason: res.error };
}
