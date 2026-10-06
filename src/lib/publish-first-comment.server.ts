// Automatyczny pierwszy komentarz z linkiem po publikacji — na życzenie
// z audytu profili: posty zapowiadały „link w komentarzu", a komentarza
// nigdy nie było. Po udanej publikacji (FB post / FB Reels / IG Reels /
// YouTube Short) moduł dodaje pod materiałem komentarz strony/kanału
// z linkiem śledzącym `/r/<kod>` (kampania marketing_campaigns per
// platforma — kliknięcia widać w panelu Marketing → Śledzenie).
//
// Ograniczenie platform: Meta Graph API ani YouTube Data API nie mają
// endpointu „przypnij komentarz" — przypięcie (IG: do 3 komentarzy,
// YouTube Studio: 1) pozostaje ręcznym tapnięciem w aplikacji. Komentarz
// własny strony i tak zwykle ląduje wysoko w sortowaniu „najtrafniejsze".
//
// Błąd komentarza NIGDY nie psuje publikacji — publikacja już się udała,
// komentarz to bonus. Stąd wszystkie ścieżki kończą się w catch z logiem.
// Wyłącznik awaryjny: PUBLISH_FIRST_COMMENT=off.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createTrackingCampaign, slugifyCampaign } from "./marketing-tracking.server";
import type { StudioPlatform } from "./studio-platforms";

const GRAPH = "https://graph.facebook.com/v21.0";
const SITE = "https://financeyou.pl";

type CommentPlatform = Exclude<StudioPlatform, "tiktok" | "x">;

/** utm_source kampanii linku per platforma publikacji. */
const UTM_SOURCE: Record<CommentPlatform, string> = {
  facebook_post: "facebook",
  facebook_reels: "facebook",
  instagram_reels: "instagram",
  youtube: "youtube",
};

function campaignName(platform: CommentPlatform): string {
  return `Auto-komentarz ${UTM_SOURCE[platform]}`;
}

/** Treść komentarza. IG nie linkuje URL-i w komentarzach, ale obiecany
 *  w captionie „link w komentarzu" musi tam być — do skopiowania. */
export function buildFirstComment(platform: CommentPlatform, url: string): string {
  if (platform === "youtube") {
    return `👉 Więcej o pożyczkach pod hipotekę i inwestowaniu: ${url}`;
  }
  return `👉 Szczegóły i bezpłatny kontakt: ${url}`;
}

// Cache per proces — kampania per platforma powstaje raz i jest reużywana.
const linkCache = new Map<string, string>();

/**
 * Krótki link śledzący dla auto-komentarza danej platformy: istniejąca
 * kampania po slugu albo nowa (target financeyou.pl + UTM platformy).
 */
export async function ensureFirstCommentLink(platform: CommentPlatform): Promise<string> {
  const source = UTM_SOURCE[platform];
  const cached = linkCache.get(source);
  if (cached) return cached;

  const slug = slugifyCampaign(campaignName(platform));
  const { data: existing } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("short_code")
    .eq("slug", slug)
    .maybeSingle();
  let shortCode = existing?.short_code;
  if (!shortCode) {
    const row = await createTrackingCampaign(supabaseAdmin, null, {
      name: campaignName(platform),
      target_url: SITE,
      utm_source: source,
      utm_medium: "social",
      utm_campaign: "auto_komentarz",
      notes: "Link w automatycznym pierwszym komentarzu pod publikacjami.",
    });
    shortCode = row.short_code;
  }
  const url = `${SITE}/r/${shortCode}`;
  linkCache.set(source, url);
  return url;
}

async function postMetaComment(objectId: string, message: string): Promise<void> {
  const token = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || "";
  if (!token) throw new Error("Brak tokena Meta do komentarza.");
  const res = await fetch(`${GRAPH}/${objectId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message, access_token: token }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }
}

async function postYoutubeComment(videoId: string, text: string): Promise<void> {
  const { youtubeRequest } = await import("./youtube-api.server");
  await youtubeRequest("/commentThreads", {
    method: "POST",
    query: { part: "snippet" },
    json: {
      snippet: {
        videoId,
        topLevelComment: { snippet: { textOriginal: text } },
      },
    },
  });
}

/**
 * Dodaje pierwszy komentarz z linkiem pod świeżo opublikowanym materiałem.
 * Nigdy nie rzuca — publikacja jest już faktem, nieudany komentarz tylko
 * loguje (do dodania ręcznie). Zwraca true, gdy komentarz poszedł.
 */
export async function postFirstComment(
  platform: StudioPlatform,
  externalId: string,
): Promise<boolean> {
  if (process.env.PUBLISH_FIRST_COMMENT === "off") return false;
  if (platform === "tiktok" || platform === "x") return false;
  try {
    const url = await ensureFirstCommentLink(platform);
    const text = buildFirstComment(platform, url);
    if (platform === "youtube") await postYoutubeComment(externalId, text);
    else await postMetaComment(externalId, text);
    return true;
  } catch (e) {
    console.warn(
      `[first-comment] ${platform}/${externalId}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  }
}
