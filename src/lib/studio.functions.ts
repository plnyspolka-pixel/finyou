// Server functions panelu /admin/studio-publikacji — jedno miejsce do:
// publikacji wideo (YouTube + Meta), generowania wideo HeyGen z promptu,
// generatora promptów i generatora grafik.
// Logika publikacji Meta: src/lib/studio-publishing.server.ts,
// helpery AI: src/lib/studio-ai.server.ts,
// upload YouTube: istniejący moduł src/lib/youtube-shorts.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StudioPromptKind } from "./studio-ai.server";
import type { StudioPlatform } from "./studio-platforms";
import { isCustomCaptionStyle, parseCaptionStyleId } from "./caption-style";
import { AVATARS_PER_REEL, MAX_AVATARS_PER_REEL, type ScenePlanItem } from "./studio-scenes";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r) => r.role === "administrator")) {
    throw new Error("Brak uprawnień");
  }
}

// ── Status konfiguracji ──────────────────────────────────────────────────────

export type StudioStatus = {
  youtubeConnected: boolean;
  facebookConfigured: boolean;
  instagramConfigured: boolean;
  tiktokConfigured: boolean;
  tiktokConnected: boolean;
  xConfigured: boolean;
  xConnected: boolean;
  heygenConfigured: boolean;
  elevenlabsConfigured: boolean;
  aiConfigured: boolean;
  /** Usługa wypalania napisów (własne style) — bez niej zostaje styl HeyGena. */
  captionBurnerConfigured: boolean;
  /** Znaczek „AI" w rogu rolek (STUDIO_AI_BADGE); kładzie go usługa wypalania. */
  aiBadgeEnabled?: boolean;
};

export const getStudioStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudioStatus> => {
    await assertAdmin(context.userId);
    const { collectStudioStatus } = await import("./studio-status.server");
    return collectStudioStatus();
  });

// ── Publikacja wielokanałowa ─────────────────────────────────────────────────

// Typ platformy żyje w czystym module studio-platforms.ts (wspólnym z panelem
// materiałów); re-eksport zachowuje dotychczasowe importy ze Studia.
export type { StudioPlatform } from "./studio-platforms";

export type SocialQueueItem = {
  id: string;
  platform: string;
  title: string;
  message: string;
  video_url: string | null;
  image_url: string | null;
  scheduled_at: string;
  status: string;
  attempt_count: number;
  external_post_id: string | null;
  tiktok_publish_id: string | null;
  tiktok_status: string | null;
  tiktok_fail_reason: string | null;
  x_media_id: string | null;
  x_media_status: string | null;
  last_error: string | null;
  published_at: string | null;
  created_at: string;
};

export const listSocialQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SocialQueueItem[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("social_publish_queue")
      .select(
        "id, platform, title, message, video_url, image_url, scheduled_at, status, attempt_count, external_post_id, tiktok_publish_id, tiktok_status, tiktok_fail_reason, x_media_id, x_media_status, last_error, published_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as SocialQueueItem[];
  });

// Jedno zgłoszenie → wpisy w kolejkach wszystkich zaznaczonych platform.
// YouTube trafia do istniejącej youtube_publish_queue (tick co 10 min),
// platformy Meta do social_publish_queue.
export const enqueueStudioPublish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      platforms: StudioPlatform[];
      title?: string;
      message?: string;
      video_url?: string;
      image_url?: string;
      privacy_status?: "public" | "unlisted" | "private";
      scheduled_at?: string;
      // Ustawienia posta TikToka wybrane przez twórcę na ekranie publikacji
      // (wymóg audytu — patrz src/lib/tiktok-upload.ts).
      tiktok_post_options?: unknown;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // Walidacja i wstawianie do kolejek: studio-enqueue.server.ts (wspólne
    // z „Publikuj" przy materiałach marketingowych).
    const { enqueuePublication } = await import("./studio-enqueue.server");
    const result = await enqueuePublication({ ...data, userId: context.userId });
    return { ok: true, ...result };
  });

