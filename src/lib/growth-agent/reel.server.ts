// Codzienna rolka agenta wzrostu — główny produkt agenta.
//
// Przebieg (rozłożony na ticki co 10 min):
//   1. plan (bandyta rolek) → scenariusz i opisy z modelu → strażnik prawdy
//      (scenariusz, opis IG/FB, tytuł YouTube, wersja na X; jedna naprawa),
//   2. zlecenie w Studiu (studio_video_jobs) — dalej robi to istniejący tick
//      Studia: lektor ElevenLabs, awatary HeyGen, przebitki, napisy,
//   3. gotowe wideo → enqueuePublication na wszystkie dostępne platformy
//      o zaplanowanej porze (Instagram, Facebook, YouTube Shorts, a TikTok i X,
//      gdy są odblokowane),
//   4. odczyt wyników publikacji, a po 48 h pomiar i nauka (observe.server.ts).
//
// Środowisko się zmienia, więc agent nie zakłada niczego na stałe:
//   • dzień z rolką dodaną ręcznie (albo przez inny proces) jest „pokryty” —
//     agent nie dubluje; gdy rolka ręczna pojawi się, zanim agent opublikuje
//     swoją, agent przesuwa swoją na następny wolny dzień,
//   • platforma, która trwale odrzuca posty (audyt TikToka, kredyty X), jest
//     wstrzymana na tydzień, potem agent próbuje znowu,
//   • brak kredytów HeyGen → prośba do właściciela (SMS) z darmową alternatywą.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildLiveFactsBlock } from "@/lib/agent-toolkit/live-facts";
import {
  logAgentAction,
  updateAgentAction,
  type ActionRow,
} from "@/lib/agent-toolkit/store.server";
import { SHORTS_QUESTIONS } from "@/lib/shorts-question-bank";
import type { StudioPlatform } from "@/lib/studio-platforms";
import { growthLlmJson } from "./llm.server";
import {
  REEL_SYSTEM_PROMPT,
  blockedPlatforms,
  buildReelRepairPrompt,
  buildReelUserPrompt,
  chooseReelPlatforms,
  normalizeReelDraft,
  pickReelSlotToday,
  reelScore,
  scriptWords,
  warsawDay,
  type QueueOutcome,
  type ReelDraft,
  type ReelPlatformChoice,
} from "./reel-plan";
import type { PostMetrics } from "./scoring";
import {
  REEL_SLOTS,
  planNextPost,
  warsawToUtcIso,
  type HistoryItem,
  type PostPlan,
  type ReelSlotKey,
} from "./strategy";
import { describeBlocking, guardContent, type GuardResult } from "./truth-guard";
import {
  getArms,
  getPlaybook,
  isReel,
  listItems,
  type GrowthItemPayload,
  type GrowthSettings,
  type ReelPayload,
} from "./state.server";

const REEL_QUEUE_PLATFORMS = ["instagram_reels", "facebook_reels", "tiktok", "x"] as const;
/** Publikacja „w toku” dłużej niż tyle godzin po terminie — zawieszona. */
const STUCK_AFTER_H = 6;
/** Render dłuższy niż tyle godzin uznajemy za zawieszony. */
const PRODUCE_TIMEOUT_H = 8;
/** Ponad dzienną liczbę rolek: tyle dodatkowych prób (blokada, nieudany render). */
const MAX_EXTRA_ATTEMPTS = 2;
/** Minimalny zapas kredytów HeyGen (≈ minuty wideo) przed zleceniem rolki. */
const MIN_HEYGEN_CREDITS = 1.5;

// ── środowisko: platformy, pokrycie dni ────────────────────────────────────

