// Studio publikacji — kolejka wsadowa wideo HeyGen + auto-publikacja.
//
// Joby ze statusem 'queued' (wstawiane hurtowo z bazy pytań lub pojedynczo)
// przetwarza processStudioVideoQueue: scenariusz AI (jeśli pusty) → ElevenLabs
// TTS (model z ustawień Studia) → HeyGen. Renderujące joby domyka
// pollStudioRenderingJobs, a gotowe z ustawionymi auto_publish_platforms
// trafiają automatycznie do kolejek publikacji (youtube_publish_queue /
// social_publish_queue — ta druga obsługuje Meta i TikTok).
//
// NAPISY: zawsze nasze. Przy renderze powstaje plik SRT z tekstu scenariusza
// i czasów znaków ElevenLabs (`subtitle_url`); gdy job ma napisy włączone,
// gotowy render nie idzie od razu do publikacji — czysty master + ten SRT
// lecą do usługi wypalania (services/caption-burner), job dostaje status
// 'captioning', a kolejne odpytanie zapisuje gotowy plik w buckecie
// `studio-media` i dopiero wtedy publikuje. HeyGen nie dostaje zlecenia na
// napisy i nie ma „wersji z napisami HeyGena" na zapas: gdy napisów nie da
// się wypalić, job kończy się statusem 'failed' z jasnym powodem, z masterem
// i SRT zachowanymi do ponowienia (`retryStudioJob` wypala wtedy napisy bez
// nowego renderu). Nigdy zawieszonym jobem.
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
  planBadgeBurn,
  planCaptionBurn,
  resolveCaptionBurn,
  type CaptionBurnPlan,
  type CaptionBurnState,
  type HeygenCaptionOutputs,
} from "./studio-captions";
import type { CustomCaptionStyleId, DynamicOverlays, SrtCue } from "./caption-style";
import type { MotionDesignElement } from "./motion-catalog";
import { AVATARS_PER_REEL } from "./studio-scenes";
import { STUDIO_FINISHER_FALLBACK_ACTION } from "./autopilot/types";

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
  /** Kategoria w /admin/materialy (kolumna z migracji; brak = domyślna). */
  material_audience?: string | null;
  /** Model ElevenLabs lektora (NULL = ustawienie Studia w chwili renderu). */
  tts_model_id?: string | null;
  /** Silnik wykończenia (studio-render-engine.ts); brak / `auto` = ustawienie Studia. */
  render_engine?: string | null;
  /** Projekt elementów dynamicznych (motion-catalog.ts); null = zaprojektuj przy wykończeniu. */
  motion_design?: unknown;
  /** Hook wizualny 0–2,5 s (studio-hook.ts); null = zaplanuje generator. */
  hook?: unknown;
  /** Wariant hooka w teście A/B ("A" / "B"). */
  hook_variant?: string | null;
  /** Tor autopilota (pozyczkobiorca / inwestor). */
  track?: string | null;
  scene_plan?: unknown;
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

/** Dopisuje uwagę do `last_error` zadania (bez kasowania poprzednich). */
async function appendJobNote(jobId: string, note: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("studio_video_jobs")
    .select("last_error")
    .eq("id", jobId)
    .maybeSingle();
  const prev = (data as { last_error?: string | null } | null)?.last_error ?? null;
  if (prev?.includes(note)) return;
  await supabaseAdmin
    .from("studio_video_jobs")
    .update({ last_error: joinNotes(prev, note) })
    .eq("id", jobId);
}

/**
 * Zejście caption-burner → Remotion do dziennika autopilota (raport dzienny
 * pokazuje je w sekcji „Produkcja”). Najwyżej jeden wpis na 6 h — tick idzie
 * co 10 min, a właściciel ma się dowiedzieć, nie dostać spam.
 */
export async function reportFinisherFallback(reason: string): Promise<void> {
  try {
    const since = new Date(Date.now() - 6 * 3_600_000).toISOString();
    const { data } = await supabaseAdmin
      .from("ai_growth_action_log")
      .select("id")
      .eq("action", STUDIO_FINISHER_FALLBACK_ACTION)
      .gte("created_at", since)
      .limit(1);
    if (data?.length) return;
    const { logAutopilot } = await import("./autopilot/state.server");
    await logAutopilot({
      action: STUDIO_FINISHER_FALLBACK_ACTION,
      status: "warning",
      summary: `caption-burner nie odpowiada — rolki wykańcza automatycznie Remotion (${reason}).`,
      payload: { reason },
    });
  } catch (e) {
    console.warn(`[Studio] wpis o zejściu na Remotion nieudany: ${errMsg(e)}`);
  }
}

