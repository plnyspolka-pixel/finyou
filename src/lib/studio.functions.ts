// Server functions panelu /admin/studio-publikacji — jedno miejsce do:
// publikacji wideo (YouTube + Meta), generowania wideo HeyGen z promptu,
// generatora promptów i generatora grafik.
// Logika publikacji Meta: src/lib/studio-publishing.server.ts,
// helpery AI: src/lib/studio-ai.server.ts,
// upload YouTube: istniejący moduł src/lib/youtube-shorts.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StudioPromptKind } from "./studio-ai.server";

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
    const { error } = await supabaseAdmin
      .from("social_publish_queue")
      .update({ status: "pending", last_error: null, scheduled_at: new Date().toISOString() })
      .eq("id", data.id)
      .in("status", ["failed", "cancelled"]);
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
  video_url: string | null;
  thumbnail_url: string | null;
  last_error: string | null;
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

// Krok 1: prompt → scenariusz AI (edytowalny w UI przed startem generacji).
export const generateStudioScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { prompt: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!data.prompt.trim()) throw new Error("Podaj prompt.");
    const { generateVideoScript } = await import("./studio-ai.server");
    return await generateVideoScript(data.prompt.trim());
  });

// Krok 2: scenariusz → ElevenLabs TTS → HeyGen avatar. Zwraca id joba do pollingu.
export const startStudioVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { prompt: string; script: string; avatar_id: string; voice_id?: string }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!data.script.trim()) throw new Error("Scenariusz jest wymagany.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ttsElevenLabs, uploadAudioToHeygen, createHeygenVideoFromAudio } =
      await import("./avatar-faq.server");
    const { FILIP_VOICE_ID } = await import("./heygen-avatars");
    const voiceId = data.voice_id || FILIP_VOICE_ID;

    const { data: job, error: insErr } = await supabaseAdmin
      .from("studio_video_jobs")
      .insert({
        prompt: data.prompt.trim(),
        script: data.script.trim(),
        avatar_id: data.avatar_id,
        voice_id: voiceId,
        status: "generating_audio",
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
      const videoId = await createHeygenVideoFromAudio({
        avatarId: data.avatar_id,
        audioAssetId: assetId,
      });

      await supabaseAdmin
        .from("studio_video_jobs")
        .update({ heygen_video_id: videoId, status: "rendering" })
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

export const pollStudioVideoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getHeygenVideoStatus } = await import("./avatar-faq.server");

    const { data: row } = await supabaseAdmin
      .from("studio_video_jobs")
      .select("heygen_video_id")
      .eq("id", data.id)
      .single();
    if (!row?.heygen_video_id) return { status: "no_video" as const };

    const status = await getHeygenVideoStatus(row.heygen_video_id);
    const update: {
      status?: string;
      video_url?: string | null;
      thumbnail_url?: string | null;
      last_error?: string | null;
    } = {};
    if (status.status === "completed" && status.video_url) {
      update.status = "ready";
      update.video_url = status.video_url;
      update.thumbnail_url = status.thumbnail_url ?? null;
    } else if (status.status === "failed") {
      update.status = "failed";
      update.last_error =
        typeof status.error === "string" ? status.error : JSON.stringify(status.error ?? {});
    } else {
      update.status = status.status === "processing" ? "rendering" : status.status;
    }
    await supabaseAdmin.from("studio_video_jobs").update(update).eq("id", data.id);
    return {
      status: status.status,
      video_url: status.video_url,
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