export async function reelPlatformChoice(
  settings: GrowthSettings,
  now: Date,
): Promise<ReelPlatformChoice> {
  const [{ collectStudioStatus }, { platformAvailability }] = await Promise.all([
    import("@/lib/studio-status.server"),
    import("@/lib/studio-platforms"),
  ]);
  const availability = platformAvailability(await collectStudioStatus());
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const [social, yt] = await Promise.all([
    supabaseAdmin
      .from("social_publish_queue")
      .select("platform, status, last_error, updated_at, scheduled_at")
      .in("platform", [...REEL_QUEUE_PLATFORMS])
      .gte("scheduled_at", since)
      .limit(200),
    supabaseAdmin
      .from("youtube_publish_queue")
      .select("status, last_error, updated_at, scheduled_at")
      .gte("scheduled_at", since)
      .limit(100),
  ]);
  const outcomes: QueueOutcome[] = [
    ...((social.data ?? []) as QueueOutcome[]),
    ...((yt.data ?? []) as Omit<QueueOutcome, "platform">[]).map((r) => ({
      ...r,
      platform: "youtube",
    })),
  ];
  return chooseReelPlatforms({
    availability,
    blocked: blockedPlatforms(outcomes, now),
    preference: settings.reelPlatforms,
    tiktokOptionsSet: Boolean(settings.tiktokPostOptions),
  });
}

interface ReelSlotUse {
  at: string;
  source: "agent" | "inne";
  queueIds: string[];
}

/**
 * Rolki zaplanowane albo opublikowane w oknie [od, do] — z kolejek Studia
 * (dowolne źródło) i z produkcji agenta (jeszcze bez wpisów w kolejce).
 * Jedna rolka = jedno wideo, choć ma kilka wpisów (po jednym na platformę).
 */
async function reelUses(fromIso: string, toIso: string): Promise<ReelSlotUse[]> {
  const [social, yt, items] = await Promise.all([
    supabaseAdmin
      .from("social_publish_queue")
      .select("id, video_url, scheduled_at, status")
      .in("platform", ["instagram_reels", "facebook_reels", "tiktok"])
      .not("status", "in", "(cancelled,failed)")
      .gte("scheduled_at", fromIso)
      .lte("scheduled_at", toIso)
      .limit(200),
    supabaseAdmin
      .from("youtube_publish_queue")
      .select("id, source_video_url, scheduled_at, status")
      .not("status", "in", "(cancelled,failed)")
      .gte("scheduled_at", fromIso)
      .lte("scheduled_at", toIso)
      .limit(100),
    listItems({ stage: ["producing", "scheduled", "awaiting_approval"], limit: 50 }),
  ]);
  const agentQueueIds = new Set<string>();
  const out: ReelSlotUse[] = [];
  for (const r of items) {
    const p = r.payload as unknown as GrowthItemPayload;
    if (!isReel(p)) continue;
    const ids = [
      ...(p.reel?.social ?? []).map((s) => s.id),
      ...(p.reel?.youtube ?? []).map((y) => y.id),
    ];
    ids.forEach((id) => agentQueueIds.add(id));
    const at = p.plan.slotIso;
    if (at >= fromIso && at <= toIso) out.push({ at, source: "agent", queueIds: ids });
  }
  const byVideo = new Map<string, ReelSlotUse>();
  const add = (id: string, video: string | null, at: string) => {
    if (agentQueueIds.has(id)) return;
    const key = video || id;
    const cur = byVideo.get(key);
    if (cur) cur.queueIds.push(id);
    else byVideo.set(key, { at, source: "inne", queueIds: [id] });
  };
  for (const r of (social.data ?? []) as any[]) add(r.id, r.video_url, r.scheduled_at);
  for (const r of (yt.data ?? []) as any[]) add(r.id, r.source_video_url, r.scheduled_at);
  return [...out, ...byVideo.values()];
}

function dayWindow(now: Date, dayOffset: number): { from: string; to: string } {
  const from = warsawToUtcIso(now, dayOffset, 0, 0);
  const to = new Date(
    new Date(warsawToUtcIso(now, dayOffset + 1, 0, 0)).getTime() - 1,
  ).toISOString();
  return { from, to };
}

// ── tworzenie ──────────────────────────────────────────────────────────────

export interface CreateReelResult {
  itemId: string | null;
  stage: GrowthItemPayload["stage"] | "dry_run" | "skipped";
  costPln: number;
  plan?: PostPlan;
  draft?: ReelDraft;
  platforms?: ReelPlatformChoice;
  violations?: GuardResult["violations"];
  reason?: string;
}