export const deleteSocialQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("social_publish_queue")
      .delete()
      .eq("id", data.id)
      .not("status", "in", "(publishing,processing)");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelSocialQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("social_publish_queue")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const retrySocialQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Ręczne ponowienie daje pełny budżet prób od nowa (inaczej wpis z
    // wyczerpanym licznikiem wracał do kolejki tylko po to, żeby od razu
    // paść). Kontener IG zostaje — jeśli żyje, dokończymy publikację z niego.
    // TikTok odwrotnie: publish_id jest jednorazowy, więc czyścimy go razem
    // z tiktok_status (tick szuka wpisów z tiktok_status IS NULL). Tak samo X:
    // media_id wygasa, a tick X-a szuka wpisów z x_media_status IS NULL.
    // Nieudana kompresja wideo (video_renditions) też dostaje nowy budżet
    // prób — inaczej ponowienie od razu słałoby oryginał.
    const { data: current } = await supabaseAdmin
      .from("social_publish_queue")
      .select("video_url, platform")
      .eq("id", data.id)
      .maybeSingle();
    if (current?.video_url) {
      const { resetVideoRendition } = await import("./video-rendition.server");
      await resetVideoRendition(current.video_url).catch(() => {});
    }
    const { error } = await supabaseAdmin
      .from("social_publish_queue")
      .update({
        status: "pending",
        last_error: null,
        attempt_count: 0,
        scheduled_at: new Date().toISOString(),
        tiktok_publish_id: null,
        tiktok_status: null,
        tiktok_fail_reason: null,
        tiktok_upload_at: null,
        x_media_id: null,
        x_media_status: null,
        x_media_at: null,
        // Kontener IG ma sens tylko przy wpisie Instagrama. Wpisy X przejęte
        // kiedyś przez tor Meta niosą obcy ig_creation_id — gdyby został,
        // ponowienie mogłoby opublikować ten kontener na Instagramie.
        ...(current?.platform !== "instagram_reels"
          ? { ig_creation_id: null, ig_container_at: null }
          : {}),
      })
      .eq("id", data.id)
      .in("status", ["failed", "cancelled", "processing"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishSocialQueueItemNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("social_publish_queue")
      .select("platform")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Nie znaleziono wpisu w kolejce.");

    // `preparing` = wideo jeszcze się kompresuje do profilu publikacji; wpis
    // został w kolejce i tick opublikuje go, gdy plik będzie gotowy.
    if (row.platform === "tiktok") {
      const { processTiktokQueueItem } = await import("./tiktok.server");
      const result = await processTiktokQueueItem(data.id);
      if (!result.ok) throw new Error(result.error ?? "Publikacja nieudana.");
      return { ok: true, processing: !!result.processing, preparing: !!result.preparing };
    }
    if (row.platform === "x") {
      const { processXQueueItem } = await import("./x.server");
      const result = await processXQueueItem(data.id);
      if (!result.ok) throw new Error(result.error ?? "Publikacja nieudana.");
      return { ok: true, processing: !!result.processing, preparing: !!result.preparing };
    }
    const { processSocialQueueItem } = await import("./studio-publishing.server");
    const result = await processSocialQueueItem(data.id);
    if (!result.ok) throw new Error(result.error ?? "Publikacja nieudana.");
    return { ok: true, processing: !!result.processing, preparing: !!result.preparing };
  });

// Gotowe wideo do podstawienia jako źródło: joby Studia + Awatar FAQ.
export type StudioVideoSource = { label: string; video_url: string };

export const listStudioVideoSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudioVideoSource[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [jobs, faqs] = await Promise.all([
      supabaseAdmin
        .from("studio_video_jobs")
        .select("prompt, video_url")
        .eq("status", "ready")
        .not("video_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("avatar_faqs")
        .select("question, video_url")
        .not("video_url", "is", null)
        .order("sort_order", { ascending: true })
        .limit(50),
    ]);
    const sources: StudioVideoSource[] = [];
    for (const j of jobs.data ?? []) {
      if (j.video_url)
        sources.push({ label: `Studio: ${j.prompt.slice(0, 80)}`, video_url: j.video_url });
    }
    for (const f of faqs.data ?? []) {
      if (f.video_url)
        sources.push({ label: `FAQ: ${f.question.slice(0, 80)}`, video_url: f.video_url });
    }
    return sources;
  });

// ── Wideo HeyGen z promptu ───────────────────────────────────────────────────

export type StudioVideoJob = {
  id: string;
  prompt: string;
  script: string;
  avatar_id: string;
  voice_id: string;
  heygen_video_id: string | null;
  status: string;
  /** Plik do publikacji — z wypalonymi napisami, jeśli je zamówiono. */
  video_url: string | null;
  /** Czysty master bez napisów (do montażu); null, gdy nie ma osobnej wersji. */
  video_url_clean: string | null;
  thumbnail_url: string | null;
  subtitle_url: string | null;
  /** Czy `video_url` ma napisy wypalone w obrazie. */
  captions: boolean;
  caption_wait_since: string | null;
  /** 'heygen' = napisy HeyGena; inne = wypalone u nas (src/lib/caption-style.ts). */
  caption_style: string;
  /** Id zadania w usłudze wypalania — gdy status to 'captioning'. */
  caption_burn_id: string | null;
  caption_burn_started_at: string | null;
  caption_burn_attempts: number;
  /** Czy rolka renderuje się jako sklejka scen (awatar + przebitki). */
  dynamic_scenes: boolean;
  /** Czy poszła stałą strukturą (ujęcie → przebitka → a-roll). */
  reel_structure: boolean;
  /** Rotacja domyślnych awatarów użyta przy tym jobie. */
  avatar_ids: string[];
  /** Plan scen faktycznie wysłany na render; null = pojedyncze ujęcie. */
  scene_plan: ScenePlanItem[] | null;
  last_error: string | null;
  auto_publish_platforms: string[];
  publish_privacy: string;
  publish_title: string;
  publish_description: string;
  auto_published_at: string | null;
  created_at: string;
  updated_at: string;
};

export const listStudioVideoJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudioVideoJob[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("studio_video_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as StudioVideoJob[];
  });

// Głosy ElevenLabs do wyboru w generatorze — pełna lista z konta przez
// /v2/voices z paginacją (v1 zwracał tylko część głosów); fallback: Filip.
export type StudioVoice = { id: string; name: string; description: string };

type ElevenVoice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
};

