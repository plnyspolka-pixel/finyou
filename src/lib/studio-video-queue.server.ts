// Studio publikacji — kolejka wsadowa wideo HeyGen + auto-publikacja.
//
// Joby ze statusem 'queued' (wstawiane hurtowo z bazy pytań lub pojedynczo)
// przetwarza processStudioVideoQueue: scenariusz AI (jeśli pusty) → ElevenLabs
// TTS → HeyGen. Renderujące joby domyka pollStudioRenderingJobs, a gotowe
// z ustawionymi auto_publish_platforms trafiają automatycznie do kolejek
// publikacji (youtube_publish_queue / social_publish_queue — ta druga obsługuje
// Meta i TikTok).
//
// NAPISY WŁASNE: gdy job ma `caption_style` inny niż 'heygen', gotowy render
// nie idzie od razu do publikacji — czysty master + SRT HeyGena lecą do usługi
// wypalania (services/caption-burner), job dostaje status 'captioning', a
// kolejne odpytanie zapisuje gotowy plik w buckecie `studio-media` i dopiero
// wtedy publikuje. Każda awaria tej drogi kończy się wersją HeyGena z jasnym
// komunikatem w `last_error` — nigdy zawieszonym jobem.
//
// Wołane z dwóch miejsc: tick social-publish-tick (pg_cron co 10 min,
// działa też przy zamkniętej przeglądarce) oraz otwarty panel admina
// (processStudioVideoQueueNow / pollStudioVideoJob — szybszy postęp).
// Domykanie renderu i wypalania siedzi w settleHeygenCompletion /
// settleCaptionBurn — obie ścieżki podejmują dokładnie te same decyzje.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseShortsPromptTag, findShortsQuestion } from "./shorts-question-bank";
import {
  CAPTION_BURN_MAX_ATTEMPTS,
  planCaptionBurn,
  resolveCaptionBurn,
  resolveCaptionedOutput,
  type CaptionBurnPlan,
  type CaptionBurnState,
  type HeygenCaptionOutputs,
} from "./studio-captions";
import type { CustomCaptionStyleId } from "./caption-style";

export type StudioJobRow = {
  id: string;
  prompt: string;
  script: string;
  avatar_id: string;
  voice_id: string;
  heygen_video_id: string | null;
  status: string;
  video_url: string | null;
  video_url_clean: string | null;
  thumbnail_url: string | null;
  subtitle_url: string | null;
  captions: boolean;
  caption_wait_since: string | null;
  caption_style: string | null;
  caption_burn_id: string | null;
  caption_burn_started_at: string | null;
  caption_burn_attempts: number;
  dynamic_scenes: boolean;
  reel_structure: boolean;
  avatar_ids: string[];
  auto_publish_platforms: string[];
  publish_privacy: string;
  tiktok_post_options: unknown;
  publish_title: string;
  publish_description: string;
  auto_published_at: string | null;
  last_error: string | null;
  created_by: string | null;
};

type JobRow = StudioJobRow;

