// Automatyczne „Zrobione" dla pozycji wysłanych w digeście — czysta część.
// Część serwerowa: digest.server.ts → autoDetectDone (na początku ticka,
// przed wyborem nowych pozycji, żeby liczniki 7 dni w mailu je widziały).
//
// Co da się wykryć:
//   * youtube_comment — commentThreads.list filmu: komentarz najwyższego
//     poziomu od NASZEGO kanału opublikowany po wysłaniu digestu. Komentarz
//     z prywatnego konta jest nie do odróżnienia → przycisk w mailu.
//   * forum_reply — strona wątku zawiera link do financeyou.pl (także /r/…).
//     Tylko gdy szkic miał link; odpowiedź bez linku → przycisk w mailu.
//   * directory_listing — tylko gdy znany jest adres wizytówki
//     (extra.profile_url); sam adres katalogu nic nie mówi.
// Nie da się wykryć: maili PR i outreach (mailto — wysyłka z prywatnej
// skrzynki) ani komentarzy na Instagramie (API nie pokazuje cudzych
// komentarzy pod cudzymi postami).

import { findOwnLink, type EngagementItem } from "./core";

/** Sprawdzamy pozycje wysłane najwyżej tyle dni temu. */
export const AUTO_DETECT_MAX_AGE_DAYS = 14;
/** commentThreads.list = 1 jednostka quota — najwyżej 30 filmów na przebieg. */
export const AUTO_DETECT_MAX_VIDEOS = 30;
/** Najwyżej tyle stron (wątki, wizytówki) na przebieg. */
export const AUTO_DETECT_MAX_PAGES = 15;

const DAY_MS = 86_400_000;

export type SentItem = Pick<
  EngagementItem,
  "id" | "kind" | "url" | "extra" | "suggested_text" | "title"
> & {
  sent_at: string | null;
};

/** Id filmu z adresu YouTube (watch?v=, youtu.be/, /shorts/, /embed/). */
export function youtubeVideoId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "");
  const valid = (id: string | null | undefined) =>
    id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  if (host === "youtu.be") return valid(u.pathname.split("/")[1]);
  if (host !== "youtube.com" && host !== "music.youtube.com") return null;
  if (u.pathname === "/watch") return valid(u.searchParams.get("v"));
  const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
  return m ? valid(m[2]) : null;
}

/** Strona do sprawdzenia linku: wątek forum albo znana wizytówka w katalogu. */
export function pageToCheck(item: SentItem): string | null {
  const extra = item.extra ?? {};
  if (item.kind === "forum_reply") {
    // Bez linku w szkicu nie ma czego szukać na stronie.
    if (!findOwnLink(item.suggested_text)) return null;
    const page = typeof extra.page_url === "string" ? extra.page_url : item.url;
    return /^https?:\/\//i.test(page) ? page : null;
  }
  if (item.kind === "directory_listing") {
    const profile = typeof extra.profile_url === "string" ? extra.profile_url : "";
    return /^https?:\/\//i.test(profile) ? profile : null;
  }
  return null;
}

export type AutoDetectPlan = {
  youtube: Array<SentItem & { videoId: string }>;
  pages: Array<SentItem & { pageUrl: string }>;
};

/**
 * Które pozycje sprawdzić w tym przebiegu: tylko 'sent' z ostatnich 14 dni,
 * najświeżej wysłane najpierw (największa szansa, że właśnie zostały
 * zrobione), z limitami quota / liczby stron.
 */
export function planAutoDetect(items: SentItem[], now: Date): AutoDetectPlan {
  const minTs = now.getTime() - AUTO_DETECT_MAX_AGE_DAYS * DAY_MS;
  const recent = items
    .filter((i) => {
      const t = i.sent_at ? new Date(i.sent_at).getTime() : NaN;
      return Number.isFinite(t) && t >= minTs && t <= now.getTime();
    })
    .sort((a, b) => new Date(b.sent_at!).getTime() - new Date(a.sent_at!).getTime());
  const youtube: AutoDetectPlan["youtube"] = [];
  const seenVideos = new Set<string>();
  const pages: AutoDetectPlan["pages"] = [];
  for (const it of recent) {
    if (it.kind === "youtube_comment") {
      const videoId = youtubeVideoId(it.url);
      if (!videoId || seenVideos.has(videoId) || youtube.length >= AUTO_DETECT_MAX_VIDEOS) continue;
      seenVideos.add(videoId);
      youtube.push({ ...it, videoId });
      continue;
    }
    const pageUrl = pageToCheck(it);
    if (pageUrl && pages.length < AUTO_DETECT_MAX_PAGES) pages.push({ ...it, pageUrl });
  }
  return { youtube, pages };
}

type CommentThread = {
  snippet?: {
    topLevelComment?: {
      snippet?: { authorChannelId?: { value?: unknown }; publishedAt?: unknown };
    };
  };
};

/**
 * Czy wśród wątków komentarzy filmu jest komentarz najwyższego poziomu
 * od naszego kanału, opublikowany po wysłaniu digestu.
 */
export function hasOwnCommentAfter(threads: unknown[], channelId: string, sentAt: string): boolean {
  const since = new Date(sentAt).getTime();
  if (!channelId || !Number.isFinite(since)) return false;
  return threads.some((t) => {
    const s = (t as CommentThread)?.snippet?.topLevelComment?.snippet;
    if (s?.authorChannelId?.value !== channelId) return false;
    const ts = typeof s.publishedAt === "string" ? new Date(s.publishedAt).getTime() : NaN;
    return Number.isFinite(ts) && ts >= since;
  });
}