async function fetchAllElevenVoices(key: string): Promise<ElevenVoice[]> {
  const all: ElevenVoice[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 10; page++) {
    const url = new URL("https://api.elevenlabs.io/v2/voices");
    url.searchParams.set("page_size", "100");
    if (pageToken) url.searchParams.set("next_page_token", pageToken);
    const res = await fetch(url, { headers: { "xi-api-key": key } });
    if (!res.ok) break;
    const json = (await res.json()) as {
      voices?: ElevenVoice[];
      has_more?: boolean;
      next_page_token?: string | null;
    };
    all.push(...(json.voices ?? []));
    if (!json.has_more || !json.next_page_token) return all;
    pageToken = json.next_page_token;
  }
  if (all.length) return all;
  // Fallback: stare v1 (bez paginacji).
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": key },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { voices?: ElevenVoice[] };
  return json.voices ?? [];
}

export const listStudioVoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudioVoice[]> => {
    await assertAdmin(context.userId);
    const { FILIP_VOICE_ID } = await import("./heygen-avatars");
    const filip: StudioVoice = {
      id: FILIP_VOICE_ID,
      name: "Filip (domyślny)",
      description: "Polski lektor ElevenLabs",
    };
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return [filip];
    try {
      const raw = await fetchAllElevenVoices(key);
      const voices: StudioVoice[] = raw.map((v) => ({
        id: v.voice_id,
        name: v.voice_id === FILIP_VOICE_ID ? `${v.name} (domyślny)` : v.name,
        description: [v.labels?.gender, v.labels?.accent, v.labels?.age, v.category]
          .filter(Boolean)
          .join(", "),
      }));
      if (!voices.length) return [filip];
      // Własne (sklonowane) głosy na górze, Filip zawsze pierwszy.
      const rank = (v: StudioVoice) =>
        v.id === FILIP_VOICE_ID ? 0 : /cloned|professional|generated/.test(v.description) ? 1 : 2;
      voices.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "pl"));
      if (!voices.some((v) => v.id === FILIP_VOICE_ID)) voices.unshift(filip);
      return voices;
    } catch {
      return [filip];
    }
  });

