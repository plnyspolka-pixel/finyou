// Publikacja materiału marketingowego (grafiki / filmu z /admin/materialy)
// przez kolejki Studia publikacji — czysta logika bez importów serwera:
// gdzie ląduje publiczna kopia pliku, co podstawić w formularzu i które wpisy
// kolejek dotyczą danego materiału.
//
// Bucket `marketing-materials` jest prywatny (panel czyta go podpisanymi
// URL-ami na godzinę), a Meta / YouTube / X / TikTok pobierają plik z URL-a
// w chwili publikacji — czasem wiele godzin po zaplanowaniu. Dlatego przed
// dodaniem do kolejki plik kopiujemy do publicznego bucketu `studio-media`
// pod stałą, deterministyczną ścieżką (ten sam materiał → ta sama kopia).
import {
  platformsForMediaType,
  type StudioMediaType,
  type StudioPlatform,
} from "./studio-platforms";

export const MATERIALS_BUCKET = "marketing-materials";
export const PUBLIC_MEDIA_BUCKET = "studio-media";
/** Katalog kopii materiałów w publicznym buckecie. */
export const PUBLIC_COPY_DIR = "marketing-materials";

export type PublishableMaterial = {
  id: string;
  title: string;
  description: string | null;
  ai_description?: string | null;
  media_type: StudioMediaType;
  storage_path: string;
};

/** Rozszerzenie pliku ze ścieżki w Storage (małe litery), domyślnie `bin`. */
export function storageExtension(storagePath: string): string {
  const name = storagePath.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin";
}

/** Stała ścieżka publicznej kopii: `marketing-materials/<id>.<ext>`. */
export function publicCopyPath(m: Pick<PublishableMaterial, "id" | "storage_path">): string {
  return `${PUBLIC_COPY_DIR}/${m.id}.${storageExtension(m.storage_path)}`;
}

/**
 * Domyślny tytuł i treść formularza publikacji: tytuł materiału oraz opis
 * wpisany ręcznie, a gdy go nie ma — opis wygenerowany przez AI.
 */
export function defaultPublishText(
  m: Pick<PublishableMaterial, "title" | "description" | "ai_description">,
): { title: string; message: string } {
  return {
    title: (m.title ?? "").trim(),
    message: (m.description ?? "").trim() || (m.ai_description ?? "").trim(),
  };
}

/**
 * Sprawdza, czy zaznaczone platformy pasują do typu pliku. Zwraca komunikat
 * blokady albo null. Ta sama reguła po stronie serwera i w formularzu.
 */
export function materialPlatformsError(
  mediaType: StudioMediaType,
  platforms: readonly StudioPlatform[],
): string | null {
  if (!platforms.length) return "Wybierz co najmniej jedną platformę.";
  const allowed = platformsForMediaType(mediaType);
  const bad = platforms.filter((p) => !allowed.includes(p));
  if (!bad.length) return null;
  return mediaType === "image"
    ? "Grafikę można opublikować jako post na Facebooku albo na X — Reels, Shorts i TikTok wymagają wideo."
    : `Platforma niedostępna dla tego pliku: ${bad.join(", ")}.`;
}

/** Wpisy kolejek dopasowane do jednego materiału (po URL publicznej kopii). */
export type MaterialPublication = {
  id: string;
  platform: StudioPlatform;
  status: string;
  scheduled_at: string;
  published_at: string | null;
  last_error: string | null;
  url: string | null;
};

type SocialQueueLike = {
  id: string;
  platform: string;
  video_url: string | null;
  image_url: string | null;
  status: string;
  scheduled_at: string;
  published_at: string | null;
  last_error: string | null;
  external_post_id: string | null;
};

type YoutubeQueueLike = {
  id: string;
  source_video_url: string;
  status: string;
  scheduled_at: string;
  published_at: string | null;
  last_error: string | null;
  youtube_video_id: string | null;
};

export function publicationUrl(platform: string, externalId: string | null): string | null {
  if (!externalId) return null;
  if (platform === "facebook_post" || platform === "facebook_reels") {
    return `https://www.facebook.com/${externalId}`;
  }
  if (platform === "x") return `https://x.com/i/web/status/${externalId}`;
  if (platform === "youtube") return `https://www.youtube.com/shorts/${externalId}`;
  return null;
}

/**
 * Które wpisy kolejek (Meta / TikTok / X oraz YouTube) publikują dany
 * materiał — po URL jego publicznej kopii. Najnowsze wpisy pierwsze.
 */
export function publicationsForMaterial(
  publicUrl: string,
  social: readonly SocialQueueLike[],
  youtube: readonly YoutubeQueueLike[],
): MaterialPublication[] {
  const out: MaterialPublication[] = [];
  for (const s of social) {
    if (s.video_url !== publicUrl && s.image_url !== publicUrl) continue;
    out.push({
      id: s.id,
      platform: s.platform as StudioPlatform,
      status: s.status,
      scheduled_at: s.scheduled_at,
      published_at: s.published_at,
      last_error: s.last_error,
      url: publicationUrl(s.platform, s.external_post_id),
    });
  }
  for (const y of youtube) {
    if (y.source_video_url !== publicUrl) continue;
    out.push({
      id: y.id,
      platform: "youtube",
      status: y.status,
      scheduled_at: y.scheduled_at,
      published_at: y.published_at,
      last_error: y.last_error,
      url: publicationUrl("youtube", y.youtube_video_id),
    });
  }
  return out.sort((a, b) =>
    a.scheduled_at < b.scheduled_at ? 1 : a.scheduled_at > b.scheduled_at ? -1 : 0,
  );
}
