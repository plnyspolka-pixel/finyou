// Raport dzienny / tygodniowy autopilota (brief 5.5) – wyniki per tor,
// zapisy na listę, leady, koszt, outliery, zmiany agenta i alarmy.
// Informacyjny: nie czeka na odpowiedź właściciela.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildReportSms,
  buildReportText,
  findOutliers,
  median,
  type PublicationMetric,
  type ReportInput,
  type TrackReport,
} from "./metrics";
import { loadAutopilotConfig, logAutopilot, reportPeriodLabel, smsOwner } from "./state.server";
import {
  AUTOPILOT_LOG_MODULE,
  STUDIO_FINISHER_FALLBACK_ACTION,
  STUDIO_HOOK_PRO_ACTION,
  TRACKS,
  TRACK_TO_AUDIENCE,
  type Track,
} from "./types";

const db = supabaseAdmin as unknown as { from: (t: string) => any };

export async function buildAutopilotReport(opts: { now?: Date; days: number }): Promise<{
  input: ReportInput;
  text: string;
  sms: string;
}> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - opts.days * 86_400_000).toISOString();
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const cfg = await loadAutopilotConfig();

  const [social, yt, metrics, signups, actions] = await Promise.all([
    db
      .from("social_publish_queue")
      .select("track, platform")
      .eq("status", "published")
      .gte("published_at", since),
    db
      .from("youtube_publish_queue")
      .select("track")
      .eq("status", "published")
      .gte("published_at", since),
    db
      .from("ai_publication_metrics")
      .select("platform, external_post_id, track, views, captured_on")
      .gte("captured_on", since30),
    db
      .from("lead_magnet_signups")
      .select("lead_id, created_at, lead_magnets(audience)")
      .gte("created_at", since),
    db
      .from("ai_growth_action_log")
      .select("module, action, status, summary, cost_pln, payload")
      .in("module", [AUTOPILOT_LOG_MODULE, "compliance_gate", "growth_agent"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  // Ostatnia migawka na publikację.
  const latest = new Map<string, PublicationMetric & { captured_on: string }>();
  for (const r of (metrics.data ?? []) as any[]) {
    const key = `${r.platform}|${r.external_post_id}`;
    const prev = latest.get(key);
    if (!prev || String(r.captured_on) > prev.captured_on) {
      latest.set(key, {
        platform: r.platform,
        externalPostId: r.external_post_id,
        track: r.track,
        views: Number(r.views) || 0,
        captured_on: String(r.captured_on),
      });
    }
  }
  const metricRows = [...latest.values()];

  const actionRows = (actions.data ?? []) as any[];
  const costByTrack: Record<Track, number> = { pozyczkobiorca: 0, inwestor: 0 };
  for (const a of actionRows) {
    const t = a.payload?.ctx?.track ?? a.payload?.track;
    const c = Number(a.cost_pln) || 0;
    if (t === "pozyczkobiorca" || t === "inwestor") costByTrack[t as Track] += c;
    else {
      costByTrack.pozyczkobiorca += c / 2;
      costByTrack.inwestor += c / 2;
    }
  }

  const tracks: TrackReport[] = TRACKS.map((t) => {
    const pubs =
      ((social.data ?? []) as any[]).filter((r) => r.track === t).length +
      ((yt.data ?? []) as any[]).filter((r) => r.track === t).length;
    const su = ((signups.data ?? []) as any[]).filter(
      (s) => s.lead_magnets?.audience === TRACK_TO_AUDIENCE[t],
    );
    return {
      track: t,
      publications: pubs,
      medianViews: median(metricRows.filter((m) => m.track === t).map((m) => m.views)),
      signups: su.length,
      leads: su.filter((s) => s.lead_id).length,
      costPln: Math.round(costByTrack[t] * 100) / 100,
    };
  });

  const changes = actionRows
    .filter((a) =>
      [
        "cadence_split",
        "slot_change",
        "ab_winner",
        "lead_magnet_retired",
        "lead_magnet_promoted",
      ].includes(a.action),
    )
    .slice(0, 5)
    .map((a) => String(a.summary));
  const rejected = actionRows.filter(
    (a) => a.module === "compliance_gate" && a.status === "blocked",
  ).length;
  if (rejected) changes.push(`bramka compliance odrzuciła ${rejected} treści`);
  const alarms = actionRows
    .filter((a) => a.action === "kill_switch_on" || a.action === "platform_signal")
    .slice(0, 3)
    .map((a) => String(a.summary));

  const { production, ownerTodo } = productionNotes(actionRows);
  const input: ReportInput = {
    periodLabel:
      opts.days <= 1 ? reportPeriodLabel(now) : `${opts.days} dni do ${reportPeriodLabel(now)}`,
    tracks,
    outliers: findOutliers(metricRows).length,
    changes,
    alarms,
    paused: cfg.state.paused,
    production,
    ownerTodo,
  };
  return { input, text: buildReportText(input), sms: buildReportSms(input) };
}

/**
 * Raport z ticka: dzienny zawsze do dziennika; SMS tylko gdy autopilot
 * faktycznie publikuje (semi_auto / full_autopilot) – bez szumu na starcie.
 */
export async function runScheduledReport(kind: "daily" | "weekly", now: Date = new Date()) {
  const cfg = await loadAutopilotConfig();
  const r = await buildAutopilotReport({ now, days: kind === "daily" ? 1 : 7 });
  await logAutopilot({
    action: `report_${kind}`,
    summary: r.text.split("\n")[0],
    payload: { text: r.text, input: r.input },
  });
  const active = cfg.state.mode === "semi_auto" || cfg.state.mode === "full_autopilot";
  const sms = active
    ? await smsOwner(r.sms, "report")
    : { sent: false, reason: "Autopilot nieaktywny – raport tylko w dzienniku." };
  return { ...r, sms };
}

/** Wpisy Studia z dziennika → sekcje „Produkcja” i „Do decyzji właściciela”. */
export function productionNotes(actions: Array<{ action?: string; summary?: string }>): {
  production: string[];
  ownerTodo: string[];
} {
  const has = (a: string) => actions.some((x) => x.action === a);
  const production: string[] = [];
  const ownerTodo: string[] = [];
  if (has(STUDIO_FINISHER_FALLBACK_ACTION)) {
    production.push("caption-burner nie odpowiada — rolki wykańcza automatycznie Remotion");
  }
  if (has(STUDIO_HOOK_PRO_ACTION)) {
    production.push("hooki wizualne z grafiki zapasowej (ElevenLabs Flows zwraca 402)");
    ownerTodo.push("plan Pro ElevenLabs (Flows: wideo Veo i obrazy do hooków)");
  }
  return { production, ownerTodo };
}
