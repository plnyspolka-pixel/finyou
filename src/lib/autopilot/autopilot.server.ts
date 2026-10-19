// Tick autopilota agenta publikującego (co godzinę, pg_cron `autopilot-tick`).
//
// ZAWSZE (niezależnie od trybu): wykrywanie anomalii, import metryk
// publikacji (raz na dobę), raport dzienny i tygodniowy do właściciela.
// TYLKO w `video_module_mode = 'full_autopilot'` i bez wyłącznika awaryjnego:
// publikacja gotowych rolek Studia w slotach torów po przejściu bramki
// compliance (Etap 0) — kolejne moduły produkcji dochodzą tu w Etapach 3–8.
//
// Każda decyzja → ai_growth_action_log (moduł `publishing_autopilot`).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { inferTrack, type Track, type TrackOrBoth } from "./compliance-rules";
import { warsawIsoDate, warsawParts } from "./dates";
import { detectAnomalies, nextFreeSlot, warsawLocalToUtc, type Anomaly } from "./guardrails";
import { findOutliers, insightValue, summarizeByTrack, type MetricPoint } from "./metrics";
import {
  autopilotMayAct,
  loadAudienceProfiles,
  loadAutopilotSettings,
  logAutopilotAction,
  notifyOwner,
  setKillSwitch,
  type AudienceProfile,
  type AutopilotSettings,
} from "./state.server";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function warsawHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

function warsawMidnightUtc(now: Date): Date {
  const { y, m, d } = warsawParts(now);
  return warsawLocalToUtc(y, m, d, 0, 0);
}

// ── Anomalie ──────────────────────────────────────────────────────────────

