/**
 * Agent publikujący — ustawienia modułu, profile torów, dziennik i alarmy.
 *
 * Odczyty są TOLERANCYJNE: gdy migracja `20261019180000_agent_publikujacy_fundament`
 * nie jest jeszcze wdrożona, zwracamy bezpieczne wartości domyślne (tryb
 * manual_review, X wyłączony), a zapisy do nowych tabel są best-effort.
 * Dzięki temu wdrożenie kodu przed migracją niczego nie psuje.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DEFAULT_AGENT_SETTINGS,
  type AgentAction,
  type AgentSettings,
  canAgentAct,
  type ActionContext,
  type ActionDecision,
} from "./safeguards";
import type { AudienceTrack } from "./compliance-rules";

export const AGENT_MODULE = "publishing_agent";

export interface AudienceProfile {
  track: AudienceTrack;
  label: string;
  target_audience: string;
  tone: string;
  primary_cta_url: string;
  material_audience: "klient" | "inwestor";
  allowed_topics: string[];
  forbidden_phrases: string[];
  publish_slots: Record<string, string[]>;
  cadence_share_pct: number;
  weekly_reels_target: number;
  weekly_long_target: number;
  monthly_ads_budget_pln: number;
  active: boolean;
}

export const DEFAULT_PROFILES: Record<AudienceTrack, AudienceProfile> = {
  pozyczkobiorca: {
    track: "pozyczkobiorca",
    label: "Pożyczkobiorcy (firmy, cel gospodarczy)",
    target_audience: "Przedsiębiorcy potrzebujący szybkiego finansowania pod zastaw nieruchomości.",
    tone: "Rzeczowo, po partnersku, klient jest bohaterem. Hook w formie pytania, konkret i liczba. Bez presji czasu.",
    primary_cta_url: "https://app.financeyou.pl/embed/wniosek",
    material_audience: "klient",
    allowed_topics: [],
    forbidden_phrases: [],
    publish_slots: { instagram_reels: ["16:15"], facebook_reels: ["16:20"], youtube: ["16:30"] },
    cadence_share_pct: 50,
    weekly_reels_target: 5,
    weekly_long_target: 1,
    monthly_ads_budget_pln: 0,
    active: true,
  },
  inwestor: {
    track: "inwestor",
    label: "Inwestorzy prywatni",
    target_audience:
      "Prywatni inwestorzy zainteresowani zarabianiem na nieruchomościach bez kupowania, budowania i remontowania.",
    tone: "Szanse, nie straszenie. Motyw szansy zawsze z beatem ryzyka. Hook-pytanie, CTA do obserwowania.",
    primary_cta_url: "https://financeyou.pl/dla-inwestora",
    material_audience: "inwestor",
    allowed_topics: [],
    forbidden_phrases: [],
    publish_slots: { instagram_reels: ["17:15"], facebook_reels: ["17:20"], youtube: ["17:30"] },
    cadence_share_pct: 50,
    weekly_reels_target: 5,
    weekly_long_target: 1,
    monthly_ads_budget_pln: 0,
    active: true,
  },
};

export async function getAgentSettings(): Promise<AgentSettings & { available: boolean }> {
  const { data, error } = await supabaseAdmin
    .from("publishing_agent_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_AGENT_SETTINGS, available: false };
  return {
    ...DEFAULT_AGENT_SETTINGS,
    ...data,
    mode: data.mode as AgentSettings["mode"],
    daily_ai_budget_pln: Number(data.daily_ai_budget_pln),
    cost_spike_factor: Number(data.cost_spike_factor),
    disabled_platforms: data.disabled_platforms ?? [],
    available: true,
  };
}

export async function getAudienceProfiles(): Promise<Record<AudienceTrack, AudienceProfile>> {
  const { data, error } = await supabaseAdmin.from("ai_audience_profiles").select("*");
  if (error || !data?.length) return DEFAULT_PROFILES;
  const out = { ...DEFAULT_PROFILES };
  for (const row of data) {
    const track = row.track as AudienceTrack;
    if (!(track in out)) continue;
    out[track] = {
      ...DEFAULT_PROFILES[track],
      ...row,
      track,
      material_audience: row.material_audience as AudienceProfile["material_audience"],
      publish_slots: (row.publish_slots ?? {}) as Record<string, string[]>,
      cadence_share_pct: Number(row.cadence_share_pct),
      monthly_ads_budget_pln: Number(row.monthly_ads_budget_pln),
    };
  }
  return out;
}

export async function logAgentAction(entry: {
  action: string;
  status?: "ok" | "blocked" | "error" | "warning" | "info";
  summary: string;
  payload?: Record<string, unknown>;
  costPln?: number;
  module?: string;
}): Promise<void> {
  const row = {
    module: entry.module ?? AGENT_MODULE,
    action: entry.action,
    status: entry.status ?? "ok",
    summary: entry.summary.slice(0, 2000),
    payload: (entry.payload ?? {}) as never,
    cost_pln: entry.costPln ?? 0,
  };
  const { error } = await supabaseAdmin.from("ai_growth_action_log").insert(row);
  if (error && (row.status === "warning" || row.status === "info")) {
    // Przed migracją CHECK zna tylko ok/blocked/error — nie gubimy wpisu.
    await supabaseAdmin
      .from("ai_growth_action_log")
      .insert({ ...row, status: row.status === "warning" ? "blocked" : "ok" });
  }
}

/** Koszt AI wydany dziś (Europe/Warsaw) przez wszystkie moduły silnika. */
export async function aiSpentTodayPln(now: Date = new Date()): Promise<number> {
  const start = warsawDayStart(now);
  const { data } = await supabaseAdmin
    .from("ai_growth_action_log")
    .select("cost_pln")
    .gte("created_at", start.toISOString())
    .limit(5000);
  return (data ?? []).reduce((sum, r) => sum + Number(r.cost_pln ?? 0), 0);
}

