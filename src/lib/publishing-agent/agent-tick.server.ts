/**
 * Tick agenta publikującego (cron co godzinę, /api/public/hooks/publishing-agent-tick).
 *
 *  1. Bezpieczniki: wykrywanie anomalii → automatyczna pauza + SMS do właściciela.
 *  2. Import metryk publikacji (IG Graph insights, YouTube statistics) raz na dobę.
 *  3. Raport dzienny (krótki) i tygodniowy (pełny) — informacyjnie, e-mail.
 *
 * Tick NIE publikuje i NIE zmienia trybu — publikują istniejące ticki kolejek,
 * a przez bramkę (`publish-guard.server.ts`) przechodzi każda publikacja.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  aiSpentTodayPln,
  autoPauseAgent,
  getAgentSettings,
  logAgentAction,
  notifyOwner,
  warsawDayStart,
} from "./agent-settings.server";
import { detectAnomalies, isAgentPaused, type AgentSettings } from "./safeguards";
import {
  buildReportText,
  findOutliers,
  median,
  per1000,
  reportDue,
  type PublicationMetricRow,
  type TrackSummary,
} from "./publication-metrics";
import type { AudienceTrack } from "./compliance-rules";

const DAY = 24 * 3600_000;

function warsawClock(now: Date): { hour: number; dow: number; label: string } {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const hour = Number(f.find((p) => p.type === "hour")?.value);
  const wd = f.find((p) => p.type === "weekday")?.value ?? "Mon";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  const label = new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "medium",
  }).format(now);
  return { hour, dow, label };
}

// ── 1. Anomalie ─────────────────────────────────────────────────────────

async function dailyCosts(now: Date): Promise<{ today: number; median7d: number }> {
  const start = new Date(warsawDayStart(now).getTime() - 7 * DAY);
  const { data } = await supabaseAdmin
    .from("ai_growth_action_log")
    .select("cost_pln,created_at")
    .gte("created_at", start.toISOString())
    .limit(10000);
  const todayStart = warsawDayStart(now).getTime();
  const perDay = new Map<number, number>();
  let today = 0;
  for (const r of data ?? []) {
    const t = new Date(r.created_at).getTime();
    const c = Number(r.cost_pln ?? 0);
    if (t >= todayStart) today += c;
    else {
      const k = Math.floor((todayStart - t) / DAY);
      perDay.set(k, (perDay.get(k) ?? 0) + c);
    }
  }
  const days = Array.from({ length: 7 }, (_, i) => perDay.get(i) ?? 0);
  return { today, median7d: median(days) ?? 0 };
}

async function checkAnomalies(settings: AgentSettings, now: Date): Promise<string[]> {
  const { data: recent } = await supabaseAdmin
    .from("social_publish_queue")
    .select("status,updated_at")
    .eq("origin", "agent")
    .in("status", ["published", "failed"])
    .order("updated_at", { ascending: false })
    .limit(10);
  const costs = await dailyCosts(now);
  const since = new Date(now.getTime() - DAY).toISOString();
  const { data: checks } = await supabaseAdmin
    .from("ai_compliance_checks")
    .select("decision")
    .gte("created_at", since)
    .limit(2000);
  const total = checks?.length ?? 0;
  const rejected = (checks ?? []).filter((c) => c.decision === "reject").length;
  // Sygnały platform (ostrzeżenia, usunięcia) zapisuje monitoring komentarzy
  // jako akcję `platform_signal` w dzienniku — dziś liczymy je z dziennika.
  const { count: signals } = await supabaseAdmin
    .from("ai_growth_action_log")
    .select("id", { count: "exact", head: true })
    .eq("action", "platform_signal")
    .gte("created_at", since);
  const anomalies = detectAnomalies(settings, {
    recentPublishOutcomes: (recent ?? []).map((r) =>
      r.status === "failed" ? "failed" : "published",
    ),
    costTodayPln: costs.today,
    costMedian7dPln: costs.median7d,
    platformSignals: signals ?? 0,
    complianceChecks24h: total,
    complianceRejectRate24h: total ? rejected / total : 0,
  });
  return anomalies.map((a) => a.message);
}

// ── 2. Metryki ──────────────────────────────────────────────────────────

const num = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

async function importMetrics(now: Date): Promise<{ imported: number; errors: string[] }> {
  const since = new Date(now.getTime() - 30 * DAY).toISOString();
  const errors: string[] = [];
  let imported = 0;
  const measuredOn = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(now);

  // Instagram Reels — insights per media.
  const { data: ig } = await supabaseAdmin
    .from("social_publish_queue")
    .select("id,external_post_id,title,published_at,audience_track")
    .eq("platform", "instagram_reels")
    .eq("status", "published")
    .gte("published_at", since)
    .not("external_post_id", "is", null)
    .limit(60);
  if (ig?.length) {
    const { getIgMediaInsights } = await import("@/lib/meta-api.server");
    for (const r of ig) {
      try {
        const data = await getIgMediaInsights(r.external_post_id as string);
        const m = Object.fromEntries(
          data.map(
            (x: {
              name: string;
              values?: Array<{ value: number }>;
              total_value?: { value: number };
            }) => [x.name, x.total_value?.value ?? x.values?.[0]?.value ?? null],
          ),
        );
        const { error } = await supabaseAdmin.from("content_publication_metrics").upsert(
          {
            platform: "instagram_reels",
            external_id: r.external_post_id as string,
            queue_table: "social_publish_queue",
            queue_id: r.id,
            audience_track: r.audience_track,
            hook_text: r.title,
            published_at: r.published_at,
            measured_on: measuredOn,
            views: num(m.views),
            reach: num(m.reach),
            likes: num(m.likes),
            comments: num(m.comments),
            shares: num(m.shares),
            saves: num(m.saved),
            raw: m as never,
          },
          { onConflict: "platform,external_id,measured_on" },
        );
        if (error) errors.push(error.message);
        else imported += 1;
      } catch (e) {
        errors.push(`IG ${r.external_post_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // YouTube — statystyki publiczne (Data API; YouTube Analytics API = Etap 2b).
  const { data: yt } = await supabaseAdmin
    .from("youtube_publish_queue")
    .select("id,youtube_video_id,title,published_at,audience_track")
    .eq("status", "published")
    .gte("published_at", since)
    .not("youtube_video_id", "is", null)
    .limit(50);
  if (yt?.length) {
    try {
      const { listVideos } = await import("@/lib/youtube-api.server");
      const items = await listVideos(yt.map((r) => r.youtube_video_id as string));
      for (const it of items) {
        const q = yt.find((r) => r.youtube_video_id === it.id);
        const { error } = await supabaseAdmin.from("content_publication_metrics").upsert(
          {
            platform: "youtube",
            external_id: it.id,
            queue_table: "youtube_publish_queue",
            queue_id: q?.id ?? null,
            audience_track: q?.audience_track ?? null,
            hook_text: q?.title ?? it.snippet?.title ?? null,
            published_at: q?.published_at ?? null,
            measured_on: measuredOn,
            views: num(it.statistics?.viewCount),
            likes: num(it.statistics?.likeCount),
            comments: num(it.statistics?.commentCount),
            raw: (it.statistics ?? {}) as never,
          },
          { onConflict: "platform,external_id,measured_on" },
        );
        if (error) errors.push(error.message);
        else imported += 1;
      }
    } catch (e) {
      errors.push(`YouTube: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { imported, errors };
}

// ── 3. Raport ───────────────────────────────────────────────────────────

async function buildReport(
  period: "daily" | "weekly",
  settings: AgentSettings,
  now: Date,
  alarms: string[],
) {
  const days = period === "daily" ? 1 : 7;
  const since = new Date(now.getTime() - days * DAY).toISOString();
  const { data: metrics } = await supabaseAdmin
    .from("content_publication_metrics")
    .select("*")
    .gte("measured_on", new Date(now.getTime() - 30 * DAY).toISOString().slice(0, 10))
    .limit(5000);
  // Najnowszy pomiar każdej publikacji.
  const latest = new Map<string, PublicationMetricRow & { measured_on: string }>();
  for (const m of (metrics ?? []) as Array<PublicationMetricRow & { measured_on: string }>) {
    const k = `${m.platform}|${m.external_id}`;
    const prev = latest.get(k);
    if (!prev || prev.measured_on < m.measured_on) latest.set(k, m);
  }
  const rows = [...latest.values()];
  const inPeriod = rows.filter((r) => r.published_at && r.published_at >= since);

  const { data: signups } = await supabaseAdmin
    .from("lead_magnet_signups")
    .select("id,lead_id,lead_magnets(audience)")
    .gte("created_at", since)
    .limit(5000);
  const signupTrack = (s: { lead_magnets?: { audience?: string } | null }) =>
    s.lead_magnets?.audience === "inwestor" ? "inwestor" : "pozyczkobiorca";

  const { data: costRows } = await supabaseAdmin
    .from("ai_growth_action_log")
    .select("cost_pln,payload")
    .gte("created_at", since)
    .limit(10000);
  const totalCost = (costRows ?? []).reduce((s, r) => s + Number(r.cost_pln ?? 0), 0);

  const tracks = {} as Record<AudienceTrack, TrackSummary>;
  for (const t of ["pozyczkobiorca", "inwestor"] as AudienceTrack[]) {
    const tr = inPeriod.filter((r) => r.audience_track === t);
    const views = tr.reduce((s, r) => s + (r.views ?? 0), 0);
    const su = (signups ?? []).filter((s) => signupTrack(s as never) === t);
    tracks[t] = {
      publications: tr.length,
      medianViews: median(tr.map((r) => r.views ?? 0)),
      shareRatePer1000: per1000(
        tr.reduce((s, r) => s + (r.shares ?? 0), 0),
        views,
      ),
      followsPer1000: per1000(
        tr.reduce((s, r) => s + (r.follows ?? 0), 0),
        views,
      ),
      signups: su.length,
      leads: su.filter((s) => s.lead_id).length,
      // Koszt per tor przypisany z payload.track; reszta dzielona po równo.
      costPln:
        (costRows ?? [])
          .filter((r) => (r.payload as { track?: string } | null)?.track === t)
          .reduce((s, r) => s + Number(r.cost_pln ?? 0), 0) +
        (costRows ?? [])
          .filter((r) => !(r.payload as { track?: string } | null)?.track)
          .reduce((s, r) => s + Number(r.cost_pln ?? 0), 0) /
          2,
    };
  }

  const { data: checks } = await supabaseAdmin
    .from("ai_compliance_checks")
    .select("decision")
    .gte("created_at", since)
    .limit(5000);
  const { count: failures } = await supabaseAdmin
    .from("social_publish_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("updated_at", since);
  const { data: changes } = await supabaseAdmin
    .from("ai_growth_action_log")
    .select("summary")
    .eq("module", "publishing_agent")
    .in("status", ["ok", "info"])
    .not("action", "in", "(owner_report,owner_alarm,tick)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);

  const pause = isAgentPaused(settings);
  return buildReportText({
    period,
    label: warsawClock(now).label,
    tracks,
    outliers: findOutliers(rows),
    compliance: {
      checks: checks?.length ?? 0,
      rejected: (checks ?? []).filter((c) => c.decision === "reject").length,
      fixed: (checks ?? []).filter((c) => c.decision === "fixed").length,
    },
    publishFailures: failures ?? 0,
    agentChanges: (changes ?? []).map((c) => c.summary ?? "").filter(Boolean),
    alarms,
    aiCostPln: period === "daily" ? await aiSpentTodayPln(now) : totalCost,
    aiBudgetPln: settings.daily_ai_budget_pln,
    mode: settings.mode,
    paused: pause.paused ? (pause.reason ?? "pauza") : null,
  });
}

export async function runPublishingAgentTick(
  opts: { now?: Date; forceReport?: "daily" | "weekly" } = {},
) {
  const now = opts.now ?? new Date();
  const settings = await getAgentSettings();
  if (!settings.available) {
    return { ok: true, skipped: "Migracja agenta publikującego nie jest jeszcze wdrożona." };
  }
  const result: Record<string, unknown> = { mode: settings.mode };

  // 1. Anomalie → auto-pauza (tylko gdy agent działa).
  const alarms: string[] = [];
  const pause = isAgentPaused(settings);
  if (!pause.paused && settings.mode !== "off") {
    const anomalies = await checkAnomalies(settings, now).catch((e) => [
      `Nie udało się sprawdzić anomalii: ${e instanceof Error ? e.message : String(e)}`,
    ]);
    if (anomalies.length) {
      await autoPauseAgent(anomalies.join(" "));
      await notifyOwner({
        kind: "alarm",
        subject: "automatyczna pauza",
        text: anomalies.join(" "),
        settings,
      });
      alarms.push(...anomalies);
    }
  }
  // Wpisy zawieszone / odrzucone ostatniej doby — informacja w raporcie.
  const { count: stuck } = await supabaseAdmin
    .from("social_publish_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "publishing")
    .lt("updated_at", new Date(now.getTime() - 3600_000).toISOString());
  if (stuck) alarms.push(`${stuck} wpis(y) w kolejce zawieszone w „publikowanie…” > 1 h.`);
  result.alarms = alarms;

  // 2. Metryki raz na dobę (godzina przed raportem dziennym).
  const clock = warsawClock(now);
  if (clock.hour === (settings.daily_report_hour + 23) % 24 || opts.forceReport) {
    result.metrics = await importMetrics(now).catch((e) => ({ error: String(e) }));
  }

  // 3. Raporty.
  const due = reportDue({
    now,
    hourWarsaw: clock.hour,
    dowWarsaw: clock.dow,
    reportHour: settings.daily_report_hour,
    weeklyDow: settings.weekly_report_dow,
    lastDaily: settings.last_daily_report_at,
    lastWeekly: settings.last_weekly_report_at,
  });
  for (const period of ["weekly", "daily"] as const) {
    const isDue = opts.forceReport ? opts.forceReport === period : due[period];
    if (!isDue) continue;
    const text = await buildReport(period, settings, now, alarms);
    await notifyOwner({
      kind: "report",
      subject:
        period === "daily" ? `raport dzienny ${clock.label}` : `raport tygodniowy ${clock.label}`,
      text,
      settings,
    });
    await supabaseAdmin
      .from("publishing_agent_settings")
      .update(
        period === "daily"
          ? { last_daily_report_at: now.toISOString() }
          : { last_weekly_report_at: now.toISOString() },
      )
      .eq("id", true);
    result[`${period}_report`] = text;
    if (period === "weekly") break; // tygodniowy zawiera dzienny
  }

  if (alarms.length || result.daily_report || result.weekly_report) {
    await logAgentAction({
      action: "tick",
      status: alarms.length ? "warning" : "info",
      summary: `Tick agenta (${settings.mode}): ${alarms.length} alarm(ów)`,
      payload: { alarms, metrics: result.metrics ?? null },
    });
  }
  return { ok: true, ...result };
}
