// Etap 1 produkcji: autopilot sam zakłada rolki w Studiu z lead magnetami.
// Co godzinę (tick) albo na żądanie (MCP `autopilot_produce_reels`):
//   1. strażnik: tryb, wyłącznik, budżet AI, kredyty HeyGen (odczyt z API),
//   2. per tor: zapas (gotowe + w produkcji) poniżej bufora i limit dzienny,
//   3. seria rotacyjnie, hasło serii → opublikowany lead magnet, temat z profilu,
//   4. scenariusz (studio-ai) → bramka compliance z poprawkami → tytuł,
//   5. job `queued` w Studiu (render robi tick Studia; publikację w slotach
//      toru planuje ready-reels.server.ts, gdy rolka będzie `ready`).
// Każda decyzja ląduje w dzienniku autopilota (reel_produced / _skipped / _rejected).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveKeywordTarget, type KeywordTarget } from "@/lib/lead-magnets/catalog";
import { llmGateDeps, runComplianceGate } from "./compliance-gate.server";
import { COMPLIANCE_RULES_VERSION, checkHardRules } from "./compliance-rules";
import {
  MAX_PRODUCED_PER_TRACK_PER_DAY,
  PRODUCTION_COST_PLN,
  PRODUCTION_PROMPT_TAG,
  buildReelBrief,
  decideProduction,
  pickSeries,
  pickTopic,
  publishTitleWithKeyword,
  type TrackPipeline,
} from "./production";
import { evaluateGuards } from "./safety";
import { MAX_WARNING_SENTENCES_PER_REEL, countWarnings } from "./script-warnings";
import { loadAutopilotConfig, loadUsage, logAutopilot, warsawDayStartIso } from "./state.server";
import { TRACKS, TRACK_TO_AUDIENCE, type Track } from "./types";

const db = supabaseAdmin as unknown as { from: (t: string) => any };

/** Statusy joba Studia „w produkcji” — liczą się do zapasu toru. */
const IN_PROGRESS_STATUSES = [
  "queued",
  "generating_script",
  "generating_audio",
  "uploading",
  "rendering",
  "captioning",
  "processing",
];

/**
 * Jeden tick = jedna rolka. Produkcja to kilka wywołań LLM (scenariusz,
 * recenzent, poprawki) — dwa tory naraz nie mieszczą się w jednym żądaniu
 * ticka. Drugi tor dostaje rolkę w następnej godzinie.
 */
const REELS_PER_RUN = 1;
/** Poprawek w bramce produkcji mniej niż globalnie (czas żądania); po nich temat wraca do banku. */
const MAX_PRODUCTION_REWRITES = 2;

function limitedRewriteDeps(max: number) {
  let used = 0;
  return {
    review: llmGateDeps.review,
    rewrite: async (...args: Parameters<typeof llmGateDeps.rewrite>) => {
      used += 1;
      if (used > max) throw new Error(`Limit ${max} poprawek w produkcji wyczerpany.`);
      return llmGateDeps.rewrite(...args);
    },
  };
}

export type ProductionResult = {
  track: Track;
  action: "produced" | "skipped" | "rejected" | "error";
  reason: string;
  job_id?: string | null;
  series?: string | null;
  keyword?: string | null;
  title?: string | null;
  pipeline?: TrackPipeline;
};

function trackFilter(track: Track): string {
  return `track.eq.${track},material_audience.eq.${TRACK_TO_AUDIENCE[track]}`;
}

async function count(build: (q: any) => any): Promise<number> {
  const { count: n } = await build(
    db.from("studio_video_jobs").select("id", { count: "exact", head: true }),
  );
  return n ?? 0;
}

