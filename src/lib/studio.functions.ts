// Server functions panelu /admin/studio-publikacji — jedno miejsce do:
// publikacji wideo (YouTube + Meta), generowania wideo HeyGen z promptu,
// generatora promptów i generatora grafik.
// Logika publikacji Meta: src/lib/studio-publishing.server.ts,
// helpery AI: src/lib/studio-ai.server.ts,
// upload YouTube: istniejący moduł src/lib/youtube-shorts.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StudioPromptKind } from "./studio-ai.server";
import { resolveCaptionedOutput } from "./studio-captions";

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
  heygenConfigured: boolean;
  elevenlabsConfigured: boolean;
  aiConfigured: boolean;
};

export const getStudioStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudioStatus> => {
    await assertAdmin(context.userId);
    const { getIntegrationRow } = await import("./youtube-shorts.server");
    const { getMetaPublishEnv } = await import("./studio-publishing.server");
    const meta = getMetaPublishEnv();
    let youtubeConnected = false;
    try {
      youtubeConnected = !!(await getIntegrationRow()).refresh_token;
    } catch {
      // Brak tabeli/tokenu nie blokuje panelu.
    }
    return {
      youtubeConnected,
      facebookConfigured: meta.facebookConfigured,
      instagramConfigured: meta.instagramConfigured,
      heygenConfigured: !!process.env.HEYGEN_API_KEY,
      elevenlabsConfigured: !!process.env.ELEVENLABS_API_KEY,
      aiConfigured: !!process.env.LOVABLE_API_KEY,
    };
  });

// ── Publikacja wielokanałowa ─────────────────────────────────────────────────

