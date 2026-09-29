// Wspólne kawałki narzędzi publikacji (Studio / materiały / kolejki):
// schematy zod platform i ustawień TikToka oraz natychmiastowe przetworzenie
// wpisów, które przed chwilą trafiły do kolejek („publikuj teraz").
import { z } from "zod";
import type { EnqueuePublicationResult } from "@/lib/studio-enqueue.server";
import type { StudioPlatform } from "@/lib/studio-platforms";

export const PLATFORM_ENUM = z.enum([
  "youtube",
  "instagram_reels",
  "facebook_reels",
  "tiktok",
  "facebook_post",
  "x",
]);

export const AUDIENCE_ENUM = z.enum(["klient", "inwestor", "posrednik"]);

export const PRIVACY_ENUM = z.enum(["public", "unlisted", "private"]);

/**
 * Ustawienia posta TikToka wybrane przez użytkownika (wymóg audytu Content
 * Posting API: prywatność z creator_info, bez wartości domyślnej).
 */
export const tiktokPostOptionsSchema = z
  .object({
    privacyLevel: z
      .string()
      .min(1)
      .describe(
        "Poziom prywatności z listy get_tiktok_creator_info (np. PUBLIC_TO_EVERYONE, SELF_ONLY) — wybór użytkownika, nie domyślny.",
      ),
    disableComment: z.boolean().default(false),
    disableDuet: z.boolean().default(false),
    disableStitch: z.boolean().default(false),
    brandOrganic: z.boolean().default(false).describe("„Your brand” — promocja własnej marki."),
    brandedContent: z.boolean().default(false).describe("„Branded content” — płatna współpraca."),
  })
  .optional()
  .describe("Wymagane, gdy platforms zawiera tiktok.");

export type PublishOutcome = {
  id: string;
  platform: StudioPlatform;
  ok: boolean;
  /** Plik wysłany, platforma przetwarza (IG / TikTok / X wideo) — tick domknie. */
  processing: boolean;
  /**
   * Wideo jeszcze się kompresuje do profilu publikacji (video_renditions) —
   * wpis został w kolejce, tick opublikuje go po zakończeniu.
   */
  preparing: boolean;
  external_id: string | null;
  error: string | null;
};

/**
 * Przetwarza od razu wpisy, które właśnie trafiły do kolejek — równolegle,
 * bo uploady wideo trwają. Nieudany wpis zostaje w kolejce z błędem, więc
 * ponowienie i licznik prób działają tak samo jak przy publikacji z ticka.
 */
export async function processQueuedNow(
  result: EnqueuePublicationResult,
): Promise<PublishOutcome[]> {
  const social = result.social.map(async (s): Promise<PublishOutcome> => {
    try {
      if (s.platform === "tiktok") {
        const { processTiktokQueueItem } = await import("@/lib/tiktok.server");
        const r = await processTiktokQueueItem(s.id);
        return {
          id: s.id,
          platform: s.platform,
          ok: r.ok,
          processing: !!r.processing,
          preparing: !!r.preparing,
          external_id: r.publishId ?? null,
          error: r.error ?? null,
        };
      }
      if (s.platform === "x") {
        const { processXQueueItem } = await import("@/lib/x.server");
        const r = await processXQueueItem(s.id);
        return {
          id: s.id,
          platform: s.platform,
          ok: r.ok,
          processing: !!r.processing,
          preparing: !!r.preparing,
          external_id: r.postId ?? null,
          error: r.error ?? null,
        };
      }
      const { processSocialQueueItem } = await import("@/lib/studio-publishing.server");
      const r = await processSocialQueueItem(s.id);
      return {
        id: s.id,
        platform: s.platform,
        ok: r.ok,
        processing: !!r.processing,
        preparing: !!r.preparing,
        external_id: r.externalId ?? null,
        error: r.error ?? null,
      };
    } catch (e) {
      return {
        id: s.id,
        platform: s.platform,
        ok: false,
        processing: false,
        preparing: false,
        external_id: null,
        error: (e as Error).message,
      };
    }
  });
  const youtube = result.youtube.map(async (y): Promise<PublishOutcome> => {
    try {
      const { processQueueItem } = await import("@/lib/youtube-shorts.server");
      const r = await processQueueItem(y.id);
      return {
        id: y.id,
        platform: "youtube",
        ok: r.ok,
        processing: false,
        preparing: !!r.preparing,
        external_id: r.videoId ?? null,
        error: r.error ?? null,
      };
    } catch (e) {
      return {
        id: y.id,
        platform: "youtube",
        ok: false,
        processing: false,
        preparing: false,
        external_id: null,
        error: (e as Error).message,
      };
    }
  });
  return Promise.all([...social, ...youtube]);
}

/** Link do opublikowanego obiektu, gdy platforma daje stabilny adres. */
export function publishedUrl(platform: string, externalId: string | null): string | null {
  if (!externalId) return null;
  if (platform === "youtube") return `https://www.youtube.com/shorts/${externalId}`;
  if (platform === "facebook_post" || platform === "facebook_reels")
    return `https://www.facebook.com/${externalId}`;
  if (platform === "x") return `https://x.com/i/web/status/${externalId}`;
  return null;
}