// Awatary HeyGen — pełny katalog z konta (moje grupy + talking photos +
// publiczne awatary HeyGen); fallback: sztywna lista HEYGEN_AVATARS.
export type StudioAvatar = {
  id: string;
  name: string;
  preview: string | null;
  kind: "avatar" | "talking_photo";
  mine: boolean;
  group?: string;
};

export const listStudioAvatars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudioAvatar[]> => {
    await assertAdmin(context.userId);
    const { HEYGEN_AVATARS } = await import("./heygen-avatars");
    const fallback: StudioAvatar[] = HEYGEN_AVATARS.map((a) => ({
      id: a.id,
      name: a.name,
      preview: a.previewImage,
      kind: "avatar",
      mine: true,
    }));
    if (!process.env.HEYGEN_API_KEY) return fallback;
    try {
      const { listHeygenCatalog } = await import("./heygen-catalog.server");
      const items = await listHeygenCatalog();
      if (!items.length) return fallback;
      // Digital twin Filipa oznaczamy jako "mój" nawet gdy API nie zwróci grup.
      const filipId = HEYGEN_AVATARS[0].id;
      return items.map((i) => (i.id === filipId ? { ...i, mine: true } : i));
    } catch {
      return fallback;
    }
  });

// Krok 1: prompt → scenariusz (edytowalny w UI przed startem generacji).
// Pytanie z bazy 250 (question_id) dostaje GOTOWY scenariusz złożony 1:1
// ze sprawdzonej treści paczki (znacznik → pytanie → teza → CTA) — bez AI.
// AI pisze scenariusz tylko dla własnych, wolnych promptów.
export const generateStudioScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { prompt: string; question_id?: number }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.question_id != null) {
      const { findShortsQuestion } = await import("./shorts-question-bank");
      const q = findShortsQuestion(data.question_id);
      if (!q) throw new Error(`Nie znaleziono pytania #${data.question_id} w bazie.`);
      const { buildShortsScript } = await import("./shorts-script");
      return buildShortsScript(q);
    }
    if (!data.prompt.trim()) throw new Error("Podaj prompt.");
    const { generateVideoScript } = await import("./studio-ai.server");
    const gen = await generateVideoScript(data.prompt.trim());
    // Spójny kształt z sekcjami: tekst AI ląduje w treści, hook/CTA puste.
    return { ...gen, hook: "", content: gen.script, cta: "" };
  });

// Auto-publikacja: walidacja wspólna dla generacji pojedynczej i wsadowej.
async function sanitizeAutoPublish(d: {
  auto_publish_platforms?: StudioPlatform[];
  publish_privacy?: string;
  tiktok_post_options?: unknown;
}): Promise<{
  auto_publish_platforms: StudioPlatform[];
  publish_privacy: string;
  tiktok_post_options: unknown;
}> {
  const allowed: StudioPlatform[] = [
    "youtube",
    "facebook_post",
    "facebook_reels",
    "instagram_reels",
    "tiktok",
  ];
  const platforms = (d.auto_publish_platforms ?? []).filter((p) => allowed.includes(p));
  const privacy = ["public", "unlisted", "private"].includes(d.publish_privacy ?? "")
    ? d.publish_privacy!
    : "public";
  // Auto-publikacja na TikToka też musi nieść wybory twórcy — tick nie ma
  // prawa dobrać prywatności sam, więc bez nich zadania nie zakładamy.
  let tiktokOptions: unknown = null;
  if (platforms.includes("tiktok")) {
    const { parseTiktokPostOptions } = await import("./tiktok-upload");
    tiktokOptions = parseTiktokPostOptions(d.tiktok_post_options);
  }
  return {
    auto_publish_platforms: platforms,
    publish_privacy: privacy,
    tiktok_post_options: tiktokOptions,
  };
}

/** Liczba twarzy w rolce z panelu: 1–MAX, a gdy brak — domyślne dwie. */
function avatarsPerReel(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return AVATARS_PER_REEL;
  return Math.min(MAX_AVATARS_PER_REEL, Math.max(1, Math.floor(v)));
}