/** Początek doby w Warszawie jako instant UTC. */
export function warsawDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const hourWarsaw = get("hour");
  const utcHour = now.getUTCHours();
  const offsetH = ((hourWarsaw - utcHour + 24) % 24) || 0;
  const d = new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 0, 0, 0));
  return new Date(d.getTime() - offsetH * 3600_000);
}

/** Decyzja bezpieczników z bieżącymi ustawieniami i wydanym budżetem. */
export async function decideAgentAction(
  action: AgentAction,
  ctx: ActionContext = {},
): Promise<ActionDecision & { settings: AgentSettings }> {
  const settings = await getAgentSettings();
  const spentTodayPln = ctx.estimatedCostPln ? await aiSpentTodayPln() : 0;
  const decision = canAgentAct(settings, action, { ...ctx, spentTodayPln });
  if (!decision.allowed && !decision.draftOnly) {
    await logAgentAction({
      action: `blocked_${action}`,
      status: "blocked",
      summary: decision.reason ?? "Zablokowane przez bezpieczniki.",
      payload: { action, ctx },
    });
  }
  return { ...decision, settings };
}

export async function setKillSwitch(opts: {
  on: boolean;
  reason?: string | null;
  actor: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from("publishing_agent_settings")
    .update({
      kill_switch: opts.on,
      kill_switch_reason: opts.on ? (opts.reason ?? null) : null,
      kill_switch_at: opts.on ? new Date().toISOString() : null,
      kill_switch_by: opts.actor,
      // Wyłączenie wyłącznika zdejmuje też automatyczną pauzę.
      ...(opts.on ? {} : { auto_paused_at: null, auto_pause_reason: null }),
      updated_by: opts.actor,
    })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  await logAgentAction({
    action: opts.on ? "kill_switch_on" : "kill_switch_off",
    status: "info",
    summary: opts.on
      ? `Wyłącznik awaryjny WŁĄCZONY${opts.reason ? `: ${opts.reason}` : ""} (${opts.actor}).`
      : `Wyłącznik awaryjny wyłączony (${opts.actor}).`,
  });
  return { ok: true };
}

export async function autoPauseAgent(reason: string): Promise<void> {
  await supabaseAdmin
    .from("publishing_agent_settings")
    .update({ auto_paused_at: new Date().toISOString(), auto_pause_reason: reason.slice(0, 500) })
    .eq("id", true)
    .is("auto_paused_at", null);
  await logAgentAction({ action: "auto_pause", status: "warning", summary: `Automatyczna pauza: ${reason}` });
}

/**
 * Alarm / raport do właściciela: SMS (tylko alarmy, przez sms-guard) i e-mail.
 * Numer i adres z ustawień modułu, zapasowo z env AGENT_OWNER_PHONE /
 * AGENT_OWNER_EMAIL. Brak kanału = wpis w dzienniku (nic nie ginie).
 */
export async function notifyOwner(opts: {
  kind: "alarm" | "report";
  subject: string;
  text: string;
  settings?: AgentSettings;
}): Promise<{ sms?: boolean; email?: boolean }> {
  const s = opts.settings ?? (await getAgentSettings());
  const phone = s.owner_phone || process.env.AGENT_OWNER_PHONE || "";
  const email = s.owner_email || process.env.AGENT_OWNER_EMAIL || "";
  const result: { sms?: boolean; email?: boolean } = {};
  if (opts.kind === "alarm" && phone) {
    try {
      const { sendSmsInternal } = await import("@/lib/voicebot.functions");
      const r = await sendSmsInternal({
        phone,
        body: `Finance You agent: ${opts.subject}. ${opts.text}`.slice(0, 450),
        source: "publishing_agent_alarm",
        category: "critical",
      });
      result.sms = r.ok;
    } catch {
      result.sms = false;
    }
  }
  if (email) {
    try {
      const { sendResendEmail } = await import("@/lib/resend-send.server");
      const r = await sendResendEmail({
        to: email,
        subject: `[Agent publikujący] ${opts.subject}`,
        text: opts.text,
        category: "transactional",
        fromName: "Agent publikujący Finance You",
      });
      result.email = r.ok;
    } catch {
      result.email = false;
    }
  }
  await logAgentAction({
    action: opts.kind === "alarm" ? "owner_alarm" : "owner_report",
    status: "info",
    summary: `${opts.subject} (SMS: ${result.sms ?? "—"}, e-mail: ${result.email ?? "—"})`,
    payload: { text: opts.text.slice(0, 4000) },
  });
  return result;
}