/** Status renderu z HeyGena (kształt z getHeygenVideoStatus). */
export type HeygenRenderStatus = HeygenCaptionOutputs & {
  status: string;
  thumbnail_url?: string | null;
  error?: unknown;
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Ile czekać na usługę napisów, zanim opublikujemy wersję zapasową. Domyślnie
 * 45 min; gdy usługa stoi na komputerze, który bywa wyłączony, można podnieść
 * (np. 720 = pół doby) — joby poczekają na włączenie zamiast schodzić na HeyGen.
 */
function captionBurnTimeoutMs(): number | undefined {
  const minutes = Number(process.env.CAPTION_BURN_TIMEOUT_MINUTES);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : undefined;
}

/** Komunikaty do `last_error` sklejamy, żeby powód pominięcia montażu nie ginął. */
const joinNotes = (...notes: Array<string | null | undefined>) =>
  notes.filter((n): n is string => Boolean(n && n.trim())).join(" ") || null;

// Tytuł do publikacji: publish_title, a w ostateczności prompt bez tagu "#N · ".
function fallbackTitle(job: JobRow): string {
  if (job.publish_title.trim()) return job.publish_title.trim();
  return job.prompt.replace(/^#\d{1,3} · /, "").slice(0, 92);
}

// Przetwarza do `limit` jobów 'queued': scenariusz → TTS → HeyGen → rendering.
// Zwraca liczbę przetworzonych i pozostałych w kolejce.
export async function processStudioVideoQueue(
  limit: number,
): Promise<{ processed: number; failed: number; remaining: number }> {
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < limit; i++) {
    // Claim najstarszego joba z kolejki — warunek status='queued' w UPDATE
    // chroni przed podwójnym przetworzeniem (tick vs otwarty panel).
    const { data: queued } = await supabaseAdmin
      .from("studio_video_jobs")
      .select("id")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!queued) break;

    const { data: claimed } = await supabaseAdmin
      .from("studio_video_jobs")
      .update({ status: "generating_script" })
      .eq("id", queued.id)
      .eq("status", "queued")
      .select("*");
    const job: JobRow | null = claimed?.[0] ?? null;
    if (!job) continue; // ktoś inny zdążył — bierz następnego

    try {
      await processClaimedJob(job);
      processed++;
    } catch (e) {
      failed++;
      await supabaseAdmin
        .from("studio_video_jobs")
        .update({ status: "failed", last_error: e instanceof Error ? e.message : String(e) })
        .eq("id", job.id);
    }
  }

  const { count } = await supabaseAdmin
    .from("studio_video_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");
  return { processed, failed, remaining: count ?? 0 };
}

async function processClaimedJob(job: JobRow): Promise<void> {
  let script = job.script.trim();
  let publishTitle = job.publish_title;
  let publishDescription = job.publish_description;

  if (!script) {
    const questionId = parseShortsPromptTag(job.prompt);
    const q = questionId != null ? findShortsQuestion(questionId) : undefined;
    let gen: { script: string; title: string; description: string; hashtags: string[] };
    if (q) {
      // Pytanie z paczki 250: gotowy, sprawdzony scenariusz 1:1 z pliku — bez AI.
      const { buildShortsScript } = await import("./shorts-script");
      gen = buildShortsScript(q);
    } else {
      const { generateVideoScript } = await import("./studio-ai.server");
      gen = await generateVideoScript(job.prompt);
    }
    script = gen.script;
    if (!publishTitle.trim()) publishTitle = gen.title;
    if (!publishDescription.trim())
      publishDescription = [gen.description, gen.hashtags.join(" ")].filter(Boolean).join("\n\n");
  }

  await supabaseAdmin
    .from("studio_video_jobs")
    .update({
      script,
      publish_title: publishTitle,
      publish_description: publishDescription,
      status: "generating_audio",
    })
    .eq("id", job.id);

  await supabaseAdmin.from("studio_video_jobs").update({ status: "uploading" }).eq("id", job.id);

  // Rotacja a-rolli: zapisana przy jobie, a gdy pusta — aktualny stały zestaw
  // domyślnych awatarów (joby z kolejki nie przechodzą przez panel).
  const { resolveAvatarRotation } = await import("./studio-avatars.server");
  const avatarIds = await resolveAvatarRotation(job.avatar_ids);

  const { renderStudioVideo } = await import("./studio-render.server");
  const rendered = await renderStudioVideo({
    script,
    topic: job.prompt,
    avatarId: job.avatar_id,
    voiceId: job.voice_id,
    captions: job.captions !== false,
    dynamicScenes: job.dynamic_scenes === true || job.reel_structure === true,
    reelStructure: job.reel_structure === true,
    avatarIds,
  });
  await supabaseAdmin
    .from("studio_video_jobs")
    .update({
      heygen_video_id: rendered.videoId,
      status: "rendering",
      captions: rendered.captionMode === "burned",
      caption_wait_since: null,
      scene_plan: rendered.scenePlan,
      last_error: rendered.note,
    })
    .eq("id", job.id);
}