// Krok 2: scenariusz → ElevenLabs TTS → HeyGen avatar. Zwraca id joba do pollingu.
export const startStudioVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      prompt: string;
      script: string;
      avatar_id: string;
      voice_id?: string;
      captions?: boolean;
      /** Styl napisów: 'heygen' albo własny (reels | tiktok | box | minimal). */
      caption_style?: string;
      dynamic_scenes?: boolean;
      reel_structure?: boolean;
      /** Pula twarzy z panelu (prowadzący + zestaw domyślnych). */
      avatar_ids?: string[];
      /** Ile twarzy z puli w jednej rolce (domyślnie AVATARS_PER_REEL). */
      avatars_per_reel?: number;
      auto_publish_platforms?: StudioPlatform[];
      publish_privacy?: string;
      tiktok_post_options?: unknown;
      publish_title?: string;
      publish_description?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!data.script.trim()) throw new Error("Scenariusz jest wymagany.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { FILIP_VOICE_ID } = await import("./heygen-avatars");
    const voiceId = data.voice_id || FILIP_VOICE_ID;
    const autoPub = await sanitizeAutoPublish(data);
    // Twarze rolki: prowadzący + partner z puli panelu (a gdy pusta — ze stałego
    // zestawu domyślnych), dobrany rotacyjnie po ostatnich rolkach.
    const { reelRotations } = await import("./studio-avatars.server");
    const [avatarIds] = await reelRotations({
      lead: data.avatar_id,
      pool: data.avatar_ids,
      count: avatarsPerReel(data.avatars_per_reel),
    });
    const reelStructure = data.reel_structure === true;

    const { data: job, error: insErr } = await supabaseAdmin
      .from("studio_video_jobs")
      .insert({
        prompt: data.prompt.trim(),
        script: data.script.trim(),
        avatar_id: data.avatar_id,
        voice_id: voiceId,
        status: "generating_audio",
        captions: data.captions !== false,
        caption_style: parseCaptionStyleId(data.caption_style),
        dynamic_scenes: data.dynamic_scenes === true || reelStructure,
        reel_structure: reelStructure,
        avatar_ids: avatarIds,
        auto_publish_platforms: autoPub.auto_publish_platforms,
        publish_privacy: autoPub.publish_privacy,
        tiktok_post_options: autoPub.tiktok_post_options as never,
        publish_title: data.publish_title?.trim() ?? "",
        publish_description: data.publish_description?.trim() ?? "",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    try {
      await supabaseAdmin
        .from("studio_video_jobs")
        .update({ status: "uploading" })
        .eq("id", job.id);

      const { renderStudioVideo } = await import("./studio-render.server");
      const rendered = await renderStudioVideo({
        script: data.script.trim(),
        topic: data.prompt.trim(),
        avatarId: data.avatar_id,
        voiceId,
        captions: data.captions !== false,
        dynamicScenes: data.dynamic_scenes === true || reelStructure,
        reelStructure,
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
      return { ok: true, id: job.id as string };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("studio_video_jobs")
        .update({ status: "failed", last_error: msg })
        .eq("id", job.id);
      throw new Error(msg);
    }
  });

// Generowanie wsadowe: pytania z bazy trafiają jako joby 'queued'.
// Kolejkę przetwarza tick (co 10 min) oraz otwarty panel (processStudioVideoQueueNow).
export const enqueueStudioVideoBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      question_ids: number[];
      avatar_id: string;
      voice_id?: string;
      captions?: boolean;
      caption_style?: string;
      dynamic_scenes?: boolean;
      reel_structure?: boolean;
      /** Pula twarzy z panelu (prowadzący + zestaw domyślnych). */
      avatar_ids?: string[];
      /** Ile twarzy z puli w jednej rolce (domyślnie AVATARS_PER_REEL). */
      avatars_per_reel?: number;
      auto_publish_platforms?: StudioPlatform[];
      publish_privacy?: string;
      tiktok_post_options?: unknown;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const ids = [...new Set(data.question_ids)];
    if (!ids.length) throw new Error("Zaznacz co najmniej jedno pytanie.");
    if (ids.length > 25) throw new Error("Maksymalnie 25 pytań w jednej serii.");
    const { findShortsQuestion, shortsPromptForQuestion } = await import("./shorts-question-bank");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { FILIP_VOICE_ID } = await import("./heygen-avatars");
    const autoPub = await sanitizeAutoPublish(data);
    const reelStructure = data.reel_structure === true;

    // Pomiń pytania, które mają już nie-failowy job (ochrona przed dublami).
    const { data: existing } = await supabaseAdmin
      .from("studio_video_jobs")
      .select("prompt, status")
      .neq("status", "failed")
      .limit(1000);
    const taken = new Set(
      (existing ?? [])
        .map((r) => /^#(\d{1,3}) · /.exec(r.prompt)?.[1])
        .filter(Boolean)
        .map(Number),
    );

    const rows = [];
    let skipped = 0;
    for (const id of ids) {
      const q = findShortsQuestion(id);
      if (!q) throw new Error(`Nie znaleziono pytania #${id} w bazie.`);
      if (taken.has(id)) {
        skipped++;
        continue;
      }
      rows.push({
        prompt: shortsPromptForQuestion(q),
        script: "",
        avatar_id: data.avatar_id,
        voice_id: data.voice_id || FILIP_VOICE_ID,
        status: "queued",
        captions: data.captions !== false,
        caption_style: parseCaptionStyleId(data.caption_style),
        dynamic_scenes: data.dynamic_scenes === true || reelStructure,
        reel_structure: reelStructure,
        // Uzupełniane niżej — każda rolka serii dostaje kolejnego partnera.
        avatar_ids: [] as string[],
        auto_publish_platforms: autoPub.auto_publish_platforms,
        publish_privacy: autoPub.publish_privacy,
        tiktok_post_options: autoPub.tiktok_post_options as never,
        publish_title: q.question.slice(0, 92),
        created_by: context.userId,
      });
    }
    if (rows.length) {
      // Rotacja po całej serii: partnerzy obchodzą zestaw po kolei, zamiast
      // 25 razy tej samej pary.
      const { reelRotations } = await import("./studio-avatars.server");
      const rotations = await reelRotations({
        lead: data.avatar_id,
        pool: data.avatar_ids,
        count: avatarsPerReel(data.avatars_per_reel),
        n: rows.length,
      });
      rows.forEach((row, i) => {
        row.avatar_ids = rotations[i] ?? [data.avatar_id];
      });
      const { error } = await supabaseAdmin.from("studio_video_jobs").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true, queued: rows.length, skipped };
  });

// Przetwarza jeden job z kolejki wsadowej (wołane w pętli przez otwarty panel,
// żeby nie czekać na cron). Zwraca ile jobów zostało w kolejce.
export const processStudioVideoQueueNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { processStudioVideoQueue } = await import("./studio-video-queue.server");
    return await processStudioVideoQueue(1);
  });