export type StudioPlatform = "youtube" | "facebook_post" | "facebook_reels" | "instagram_reels";

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
        "id, platform, title, message, video_url, image_url, scheduled_at, status, attempt_count, external_post_id, last_error, published_at, created_at",
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
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!data.platforms.length) throw new Error("Wybierz co najmniej jedną platformę.");
    const videoUrl = data.video_url?.trim() || null;
    const imageUrl = data.image_url?.trim() || null;
    const title = data.title?.trim() ?? "";
    const message = data.message?.trim() ?? "";
    for (const url of [videoUrl, imageUrl]) {
      if (url && !/^https:\/\//.test(url))
        throw new Error("URL mediów musi zaczynać się od https://");
    }
    const needsVideo = data.platforms.filter((p) => p !== "facebook_post");
    if (needsVideo.length && !videoUrl) {
      throw new Error("Publikacja wideo (YouTube/Reels) wymaga URL pliku MP4.");
    }
    if (data.platforms.includes("youtube") && !title) {
      throw new Error("YouTube wymaga tytułu.");
    }
    if (data.platforms.includes("facebook_post") && !message && !imageUrl && !videoUrl) {
      throw new Error("Post na Facebooku wymaga treści lub mediów.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const scheduledAt = data.scheduled_at ?? new Date().toISOString();

    if (data.platforms.includes("youtube")) {
      const { error } = await supabaseAdmin.from("youtube_publish_queue").insert({
        title,
        description: message,
        source_video_url: videoUrl!,
        privacy_status: data.privacy_status ?? "public",
        scheduled_at: scheduledAt,
        created_by: context.userId,
      });
      if (error) throw new Error(error.message);
    }

    const metaPlatforms = data.platforms.filter(
      (p): p is Exclude<StudioPlatform, "youtube"> => p !== "youtube",
    );
    if (metaPlatforms.length) {
      const rows = metaPlatforms.map((platform) => ({
        platform,
        title,
        message,
        video_url: videoUrl,
        image_url: platform === "facebook_post" ? imageUrl : null,
        scheduled_at: scheduledAt,
        created_by: context.userId,
      }));
      const { error } = await supabaseAdmin.from("social_publish_queue").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true, queued: data.platforms.length };
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
    const { error } = await supabaseAdmin
      .from("social_publish_queue")
      .update({
        status: "pending",
        last_error: null,
        attempt_count: 0,
        scheduled_at: new Date().toISOString(),
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
    const { processSocialQueueItem } = await import("./studio-publishing.server");
    const result = await processSocialQueueItem(data.id);
    if (!result.ok) throw new Error(result.error ?? "Publikacja nieudana.");
    return { ok: true, processing: !!result.processing };
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
function sanitizeAutoPublish(d: {
  auto_publish_platforms?: StudioPlatform[];
  publish_privacy?: string;
}): {
  auto_publish_platforms: StudioPlatform[];
  publish_privacy: string;
} {
  const allowed: StudioPlatform[] = [
    "youtube",
    "facebook_post",
    "facebook_reels",
    "instagram_reels",
  ];
  const platforms = (d.auto_publish_platforms ?? []).filter((p) => allowed.includes(p));
  const privacy = ["public", "unlisted", "private"].includes(d.publish_privacy ?? "")
    ? d.publish_privacy!
    : "public";
  return { auto_publish_platforms: platforms, publish_privacy: privacy };
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
      auto_publish_platforms?: StudioPlatform[];
      publish_privacy?: string;
      publish_title?: string;
      publish_description?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!data.script.trim()) throw new Error("Scenariusz jest wymagany.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ttsElevenLabs, uploadAudioToHeygen, createHeygenVideoFromAudio } =
      await import("./avatar-faq.server");
    const { FILIP_VOICE_ID } = await import("./heygen-avatars");
    const voiceId = data.voice_id || FILIP_VOICE_ID;
    const autoPub = sanitizeAutoPublish(data);

    const { data: job, error: insErr } = await supabaseAdmin
      .from("studio_video_jobs")
      .insert({
        prompt: data.prompt.trim(),
        script: data.script.trim(),
        avatar_id: data.avatar_id,
        voice_id: voiceId,
        status: "generating_audio",
        captions: data.captions !== false,
        auto_publish_platforms: autoPub.auto_publish_platforms,
        publish_privacy: autoPub.publish_privacy,
        publish_title: data.publish_title?.trim() ?? "",
        publish_description: data.publish_description?.trim() ?? "",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    try {
      const audio = await ttsElevenLabs({ text: data.script.trim(), voiceId });
      await supabaseAdmin
        .from("studio_video_jobs")
        .update({ status: "uploading" })
        .eq("id", job.id);

      const assetId = await uploadAudioToHeygen(audio);
      const { videoId, captionMode } = await createHeygenVideoFromAudio({
        avatarId: data.avatar_id,
        audioAssetId: assetId,
        captions: data.captions !== false ? "burned" : "off",
      });

      await supabaseAdmin
        .from("studio_video_jobs")
        .update({
          heygen_video_id: videoId,
          status: "rendering",
          captions: captionMode === "burned",
          caption_wait_since: null,
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
      auto_publish_platforms?: StudioPlatform[];
      publish_privacy?: string;
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
    const autoPub = sanitizeAutoPublish(data);

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
        auto_publish_platforms: autoPub.auto_publish_platforms,
        publish_privacy: autoPub.publish_privacy,
        publish_title: q.question.slice(0, 92),
        created_by: context.userId,
      });
    }
    if (rows.length) {
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

    const { data: row } = await supabaseAdmin
      .from("studio_video_jobs")
      .select(
        "id, prompt, script, avatar_id, voice_id, heygen_video_id, status, video_url, captions, caption_wait_since, auto_publish_platforms, publish_privacy, publish_title, publish_description, auto_published_at, created_by",
      )
      .eq("id", data.id)
      .single();
    if (!row?.heygen_video_id) return { status: "no_video" as const };

    const status = await getHeygenVideoStatus(row.heygen_video_id);
    const update: {
      status?: string;
      video_url?: string | null;
      video_url_clean?: string | null;
      thumbnail_url?: string | null;
      subtitle_url?: string | null;
      captions?: boolean;
      caption_wait_since?: string | null;
      last_error?: string | null;
    } = {};
    if (status.status === "completed" && status.video_url) {
      // Wersja z wypalonymi napisami to osobny plik HeyGena — bierzemy ją,
      // a czysty master zostaje pod video_url_clean.
      const resolved = resolveCaptionedOutput({
        want: row.captions ? "burned" : "sidecar",
        outputs: status,
        waitSince: row.caption_wait_since,
        now: new Date(),
      });
      if (resolved.state === "waiting") {
        await supabaseAdmin
          .from("studio_video_jobs")
          .update({ caption_wait_since: resolved.waitSince })
          .eq("id", data.id);
        return { status: "rendering", video_url: null, thumbnail_url: status.thumbnail_url };
      }
      update.status = "ready";
      update.video_url = resolved.videoUrl;
      update.video_url_clean = resolved.cleanVideoUrl;
      update.thumbnail_url = status.thumbnail_url ?? null;
      update.subtitle_url = resolved.subtitleUrl;
      update.captions = resolved.captionsBurned;
      update.caption_wait_since = null;
      update.last_error = resolved.note;
    } else if (status.status === "failed") {
      update.status = "failed";
      update.last_error =
        typeof status.error === "string" ? status.error : JSON.stringify(status.error ?? {});
    } else {
      update.status = status.status === "processing" ? "rendering" : status.status;
    }
    await supabaseAdmin.from("studio_video_jobs").update(update).eq("id", data.id);

    if (update.status === "ready" && update.video_url) {
      const { maybeAutoPublishJob } = await import("./studio-video-queue.server");
      await maybeAutoPublishJob({ ...row, status: "ready", video_url: update.video_url });
    }
    return {
      status: status.status,
      // Ten sam plik, który zapisaliśmy i który pójdzie do publikacji.
      video_url: update.video_url ?? null,
      thumbnail_url: status.thumbnail_url,
    };
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