// Tytuł do publikacji: publish_title, a w ostateczności prompt bez tagu "#N · ".
function fallbackTitle(job: JobRow): string {
  if (job.publish_title.trim()) return job.publish_title.trim();
  return job.prompt.replace(/^#\d{1,3} · /, "").slice(0, 92);
}

/**
 * Nakładki dynamiczne joba, wypalane w obrazie:
 *   * rolki z paczki 250 pytań (tag "#N · " w prompcie) — znacznik
 *     kategorii, duże pytanie i checklista CTA (deterministycznie,
 *     bez bazy — zmiana napisów gotowej rolki wypala te same nakładki);
 *   * KAŻDA rolka ze scenariuszem — karty ekranowe wyciągnięte przez AI
 *     z tekstu lektora (generateOverlayCards). AI tu tylko streszcza
 *     w wiersze to, co lektor mówi; czas i tak pilnuje SRT, a karta bez
 *     pokrycia w nagraniu wypada. Porażka AI nie blokuje nakładek.
 * `STUDIO_DYNAMIC_OVERLAYS=0` wyłącza całość.
 */
async function overlaysForJob(job: JobRow): Promise<DynamicOverlays | null> {
  const { isDynamicOverlaysEnabled } = await import("./caption-burner.server");
  if (!isDynamicOverlaysEnabled()) return null;

  // Odcinek serii: nakładki i karty zdefiniowane ręcznie w shorts-series.ts
  // (ze wskazówek montażowych autora) — AI nie dokłada swoich kart.
  const { parseEpisodePromptTag, findShortsEpisode, buildEpisodeOverlays } =
    await import("./shorts-series");
  const episodeId = parseEpisodePromptTag(job.prompt);
  const episode = episodeId != null ? findShortsEpisode(episodeId) : undefined;
  if (episode) return buildEpisodeOverlays(episode);

  const questionId = parseShortsPromptTag(job.prompt);
  const q = questionId != null ? findShortsQuestion(questionId) : undefined;
  let base: DynamicOverlays | null = null;
  if (q) {
    const { buildShortsOverlays } = await import("./shorts-script");
    base = buildShortsOverlays(q);
  }

  const script = job.script?.trim();
  // Silnik Remotion: elementy dynamiczne projektuje Claude z katalogu
  // komponentów (motion-catalog.ts) — zastępują karty. Porażka projektanta
  // spada na zwykłe karty niżej.
  if (script) {
    const motion = await designMotionForJob(job, q?.question ?? job.prompt);
    if (motion?.length) return { ...(base ?? {}), cards: [], motion };
  }
  if (script) {
    try {
      const { generateOverlayCards } = await import("./studio-ai.server");
      const aiCards = await generateOverlayCards(script);
      if (aiCards.length) {
        base = base ? { ...base, cards: [...aiCards, ...(base.cards ?? [])] } : { cards: aiCards };
      }
    } catch (e) {
      console.warn(`[Studio] karty ekranowe z AI nieudane (${job.id}): ${errMsg(e)}`);
    }
  }
  return base;
}

/** Kwestie SRT joba (tekst scenariusza z czasami ElevenLabs) — do projektu i podglądu czasów. */
export async function loadJobCues(job: JobRow): Promise<SrtCue[]> {
  if (!job.subtitle_url) throw new Error("Zadanie nie ma pliku SRT (napisy z czasami lektora).");
  const { fetchBytes } = await import("./media-storage.server");
  const { parseSubtitles } = await import("./caption-style");
  const { fixBrandInCues } = await import("./caption-brand");
  const srt = new TextDecoder().decode((await fetchBytes(job.subtitle_url, 2 * 1024 * 1024)).bytes);
  return fixBrandInCues(parseSubtitles(srt));
}

/**
 * Projekt elementów dynamicznych od Claude dla joba — zapisany w
 * `motion_design`, żeby ponowne wypalenie dało te same elementy (pusta lista
 * też się zapisuje: „nic tu nie pasuje”, bez pytania modelu przy każdym
 * wypaleniu). Rzuca przy błędzie.
 */
export async function designAndSaveMotion(
  job: JobRow,
  topic?: string | null,
  opts: {
    /**
     * Wykończenie (render / ponowienie): zapis TYLKO gdy przy zadaniu nadal
     * nie ma projektu. Projekt wgrany w międzyczasie (`set_studio_motion`)
     * wygrywa z projektem AI — bez tego AI nadpisywało ręczny projekt.
     */
    onlyIfUnset?: boolean;
  } = {},
): Promise<MotionDesignElement[]> {
  const script = job.script?.trim();
  if (!script) throw new Error("Zadanie nie ma scenariusza.");
  const { designMotion } = await import("./motion-designer.server");
  const cues = await loadJobCues(job);
  const elements = await designMotion({ script, cues, topic: topic ?? job.prompt });
  if (opts.onlyIfUnset) {
    const { data, error } = await supabaseAdmin
      .from("studio_video_jobs")
      .update({ motion_design: elements as never })
      .eq("id", job.id)
      .is("motion_design", null)
      .select("id");
    if (error) throw new Error(`studio_video_jobs: ${error.message}`);
    if (!data?.length) {
      // Ktoś zapisał projekt, gdy model myślał — bierzemy zapis, nie wynik AI.
      const saved = await loadSavedMotionDesign(job.id);
      const { sanitizeMotionDesign } = await import("./motion-catalog");
      const design = sanitizeMotionDesign(saved ?? []);
      job.motion_design = saved ?? null;
      return design;
    }
  } else {
    await saveMotionDesign(job.id, elements);
  }
  // Kolejne overlaysForJob na tym samym obiekcie (ten sam przebieg) biorą zapis, nie pytają modelu.
  job.motion_design = elements;
  return elements;
}

/**
 * Projekt zapisany przy zadaniu — czytany ZAWSZE świeżo z bazy przed
 * wykończeniem. Obiekt joba w przebiegu bywa starszy niż zapis robota
 * (`set_studio_motion` tuż po utworzeniu zadania). `undefined` = nie udało
 * się odczytać (wtedy zostaje to, co ma obiekt).
 */
export async function loadSavedMotionDesign(jobId: string): Promise<unknown> {
  const { data, error } = await supabaseAdmin
    .from("studio_video_jobs")
    .select("motion_design")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !data) return undefined;
  return (data as { motion_design?: unknown }).motion_design ?? null;
}