export const pollStudioVideoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getHeygenVideoStatus } = await import("./avatar-faq.server");
    const { settleCaptionBurn, settleHeygenCompletion } =
      await import("./studio-video-queue.server");
    type JobRow = import("./studio-video-queue.server").StudioJobRow;

    const { data: row } = await supabaseAdmin
      .from("studio_video_jobs")
      .select("*")
      .eq("id", data.id)
      .single();
    const job = (row ?? null) as JobRow | null;
    if (!job) return { status: "no_video" as const };

    // Własne napisy w toku: odpytujemy usługę wypalania, nie HeyGen.
    if (job.status === "captioning") {
      const out = await settleCaptionBurn(job);
      return {
        status: out.state === "ready" ? "completed" : "captioning",
        video_url: out.state === "ready" ? out.videoUrl : null,
        thumbnail_url: job.thumbnail_url,
      };
    }
    if (!job.heygen_video_id) return { status: "no_video" as const };

    const status = await getHeygenVideoStatus(job.heygen_video_id);
    if (status.status === "completed" && status.video_url) {
      // Te same decyzje co w ticku: własne napisy, wersja HeyGena z karencją,
      // auto-publikacja — jedna funkcja, żeby panel i cron nie rozjeżdżały się.
      const out = await settleHeygenCompletion(job, status);
      return {
        status:
          out.state === "ready"
            ? "completed"
            : out.state === "captioning"
              ? "captioning"
              : "rendering",
        video_url: out.state === "ready" ? out.videoUrl : null,
        thumbnail_url: status.thumbnail_url,
      };
    }
    if (status.status === "failed") {
      await supabaseAdmin
        .from("studio_video_jobs")
        .update({
          status: "failed",
          last_error:
            typeof status.error === "string" ? status.error : JSON.stringify(status.error ?? {}),
        })
        .eq("id", data.id);
      return { status: "failed", video_url: null, thumbnail_url: status.thumbnail_url };
    }
    await supabaseAdmin
      .from("studio_video_jobs")
      .update({ status: status.status === "processing" ? "rendering" : status.status })
      .eq("id", data.id);
    return { status: status.status, video_url: null, thumbnail_url: status.thumbnail_url };
  });