// ── Domykanie renderu i napisów ─────────────────────────────────────────────

export type SettleOutcome =
  /** Wideo gotowe, ale czekamy jeszcze (wersja z napisami HeyGena albo usługa wypalania). */
  | { state: "waiting" }
  /** Zlecono własne napisy — job w statusie 'captioning'. */
  | { state: "captioning" }
  | { state: "ready"; videoUrl: string; autoPublished: boolean };

async function markReady(
  job: JobRow,
  patch: Record<string, unknown> & { video_url: string },
): Promise<SettleOutcome> {
  await supabaseAdmin
    .from("studio_video_jobs")
    .update({ status: "ready", ...patch })
    .eq("id", job.id);
  const autoPublished = await maybeAutoPublishJob({
    ...job,
    status: "ready",
    video_url: patch.video_url,
  });
  return { state: "ready", videoUrl: patch.video_url, autoPublished };
}

async function submitBurn(
  job: JobRow,
  plan: Extract<CaptionBurnPlan, { action: "burn" }>,
  thumbnailUrl: string | null,
): Promise<void> {
  const { submitCaptionBurn } = await import("./caption-burner.server");
  const burnId = await submitCaptionBurn({
    videoUrl: plan.videoUrl,
    srtUrl: plan.srtUrl,
    styleId: plan.styleId,
    name: fallbackTitle(job),
  });
  await supabaseAdmin
    .from("studio_video_jobs")
    .update({
      status: "captioning",
      caption_style: plan.styleId,
      caption_burn_id: burnId,
      caption_burn_started_at: new Date().toISOString(),
      caption_burn_attempts: job.caption_burn_attempts + 1,
      video_url_clean: plan.videoUrl,
      subtitle_url: plan.srtUrl,
      thumbnail_url: thumbnailUrl ?? job.thumbnail_url ?? null,
      caption_wait_since: null,
    })
    .eq("id", job.id);
}

/**
 * Gotowy render HeyGena: własne napisy (jeśli zamówione i możliwe) albo
 * publikacja wersji HeyGena — z dotychczasową karencją na wypaloną wersję.
 * Jedna funkcja dla ticka i pollingu z panelu.
 */
export async function settleHeygenCompletion(
  job: JobRow,
  status: HeygenRenderStatus,
): Promise<SettleOutcome> {
  const { isCaptionBurnerConfigured } = await import("./caption-burner.server");
  const plan = planCaptionBurn({
    captions: job.captions,
    captionStyle: job.caption_style,
    burnerConfigured: isCaptionBurnerConfigured(),
    outputs: status,
  });
  let planNote: string | null = plan.action === "heygen" ? plan.reason : null;

  if (plan.action === "burn") {
    try {
      await submitBurn(job, plan, status.thumbnail_url ?? null);
      return { state: "captioning" };
    } catch (e) {
      console.warn(`[Studio] zlecenie napisów własnych nieudane (${job.id}): ${errMsg(e)}`);
      planNote = `Własne napisy nieudane przy zleceniu: ${errMsg(e)} — napisy HeyGena.`;
    }
  }

  // HeyGen oddaje wersję z wypalonymi napisami jako OSOBNY plik
  // (captioned_video_url) — publikujemy ją, nie czysty master.
  const resolved = resolveCaptionedOutput({
    want: job.captions ? "burned" : "sidecar",
    outputs: status,
    waitSince: job.caption_wait_since,
    now: new Date(),
  });
  if (resolved.state === "waiting") {
    // Zostajemy w 'rendering' — kolejny tick dokończy albo odpuści.
    await supabaseAdmin
      .from("studio_video_jobs")
      .update({ caption_wait_since: resolved.waitSince })
      .eq("id", job.id);
    return { state: "waiting" };
  }
  return markReady(job, {
    video_url: resolved.videoUrl,
    video_url_clean: resolved.cleanVideoUrl,
    thumbnail_url: status.thumbnail_url ?? null,
    subtitle_url: resolved.subtitleUrl,
    captions: resolved.captionsBurned,
    // Cokolwiek zamówiono, tu publikujemy plik HeyGena — flaga ma mówić prawdę.
    caption_style: "heygen",
    caption_wait_since: null,
    caption_burn_id: null,
    caption_burn_started_at: null,
    last_error: joinNotes(job.last_error, resolved.note, planNote),
  });
}