/** Zapas toru: gotowe nieopublikowane + w produkcji; produkcja z dziś. */
export async function loadPipeline(track: Track, dayStartIso: string): Promise<TrackPipeline> {
  const [ready, inProgress, producedToday] = await Promise.all([
    count((q) =>
      q
        .eq("status", "ready")
        .not("video_url", "is", null)
        .is("auto_published_at", null)
        .or("compliance_status.is.null,compliance_status.in.(passed,rewritten)")
        .or(trackFilter(track)),
    ),
    count((q) => q.in("status", IN_PROGRESS_STATUSES).or(trackFilter(track))),
    count((q) =>
      q
        .eq("track", track)
        .like("prompt", `${PRODUCTION_PROMPT_TAG}%`)
        .gte("created_at", dayStartIso),
    ),
  ]);
  return { track, ready, inProgress, producedToday };
}

async function recentJobs(
  track: Track,
): Promise<
  Array<{ series: string | null; publish_title: string; prompt: string; created_at: string }>
> {
  const { data } = await db
    .from("studio_video_jobs")
    .select("series, publish_title, prompt, created_at")
    .or(trackFilter(track))
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(12);
  return (data ?? []) as Array<{
    series: string | null;
    publish_title: string;
    prompt: string;
    created_at: string;
  }>;
}