/**
 * Zmiana napisów gotowego wideo na własny styl (usługa wypalania). Poprzedni
 * plik zostaje pod video_url, aż nowy będzie gotowy; przy porażce wraca.
 */
export const restyleStudioVideoCaptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; caption_style: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!isCustomCaptionStyle(data.caption_style)) {
      throw new Error("Wybierz własny styl napisów (nie HeyGen).");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { restyleJobCaptions } = await import("./studio-video-queue.server");
    type JobRow = import("./studio-video-queue.server").StudioJobRow;
    const { data: row } = await supabaseAdmin
      .from("studio_video_jobs")
      .select("*")
      .eq("id", data.id)
      .single();
    if (!row) throw new Error("Nie znaleziono zadania.");
    await restyleJobCaptions(row as JobRow, data.caption_style);
    return { ok: true };
  });

export const deleteStudioVideoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("studio_video_jobs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Generator promptów ───────────────────────────────────────────────────────

export const generateStudioPrompts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { topic: string; kind: StudioPromptKind; count?: number }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!data.topic.trim()) throw new Error("Podaj temat.");
    const { generatePromptIdeas } = await import("./studio-ai.server");
    const prompts = await generatePromptIdeas({
      topic: data.topic.trim(),
      kind: data.kind,
      count: data.count,
    });
    return { prompts };
  });

// ── Generator grafik ─────────────────────────────────────────────────────────

export type StudioImage = {
  id: string;
  prompt: string;
  image_url: string;
  created_at: string;
};

export const listStudioImages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudioImage[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("studio_images")
      .select("id, prompt, image_url, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as StudioImage[];
  });

export const generateStudioImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { prompt: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!data.prompt.trim()) throw new Error("Podaj prompt.");
    const { generateStudioImage } = await import("./studio-ai.server");
    return await generateStudioImage(data.prompt.trim(), context.userId);
  });

export const deleteStudioImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("studio_images")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.storage_path) {
      await supabaseAdmin.storage.from("studio-media").remove([row.storage_path]);
    }
    const { error } = await supabaseAdmin.from("studio_images").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Domyślne awatary (stały zestaw + rotacja a-rolli) ────────────────────────
// Przycisk „Ustaw jako domyślne" w panelu zapisuje TU cały zestaw — kolejność
// z panelu wyznacza rotację: pierwszy mówi hook, kolejni przejmują a-rolle.

export type StudioDefaultAvatar = {
  avatar_id: string;
  name: string;
  preview: string | null;
  kind: "avatar" | "talking_photo";
  position: number;
};

/** Więcej twarzy w jednej 30-60-sekundowej rolce to już nie montaż, to chaos. */
const MAX_DEFAULT_AVATARS = 6;

export const listStudioDefaultAvatars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudioDefaultAvatar[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("studio_default_avatars")
      .select("avatar_id, name, preview, kind, position")
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      avatar_id: r.avatar_id,
      name: r.name ?? "",
      preview: r.preview ?? null,
      kind: r.kind === "talking_photo" ? "talking_photo" : "avatar",
      position: r.position ?? 0,
    }));
  });