function guardReel(plan: PostPlan, d: ReelDraft, now: Date) {
  const audience = plan.audience === "inwestor" ? "inwestor" : "klient";
  const script = guardContent({ text: d.script, audience, platform: "reel_script", date: now });
  // Ten sam opis idzie na Instagram, Facebook, YouTube i TikToka — strażnik
  // jak dla Facebooka zamienia „link w bio” na financeyou.pl.
  const caption = guardContent({ text: d.caption, audience, platform: "facebook_post", date: now });
  const title = guardContent({ text: d.title, audience, platform: "reel_script", date: now });
  const short = guardContent({ text: d.short, audience, platform: "x", date: now });
  const words = scriptWords(d.script);
  if (words < 45 || words > 160) {
    script.ok = false;
    script.violations.push({
      code: "dlugosc_scenariusza",
      severity: "block",
      message: `Scenariusz ma ${words} słów — rolka potrzebuje 70–120 (25–45 sekund).`,
    });
  }
  if (!d.caption) {
    caption.ok = false;
    caption.violations.push({
      code: "brak_opisu",
      severity: "block",
      message: "Brak opisu rolki.",
    });
  }
  return { script, caption, title, short };
}

async function heygenCreditsOk(): Promise<{ ok: boolean; credits: number | null }> {
  try {
    const { getRemainingQuota } = await import("@/lib/heygen-api.server");
    const q = await getRemainingQuota();
    return {
      ok: q.credits_estimate == null || q.credits_estimate >= MIN_HEYGEN_CREDITS,
      credits: q.credits_estimate,
    };
  } catch {
    // Nie wiemy — nie blokujemy; Studio samo zgłosi błąd renderu.
    return { ok: true, credits: null };
  }
}

async function recentReelTitles(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("studio_video_jobs")
    .select("publish_title, prompt")
    .order("created_at", { ascending: false })
    .limit(15);
  return ((data ?? []) as Array<{ publish_title: string | null; prompt: string }>)
    .map((r) => (r.publish_title || r.prompt || "").trim())
    .filter(Boolean);
}