/**
 * Job w statusie 'captioning': odpytuje usługę wypalania i domyka — zapis
 * gotowego pliku, ponowienie (usługa mogła się zrestartować) albo wersja
 * zapasowa po błędzie / przekroczeniu czasu.
 */
export async function settleCaptionBurn(job: JobRow): Promise<SettleOutcome> {
  const burner = await import("./caption-burner.server");
  let probe: { status: CaptionBurnState; error: string | null };
  if (!job.caption_burn_id) {
    probe = { status: "missing", error: "brak id zadania w usłudze" };
  } else {
    try {
      probe = await burner.getCaptionBurnStatus(job.caption_burn_id);
    } catch (e) {
      // Usługa nie odpowiada — nie zużywamy próby, czekamy do limitu czasu.
      console.warn(`[Studio] usługa napisów nie odpowiada (${job.id}): ${errMsg(e)}`);
      probe = { status: "processing", error: null };
    }
  }
  return finishCaptionBurn(job, probe);
}

async function finishCaptionBurn(
  job: JobRow,
  probe: { status: CaptionBurnState; error: string | null },
): Promise<SettleOutcome> {
  const burner = await import("./caption-burner.server");
  // Przy zmianie napisów gotowego wideo poprzedni plik zostaje pod video_url
  // i wraca, gdy nowe napisy się nie udadzą; przy pierwszym renderze go nie ma.
  const previous = job.video_url
    ? { videoUrl: job.video_url, captions: job.captions, captionStyle: job.caption_style }
    : null;
  const resolveWith = (heygen: HeygenCaptionOutputs | null) =>
    resolveCaptionBurn({
      status: probe.status,
      error: probe.error,
      startedAt: job.caption_burn_started_at,
      attempts: job.caption_burn_attempts,
      now: new Date(),
      fallback: { previous, heygen },
      timeoutMs: captionBurnTimeoutMs(),
    });

  let resolution = resolveWith(null);
  if (resolution.state === "fallback" && !previous) {
    // Wersja zapasowa z HeyGena: może już jest plik z ich napisami.
    let heygen: HeygenCaptionOutputs | null = null;
    if (job.heygen_video_id) {
      const { getHeygenVideoStatus } = await import("./avatar-faq.server");
      heygen = await getHeygenVideoStatus(job.heygen_video_id).catch(() => null);
    }
    resolution = resolveWith(heygen ?? { video_url: job.video_url_clean });
  }

  if (resolution.state === "waiting") return { state: "waiting" };

  if (resolution.state === "store") {
    try {
      const stored = await burner.storeCaptionBurnResult(job.caption_burn_id!, fallbackTitle(job));
      await burner.discardCaptionBurn(job.caption_burn_id!);
      return await markReady(job, {
        video_url: stored.url,
        captions: true,
        caption_burn_id: null,
        caption_burn_started_at: null,
        caption_wait_since: null,
      });
    } catch (e) {
      console.warn(`[Studio] zapis wypalonego pliku nieudany (${job.id}): ${errMsg(e)}`);
      return finishCaptionBurn(job, { status: "failed", error: `zapis pliku: ${errMsg(e)}` });
    }
  }

  if (resolution.state === "retry") {
    const styleId = job.caption_style as CustomCaptionStyleId;
    const plan = planCaptionBurn({
      captions: true,
      captionStyle: styleId,
      burnerConfigured: burner.isCaptionBurnerConfigured(),
      outputs: { video_url: job.video_url_clean, subtitle_url: job.subtitle_url },
    });
    if (plan.action === "burn") {
      try {
        console.warn(`[Studio] ponawiam napisy własne (${job.id}): ${resolution.reason}`);
        await submitBurn(job, plan, job.thumbnail_url);
        return { state: "captioning" };
      } catch (e) {
        probe = { status: "failed", error: `ponowienie: ${errMsg(e)}` };
      }
    } else {
      probe = { status: "failed", error: plan.reason ?? resolution.reason };
    }
    // Ponowienie niemożliwe — domykamy wersją zapasową bez kolejnych prób.
    return finishCaptionBurn({ ...job, caption_burn_attempts: CAPTION_BURN_MAX_ATTEMPTS }, probe);
  }

  if (job.caption_burn_id) await burner.discardCaptionBurn(job.caption_burn_id);
  if (!resolution.videoUrl) {
    await supabaseAdmin
      .from("studio_video_jobs")
      .update({
        status: "failed",
        caption_burn_id: null,
        caption_burn_started_at: null,
        last_error: joinNotes(job.last_error, `${resolution.note} Brak też pliku HeyGena.`),
      })
      .eq("id", job.id);
    return { state: "waiting" };
  }
  return markReady(job, {
    video_url: resolution.videoUrl,
    captions: resolution.captionsBurned,
    caption_style: resolution.captionStyle,
    caption_burn_id: null,
    caption_burn_started_at: null,
    last_error: joinNotes(job.last_error, resolution.note),
  });
}