export const saveStudioDefaultAvatars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { avatar_ids: string[] }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const ids = [...new Set(data.avatar_ids.map((i) => i.trim()).filter(Boolean))];
    if (ids.length > MAX_DEFAULT_AVATARS) {
      throw new Error(`Maksymalnie ${MAX_DEFAULT_AVATARS} domyślnych awatarów.`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Nazwę i podgląd bierzemy z katalogu konta HeyGen, żeby panel pokazywał
    // twarze także wtedy, gdy API akurat nie odpowiada.
    const catalog = new Map<string, { name: string; preview: string | null; kind: string }>();
    try {
      const { listHeygenCatalog } = await import("./heygen-catalog.server");
      for (const item of await listHeygenCatalog()) {
        catalog.set(item.id, { name: item.name, preview: item.preview, kind: item.kind });
      }
    } catch {
      // Katalog niedostępny — zapisujemy same id, panel dorobi opis później.
    }
    const { HEYGEN_AVATARS } = await import("./heygen-avatars");
    for (const a of HEYGEN_AVATARS) {
      if (!catalog.has(a.id)) {
        catalog.set(a.id, { name: a.name, preview: a.previewImage, kind: "avatar" });
      }
    }

    // Zestaw zastępujemy w całości — „domyślne" to dokładnie to, co widać
    // w panelu przy kliknięciu, bez resztek po poprzednim wyborze.
    const { error: delErr } = await supabaseAdmin
      .from("studio_default_avatars")
      .delete()
      .neq("avatar_id", "");
    if (delErr) throw new Error(delErr.message);
    if (!ids.length) return { ok: true, saved: 0 };

    const rows = ids.map((avatar_id, position) => {
      const meta = catalog.get(avatar_id);
      return {
        avatar_id,
        name: meta?.name ?? avatar_id,
        preview: meta?.preview ?? null,
        kind: meta?.kind === "talking_photo" ? "talking_photo" : "avatar",
        position,
        created_by: context.userId,
      };
    });
    const { error } = await supabaseAdmin.from("studio_default_avatars").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, saved: rows.length };
  });

// ── Bank b-rolli ─────────────────────────────────────────────────────────────

export type StudioBrollAsset = {
  id: string;
  kind: "broll";
  title: string;
  tags: string[];
  media_url: string;
  source: string;
  source_query: string;
  orientation: string | null;
  attribution: string;
  active: boolean;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
};

export const listStudioBroll = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { search?: string }) => d ?? {})
  .handler(async ({ data, context }): Promise<StudioBrollAsset[]> => {
    await assertAdmin(context.userId);
    const { listBrollAssets } = await import("./studio-broll.server");
    const items = await listBrollAssets({
      search: data.search,
      includeInactive: true,
      limit: 2000,
    });
    return items.map(({ storage_path: _ignored, ...rest }) => rest);
  });

export const addStudioBroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string; title?: string; tags?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { addBrollFromUrl } = await import("./studio-broll.server");
    const tags = (data.tags ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const asset = await addBrollFromUrl({
      url: data.url,
      title: data.title,
      tags,
      source: "url",
      sourceQuery: data.title ?? "",
      userId: context.userId,
    });
    return { ok: true, id: asset.id, media_url: asset.media_url };
  });

export const setStudioBrollActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { setBrollActive } = await import("./studio-broll.server");
    await setBrollActive(data.id, data.active);
    return { ok: true };
  });

export const deleteStudioBroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { deleteBrollAsset } = await import("./studio-broll.server");
    await deleteBrollAsset(data.id);
    return { ok: true };
  });

// Startowy bank ze stocku (Pexels, gdy jest PEXELS_API_KEY, inaczej biblioteka
// HeyGena), po kilka ujęć na frazę. Jedno wywołanie = jedna porcja fraz;
// panel woła w pętli, dopóki `remaining` > 0. Idempotentne — frazy już
// pobrane są pomijane.
export const seedStudioBroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: Record<string, never>) => d ?? {})
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { seedBrollBank } = await import("./studio-broll.server");
    return await seedBrollBank({ userId: context.userId });
  });