export async function createReel(opts: {
  settings: GrowthSettings;
  now?: Date;
  dryRun?: boolean;
  force?: boolean;
  audience?: PostPlan["audience"];
}): Promise<CreateReelResult> {
  const now = opts.now ?? new Date();

  // Ile rolek już ma dzisiejszy dzień (ręczne, inne procesy, agent).
  const today = dayWindow(now, 0);
  const uses = await reelUses(today.from, today.to);
  if (!opts.force && uses.length >= opts.settings.reelsPerDay) {
    return {
      itemId: null,
      stage: "skipped",
      costPln: 0,
      reason: `dzień ma już rolkę (${uses.map((u) => `${u.source} ${u.at.slice(11, 16)} UTC`).join(", ")})`,
    };
  }

  if (
    !opts.force &&
    !pickReelSlotToday({ now, preferred: REEL_SLOTS[0], takenIso: uses.map((u) => u.at) })
  ) {
    return {
      itemId: null,
      stage: "skipped",
      costPln: 0,
      reason: "dziś nie ma już pory z zapasem na render",
    };
  }
  // Limit prób na dzień: scenariusz zablokowany przez strażnika albo
  // nieudany render nie może generować kosztów co 10 minut.
  const attempts = (await listItems({ sinceIso: today.from, limit: 50 })).filter((r) =>
    isReel(r.payload),
  ).length;
  if (!opts.force && attempts >= opts.settings.reelsPerDay + MAX_EXTRA_ATTEMPTS) {
    return {
      itemId: null,
      stage: "skipped",
      costPln: 0,
      reason: `limit prób rolki na dziś (${attempts})`,
    };
  }

  const choice = await reelPlatformChoice(opts.settings, now);
  if (choice.platforms.length === 0) {
    return {
      itemId: null,
      stage: "skipped",
      costPln: 0,
      platforms: choice,
      reason: "żadna platforma wideo nie jest dostępna",
    };
  }

  const [arms, playbook, history, titles] = await Promise.all([
    getArms("reel"),
    getPlaybook(),
    listItems({ limit: 60 }),
    recentReelTitles(),
  ]);
  const hist: HistoryItem[] = history
    .filter((r) => r.payload?.plan && isReel(r.payload))
    .map((r) => ({
      audience: r.payload!.plan.audience,
      pillar: r.payload!.plan.pillar,
      hook: r.payload!.plan.hook,
      questionId: r.payload!.plan.question?.id ?? null,
      createdAt: r.created_at,
    }));
  let plan = planNextPost({
    arms,
    history: hist,
    now,
    rng: Math.random,
    slots: REEL_SLOTS,
    questionBank: SHORTS_QUESTIONS,
  });
  if (opts.audience && opts.audience !== plan.audience) plan = { ...plan, audience: opts.audience };
  const slot = pickReelSlotToday({
    now,
    preferred: plan.slot as ReelSlotKey,
    takenIso: uses.map((u) => u.at),
  });
  if (!slot && !opts.force) {
    return {
      itemId: null,
      stage: "skipped",
      costPln: 0,
      plan,
      reason: "dziś nie ma już pory z zapasem na render",
    };
  }
  const slotIso = slot?.slotIso ?? new Date(now.getTime() + 90 * 60_000).toISOString();
  plan = { ...plan, slot: slot?.slot ?? plan.slot, slotIso };

  if (!opts.dryRun) {
    const credits = await heygenCreditsOk();
    if (!credits.ok) {
      const { requestCapability } = await import("@/lib/agent-toolkit/capabilities.server");
      await requestCapability(
        {
          key: "heygen_credits",
          description: `Brak kredytów HeyGen na codzienną rolkę (zostało ok. ${credits.credits}).`,
          why: "Rolka to główny produkt agenta wzrostu.",
        },
        { requester: "growth_agent" },
      ).catch(() => null);
      return {
        itemId: null,
        stage: "skipped",
        costPln: 0,
        plan,
        reason: `za mało kredytów HeyGen (${credits.credits})`,
      };
    }
  }

  const factsBlock = buildLiveFactsBlock(plan.audience === "inwestor" ? "inwestor" : "klient", now);
  let costPln = 0;
  const userPrompt = buildReelUserPrompt({ plan, factsBlock, playbook, recentTitles: titles });
  const first = await growthLlmJson({ system: REEL_SYSTEM_PROMPT, user: userPrompt });
  costPln += first.costPln;
  let draft = normalizeReelDraft(first.data);
  let g = guardReel(plan, draft, now);
  if (!g.script.ok || !g.caption.ok || !g.title.ok) {
    const problems = [
      describeBlocking(g.script),
      describeBlocking(g.caption),
      describeBlocking(g.title),
    ]
      .filter(Boolean)
      .join("\n");
    const second = await growthLlmJson({
      system: REEL_SYSTEM_PROMPT,
      user: `${userPrompt}\n\n${buildReelRepairPrompt(draft, problems)}`,
      temperature: 0.4,
    });
    costPln += second.costPln;
    draft = normalizeReelDraft(second.data);
    g = guardReel(plan, draft, now);
  }

  const violations = [
    ...g.script.violations,
    ...g.caption.violations,
    ...g.title.violations,
    ...g.short.violations,
  ];
  // X tylko, gdy krótka wersja też przeszła strażnika.
  const targets = choice.platforms.filter((p) => p !== "x" || g.short.ok);
  const skipped = [
    ...choice.skipped,
    ...(choice.platforms.includes("x") && !g.short.ok
      ? [{ platform: "x" as StudioPlatform, reason: "krótka wersja nie przeszła strażnika" }]
      : []),
  ];
  const reel: ReelPayload = {
    script: g.script.text,
    title: g.title.text,
    caption: g.caption.text,
    short: g.short.text,
    studioJobId: null,
    videoUrl: null,
    targets,
    skipped,
    social: [],
    youtube: [],
  };
  const base: Omit<GrowthItemPayload, "stage"> = {
    format: "reel",
    reel,
    plan,
    texts: { facebook: g.caption.text, instagram: g.caption.text },
    summary: draft.summary,
    imagePrompt: "",
    imageUrl: null,
    altText: "",
    guard: {
      script: g.script.violations,
      caption: g.caption.violations,
      title: g.title.violations,
      x: g.short.violations,
    },
    platforms: [],
  };

  const blocked = !g.script.ok || !g.caption.ok || !g.title.ok;
  if (blocked) {
    const itemId = opts.dryRun
      ? null
      : await logAgentAction({
          module: "growth_agent",
          action: "item",
          status: "blocked",
          summary: `Strażnik prawdy zablokował rolkę (${plan.audience}/${plan.pillar}): ${violations
            .filter((v) => v.severity === "block")
            .map((v) => v.code)
            .join(", ")}`,
          payload: { ...base, stage: "blocked" } as unknown as Record<string, unknown>,
          costPln,
        });
    return { itemId, stage: "blocked", costPln, plan, draft, platforms: choice, violations };
  }
  if (opts.dryRun)
    return { itemId: null, stage: "dry_run", costPln, plan, draft, platforms: choice, violations };

  const payload: GrowthItemPayload = {
    ...base,
    stage: opts.settings.mode === "draft" ? "awaiting_approval" : "producing",
  };
  const itemId = await logAgentAction({
    module: "growth_agent",
    action: "item",
    status: "ok",
    summary:
      `${payload.stage === "producing" ? "Rolka w produkcji" : "Rolka do akceptacji"}: ${draft.title}`.slice(
        0,
        480,
      ),
    payload: payload as unknown as Record<string, unknown>,
    costPln,
  });
  if (itemId && payload.stage === "producing") await startReelProduction(itemId, payload);
  return { itemId, stage: payload.stage, costPln, plan, draft, platforms: choice, violations };
}