/**
 * Zmiana napisów gotowego wideo: czysty master (video_url_clean, a gdy go nie
 * ma — video_url bez napisów) + SRT HeyGena lecą do usługi w nowym stylu.
 * Poprzedni plik zostaje pod video_url do czasu sukcesu (wraca przy porażce).
 * Nie publikuje ponownie — auto_published_at zostaje, publikacja ręcznie.
 */
export async function restyleJobCaptions(
  job: JobRow,
  styleId: CustomCaptionStyleId,
): Promise<void> {
  if (job.status !== "ready") throw new Error("Napisy można zmienić tylko dla gotowego wideo.");
  const { isCaptionBurnerConfigured } = await import("./caption-burner.server");
  if (!isCaptionBurnerConfigured()) {
    throw new Error(
      "Usługa wypalania napisów nie jest skonfigurowana (CAPTION_BURNER_URL / CAPTION_BURNER_SECRET).",
    );
  }
  const clean = job.video_url_clean ?? (!job.captions ? job.video_url : null);
  if (!clean) throw new Error("Brak czystego mastera bez napisów — nie ma na czym wypalić nowych.");
  if (!job.subtitle_url)
    throw new Error("Brak pliku SRT z HeyGena — nie ma z czego zbudować napisów.");
  const plan = planCaptionBurn({
    captions: true,
    captionStyle: styleId,
    burnerConfigured: true,
    outputs: { video_url: clean, subtitle_url: job.subtitle_url },
  });
  if (plan.action !== "burn") throw new Error(plan.reason ?? "Nie można zlecić napisów.");
  await submitBurn({ ...job, caption_burn_attempts: 0 }, plan, job.thumbnail_url);
}

// Odpytuje HeyGen o joby 'rendering' i usługę napisów o joby 'captioning';
// domyka gotowe/nieudane. Gotowe joby z auto-publikacją wpadają do kolejek.
export async function pollStudioRenderingJobs(): Promise<{
  completed: number;
  autoPublished: number;
}> {
  const { data: rows } = await supabaseAdmin
    .from("studio_video_jobs")
    .select("*")
    .in("status", ["rendering", "captioning"])
    .order("created_at", { ascending: true })
    .limit(20);

  let completed = 0;
  let autoPublished = 0;
  const { getHeygenVideoStatus } = await import("./avatar-faq.server");
  const count = (out: SettleOutcome) => {
    if (out.state !== "ready") return;
    completed++;
    if (out.autoPublished) autoPublished++;
  };

  for (const job of (rows ?? []) as JobRow[]) {
    try {
      if (job.status === "captioning") {
        count(await settleCaptionBurn(job));
        continue;
      }
      if (!job.heygen_video_id) continue;
      const status = await getHeygenVideoStatus(job.heygen_video_id);
      if (status.status === "completed" && status.video_url) {
        count(await settleHeygenCompletion(job, status));
      } else if (status.status === "failed") {
        await supabaseAdmin
          .from("studio_video_jobs")
          .update({
            status: "failed",
            last_error:
              typeof status.error === "string" ? status.error : JSON.stringify(status.error ?? {}),
          })
          .eq("id", job.id);
      }
    } catch {
      // Pojedynczy błąd pollingu nie blokuje pozostałych jobów.
    }
  }
  return { completed, autoPublished };
}

