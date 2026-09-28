// Platformy Studia publikacji — czysty moduł bez importów, wspólny dla
// klienta (formularze) i serwera (walidacja, kolejka). Etykiety i reguły
// „co można opublikować z jakiego pliku" mają jedno źródło, żeby panel
// materiałów i Studio nie rozjeżdżały się w nazwach ani w ograniczeniach.

export type StudioPlatform =
  | "youtube"
  | "facebook_post"
  | "facebook_reels"
  | "instagram_reels"
  | "tiktok"
  | "x";

/** Kolejność, w jakiej formularze pokazują platformy. */
export const STUDIO_PLATFORMS: readonly StudioPlatform[] = [
  "youtube",
  "instagram_reels",
  "facebook_reels",
  "tiktok",
  "facebook_post",
  "x",
];

export const PLATFORM_LABELS: Record<StudioPlatform, string> = {
  youtube: "YouTube Short",
  facebook_post: "Post na Facebooku",
  facebook_reels: "Facebook Reels",
  instagram_reels: "Instagram Reels",
  tiktok: "TikTok",
  x: "Post na X",
};

/** Platformy, które publikują sam tekst (albo tekst + grafikę) — bez wideo. */
export const TEXT_OR_IMAGE_PLATFORMS: readonly StudioPlatform[] = ["facebook_post", "x"];

export type StudioMediaType = "image" | "video";

/**
 * Które platformy przyjmą dany typ pliku. Grafika idzie tylko tam, gdzie
 * kolejka niesie `image_url` (post FB, X); wideo — wszędzie.
 */
export function platformsForMediaType(mediaType: StudioMediaType): StudioPlatform[] {
  if (mediaType === "image") return [...TEXT_OR_IMAGE_PLATFORMS];
  return [...STUDIO_PLATFORMS];
}

export type PlatformAvailabilityInput = {
  youtubeConnected: boolean;
  facebookConfigured: boolean;
  instagramConfigured: boolean;
  tiktokConnected: boolean;
  xConnected: boolean;
};

/**
 * Które platformy są faktycznie gotowe do publikacji (sekrety Meta,
 * połączone konta YouTube / TikTok / X). Formularz wyszarza resztę zamiast
 * dopuszczać wpis, który na pewno padnie w kolejce.
 */
export function platformAvailability(
  status: PlatformAvailabilityInput | undefined,
): Record<StudioPlatform, boolean> {
  return {
    youtube: !!status?.youtubeConnected,
    instagram_reels: !!status?.instagramConfigured,
    facebook_reels: !!status?.facebookConfigured,
    facebook_post: !!status?.facebookConfigured,
    tiktok: !!status?.tiktokConnected,
    x: !!status?.xConnected,
  };
}