/**
 * Silnik wykończenia rolki (napisy, znaczek „AI”). Domyślny z ustawień Studia;
 * gdy nie odpowiada (np. caption-burner leży), a Remotion Lambda jest gotowy —
 * Remotion. Bez działającego silnika rolka z napisami nie wyjdzie.
 */
async function pickRenderEngine(): Promise<"auto" | "remotion"> {
  try {
    const { captionBurnerPreflight } = await import("@/lib/caption-burner.server");
    const auto = await captionBurnerPreflight({ captions: true, engine: "auto" });
    if (auto.ok) return "auto";
    const rem = await captionBurnerPreflight({ captions: true, engine: "remotion" });
    return rem.ok ? "remotion" : "auto";
  } catch {
    return "auto";
  }
}

/** Zlecenie rolki w Studiu (render robi tick Studia). */
export async function startReelProduction(
  itemId: string,
  payload: GrowthItemPayload,
): Promise<GrowthItemPayload> {
  const reel = payload.reel!;
  const { HEYGEN_AVATARS, FILIP_VOICE_ID } = await import("@/lib/heygen-avatars");
  const { listDefaultAvatars } = await import("@/lib/studio-avatars.server");
  const lead = (await listDefaultAvatars())[0]?.avatar_id ?? HEYGEN_AVATARS[0].id;
  const engine = await pickRenderEngine();
  const { data, error } = await supabaseAdmin
    .from("studio_video_jobs")
    .insert({
      prompt: `Agent wzrostu · ${reel.title}`.slice(0, 300),
      script: reel.script,
      avatar_id: lead,
      // Pusto = rotacja twarzy z zestawu domyślnych Studia (jak w kolejce).
      avatar_ids: [],
      voice_id: FILIP_VOICE_ID,
      status: "queued",
      captions: true,
      caption_style: "reels",
      render_engine: engine,
      dynamic_scenes: true,
      reel_structure: true,
      auto_publish_platforms: [],
      publish_privacy: "public",
      publish_title: reel.title,
      publish_description: reel.caption,
      created_by: null,
    })
    .select("id")
    .single();
  const next: GrowthItemPayload = { ...payload, stage: "producing", reel: { ...reel } };
  if (error || !data) {
    next.stage = "failed";
    next.reel!.jobError = `zlecenie w Studiu: ${error?.message ?? "brak id"}`;
  } else {
    next.reel!.studioJobId = data.id as string;
    next.reel!.jobStatus = "queued";
    const { setJobMaterialAudience } = await import("@/lib/studio-materials.server");
    await setJobMaterialAudience(
      data.id as string,
      payload.plan.audience === "inwestor" ? "inwestor" : "klient",
    );
  }
  await updateAgentAction(itemId, {
    payload: next as unknown as Record<string, unknown>,
    status: next.stage === "failed" ? "error" : "ok",
  });
  return next;
}