// Wstawia gotowy job do kolejek publikacji zgodnie z auto_publish_platforms.
// Idempotentne: auto_published_at ustawiane warunkowo (WHERE IS NULL) chroni
// przed podwójną publikacją przy wyścigu tick vs panel.
export async function maybeAutoPublishJob(job: JobRow): Promise<boolean> {
  if (!job.auto_publish_platforms.length || !job.video_url || job.auto_published_at) return false;

  const { data: stamped } = await supabaseAdmin
    .from("studio_video_jobs")
    .update({ auto_published_at: new Date().toISOString() })
    .eq("id", job.id)
    .is("auto_published_at", null)
    .select("id");
  if (!stamped?.length) return false;

  const title = fallbackTitle(job);
  const message = job.publish_description;
  const now = new Date().toISOString();
  const errors: string[] = [];

  if (job.auto_publish_platforms.includes("youtube")) {
    const { error } = await supabaseAdmin.from("youtube_publish_queue").insert({
      title,
      description: message,
      source_video_url: job.video_url,
      privacy_status: job.publish_privacy || "public",
      scheduled_at: now,
      created_by: job.created_by,
    });
    if (error) errors.push(`youtube: ${error.message}`);
  }

  // Meta i TikTok dzielą kolejkę social_publish_queue (różnią się `platform`).
  const queuePlatforms = job.auto_publish_platforms.filter(
    (p): p is "facebook_post" | "facebook_reels" | "instagram_reels" | "tiktok" => p !== "youtube",
  );
  if (queuePlatforms.length) {
    const { error } = await supabaseAdmin.from("social_publish_queue").insert(
      queuePlatforms.map((platform) => ({
        platform,
        title,
        message,
        video_url: job.video_url,
        image_url: null,
        scheduled_at: now,
        created_by: job.created_by,
        // Wybory twórcy z formularza zadania jadą do kolejki — tick publikuje
        // dokładnie je, bez dobierania prywatności za niego.
        ...(platform === "tiktok" ? { tiktok_post_options: job.tiktok_post_options as never } : {}),
      })),
    );
    if (error) errors.push(`social: ${error.message}`);
  }

  if (errors.length) {
    await supabaseAdmin
      .from("studio_video_jobs")
      .update({ last_error: `Auto-publikacja: ${errors.join("; ")}` })
      .eq("id", job.id);
  }

  // Kompresja przed publikacją (video_renditions) — rolka z HeyGena zwykle
  // spełnia profil i wraca jako `unchanged`, ale sprawdzenie robi tick, nie
  // publikator w chwili wysyłki.
  const { requestVideoRendition } = await import("./video-rendition.server");
  await requestVideoRendition(job.video_url).catch((e) =>
    console.warn(`[renditions] ${errMsg(e)}`),
  );
  return errors.length < job.auto_publish_platforms.length;
}

// Pełny przebieg ticka: przetwórz kolejkę + domknij rendery.
export async function runStudioVideoTick(): Promise<{
  processed: number;
  failed: number;
  remaining: number;
  completed: number;
  autoPublished: number;
}> {
  const queue = await processStudioVideoQueue(2);
  const poll = await pollStudioRenderingJobs();
  return { ...queue, ...poll };
}
