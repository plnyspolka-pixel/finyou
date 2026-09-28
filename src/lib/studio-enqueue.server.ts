// Wspólne wstawianie do kolejek publikacji — jedno miejsce dla Studia
// publikacji (formularz ręczny) i panelu materiałów marketingowych
// („Publikuj" przy wgranym pliku). Walidacja i reguły per platforma są tu,
// żeby oba wejścia odrzucały dokładnie te same braki.
//
// YouTube trafia do youtube_publish_queue (tick co 10 min), Meta / TikTok / X
// dzielą social_publish_queue (różni je kolumna `platform`).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { StudioPlatform } from "./studio-platforms";

export type EnqueuePublicationInput = {
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
  userId: string;
};

export type EnqueuePublicationResult = {
  queued: number;
  /** Wpisy w social_publish_queue (Meta, TikTok, X) — do „Publikuj teraz". */
  social: { id: string; platform: StudioPlatform }[];
  /** Wpisy w youtube_publish_queue. */
  youtube: { id: string }[];
};

export async function enqueuePublication(
  data: EnqueuePublicationInput,
): Promise<EnqueuePublicationResult> {
  if (!data.platforms.length) throw new Error("Wybierz co najmniej jedną platformę.");
  const videoUrl = data.video_url?.trim() || null;
  const imageUrl = data.image_url?.trim() || null;
  const title = data.title?.trim() ?? "";
  const message = data.message?.trim() ?? "";
  for (const url of [videoUrl, imageUrl]) {
    if (url && !/^https:\/\//.test(url))
      throw new Error("URL mediów musi zaczynać się od https://");
  }
  // X, jak post na FB, publikuje też sam tekst — reszta platform to wideo.
  const needsVideo = data.platforms.filter((p) => p !== "facebook_post" && p !== "x");
  if (needsVideo.length && !videoUrl) {
    throw new Error("Publikacja wideo (YouTube/Reels/TikTok) wymaga URL pliku MP4.");
  }
  if (data.platforms.includes("youtube") && !title) {
    throw new Error("YouTube wymaga tytułu.");
  }
  // TikTok publikuje `post_info.title` — bez niego init API zwraca błąd.
  if (data.platforms.includes("tiktok") && !title && !message) {
    throw new Error("TikTok wymaga tytułu (lub treści, która go zastąpi).");
  }
  // Prywatności ani oznaczeń komercyjnych NIE ustalamy za twórcę — walidacja
  // wymusza, że przyszły z ekranu publikacji.
  let tiktokOptions: unknown = null;
  if (data.platforms.includes("tiktok")) {
    const { parseTiktokPostOptions } = await import("./tiktok-upload");
    tiktokOptions = parseTiktokPostOptions(data.tiktok_post_options);
  }
  if (data.platforms.includes("facebook_post") && !message && !imageUrl && !videoUrl) {
    throw new Error("Post na Facebooku wymaga treści lub mediów.");
  }
  // X wymaga tekstu zawsze — sam materiał bez treści to na X pusty post.
  if (data.platforms.includes("x") && !message && !title) {
    throw new Error("Post na X wymaga treści (lub tytułu, który ją zastąpi).");
  }

  const scheduledAt = data.scheduled_at ?? new Date().toISOString();
  const result: EnqueuePublicationResult = {
    queued: data.platforms.length,
    social: [],
    youtube: [],
  };

  if (data.platforms.includes("youtube")) {
    const { data: row, error } = await supabaseAdmin
      .from("youtube_publish_queue")
      .insert({
        title,
        description: message,
        source_video_url: videoUrl!,
        privacy_status: data.privacy_status ?? "public",
        scheduled_at: scheduledAt,
        created_by: data.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    result.youtube.push({ id: row.id });
  }

  // Meta, TikTok i X dzielą kolejkę social_publish_queue (różni je `platform`).
  const queuePlatforms = data.platforms.filter(
    (p): p is Exclude<StudioPlatform, "youtube"> => p !== "youtube",
  );
  if (queuePlatforms.length) {
    const rows = queuePlatforms.map((platform) => ({
      platform,
      title,
      message,
      video_url: videoUrl,
      // Grafikę niosą tylko platformy, które ją publikują: post FB i X.
      image_url: platform === "facebook_post" || platform === "x" ? imageUrl : null,
      scheduled_at: scheduledAt,
      created_by: data.userId,
      ...(platform === "tiktok" ? { tiktok_post_options: tiktokOptions as never } : {}),
    }));
    const { data: inserted, error } = await supabaseAdmin
      .from("social_publish_queue")
      .insert(rows)
      .select("id, platform");
    if (error) throw new Error(error.message);
    for (const r of inserted ?? []) {
      result.social.push({ id: r.id, platform: r.platform as StudioPlatform });
    }
  }
  return result;
}