async function gatherAnomalies(s: AutopilotSettings, now: Date): Promise<Anomaly[]> {
  const since = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const midnight = warsawMidnightUtc(now).toISOString();
  const [{ data: social }, { data: yt }, { data: costRows }, blocked, warnings] = await Promise.all(
    [
      supabaseAdmin
        .from("social_publish_queue")
        .select("platform,status,last_error,updated_at")
        .gte("updated_at", since)
        .in("status", ["published", "failed"])
        .order("updated_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("youtube_publish_queue")
        .select("status,last_error,updated_at")
        .gte("updated_at", since)
        .in("status", ["published", "failed"])
        .order("updated_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("ai_growth_action_log")
        .select("cost_pln")
        .gte("created_at", midnight)
        .limit(5000),
      supabaseAdmin
        .from("ai_compliance_checks")
        .select("id", { count: "exact", head: true })
        .gte("created_at", midnight)
        .in("result", ["rejected", "blocked"]),
      supabaseAdmin
        .from("ai_growth_action_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", midnight)
        .eq("action", "platform_warning"),
    ],
  );
  const outcomes = [
    ...(social ?? []).map((r) => ({
      platform: r.platform,
      status: r.status,
      lastError: r.last_error,
      updatedAt: r.updated_at,
    })),
    ...(yt ?? []).map((r) => ({
      platform: "youtube",
      status: r.status,
      lastError: r.last_error,
      updatedAt: r.updated_at,
    })),
  ];
  // Kanały wyłączone w ustawieniach (np. X) nie są awarią.
  const relevant = outcomes.filter((o) => !s.disabledPlatforms.includes(o.platform));
  return detectAnomalies({
    outcomes: relevant,
    failuresThreshold: s.anomalyFailuresThreshold,
    aiCostTodayPln: (costRows ?? []).reduce((sum, r) => sum + Number(r.cost_pln ?? 0), 0),
    dailyAiBudgetPln: s.dailyAiBudgetPln,
    complianceBlockedToday: blocked.count ?? 0,
    platformWarningsToday: warnings.count ?? 0,
  });
}

async function handleAnomalies(
  s: AutopilotSettings,
  anomalies: Anomaly[],
  now: Date,
): Promise<void> {
  if (!anomalies.length) return;
  // Raz na dobę na kod — bez zalewania dziennika i telefonu.
  const midnight = warsawMidnightUtc(now).toISOString();
  const { data: seen } = await supabaseAdmin
    .from("ai_growth_action_log")
    .select("payload")
    .eq("action", "anomaly")
    .gte("created_at", midnight)
    .limit(200);
  const seenCodes = new Set((seen ?? []).map((r) => (r.payload as any)?.code).filter(Boolean));
  const fresh = anomalies.filter((a) => !seenCodes.has(a.code));
  for (const a of fresh) {
    await logAutopilotAction({
      action: "anomaly",
      status: "warning",
      summary: a.message,
      payload: { code: a.code },
    });
  }
  if (!fresh.length) return;
  // Automatyczna pauza tylko wtedy, gdy autopilot faktycznie działa.
  if (autopilotMayAct(s)) {
    await setKillSwitch({
      on: true,
      reason: `Automatyczna pauza: ${fresh.map((a) => a.message).join("; ")}`,
      source: "anomaly",
    });
    await notifyOwner(
      `Finance You autopilot: PAUZA. ${fresh.map((a) => a.message).join("; ")}. Wznowienie: panel albo MCP set_autopilot_kill_switch.`,
      "alarm",
    );
  }
}

// ── Metryki (Etap 2) ──────────────────────────────────────────────────────

const METRICS_MAX_PER_RUN = 40;

export async function importPublicationMetrics(now = new Date()): Promise<{
  imported: number;
  errors: string[];
}> {
  const today = warsawIsoDate(now);
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const errors: string[] = [];
  const rows: Record<string, unknown>[] = [];

  const { data: done } = await supabaseAdmin
    .from("social_post_metrics")
    .select("platform,external_id")
    .eq("captured_on", today)
    .limit(2000);
  const doneKeys = new Set((done ?? []).map((r) => `${r.platform}|${r.external_id}`));

  const { data: ig } = await supabaseAdmin
    .from("social_publish_queue")
    .select("id,platform,external_post_id,published_at,track,series")
    .eq("status", "published")
    .eq("platform", "instagram_reels")
    .not("external_post_id", "is", null)
    .gte("published_at", since)
    .limit(200);
  const igTodo = (ig ?? []).filter((r) => !doneKeys.has(`instagram_reels|${r.external_post_id}`));
  if (igTodo.length) {
    const { getIgMediaInsights } = await import("@/lib/meta-api.server");
    for (const r of igTodo.slice(0, METRICS_MAX_PER_RUN)) {
      try {
        const data = await getIgMediaInsights(r.external_post_id!);
        rows.push({
          platform: "instagram_reels",
          external_id: r.external_post_id,
          queue_table: "social_publish_queue",
          queue_item_id: r.id,
          track: r.track,
          series: r.series,
          published_at: r.published_at,
          captured_on: today,
          views: insightValue(data, "views"),
          reach: insightValue(data, "reach"),
          likes: insightValue(data, "likes"),
          comments: insightValue(data, "comments"),
          shares: insightValue(data, "shares"),
          saves: insightValue(data, "saved"),
          raw: { insights: data },
        });
      } catch (e) {
        errors.push(`ig ${r.external_post_id}: ${errMsg(e)}`);
      }
    }
  }

  const { data: yt } = await supabaseAdmin
    .from("youtube_publish_queue")
    .select("id,youtube_video_id,published_at,track,series")
    .eq("status", "published")
    .not("youtube_video_id", "is", null)
    .gte("published_at", since)
    .limit(200);
  const ytTodo = (yt ?? []).filter((r) => !doneKeys.has(`youtube|${r.youtube_video_id}`));
  if (ytTodo.length) {
    try {
      const { listVideos } = await import("@/lib/youtube-api.server");
      const byId = new Map(ytTodo.map((r) => [r.youtube_video_id!, r]));
      const ids = [...byId.keys()].slice(0, 50);
      for (const v of await listVideos(ids)) {
        const r = byId.get(v.id);
        if (!r) continue;
        const st = v.statistics ?? {};
        rows.push({
          platform: "youtube",
          external_id: v.id,
          queue_table: "youtube_publish_queue",
          queue_item_id: r.id,
          track: r.track,
          series: r.series,
          published_at: r.published_at,
          captured_on: today,
          views: st.viewCount != null ? Number(st.viewCount) : null,
          likes: st.likeCount != null ? Number(st.likeCount) : null,
          comments: st.commentCount != null ? Number(st.commentCount) : null,
          raw: { statistics: st },
        });
      }
    } catch (e) {
      errors.push(`youtube: ${errMsg(e)}`);
    }
  }
  // Facebook Reels: metryki wideo wymagają osobnego endpointu video_insights
  // (uprawnienie read_insights) — do dodania po potwierdzeniu uprawnień.

  if (rows.length) {
    const { error } = await supabaseAdmin
      .from("social_post_metrics")
      .upsert(rows as never, { onConflict: "platform,external_id,captured_on" });
    if (error) errors.push(`zapis: ${error.message}`);
  }
  if (rows.length || errors.length) {
    await logAutopilotAction({
      action: "metrics_import",
      status: errors.length ? "warning" : "ok",
      summary: `Metryki publikacji: ${rows.length} zapisanych${errors.length ? `, błędy: ${errors.length}` : ""}`,
      payload: { errors: errors.slice(0, 10) },
    });
  }
  return { imported: rows.length, errors };
}

async function latestMetrics(days: number, now: Date): Promise<MetricPoint[]> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const { data } = await supabaseAdmin
    .from("social_post_metrics")
    .select(
      "platform,external_id,track,series,published_at,views,likes,comments,shares,saves,follows,captured_on",
    )
    .gte("published_at", since)
    .order("captured_on", { ascending: false })
    .limit(3000);
  // Najnowszy snapshot na publikację.
  const seen = new Set<string>();
  const out: MetricPoint[] = [];
  for (const r of data ?? []) {
    const k = `${r.platform}|${r.external_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      platform: r.platform,
      externalId: r.external_id,
      track: r.track,
      series: r.series,
      publishedAt: r.published_at,
      views: r.views,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      saves: r.saves,
      follows: r.follows,
    });
  }
  return out;
}

// ── Raporty ───────────────────────────────────────────────────────────────

async function countSince(table: string, since: string): Promise<number | null> {
  const { count, error } = await supabaseAdmin
    .from(table as never)
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  return error ? null : (count ?? 0);
}

export async function buildReport(
  s: AutopilotSettings,
  days: number,
  now = new Date(),
): Promise<{ short: string; full: string }> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const [{ data: pub }, { data: ytPub }, failed, blocked, signups, subscribers, leads, metrics] =
    await Promise.all([
      supabaseAdmin
        .from("social_publish_queue")
        .select("platform,track")
        .eq("status", "published")
        .gte("published_at", since)
        .limit(1000),
      supabaseAdmin
        .from("youtube_publish_queue")
        .select("track")
        .eq("status", "published")
        .gte("published_at", since)
        .limit(500),
      supabaseAdmin
        .from("social_publish_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("updated_at", since),
      supabaseAdmin
        .from("ai_compliance_checks")
        .select("id", { count: "exact", head: true })
        .in("result", ["rejected", "blocked"])
        .gte("created_at", since),
      countSince("lead_magnet_signups", since),
      countSince("email_subscribers", since),
      countSince("leads", since),
      latestMetrics(Math.max(days, 30), now),
    ]);
  const published = [
    ...(pub ?? []).map((r) => ({ platform: r.platform, track: r.track })),
    ...(ytPub ?? []).map((r) => ({ platform: "youtube", track: r.track })),
  ];
  const perTrack = (t: string) => published.filter((p) => (p.track ?? "oba") === t).length;
  const summary = summarizeByTrack(metrics);
  const outliers = findOutliers(metrics, now).slice(0, 5);
  const n = (v: number | null) => (v == null ? "b.d." : String(v));
  const state = s.killSwitch
    ? `PAUZA (${s.killSwitchReason ?? "wyłącznik"})`
    : `tryb ${s.videoModuleMode}`;

  const short =
    `Finance You ${days === 1 ? "dzień" : "tydzień"}: publikacje ${published.length} ` +
    `(poż. ${perTrack("pozyczkobiorca")}, inw. ${perTrack("inwestor")}), nieudane ${n(failed.count ?? null)}, ` +
    `zablokowane compliance ${n(blocked.count ?? null)}, zapisy LM ${n(signups)}, nowi subskrybenci ${n(subscribers)}, ` +
    `leady ${n(leads)}. Autopilot: ${state}.`;

  const lines = [
    `Raport autopilota Finance You — ostatnie ${days} dni (stan ${warsawIsoDate(now)})`,
    "",
    `Stan: ${state}; kanały wyłączone: ${s.disabledPlatforms.join(", ") || "brak"}.`,
    `Publikacje: ${published.length} (pożyczkobiorca ${perTrack("pozyczkobiorca")}, inwestor ${perTrack("inwestor")}, bez toru ${perTrack("oba")}).`,
    `Nieudane publikacje: ${n(failed.count ?? null)}; treści zatrzymane przez bramkę compliance: ${n(blocked.count ?? null)}.`,
    `Lista mailingowa: zapisy z lead magnetów ${n(signups)}, nowi subskrybenci ${n(subscribers)}; nowe leady CRM ${n(leads)}.`,
    "",
    "Wyniki per tor (najnowsze snapshoty, 30 dni):",
    ...(summary.length
      ? summary.map(
          (t) =>
            `- ${t.track}: ${t.posts} publikacji, mediana wyświetleń ${t.medianViews}, udostępnienia/1000 ${t.sharesPer1k}, komentarze/1000 ${t.commentsPer1k}`,
        )
      : ["- brak danych (metryki zbierane od wdrożenia)"]),
    "",
    "Outliery (≥ 3× mediany platformy i toru):",
    ...(outliers.length
      ? outliers.map(
          (o) =>
            `- ${o.platform} ${o.externalId} (${o.track ?? "oba"}): ${o.views} wyśw., ${o.factor}× mediany`,
        )
      : ["- brak"]),
  ];
  return { short, full: lines.join("\n") };
}

async function sendReports(s: AutopilotSettings, now: Date): Promise<string | null> {
  const today = warsawIsoDate(now);
  if (warsawHour(now) < 8) return null;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Warsaw",
    weekday: "short",
  }).format(now);
  const weekly = weekday === "Mon" && s.lastWeeklyReportOn !== today;
  const daily = s.lastDailyReportOn !== today;
  if (!weekly && !daily) return null;

  const report = await buildReport(s, weekly ? 7 : 1, now);
  // Stempel PRZED wysyłką — przy błędzie SMS/maila nie ponawiamy co godzinę.
  await supabaseAdmin
    .from("ai_growth_settings")
    .update({
      last_daily_report_on: today,
      ...(weekly ? { last_weekly_report_on: today } : {}),
    })
    .eq("id", s.id);
  await logAutopilotAction({
    action: weekly ? "weekly_report" : "daily_report",
    summary: report.short,
    payload: { full: report.full },
  });
  await notifyOwner(report.short, "report");
  if (s.ownerReportEmail) {
    const { sendResendEmail } = await import("@/lib/resend-send.server");
    await sendResendEmail({
      to: s.ownerReportEmail,
      subject: `Autopilot Finance You — raport ${weekly ? "tygodniowy" : "dzienny"} ${today}`,
      text: report.full,
      category: "transactional",
    }).catch((e) => console.warn(`[autopilot] report mail: ${errMsg(e)}`));
  }
  return weekly ? "weekly" : "daily";
}

// ── Etap 0: gotowe rolki Studia → bramka → sloty torów ────────────────────

const VIDEO_PLATFORMS = ["instagram_reels", "facebook_reels", "youtube"] as const;
const READY_JOBS_PER_TICK = 2;

function profileFor(profiles: AudienceProfile[], track: TrackOrBoth): AudienceProfile | null {
  const t: Track = track === "oba" ? "inwestor" : track;
  return profiles.find((p) => p.track === t && p.active) ?? null;
}

async function takenSlots(platform: string, since: Date): Promise<Date[]> {
  if (platform === "youtube") {
    const { data } = await supabaseAdmin
      .from("youtube_publish_queue")
      .select("scheduled_at")
      .in("status", ["pending", "uploading", "published"])
      .gte("scheduled_at", since.toISOString())
      .limit(500);
    return (data ?? []).map((r) => new Date(r.scheduled_at));
  }
  const { data } = await supabaseAdmin
    .from("social_publish_queue")
    .select("scheduled_at")
    .eq("platform", platform)
    .in("status", ["pending", "processing", "publishing", "published"])
    .gte("scheduled_at", since.toISOString())
    .limit(500);
  return (data ?? []).map((r) => new Date(r.scheduled_at));
}

export async function scheduleReadyStudioJobs(
  s: AutopilotSettings,
  profiles: AudienceProfile[],
  now = new Date(),
): Promise<{ scheduled: number; rejected: number }> {
  const { data: jobs } = await supabaseAdmin
    .from("studio_video_jobs")
    .select("id,script,prompt,publish_title,publish_description,video_url,track,created_by")
    .eq("status", "ready")
    .not("video_url", "is", null)
    .is("auto_published_at", null)
    .is("compliance_status", null)
    .order("created_at", { ascending: true })
    .limit(READY_JOBS_PER_TICK);
  if (!jobs?.length) return { scheduled: 0, rejected: 0 };

  const { runComplianceGate } = await import("./compliance.server");
  let scheduled = 0;
  let rejected = 0;
  for (const job of jobs) {
    const track: TrackOrBoth =
      (job.track as TrackOrBoth | null) ??
      inferTrack(`${job.publish_title}\n${job.publish_description}\n${job.script}`);
    const ref = { refTable: "studio_video_jobs", refId: job.id };
    const markJob = (
      status: "passed" | "rejected" | "blocked",
      extra: Record<string, unknown> = {},
    ) =>
      supabaseAdmin
        .from("studio_video_jobs")
        .update({
          compliance_status: status,
          compliance_checked_at: now.toISOString(),
          track,
          ...extra,
        })
        .eq("id", job.id);

    // Wideo jest już wyrenderowane — scenariusza nie da się przepisać bez
    // nowego renderu, więc naruszenie = odrzucenie (temat wraca do banku).
    const script = await runComplianceGate({
      text: job.script || job.prompt,
      kind: "video_script",
      track,
      rewrite: null,
      ...ref,
    });
    if (script.status !== "passed") {
      await markJob("blocked");
      rejected += 1;
      continue;
    }
    const title = await runComplianceGate({
      text: job.publish_title || job.prompt.slice(0, 90),
      kind: "title",
      track,
      ...ref,
    });
    const caption = await runComplianceGate({
      text: job.publish_description || job.publish_title,
      kind: "video_caption",
      track,
      ...ref,
    });
    if (title.status !== "passed" || caption.status !== "passed") {
      await markJob("rejected");
      rejected += 1;
      continue;
    }

    const profile = profileFor(profiles, track);
    if (!profile) {
      await logAutopilotAction({
        action: "schedule_skipped",
        status: "skipped",
        summary: `Brak aktywnego profilu toru ${track} — rolka ${job.id} czeka.`,
      });
      continue;
    }
    // Stempel auto_published_at chroni przed podwójnym wstawieniem (idempotencja).
    const { data: stamped } = await supabaseAdmin
      .from("studio_video_jobs")
      .update({ auto_published_at: now.toISOString() })
      .eq("id", job.id)
      .is("auto_published_at", null)
      .select("id");
    if (!stamped?.length) continue;

    const placed: { platform: string; at: string }[] = [];
    for (const platform of VIDEO_PLATFORMS) {
      if (s.disabledPlatforms.includes(platform)) continue;
      const taken = await takenSlots(platform, new Date(now.getTime() - 86_400_000));
      const at = nextFreeSlot({
        slots: profile.slots,
        platform,
        now,
        taken,
        maxPerDay: s.maxPostsPerDayPerAccount,
      });
      if (!at) continue;
      const common = {
        title: title.text.slice(0, 100),
        scheduled_at: at.toISOString(),
        created_by: job.created_by,
        track,
        autopilot: true,
        compliance_status: "passed",
        compliance_checked_at: now.toISOString(),
        content_meta: {
          studio_job_id: job.id,
          compliance_check_ids: [script.checkId, title.checkId, caption.checkId],
        },
      };
      const { error } =
        platform === "youtube"
          ? await supabaseAdmin.from("youtube_publish_queue").insert({
              ...common,
              description: caption.text,
              source_video_url: job.video_url!,
              privacy_status: "public",
            } as never)
          : await supabaseAdmin.from("social_publish_queue").insert({
              ...common,
              platform,
              message: caption.text,
              video_url: job.video_url,
              image_url: null,
            } as never);
      if (error) {
        await logAutopilotAction({
          action: "schedule_error",
          status: "error",
          summary: `${platform}: ${error.message}`,
          payload: { job_id: job.id },
        });
        continue;
      }
      placed.push({ platform, at: at.toISOString() });
    }
    await markJob("passed");
    scheduled += 1;
    await logAutopilotAction({
      action: "schedule_ready_reel",
      summary: `Rolka „${title.text.slice(0, 80)}” (${track}) w slotach: ${placed.map((p) => `${p.platform} ${p.at}`).join(", ") || "brak wolnych slotów"}`,
      payload: { job_id: job.id, placed },
    });
  }
  return { scheduled, rejected };
}

// ── Tick ──────────────────────────────────────────────────────────────────

export async function runAutopilotTick(now = new Date()): Promise<Record<string, unknown>> {
  const s = await loadAutopilotSettings();
  const result: Record<string, unknown> = {
    mode: s.videoModuleMode,
    killSwitch: s.killSwitch,
  };

  try {
    const anomalies = await gatherAnomalies(s, now);
    await handleAnomalies(s, anomalies, now);
    result.anomalies = anomalies.map((a) => a.code);
  } catch (e) {
    result.anomaliesError = errMsg(e);
  }

  // Metryki raz na dobę po 6:00 (snapshot „na dziś” — upsert idempotentny).
  if (warsawHour(now) >= 6) {
    result.metrics = await importPublicationMetrics(now).catch((e) => ({ error: errMsg(e) }));
  }

  result.report = await sendReports(s, now).catch((e) => `error: ${errMsg(e)}`);

  // Stan mógł się zmienić (automatyczna pauza) — czytamy ponownie.
  const fresh = await loadAutopilotSettings();
  if (!autopilotMayAct(fresh)) {
    result.production = fresh.killSwitch ? "paused" : `mode ${fresh.videoModuleMode}`;
    return result;
  }
  const profiles = await loadAudienceProfiles();
  result.readyReels = await scheduleReadyStudioJobs(fresh, profiles, now).catch((e) => ({
    error: errMsg(e),
  }));
  return result;
}
