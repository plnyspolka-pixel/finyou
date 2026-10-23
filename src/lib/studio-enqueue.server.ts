// Wspólne wstawianie do kolejek publikacji — jedno miejsce dla Studia
// publikacji (formularz ręczny) i panelu materiałów marketingowych
// („Publikuj" przy wgranym pliku). Walidacja i reguły per platforma są tu,
// żeby oba wejścia odrzucały dokładnie te same braki.
//
// YouTube trafia do youtube_publish_queue (tick co 10 min), Meta / TikTok / X
// dzielą social_publish_queue (różni je kolumna `platform`).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { StudioPlatform } from "./studio-platforms";
import {
  COMPLIANCE_RULES_VERSION,
  applyRequiredElements,
  checkHardRules,
} from "./autopilot/compliance-rules";
import type { Track } from "./autopilot/types";

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
  /** Wpisy autopilota (brief 5.3): tor, seria, lejek, idempotencja. */
  autopilot?: {
    track: Track;
    series?: string | null;
    keyword?: string | null;
    lead_magnet_id?: string | null;
    studio_job_id?: string | null;
    /** Np. `autopilot:<job>:<platforma>` – drugi wpis z tym kluczem nie powstanie. */
    idempotency_key: string;
  };
  /** false tylko dla materiału nagranego przez człowieka (bez AI). */
  contains_synthetic_media?: boolean;
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
  if (data.platforms.includes("x")) {
    const { isXPublishingEnabled } = await import("./x.server");
    if (!isXPublishingEnabled()) {
      throw new Error(
        "Kanał X jest wyłączony do czasu decyzji o kredytach API (X_PUBLISHING_ENABLED). Wybierz inne platformy.",
      );
    }
  }
  // X wymaga tekstu zawsze — sam materiał bez treści to na X pusty post.
  if (data.platforms.includes("x") && !message && !title) {
    throw new Error("Post na X wymaga treści (lub tytułu, który ją zastąpi).");
  }

  // Bramka compliance – reguły twarde dla KAŻDEJ publikacji (brief 5.7: nie
  // ma ścieżki ominięcia). Autopilot przechodzi wcześniej pełną bramkę
  // (recenzent LLM); tu deterministyczna kontrola końcowa.
  const track = data.autopilot?.track ?? null;
  const blocks = checkHardRules(`${title}\n${message}`, { kind: "description", track }).filter(
    (h) => h.severity === "block",
  );
  if (blocks.length) {
    throw new Error(
      `Treść nie przeszła reguł compliance (${COMPLIANCE_RULES_VERSION}): ` +
        blocks.map((b) => `${b.message}${b.match ? ` [„${b.match}”]` : ""}`).join(" "),
    );
  }

  const autopilotCols = data.autopilot
    ? {
        origin: "autopilot",
        track: data.autopilot.track,
        series: data.autopilot.series ?? null,
        keyword: data.autopilot.keyword ?? null,
        lead_magnet_id: data.autopilot.lead_magnet_id ?? null,
        studio_job_id: data.autopilot.studio_job_id ?? null,
        compliance_rules_version: COMPLIANCE_RULES_VERSION,
        contains_synthetic_media: data.contains_synthetic_media !== false,
      }
    : data.contains_synthetic_media === false
      ? { contains_synthetic_media: false }
      : {};
  // Elementy obowiązkowe w opisie wpisów autopilota (AI, nadawca, ryzyko).
  const finalMessage =
    data.autopilot && message
      ? applyRequiredElements(message, { kind: "description", track: data.autopilot.track })
      : message;
  const keyFor = (platform: string) =>
    data.autopilot ? { idempotency_key: `${data.autopilot.idempotency_key}:${platform}` } : {};

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
        description: finalMessage,
        source_video_url: videoUrl!,
        privacy_status: data.privacy_status ?? "public",
        scheduled_at: scheduledAt,
        created_by: data.userId,
        ...autopilotCols,
        ...keyFor("youtube"),
      } as never)
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
      message: finalMessage,
      video_url: videoUrl,
      // Grafikę niosą tylko platformy, które ją publikują: post FB i X.
      image_url: platform === "facebook_post" || platform === "x" ? imageUrl : null,
      scheduled_at: scheduledAt,
      created_by: data.userId,
      ...(platform === "tiktok" ? { tiktok_post_options: tiktokOptions as never } : {}),
      ...autopilotCols,
      ...keyFor(platform),
    }));
    const { data: inserted, error } = await supabaseAdmin
      .from("social_publish_queue")
      .insert(rows as never)
      .select("id, platform");
    if (error) throw new Error(error.message);
    for (const r of inserted ?? []) {
      result.social.push({ id: r.id, platform: r.platform as StudioPlatform });
    }
  }

  return result;
}