// ── produkcja → publikacja ─────────────────────────────────────────────────

/**
 * Termin publikacji gotowej rolki. Jeśli w międzyczasie ktoś inny dodał
 * rolkę na ten dzień, przesuwamy naszą na ten sam slot następnego wolnego
 * dnia — film już powstał, nie marnujemy go i nie dublujemy.
 */
async function publicationTime(p: GrowthItemPayload, now: Date): Promise<string> {
  const minIso = new Date(now.getTime() + 10 * 60_000).toISOString();
  let at = p.plan.slotIso < minIso ? minIso : p.plan.slotIso;
  for (let i = 0; i < 4; i++) {
    const day = warsawDay(at);
    const offset = Math.round(
      (new Date(`${day}T12:00:00Z`).getTime() - new Date(`${warsawDay(now)}T12:00:00Z`).getTime()) /
        86_400_000,
    );
    const w = dayWindow(now, offset);
    const others = (await reelUses(w.from, w.to)).filter((u) => u.source === "inne");
    if (others.length === 0) return at;
    at = new Date(new Date(at).getTime() + 86_400_000).toISOString();
  }
  return at;
}

async function enqueueReel(
  p: GrowthItemPayload,
  settings: GrowthSettings,
  now: Date,
): Promise<GrowthItemPayload> {
  const reel = p.reel!;
  const choice = await reelPlatformChoice(settings, now);
  const platforms = reel.targets.filter((t) => choice.platforms.includes(t));
  const at = await publicationTime(p, now);
  const { enqueuePublication } = await import("@/lib/studio-enqueue.server");
  const next: GrowthItemPayload = {
    ...p,
    plan: { ...p.plan, slotIso: at },
    reel: { ...reel, social: [...reel.social], youtube: [...reel.youtube], targets: platforms },
  };
  const main = platforms.filter((x) => x !== "x");
  if (main.length) {
    const r = await enqueuePublication({
      platforms: main,
      title: reel.title,
      message: reel.caption,
      video_url: reel.videoUrl!,
      privacy_status: "public",
      scheduled_at: at,
      tiktok_post_options: settings.tiktokPostOptions ?? undefined,
      userId: null,
    });
    next.reel!.social.push(...r.social.map((s) => ({ id: s.id, platform: s.platform })));
    next.reel!.youtube.push(...r.youtube.map((y) => ({ id: y.id })));
  }
  if (platforms.includes("x")) {
    try {
      const r = await enqueuePublication({
        platforms: ["x"],
        title: reel.title,
        message: reel.short,
        video_url: reel.videoUrl!,
        scheduled_at: at,
        userId: null,
      });
      next.reel!.social.push(...r.social.map((s) => ({ id: s.id, platform: s.platform })));
    } catch (e) {
      next.reel!.skipped.push({
        platform: "x",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
  next.reel!.queuedAt = now.toISOString();
  next.stage = next.reel!.social.length || next.reel!.youtube.length ? "scheduled" : "failed";
  return next;
}

async function advanceProducing(
  row: ActionRow,
  settings: GrowthSettings,
  now: Date,
): Promise<string | null> {
  const p = row.payload as unknown as GrowthItemPayload;
  const reel = p.reel;
  if (!reel?.studioJobId) return null;
  const { data: job } = await supabaseAdmin
    .from("studio_video_jobs")
    .select("*")
    .eq("id", reel.studioJobId)
    .maybeSingle();
  let next: GrowthItemPayload = { ...p, reel: { ...reel } };
  if (!job) {
    next.stage = "failed";
    next.reel!.jobError = "zlecenie zniknęło ze Studia";
  } else if (job.status === "ready" && job.video_url) {
    next.reel!.videoUrl = job.video_url;
    next.reel!.jobStatus = "ready";
    next = await enqueueReel(next, settings, now);
  } else if (job.status === "failed") {
    const retries = reel.retries ?? 0;
    if (retries < 1) {
      try {
        const { retryStudioJob } = await import("@/lib/studio-video-queue.server");
        await retryStudioJob(job as any);
        next.reel!.retries = retries + 1;
        next.reel!.jobStatus = "retry";
        next.reel!.jobError = job.last_error ?? null;
      } catch (e) {
        next.stage = "failed";
        next.reel!.jobError = `${job.last_error ?? "render nieudany"}; ponowienie: ${e instanceof Error ? e.message : e}`;
      }
    } else {
      next.stage = "failed";
      next.reel!.jobError = job.last_error ?? "render nieudany po ponowieniu";
    }
  } else {
    const ageH = (now.getTime() - new Date(row.created_at).getTime()) / 3600_000;
    if (ageH > PRODUCE_TIMEOUT_H) {
      next.stage = "failed";
      next.reel!.jobError = `render trwa ponad ${PRODUCE_TIMEOUT_H} h (status ${job.status})`;
    } else if (job.status === reel.jobStatus) {
      return null;
    } else {
      next.reel!.jobStatus = job.status;
    }
  }
  await updateAgentAction(row.id, {
    payload: next as unknown as Record<string, unknown>,
    status: next.stage === "failed" ? "error" : "ok",
  });
  return `${row.id.slice(0, 8)}:${next.stage}${next.reel?.jobStatus ? ` (${next.reel.jobStatus})` : ""}${next.reel?.jobError ? ` ${next.reel.jobError.slice(0, 80)}` : ""}`;
}

async function advanceScheduled(row: ActionRow, now: Date): Promise<string | null> {
  const p = row.payload as unknown as GrowthItemPayload;
  const reel = p.reel!;
  // Wpis, który kilka godzin po terminie nadal „się publikuje”, utknął
  // (np. proces padł w trakcie wysyłki dużego wideo). Nie ponawiamy go —
  // Meta mogła już opublikować — tylko przestajemy na niego czekać.
  const stuck = now.getTime() - new Date(p.plan.slotIso).getTime() > STUCK_AFTER_H * 3600_000;
  const socialIds = reel.social.map((s) => s.id);
  const ytIds = reel.youtube.map((y) => y.id);
  const [social, yt] = await Promise.all([
    socialIds.length
      ? supabaseAdmin
          .from("social_publish_queue")
          .select("id, status, external_post_id, last_error, published_at")
          .in("id", socialIds)
      : Promise.resolve({ data: [] as any[] }),
    ytIds.length
      ? supabaseAdmin
          .from("youtube_publish_queue")
          .select("id, status, youtube_video_id, last_error, published_at")
          .in("id", ytIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const sMap = new Map(((social.data ?? []) as any[]).map((r) => [r.id, r]));
  const yMap = new Map(((yt.data ?? []) as any[]).map((r) => [r.id, r]));
  const terminal = (s?: string) =>
    s === "published" || s === "failed" || s === "cancelled" || s === "zawieszony";
  const settle = (status: string | undefined) =>
    status && !terminal(status) && stuck ? "zawieszony" : (status ?? "usunięty");
  const nextSocial = reel.social.map((s) => {
    const r = sMap.get(s.id);
    return {
      ...s,
      status: settle(r?.status),
      externalId: r?.external_post_id ?? null,
      error: r?.last_error ?? null,
    };
  });
  const nextYt = reel.youtube.map((y) => {
    const r = yMap.get(y.id);
    return {
      ...y,
      status: settle(r?.status),
      videoId: r?.youtube_video_id ?? null,
      error: r?.last_error ?? null,
    };
  });
  const all = [...nextSocial.map((s) => s.status), ...nextYt.map((y) => y.status)];
  const changed =
    JSON.stringify(nextSocial) !== JSON.stringify(reel.social) ||
    JSON.stringify(nextYt) !== JSON.stringify(reel.youtube);
  if (!changed && !all.every((s) => terminal(s) || s === "usunięty")) return null;
  const next: GrowthItemPayload = { ...p, reel: { ...reel, social: nextSocial, youtube: nextYt } };
  if (all.every((s) => terminal(s) || s === "usunięty")) {
    const published = [
      ...((social.data ?? []) as any[]).filter((r) => r.status === "published"),
      ...((yt.data ?? []) as any[]).filter((r) => r.status === "published"),
    ];
    next.stage = published.length ? "published" : "failed";
    next.publishedAt = published.length
      ? published.map((r) => String(r.published_at ?? new Date().toISOString())).sort()[0]
      : null;
  }
  await updateAgentAction(row.id, {
    payload: next as unknown as Record<string, unknown>,
    status: next.stage === "failed" ? "error" : "ok",
  });
  const summary = [
    ...nextSocial.map((s) => `${s.platform}=${s.status}`),
    ...nextYt.map((y) => `youtube=${y.status}`),
  ].join(" ");
  return `${row.id.slice(0, 8)}:${next.stage} ${summary}`;
}

/** Domykanie rolek agenta: render → kolejka → wynik publikacji. */
export async function advanceReels(settings: GrowthSettings, now = new Date()): Promise<string[]> {
  const rows = await listItems({ stage: ["producing", "scheduled"], limit: 30 });
  const out: string[] = [];
  for (const r of rows) {
    if (!isReel(r.payload)) continue;
    const stage = (r.payload as any)?.stage;
    const res = await (
      stage === "producing" ? advanceProducing(r, settings, now) : advanceScheduled(r, now)
    ).catch((e) => `${r.id.slice(0, 8)}:błąd ${e instanceof Error ? e.message : e}`);
    if (res) out.push(res);
  }
  return out;
}

// ── pomiar ─────────────────────────────────────────────────────────────────

const val = (rows: any[], name: string): number | null => {
  const r = rows.find((x) => x?.name === name);
  const v = r?.values?.[0]?.value ?? r?.total_value?.value;
  return typeof v === "number" ? v : null;
};

/** Metryki opublikowanej rolki na każdej platformie, na której wyszła. */
export async function reelMetrics(p: GrowthItemPayload): Promise<Record<string, PostMetrics>> {
  const out: Record<string, PostMetrics> = {};
  const m = await import("@/lib/meta-api.server");
  for (const s of p.reel?.social ?? []) {
    if (s.status !== "published" || !s.externalId) continue;
    try {
      if (s.platform === "instagram_reels") {
        const ins = await m.getIgMediaInsights(
          s.externalId,
          "views,reach,likes,comments,shares,saved",
        );
        out.instagram = {
          views: val(ins, "views"),
          reach: val(ins, "reach"),
          likes: val(ins, "likes"),
          comments: val(ins, "comments"),
          shares: val(ins, "shares"),
          saves: val(ins, "saved"),
        };
      } else if (s.platform === "facebook_reels") {
        const v = await m.graphRequest(s.externalId, {
          query: { fields: "likes.summary(true),comments.summary(true)" },
          token: "page",
        });
        // Odtworzenia rolki FB — metryka zależy od wersji Graph API, więc
        // próbujemy obu nazw i nie przerywamy pomiaru, gdy żadnej nie ma.
        const plays = await m
          .graphRequest(`${s.externalId}/video_insights`, {
            query: { metric: "blue_reels_play_count,fb_reels_total_plays" },
            token: "page",
          })
          .then((r: any) => (Array.isArray(r?.data) ? r.data : []))
          .catch(() => [] as any[]);
        out.facebook = {
          views: val(plays, "blue_reels_play_count") ?? val(plays, "fb_reels_total_plays"),
          likes: v?.likes?.summary?.total_count ?? null,
          comments: v?.comments?.summary?.total_count ?? null,
        };
      }
    } catch (e) {
      console.warn(`[growth-agent] metryki ${s.platform}: ${e instanceof Error ? e.message : e}`);
    }
  }
  const ytIds = (p.reel?.youtube ?? [])
    .map((y) => y.videoId)
    .filter((x): x is string => Boolean(x));
  if (ytIds.length) {
    try {
      const { listVideos } = await import("@/lib/youtube-api.server");
      const [v] = await listVideos(ytIds);
      const st = v?.statistics ?? {};
      out.youtube = {
        views: Number(st.viewCount ?? 0) || null,
        likes: Number(st.likeCount ?? 0) || null,
        comments: Number(st.commentCount ?? 0) || null,
      };
    } catch (e) {
      console.warn(`[growth-agent] metryki youtube: ${e instanceof Error ? e.message : e}`);
    }
  }
  return out;
}

export function reelScoreFromMetrics(metrics: Record<string, PostMetrics>): number {
  const scores = Object.values(metrics).map(reelScore);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}