export async function saveMotionDesign(
  jobId: string,
  elements: MotionDesignElement[] | null,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("studio_video_jobs")
    .update({ motion_design: elements as never })
    .eq("id", jobId);
  if (error) throw new Error(`studio_video_jobs: ${error.message}`);
}

/**
 * Elementy dynamiczne do wykończenia (tylko silnik Remotion): zapisany projekt
 * (od AI albo wgrany przez robota `set_studio_motion`), a bez niego nowy
 * projekt Claude. null = brak — wtedy zwykłe karty.
 */
export async function designMotionForJob(
  job: JobRow,
  topic: string | null,
): Promise<MotionDesignElement[] | null> {
  const { resolveRenderEngine } = await import("./studio-render-engine");
  if (resolveRenderEngine(job.render_engine) !== "remotion") return null;
  const fresh = await loadSavedMotionDesign(job.id);
  if (fresh !== undefined) job.motion_design = fresh;
  if (job.motion_design != null) {
    const { sanitizeMotionDesign } = await import("./motion-catalog");
    const saved = sanitizeMotionDesign(job.motion_design);
    return saved.length ? saved : null;
  }
  const { isMotionDesignerConfigured } = await import("./motion-designer.server");
  if (!job.subtitle_url || !isMotionDesignerConfigured()) {
    const { logClaudeCall } = await import("./claude-json.server");
    await logClaudeCall({
      label: "Projektant",
      success: false,
      error: !job.subtitle_url
        ? `pominięty (${job.id}): brak pliku SRT`
        : `pominięty (${job.id}): brak ANTHROPIC_API_KEY w środowisku aplikacji`,
    });
    return null;
  }
  try {
    const elements = await designAndSaveMotion(job, topic, { onlyIfUnset: true });
    return elements.length ? elements : null;
  } catch (e) {
    console.warn(`[Studio] projekt elementów dynamicznych nieudany (${job.id}): ${errMsg(e)}`);
    return null;
  }
}