async function adminUserId(): Promise<string | null> {
  const { data } = await db
    .from("user_roles")
    .select("user_id")
    .eq("role", "administrator")
    .limit(1)
    .maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

/** Opublikowany lead magnet pod hasło serii — bez niego hasło nie pada w rolce. */
async function publishedMagnet(keyword: string | undefined): Promise<KeywordTarget | null> {
  const target = keyword ? resolveKeywordTarget(keyword) : null;
  if (!target) return null;
  const { data } = await db
    .from("lead_magnets")
    .select("id, published")
    .eq("slug", target.slug)
    .maybeSingle();
  return data?.published ? target : null;
}

async function heygenCredits(fallback: number | null): Promise<number | null> {
  if (fallback != null) return fallback;
  try {
    const { getRemainingQuota } = await import("@/lib/heygen-api.server");
    return (await getRemainingQuota()).credits_estimate;
  } catch {
    // Brak odczytu kredytów nie blokuje produkcji — HeyGen i tak odrzuci render bez kredytów.
    return null;
  }
}

export async function produceReels(
  opts: { now?: Date; tracks?: Track[]; force?: boolean; actor?: string | null } = {},
): Promise<{ results: ProductionResult[]; skipped: string | null }> {
  const now = opts.now ?? new Date();
  const cfg = await loadAutopilotConfig();
  const usage = await loadUsage(now);
  const credits = await heygenCredits(usage.heygenRemainingCredits);
  const guard = evaluateGuards(
    cfg.state,
    cfg.limits,
    { ...usage, heygenRemainingCredits: credits },
    { kind: "produce_video", estCostPln: PRODUCTION_COST_PLN },
  );
  // Produkcja to nie wyjście na zewnątrz: w semi_auto jedzie sama; w
  // manual_review tylko na wyraźne żądanie właściciela (force).
  if (!guard.allowed || (guard.asDraft && !opts.force)) {
    const skipped = guard.reasons.join(" ") || cfg.state.mode;
    // Blokada strażnika jest rzadka — zostaje w dzienniku, żeby było widać, czemu nic nie powstało.
    if (cfg.state.mode === "full_autopilot" || opts.force) {
      await logAutopilot({
        action: "reel_production_skipped",
        status: "warning",
        summary: `Produkcja pominięta: ${skipped}`.slice(0, 500),
        payload: { reasons: guard.reasons, credits, aiSpentTodayPln: usage.aiSpentTodayPln },
        actor: opts.actor ?? null,
      }).catch(() => null);
    }
    return { results: [], skipped };
  }

  const dayStart = warsawDayStartIso(now);
  const results: ProductionResult[] = [];
  let createdBy: string | null = opts.actor ?? null;
  let produced = 0;

  // Kolejność torów: najpierw ten z najmniejszym zapasem, przy remisie ten,
  // który dawniej dostał rolkę — przy jednej rolce na tick tory się zmieniają.
  const candidates = await Promise.all(
    (opts.tracks ?? [...TRACKS]).map(async (track) => ({
      track,
      pipeline: await loadPipeline(track, dayStart),
      recent: await recentJobs(track),
    })),
  );
  candidates.sort((a, b) => {
    const za = a.pipeline.ready + a.pipeline.inProgress;
    const zb = b.pipeline.ready + b.pipeline.inProgress;
    if (za !== zb) return za - zb;
    const la = a.recent[0]?.created_at ?? "";
    const lb = b.recent[0]?.created_at ?? "";
    return la < lb ? -1 : la > lb ? 1 : 0;
  });

  for (const { track, pipeline, recent } of candidates) {
    if (produced >= (opts.tracks?.length && opts.force ? opts.tracks.length : REELS_PER_RUN)) {
      results.push({ track, action: "skipped", reason: "jedna rolka na tick", pipeline });
      continue;
    }
    const decision = opts.force
      ? pipeline.producedToday >= MAX_PRODUCED_PER_TRACK_PER_DAY
        ? decideProduction(pipeline)
        : { produce: true, reason: "na żądanie (bufor pominięty)" }
      : decideProduction(pipeline);
    if (!decision.produce) {
      // Pełny zapas to stan normalny (co godzinę) — do dziennika idzie tylko
      // wyczerpany limit dzienny i wywołanie na żądanie.
      if (opts.force || /limit/.test(decision.reason)) {
        await logAutopilot({
          action: "reel_production_skipped",
          status: "ok",
          summary: `Produkcja (${track}) pominięta: ${decision.reason}`,
          payload: { track, pipeline },
          actor: opts.actor ?? null,
        }).catch(() => null);
      }
      results.push({ track, action: "skipped", reason: decision.reason, pipeline });
      continue;
    }

    const series = pickSeries(
      track,
      recent.map((r) => r.series).filter((s): s is string => Boolean(s)),
    );
    if (!series) {
      results.push({ track, action: "skipped", reason: "brak serii do produkcji", pipeline });
      continue;
    }
    const magnet = await publishedMagnet(series.defaultKeyword);
    const keyword = magnet ? (series.defaultKeyword ?? null) : null;
    const profile = cfg.profiles[track];
    const topic = pickTopic(
      profile.allowedTopics,
      recent.map((r) => r.prompt),
    );
    const brief = buildReelBrief({
      track,
      series,
      profile,
      magnet,
      recentTitles: recent.map((r) => r.publish_title).filter(Boolean),
      topic,
    });

    try {
      const { generateVideoScript } = await import("@/lib/studio-ai.server");
      const gen = await generateVideoScript(brief, { track });
      const ref = { production: true, series: series.slug, track, keyword };
      const scriptGate = await runComplianceGate(
        { text: gen.script, ctx: { kind: "script", track }, ref },
        limitedRewriteDeps(MAX_PRODUCTION_REWRITES),
      );
      if (scriptGate.status === "rejected") {
        await logAutopilot({
          action: "reel_production_rejected",
          status: "blocked",
          summary: `Produkcja (${track}, ${series.slug}): scenariusz odrzucony — ${scriptGate.reason ?? ""}`,
          payload: { track, series: series.slug, keyword, reason: scriptGate.reason ?? null },
          costPln: PRODUCTION_COST_PLN,
          actor: opts.actor ?? null,
        });
        results.push({
          track,
          action: "rejected",
          reason: scriptGate.reason ?? "scenariusz odrzucony przez bramkę",
          series: series.slug,
          keyword,
          pipeline,
        });
        continue;
      }
      // Odchudzenie zastrzeżeń po bramce: poprawki recenzenta potrafiły dołożyć
      // drugie i trzecie zdanie o ryzyku — w rolce zostaje jedno (decyzja
      // właściciela 26.10.2026). Wynik sprawdza acceptCondensedScript (reguły
      // twarde, hasło, długość); gotową rolkę i tak ocenia raz jeszcze bramka
      // Etapu 0 przed publikacją. Nieudane odchudzenie zostawia tekst z bramki.
      let script = scriptGate.text;
      const warningsBefore = countWarnings(script);
      if (warningsBefore > MAX_WARNING_SENTENCES_PER_REEL) {
        try {
          const { condenseScriptWarnings } = await import("@/lib/studio-ai.server");
          const slim = await condenseScriptWarnings(script, { track });
          if (slim) {
            script = slim;
            await logAutopilot({
              action: "reel_warnings_condensed",
              status: "ok",
              summary: `Produkcja (${track}, ${series.slug}): zastrzeżenia w scenariuszu ${warningsBefore} → ${countWarnings(slim)}`,
              payload: {
                track,
                series: series.slug,
                keyword,
                before: scriptGate.text,
                after: slim,
              },
              actor: opts.actor ?? null,
            }).catch(() => null);
          }
        } catch {
          // zostaje scenariusz z bramki
        }
      }

      // Tytuł: reguły twarde bez recenzenta (czas żądania); przy blokadzie tytuł serii.
      const rawTitle = publishTitleWithKeyword(gen.title || series.title, keyword);
      const titleBlocked = checkHardRules(rawTitle, { kind: "title", track }).some(
        (h) => h.severity === "block",
      );
      const title = titleBlocked ? publishTitleWithKeyword(series.title, keyword) : rawTitle;
      const description = [gen.description.trim(), gen.hashtags.slice(0, 5).join(" ")]
        .filter(Boolean)
        .join("\n\n");

      // Twarze, głos i model lektora jak w panelu Studia (zestaw domyślnych).
      const { HEYGEN_AVATARS, FILIP_VOICE_ID } = await import("@/lib/heygen-avatars");
      const { listDefaultAvatars, defaultReelRotation, portraitLead } =
        await import("@/lib/studio-avatars.server");
      const { resolveJobTtsModelId } = await import("@/lib/studio-settings.server");
      const { DEFAULT_CUSTOM_CAPTION_STYLE } = await import("@/lib/caption-style");
      const defaults = await listDefaultAvatars();
      const lead = await portraitLead(defaults[0]?.avatar_id ?? HEYGEN_AVATARS[0].id, []);
      const avatarIds = await defaultReelRotation(lead.lead, 2);
      const ttsModelId = await resolveJobTtsModelId(undefined);
      if (!createdBy) createdBy = await adminUserId();

      const { data: job, error } = await db
        .from("studio_video_jobs")
        .insert({
          prompt: brief,
          script,
          avatar_id: lead.lead,
          avatar_ids: avatarIds,
          voice_id: FILIP_VOICE_ID,
          tts_model_id: ttsModelId,
          status: "queued",
          captions: true,
          caption_style: DEFAULT_CUSTOM_CAPTION_STYLE,
          render_engine: "auto",
          dynamic_scenes: true,
          reel_structure: true,
          auto_publish_platforms: [],
          publish_privacy: "public",
          publish_title: title,
          publish_description: description,
          created_by: createdBy,
          track,
          series: series.slug,
          compliance_status: scriptGate.status,
          compliance_rules_version: COMPLIANCE_RULES_VERSION,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const { setJobMaterialAudience } = await import("@/lib/studio-materials.server");
      await setJobMaterialAudience(job.id, TRACK_TO_AUDIENCE[track]);

      await logAutopilot({
        action: "reel_produced",
        status: "ok",
        summary: `Produkcja (${track}, ${series.slug}${keyword ? `, ${keyword}` : ""}): „${title.slice(0, 70)}” → Studio (queued)`,
        payload: {
          job_id: job.id,
          track,
          series: series.slug,
          keyword,
          topic,
          gate: scriptGate.status,
          pipeline,
        },
        costPln: PRODUCTION_COST_PLN,
        actor: opts.actor ?? null,
      });
      produced += 1;
      results.push({
        track,
        action: "produced",
        reason: decision.reason,
        job_id: job.id,
        series: series.slug,
        keyword,
        title,
        pipeline,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logAutopilot({
        action: "reel_production_error",
        status: "error",
        summary: `Produkcja (${track}, ${series.slug}): ${msg}`.slice(0, 500),
        payload: { track, series: series.slug, keyword },
        actor: opts.actor ?? null,
      }).catch(() => null);
      results.push({ track, action: "error", reason: msg, series: series.slug, keyword, pipeline });
    }
  }
  return { results, skipped: null };
}
