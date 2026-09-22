// Kopia filmu z landingu inwestora w naszym Storage: sprawdzenie, czy plik już
// jest (HEAD na publiczny adres, z cache), oraz jednorazowa synchronizacja
// HeyGen → Storage pod stałą ścieżką (nadpisuje poprzednią kopię).
import { LANDING_INVESTOR_VIDEO, type LandingVideoInfo } from "./landing-video";

export type LandingVideoSyncResult = LandingVideoInfo & {
  /** Który plik HeyGen skopiowano: z wypalonymi napisami czy czysty master. */
  variant: "captioned" | "clean";
  bytes: number;
  posterBytes: number | null;
  title: string | null;
};

function publicUrl(path: string): string | null {
  const base = process.env.SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${LANDING_INVESTOR_VIDEO.bucket}/${path}`;
}

async function headOk(url: string, timeoutMs = 2500): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Cache na instancję serwera: trafienie na godzinę, brak pliku na minutę —
// po synchronizacji landing podnosi film najpóźniej po minucie.
const HIT_TTL_MS = 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 1000;
let cache: { until: number; value: LandingVideoInfo | null } | null = null;

export function invalidateLandingVideoCache(): void {
  cache = null;
}

/** Adresy kopii w Storage, gdy film już tam jest; inaczej null (landing pokaże odtwarzacz HeyGen). */
export async function getLandingInvestorVideoInfo(): Promise<LandingVideoInfo | null> {
  if (cache && cache.until > Date.now()) return cache.value;
  const videoUrl = publicUrl(LANDING_INVESTOR_VIDEO.videoPath);
  const posterUrl = publicUrl(LANDING_INVESTOR_VIDEO.posterPath);
  let value: LandingVideoInfo | null = null;
  if (videoUrl) {
    const [hasVideo, hasPoster] = await Promise.all([
      headOk(videoUrl),
      posterUrl ? headOk(posterUrl) : Promise.resolve(false),
    ]);
    if (hasVideo) value = { videoUrl, posterUrl: hasPoster ? posterUrl : null };
  }
  cache = { until: Date.now() + (value ? HIT_TTL_MS : MISS_TTL_MS), value };
  return value;
}

/**
 * Kopiuje gotowy film z HeyGen do Storage pod stałą ścieżką (upsert) razem z
 * miniaturą jako plakatem. Wymaga HEYGEN_API_KEY i klucza serwisowego Supabase
 * — uruchamiane wyłącznie przez administratora/operatora.
 */
export async function syncLandingInvestorVideo(
  opts: { variant?: "captioned" | "clean" } = {},
): Promise<LandingVideoSyncResult> {
  const hg = await import("./heygen-api.server");
  const v = await hg.getVideo(LANDING_INVESTOR_VIDEO.heygenVideoId);
  if (v.status !== "completed") {
    throw new Error(
      `Film HeyGen nie jest gotowy (status: ${v.status}${v.error ? `, ${v.error}` : ""}).`,
    );
  }
  const wantCaptioned = (opts.variant ?? "captioned") === "captioned";
  const url = (wantCaptioned ? v.captioned_video_url : null) ?? v.video_url;
  if (!url) throw new Error("HeyGen nie zwrócił adresu pliku wideo.");

  const { fetchBytes, uploadEnsuringBucket } = await import("./media-storage.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const file = await fetchBytes(url, 250 * 1024 * 1024);
  const videoType = file.contentType.split(";")[0].trim().toLowerCase();
  await uploadEnsuringBucket(
    LANDING_INVESTOR_VIDEO.bucket,
    LANDING_INVESTOR_VIDEO.videoPath,
    new Uint8Array(file.bytes),
    videoType.startsWith("video/") ? videoType : "video/mp4",
    { upsert: true },
  );

  let posterBytes: number | null = null;
  if (v.thumbnail_url) {
    try {
      const thumb = await fetchBytes(v.thumbnail_url, 10 * 1024 * 1024);
      const imageType = thumb.contentType.split(";")[0].trim().toLowerCase();
      await uploadEnsuringBucket(
        LANDING_INVESTOR_VIDEO.bucket,
        LANDING_INVESTOR_VIDEO.posterPath,
        new Uint8Array(thumb.bytes),
        imageType.startsWith("image/") ? imageType : "image/jpeg",
        { upsert: true },
      );
      posterBytes = thumb.bytes.byteLength;
    } catch (e) {
      // Plakat jest opcjonalny — bez niego <video> pokaże pierwszą klatkę.
      console.warn("[landing-video] plakat nie został skopiowany:", e);
    }
  }

  invalidateLandingVideoCache();
  const pub = (path: string) =>
    supabaseAdmin.storage.from(LANDING_INVESTOR_VIDEO.bucket).getPublicUrl(path).data.publicUrl;
  return {
    videoUrl: pub(LANDING_INVESTOR_VIDEO.videoPath),
    posterUrl: posterBytes != null ? pub(LANDING_INVESTOR_VIDEO.posterPath) : null,
    variant: url === v.captioned_video_url ? "captioned" : "clean",
    bytes: file.bytes.byteLength,
    posterBytes,
    title: v.title,
  };
}