// Przetwarza do `limit` jobów 'queued': scenariusz → TTS → HeyGen → rendering.
// Zwraca liczbę przetworzonych i pozostałych w kolejce.
export async function processStudioVideoQueue(
  limit: number,
): Promise<{ processed: number; failed: number; remaining: number; deferred: string | null }> {
  let processed = 0;
  let failed = 0;
  // Bramka caption-burnera: sprawdzana raz na przebieg, dopiero gdy w kolejce
  // coś jest. Gdy usługa nie odpowiada, joby zostają 'queued' (bez zużycia
  // kredytów HeyGen) i ruszą w kolejnym ticku.
  let deferred: string | null = null;
  let burnerChecked = false;
  // caption-burner padł, a Remotion jest skonfigurowany — joby na
  // caption-burnerze przechodzą w tym przebiegu na Remotion (zamiast stać).
  let fallback: { reason: string } | null = null;

  for (let i = 0; i < limit; i++) {
    // Claim najstarszego joba z kolejki — warunek status='queued' w UPDATE
    // chroni przed podwójnym przetworzeniem (tick vs otwarty panel).
    const { data: queued } = await supabaseAdmin
      .from("studio_video_jobs")
      .select("id, captions, render_engine")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!queued) break;

    if (!burnerChecked) {
      burnerChecked = true;
      const { resolveFinisherForRender } = await import("./caption-burner.server");
      const gate = await resolveFinisherForRender({
        captions: queued.captions !== false,
        engine: queued.render_engine,
      });
      if (!gate.ok) {
        deferred = gate.reason;
        console.warn(`[Studio] kolejka wstrzymana: ${gate.reason}`);
        break;
      }
      if (gate.fallback) {
        fallback = { reason: gate.fallback.reason };
        console.warn(
          `[Studio] caption-burner padł — wykończenie w Remotion: ${gate.fallback.reason}`,
        );
        await reportFinisherFallback(gate.fallback.reason);
      }
    }

    const { resolveRenderEngine } = await import("./studio-render-engine");
    const switchEngine = fallback && resolveRenderEngine(queued.render_engine) !== "remotion";
    const { data: claimed } = await supabaseAdmin
      .from("studio_video_jobs")
      .update({
        status: "generating_script",
        ...(switchEngine ? { render_engine: "remotion" } : {}),
      })
      .eq("id", queued.id)
      .eq("status", "queued")
      .select("*");
    const job: JobRow | null = claimed?.[0] ?? null;
    if (!job) continue; // ktoś inny zdążył — bierz następnego

    try {
      await processClaimedJob(job);
      if (switchEngine && fallback) {
        const { finisherFallbackNote } = await import("./caption-burner.server");
        await appendJobNote(job.id, finisherFallbackNote(fallback.reason));
      }
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
  return { processed, failed, remaining: count ?? 0, deferred };
}

async function processClaimedJob(job: JobRow): Promise<void> {
  let script = job.script.trim();
  let publishTitle = job.publish_title;
  let publishDescription = job.publish_description;

  if (!script) {
    const questionId = parseShortsPromptTag(job.prompt);
    const q = questionId != null ? findShortsQuestion(questionId) : undefined;
    const { parseEpisodePromptTag, findShortsEpisode, buildEpisodeScript } =
      await import("./shorts-series");
    const episodeId = parseEpisodePromptTag(job.prompt);
    const episode = episodeId != null ? findShortsEpisode(episodeId) : undefined;
    let gen: { script: string; title: string; description: string; hashtags: string[] };
    if (episode) {
      // Odcinek serii: scenariusz autorski 1:1 — bez AI.
      gen = buildEpisodeScript(episode);
    } else if (q) {
      // Pytanie z paczki 250: gotowy, sprawdzony scenariusz 1:1 z pliku — bez AI.
      const { buildShortsScript } = await import("./shorts-script");
      gen = buildShortsScript(q);
    } else {
      const { generateVideoScript } = await import("./studio-ai.server");
      const { trackOfJob } = await import("./studio-hook.server");
      gen = await generateVideoScript(job.prompt, { track: trackOfJob(job) });
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

  // Twarze rolki: zapisane przy jobie, a gdy pusto — prowadzący + partner
  // z aktualnego zestawu domyślnych (joby z kolejki nie przechodzą przez panel).
  const stored = (job.avatar_ids ?? []).filter(Boolean);
  const { defaultReelRotation, portraitLead } = await import("./studio-avatars.server");
  // Poziome zdjęcie nie prowadzi rolki — pionowy z puli przejmuje hook.
  const lead = await portraitLead(job.avatar_id, stored);
  if (lead.swapped) {
    job.avatar_id = lead.lead;
    await supabaseAdmin.from("studio_video_jobs").update({ avatar_id: lead.lead }).eq("id", job.id);
  }
  const avatarIds = stored.length
    ? [...new Set([job.avatar_id, ...stored])]
    : await defaultReelRotation(job.avatar_id, AVATARS_PER_REEL);

  // Model lektora: nadpisanie z joba, a gdy go nie ma — ustawienie Studia.
  const { resolveJobTtsModelId } = await import("./studio-settings.server");
  const ttsModelId = await resolveJobTtsModelId(job.tts_model_id);

  const { renderStudioVideo } = await import("./studio-render.server");
  const rendered = await renderStudioVideo({
    script,
    topic: job.prompt,
    avatarId: job.avatar_id,
    voiceId: job.voice_id,
    ttsModelId,
    captions: job.captions !== false,
    dynamicScenes: job.dynamic_scenes === true || job.reel_structure === true,
    reelStructure: job.reel_structure === true,
    avatarIds,
    name: publishTitle || job.prompt,
  });
  await supabaseAdmin
    .from("studio_video_jobs")
    .update({
      heygen_video_id: rendered.videoId,
      status: "rendering",
      // Nasz SRT (tekst scenariusza + czasy ElevenLabs) — wypalany po renderze.
      subtitle_url: rendered.subtitleUrl,
      tts_model_id: rendered.ttsModelId,
      scene_plan: rendered.scenePlan,
      last_error: rendered.note,
    })
    .eq("id", job.id);
  await startHookIfRemotion(job.id, job.render_engine);
}

/**
 * Hook wizualny: plan + zlecenie klipu równolegle z renderem awatara — tylko
 * gdy wykończy Remotion (caption-burner hooka nie narysuje, kredyty zostają).
 */
export async function startHookIfRemotion(jobId: string, engine: unknown): Promise<void> {
  const { resolveRenderEngine } = await import("./studio-render-engine");
  if (resolveRenderEngine(engine) !== "remotion") return;
  const { prepareHookForJob } = await import("./studio-hook.server");
  await prepareHookForJob(jobId);
}

// ── Domykanie renderu i napisów ─────────────────────────────────────────────

export type SettleOutcome =
  /** Czekamy jeszcze na usługę wypalania. */
  | { state: "waiting" }
  /** Zlecono napisy (albo sam znaczek AI) — job w statusie 'captioning'. */
  | { state: "captioning" }
  | { state: "ready"; videoUrl: string; autoPublished: boolean }
  /** Napisów nie dało się wypalić — job 'failed' z powodem, master i SRT zostają. */
  | { state: "failed"; note: string };

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
  const lastError = "last_error" in patch ? (patch.last_error as string | null) : job.last_error;
  await copyToMaterials(job, patch.video_url, lastError);
  return { state: "ready", videoUrl: patch.video_url, autoPublished };
}

/**
 * Gotowa rolka → biblioteka materiałów (/admin/materialy), trwała kopia pliku.
 * Porażka nie cofa gotowości — dopisujemy tylko powód do `last_error`.
 */
async function copyToMaterials(
  job: JobRow,
  videoUrl: string,
  lastError: string | null,
): Promise<void> {
  const materials = await import("./studio-materials.server");
  if (!materials.isStudioMaterialsEnabled() || !videoUrl) return;
  try {
    await materials.saveStudioJobToMaterials({ ...job, video_url: videoUrl });
  } catch (e) {
    console.warn(`[Studio] zapis do materiałów nieudany (${job.id}): ${errMsg(e)}`);
    await supabaseAdmin
      .from("studio_video_jobs")
      .update({ last_error: joinNotes(lastError, `Zapis do materiałów nieudany: ${errMsg(e)}`) })
      .eq("id", job.id);
  }
}

async function submitBurn(
  job: JobRow,
  plan: Extract<CaptionBurnPlan, { action: "burn" }>,
  thumbnailUrl: string | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const sent = await submitFinish(job, {
    videoUrl: plan.videoUrl,
    srtUrl: plan.srtUrl,
    styleId: plan.styleId,
    aiBadge: plan.aiBadge,
    overlays: plan.overlays,
    name: fallbackTitle(job),
  });
  const burnId = sent.burnId;
  await supabaseAdmin
    .from("studio_video_jobs")
    .update({
      status: "captioning",
      ...sent.patch,
      caption_style: plan.styleId,
      caption_burn_id: burnId,
      caption_burn_started_at: new Date().toISOString(),
      caption_burn_attempts: job.caption_burn_attempts + 1,
      video_url_clean: plan.videoUrl,
      subtitle_url: plan.srtUrl,
      thumbnail_url: thumbnailUrl ?? job.thumbnail_url ?? null,
      ...extra,
    })
    .eq("id", job.id);
}

/**
 * Znaczek „AI" i/lub nakładki dynamiczne na czystym masterze rolki zamówionej
 * BEZ napisów. Job przechodzi w 'captioning' jak przy napisach; przy domykaniu
 * rozpoznajemy ten rodzaj po `captions = false`.
 */
async function submitBadgeBurn(
  job: JobRow,
  src: {
    /** Czysty master, na który kładziemy znaczek. */
    videoUrl: string;
    subtitleUrl: string | null;
    thumbnailUrl: string | null;
    lastError: string | null;
    aiBadge: boolean;
    overlays: DynamicOverlays | null;
  },
): Promise<void> {
  const sent = await submitFinish(
    { ...job, last_error: src.lastError },
    {
      videoUrl: src.videoUrl,
      // SRT podajemy dla czasów nakładek (koniec dużego pytania) — napisów nie
      // wypalamy. Hook wizualny też liczy czasy z SRT.
      srtUrl: src.subtitleUrl,
      aiBadge: src.aiBadge,
      overlays: src.overlays,
      name: fallbackTitle(job),
    },
  );
  const burnId = sent.burnId;
  await supabaseAdmin
    .from("studio_video_jobs")
    .update({
      status: "captioning",
      captions: false,
      caption_burn_id: burnId,
      caption_burn_started_at: new Date().toISOString(),
      caption_burn_attempts: job.caption_burn_attempts + 1,
      // Czysty master zostaje czysty — nie wynik ze znaczkiem (inaczej zmiana
      // napisów dołożyłaby drugi znaczek).
      video_url_clean: src.videoUrl,
      subtitle_url: src.subtitleUrl,
      thumbnail_url: src.thumbnailUrl ?? job.thumbnail_url ?? null,
      last_error: src.lastError,
      ...sent.patch,
    })
    .eq("id", job.id);
}

/** Hook i kadrowanie awatarów dla planu Remotion (patrz studio-hook.server.ts). */
async function reelExtrasForJob(job: JobRow) {
  const { reelExtrasForJob: extras } = await import("./studio-hook.server");
  return extras(job.id);
}

type FinishInput = Omit<
  Parameters<typeof import("./caption-burner.server").submitCaptionBurn>[0],
  "engine"
>;

/**
 * Zlecenie wykończenia silnikiem zadania, a gdy caption-burner nie przyjmie
 * zlecenia (timeout, błąd) i Remotion jest skonfigurowany — od razu Remotion.
 * `patch` niesie zmianę silnika i uwagę do zapisania przy zadaniu. Hook
 * wizualny i kadrowanie awatarów dokłada tylko Remotion (caption-burner ich
 * nie rysuje).
 */
async function submitFinish(
  job: JobRow,
  input: FinishInput,
): Promise<{ burnId: string; patch: Record<string, unknown> }> {
  const burner = await import("./caption-burner.server");
  const { resolveRenderEngine } = await import("./studio-render-engine");
  const extras = await reelExtrasForJob(job);
  const withExtras = (engine: unknown) =>
    resolveRenderEngine(engine) === "remotion" ? { ...input, ...extras } : input;
  try {
    const burnId = await burner.submitCaptionBurn({
      ...withExtras(job.render_engine),
      engine: job.render_engine,
    });
    return { burnId, patch: {} };
  } catch (e) {
    if (resolveRenderEngine(job.render_engine) === "remotion") throw e;
    const { isRemotionConfigured } = await import("./remotion-render.server");
    if (!isRemotionConfigured()) throw e;
    const reason = `caption-burner nie przyjął zlecenia (${errMsg(e).replace(/^caption-burner: /, "")})`;
    console.warn(`[Studio] ${reason} — wykańczam w Remotion (${job.id}).`);
    const burnId = await burner.submitCaptionBurn({
      ...withExtras("remotion"),
      engine: "remotion",
    });
    await reportFinisherFallback(reason);
    return {
      burnId,
      patch: {
        render_engine: "remotion",
        last_error: joinNotes(job.last_error, burner.finisherFallbackNote(reason)),
      },
    };
  }
}

const RETRY_HINT =
  "Ponów zadanie (przycisk „Ponów” / `retry_studio_job`) — napisy wypalą się na nowo bez kolejnego renderu w HeyGen.";

/**
 * Napisy zamówione, a nie wypalone: job pada z powodem, ale czysty master,
 * plik SRT i miniatura zostają — ponowienie wypala napisy od razu, bez
 * nowego renderu (i kredytów) HeyGena. Rolka bez napisów NIE idzie do
 * publikacji.
 */
async function markCaptionFailure(
  job: JobRow,
  src: {
    videoUrlClean: string | null;
    subtitleUrl: string | null;
    thumbnailUrl: string | null;
    note: string;
  },
): Promise<SettleOutcome> {
  if (job.caption_burn_id) {
    const burner = await import("./caption-burner.server");
    await burner.discardCaptionBurn(job.caption_burn_id);
  }
  const note = `${src.note} ${RETRY_HINT}`;
  await supabaseAdmin
    .from("studio_video_jobs")
    .update({
      status: "failed",
      video_url: null,
      video_url_clean: src.videoUrlClean,
      subtitle_url: src.subtitleUrl,
      thumbnail_url: src.thumbnailUrl ?? job.thumbnail_url ?? null,
      caption_burn_id: null,
      caption_burn_started_at: null,
      last_error: joinNotes(job.last_error, note),
    })
    .eq("id", job.id);
  console.warn(`[Studio] napisy nieudane (${job.id}): ${src.note}`);
  return { state: "failed", note };
}

/**
 * Gotowy render HeyGena: napisy własne (gdy zamówione — a bez możliwości ich
 * wypalenia job pada) albo czysty master ze znaczkiem „AI" (rolka bez
 * napisów). Jedna funkcja dla ticka i pollingu z panelu.
 */
export async function settleHeygenCompletion(
  job: JobRow,
  status: HeygenRenderStatus,
): Promise<SettleOutcome> {
  const { isFinisherConfigured, isAiBadgeEnabled } = await import("./caption-burner.server");
  const burnerConfigured = await isFinisherConfigured(job.render_engine);
  // Hook wizualny rysuje tylko Remotion: dokończ jego zasoby (odbiór klipu
  // Flows, zejście na obraz). Klip w toku = czekamy z wykończeniem do
  // kolejnego odpytania (render HeyGena zostaje w statusie 'rendering').
  const { resolveRenderEngine } = await import("./studio-render-engine");
  if (resolveRenderEngine(job.render_engine) === "remotion" && burnerConfigured) {
    const { hookForFinish } = await import("./studio-hook.server");
    const h = await hookForFinish(job.id);
    if (h.waiting) return { state: "waiting" };
  }
  const aiBadge = isAiBadgeEnabled();
  const overlays = await overlaysForJob(job);
  const videoUrl = status.video_url ?? "";
  const thumbnailUrl = status.thumbnail_url ?? null;
  // Nasz SRT z renderu; film dołączony spoza Studia może mieć tylko plik SRT
  // HeyGena — ten też idzie przez nasz renderer (z poprawką nazwy firmy).
  const srtUrl = job.subtitle_url ?? status.subtitle_url ?? null;

  const plan = planCaptionBurn({
    captions: job.captions,
    captionStyle: job.caption_style,
    burnerConfigured,
    videoUrl,
    srtUrl,
    aiBadge,
    overlays,
  });
  if (plan.action === "burn") {
    try {
      await submitBurn(job, plan, thumbnailUrl);
      return { state: "captioning" };
    } catch (e) {
      return markCaptionFailure(job, {
        videoUrlClean: videoUrl,
        subtitleUrl: srtUrl,
        thumbnailUrl,
        note: `Napisy nieudane przy zleceniu: ${errMsg(e)}`,
      });
    }
  }
  if (plan.action === "fail") {
    return markCaptionFailure(job, {
      videoUrlClean: videoUrl,
      subtitleUrl: srtUrl,
      thumbnailUrl,
      note: plan.reason,
    });
  }

  // Rolka bez napisów: znaczek „AI" i/lub nakładki dynamiczne na czystym
  // masterze, zanim pójdzie do publikacji; bez usługi — publikacja bez nich
  // z adnotacją.
  let badgeNote: string | null = null;
  const badge = planBadgeBurn({ aiBadge, burnerConfigured, videoUrl, overlays });
  if (badge.action === "badge") {
    try {
      await submitBadgeBurn(job, {
        videoUrl: badge.videoUrl,
        subtitleUrl: srtUrl,
        thumbnailUrl,
        lastError: job.last_error,
        aiBadge: badge.aiBadge,
        overlays: badge.overlays,
      });
      return { state: "captioning" };
    } catch (e) {
      console.warn(`[Studio] zlecenie znaczka AI nieudane (${job.id}): ${errMsg(e)}`);
      badgeNote = `Znaczek AI nieudany przy zleceniu: ${errMsg(e)} — opublikowano bez znaczka.`;
    }
  } else {
    badgeNote = badge.reason;
  }

  return markReady(job, {
    video_url: videoUrl,
    video_url_clean: null,
    thumbnail_url: thumbnailUrl,
    subtitle_url: srtUrl,
    captions: false,
    caption_burn_id: null,
    caption_burn_started_at: null,
    last_error: joinNotes(job.last_error, badgeNote),
  });
}

/**
 * Job w statusie 'captioning': odpytuje usługę wypalania i domyka — zapis
 * gotowego pliku, ponowienie (usługa mogła się zrestartować) albo porażka
 * po błędzie / przekroczeniu czasu.
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
  // Rolka bez napisów niesie w usłudze sam znaczek — przy porażce wychodzi
  // bez znaczka, zamiast padać.
  const badgeOnly = !job.captions;
  const resolution = resolveCaptionBurn({
    status: probe.status,
    error: probe.error,
    startedAt: job.caption_burn_started_at,
    attempts: job.caption_burn_attempts,
    now: new Date(),
    fallback: { previous },
    timeoutMs: captionBurnTimeoutMs(),
    failureLabel: badgeOnly ? "Znaczek AI nieudany" : "Napisy nieudane",
  });

  if (resolution.state === "waiting") return { state: "waiting" };

  if (resolution.state === "store") {
    try {
      const stored = await burner.storeCaptionBurnResult(job.caption_burn_id!, fallbackTitle(job));
      await burner.discardCaptionBurn(job.caption_burn_id!);
      return await markReady(job, {
        video_url: stored.url,
        // Sam znaczek nie zmienia tego, czy plik ma napisy.
        captions: !badgeOnly,
        caption_burn_id: null,
        caption_burn_started_at: null,
      });
    } catch (e) {
      console.warn(`[Studio] zapis wypalonego pliku nieudany (${job.id}): ${errMsg(e)}`);
      return finishCaptionBurn(job, { status: "failed", error: `zapis pliku: ${errMsg(e)}` });
    }
  }

  if (resolution.state === "retry" && badgeOnly) {
    const source = (await burner.isFinisherConfigured(job.render_engine))
      ? job.video_url_clean
      : null;
    if (source) {
      try {
        console.warn(`[Studio] ponawiam znaczek AI (${job.id}): ${resolution.reason}`);
        await submitBadgeBurn(job, {
          videoUrl: source,
          subtitleUrl: job.subtitle_url,
          thumbnailUrl: job.thumbnail_url,
          lastError: job.last_error,
          aiBadge: burner.isAiBadgeEnabled(),
          overlays: await overlaysForJob(job),
        });
        return { state: "captioning" };
      } catch (e) {
        probe = { status: "failed", error: `ponowienie: ${errMsg(e)}` };
      }
    } else {
      probe = { status: "failed", error: `${resolution.reason}; brak pliku do ponowienia` };
    }
    return finishCaptionBurn({ ...job, caption_burn_attempts: CAPTION_BURN_MAX_ATTEMPTS }, probe);
  }

  if (resolution.state === "retry") {
    const plan = planCaptionBurn({
      captions: true,
      captionStyle: job.caption_style,
      burnerConfigured: await burner.isFinisherConfigured(job.render_engine),
      videoUrl: job.video_url_clean,
      srtUrl: job.subtitle_url,
      aiBadge: burner.isAiBadgeEnabled(),
      overlays: await overlaysForJob(job),
    });
    if (plan.action === "burn") {
      try {
        console.warn(`[Studio] ponawiam napisy (${job.id}): ${resolution.reason}`);
        await submitBurn(job, plan, job.thumbnail_url);
        return { state: "captioning" };
      } catch (e) {
        probe = { status: "failed", error: `ponowienie: ${errMsg(e)}` };
      }
    } else {
      probe = { status: "failed", error: plan.action === "fail" ? plan.reason : resolution.reason };
    }
    // Ponowienie niemożliwe — domykamy porażką bez kolejnych prób.
    return finishCaptionBurn({ ...job, caption_burn_attempts: CAPTION_BURN_MAX_ATTEMPTS }, probe);
  }

  if (resolution.state === "fallback") {
    if (job.caption_burn_id) await burner.discardCaptionBurn(job.caption_burn_id);
    return markReady(job, {
      video_url: resolution.videoUrl,
      captions: resolution.captionsBurned,
      caption_style: resolution.captionStyle,
      caption_burn_id: null,
      caption_burn_started_at: null,
      last_error: joinNotes(job.last_error, resolution.note),
    });
  }

  // resolution.state === "fail"
  if (badgeOnly && job.video_url_clean) {
    if (job.caption_burn_id) await burner.discardCaptionBurn(job.caption_burn_id);
    return markReady(job, {
      video_url: job.video_url_clean,
      captions: false,
      caption_burn_id: null,
      caption_burn_started_at: null,
      last_error: joinNotes(job.last_error, `${resolution.note} — opublikowano bez znaczka.`),
    });
  }
  return markCaptionFailure(job, {
    videoUrlClean: job.video_url_clean,
    subtitleUrl: job.subtitle_url,
    thumbnailUrl: job.thumbnail_url,
    note: resolution.note,
  });
}

/**
 * Zmiana napisów gotowego wideo: czysty master (video_url_clean, a gdy go nie
 * ma — video_url bez napisów) + nasz SRT lecą do usługi w nowym stylu.
 * Poprzedni plik zostaje pod video_url do czasu sukcesu (wraca przy porażce).
 * Nie publikuje ponownie — auto_published_at zostaje, publikacja ręcznie.
 */
export async function restyleJobCaptions(
  job: JobRow,
  styleId: CustomCaptionStyleId,
): Promise<void> {
  if (job.status !== "ready") throw new Error("Napisy można zmienić tylko dla gotowego wideo.");
  const { isFinisherConfigured, isAiBadgeEnabled } = await import("./caption-burner.server");
  if (!(await isFinisherConfigured(job.render_engine))) {
    const { resolveRenderEngine } = await import("./studio-render-engine");
    throw new Error(
      resolveRenderEngine(job.render_engine) === "remotion"
        ? "Remotion Lambda nie jest skonfigurowany (REMOTION_* w sekretach środowiska)."
        : "Usługa wypalania napisów nie jest skonfigurowana (CAPTION_BURNER_URL / CAPTION_BURNER_SECRET).",
    );
  }
  const clean = job.video_url_clean ?? (!job.captions ? job.video_url : null);
  if (!clean) throw new Error("Brak czystego mastera bez napisów — nie ma na czym wypalić nowych.");
  if (!job.subtitle_url)
    throw new Error(
      "Brak pliku SRT (tekst scenariusza z czasami ElevenLabs) — nie ma z czego zbudować napisów.",
    );
  const plan = planCaptionBurn({
    captions: true,
    captionStyle: styleId,
    burnerConfigured: true,
    videoUrl: clean,
    srtUrl: job.subtitle_url,
    aiBadge: isAiBadgeEnabled(),
    overlays: await overlaysForJob(job),
  });
  if (plan.action !== "burn")
    throw new Error(plan.action === "fail" ? plan.reason : "Nie można zlecić napisów.");
  await submitBurn({ ...job, caption_burn_attempts: 0 }, plan, job.thumbnail_url);
}

/**
 * Ponowienie nieudanego zadania. Gdy padło na napisach (jest czysty master
 * i nasz SRT), wypalamy je od razu — bez nowego renderu i kredytów HeyGena.
 * W każdym innym przypadku zadanie wraca do kolejki i renderuje się od nowa.
 */
export async function retryStudioJob(job: JobRow): Promise<{ mode: "captions" | "rerender" }> {
  if (job.status !== "failed") throw new Error("Ponowić można tylko zadanie ze statusem failed.");
  const burner = await import("./caption-burner.server");
  if (
    job.captions &&
    job.video_url_clean &&
    job.subtitle_url &&
    (await burner.isFinisherConfigured(job.render_engine))
  ) {
    const plan = planCaptionBurn({
      captions: true,
      captionStyle: job.caption_style,
      burnerConfigured: true,
      videoUrl: job.video_url_clean,
      srtUrl: job.subtitle_url,
      aiBadge: burner.isAiBadgeEnabled(),
      overlays: await overlaysForJob(job),
    });
    if (plan.action === "burn") {
      try {
        await submitBurn({ ...job, caption_burn_attempts: 0 }, plan, job.thumbnail_url, {
          last_error: null,
        });
        return { mode: "captions" };
      } catch (e) {
        // Usługa nie przyjęła zlecenia — zostaje pełny render od nowa.
        console.warn(`[Studio] ponowienie napisów nieudane (${job.id}): ${errMsg(e)}`);
      }
    }
  }
  const { error } = await supabaseAdmin
    .from("studio_video_jobs")
    .update({
      status: "queued",
      last_error: null,
      heygen_video_id: null,
      video_url: null,
      video_url_clean: null,
      thumbnail_url: null,
      subtitle_url: null,
      caption_wait_since: null,
      caption_burn_id: null,
      caption_burn_started_at: null,
      caption_burn_attempts: 0,
      scene_plan: null,
      // `motion_design` ZOSTAJE: kotwice elementów to dosłowne fragmenty
      // scenariusza (nie sekundy), więc nowy render tego samego tekstu ma je
      // w nowym SRT. Czyszczenie tu kasowało projekt z `set_studio_motion`
      // i pierwsze wykończenie szło z projektem AI. Zmiana scenariusza czyści
      // projekt w `update_studio_job` / panelu.
    })
    .eq("id", job.id)
    .eq("status", "failed");
  if (error) throw new Error(`studio_video_jobs: ${error.message}`);
  return { mode: "rerender" };
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

  // Bramka compliance – reguły twarde także dla auto-publikacji ze Studia
  // (brief 5.7: brak ścieżki ominięcia). Blokada = brak publikacji + powód.
  const { checkHardRules, COMPLIANCE_RULES_VERSION } = await import("./autopilot/compliance-rules");
  const blocks = checkHardRules(
    `${fallbackTitle(job)}\n${job.publish_description ?? ""}\n${job.script ?? ""}`,
    {
      kind: "description",
      // Tor z odbiorcy materiału: reguły toru (B2B / inwestor) też obowiązują.
      track:
        job.material_audience === "inwestor"
          ? "inwestor"
          : job.material_audience === "klient"
            ? "pozyczkobiorca"
            : null,
    },
  ).filter((h) => h.severity === "block");
  if (blocks.length) {
    await supabaseAdmin
      .from("studio_video_jobs")
      .update({
        last_error:
          `Auto-publikacja wstrzymana przez reguły compliance (${COMPLIANCE_RULES_VERSION}): ` +
          blocks.map((b) => `${b.message}${b.match ? ` [„${b.match}”]` : ""}`).join(" "),
      })
      .eq("id", job.id);
    return false;
  }

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
  /** Kolejka wstrzymana — powód (caption-burner nie odpowiada); null = szła. */
  deferred: string | null;
  completed: number;
  autoPublished: number;
}> {
  const queue = await processStudioVideoQueue(2);
  const poll = await pollStudioRenderingJobs();
  return { ...queue, ...poll };
}
