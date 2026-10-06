// Źródła porannego digestu zaangażowania. Każde źródło jest osobną
// funkcją zwracającą SourceStatus — wyjątek jednego (brak tokena, limit,
// brak tabeli) łapie digest.server.ts i nie zatrzymuje pozostałych.
//
//   * YouTube: search.list (2 zapytania dziennie z rotacji, 100 jednostek
//     quota każde) + videos.list (1 jednostka) → szkic merytorycznego
//     komentarza (bez linku i marki).
//   * Instagram: ig_hashtag_search + recent_media (≤ 3 hashtagi dziennie;
//     limit Instagrama: 30 unikalnych na 7 dni). Brak uprawnienia = sekcja
//     „niedostępna" z podpowiedzią w mailu.
//   * Fora: Google Programmable Search (4 rotowane zapytania dziennie,
//     GOOGLE_CSE_KEY + GOOGLE_CSE_CX; bez nich „niedostępne") oraz feedy
//     RSS/Atom z tabeli engagement_feeds (fora, blogi, stare Google Alerts;
//     w poniedziałki autodiscovery dopisuje nowe feedy) → wspólny tor:
//     szkic odpowiedzi eksperta, link tylko śledzący (kampania „forum").
//   * PR: nowe okazje z pr_opportunities (szkic z pr/draft.server.ts).
//   * Outreach: 1 cel dziennie z ai_outreach_targets (wiadomość z
//     generatora outreach), cel → 'queued'.
//   * Katalogi firm: 1 dziennie ze stałej listy, aż do wyczerpania.
//
// Każde źródło tworzy najwyżej tyle nowych pozycji, ile brakuje do limitu
// rodzaju w mailu (DIGEST_LIMITS minus zaległe 'new') — bez marnowania
// quota i zapytań do AI. Szkice odrzucone przez model albo twarde reguły
// zapisujemy jako 'skipped' (z powodem w extra), żeby nie wracały co dzień.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { parseRssItems } from "../pr/core";
import {
  FEEDS_PER_PAGE,
  FEED_DISCOVERY_PAGES,
  extractFeedLinks,
  isFeedDiscoveryDay,
} from "./feed-discovery";
import {
  WEB_SEARCH_QUERIES,
  WEB_SEARCH_QUERIES_PER_DAY,
  WEB_SEARCH_UNAVAILABLE_HINT,
  buildWebSearchUrl,
  parseWebSearchItems,
  webSearchConfig,
  webSearchErrorMessage,
} from "./web-search";
import {
  DIGEST_LIMITS,
  DIRECTORIES,
  FORUM_DEFAULT_KEYWORDS,
  INSTAGRAM_HASHTAGS,
  INSTAGRAM_HASHTAGS_PER_DAY,
  INSTAGRAM_MIN_LIKES,
  INSTAGRAM_UNAVAILABLE_HINT,
  OUTREACH_ANGLE,
  OUTREACH_GOAL,
  YOUTUBE_KEYWORDS,
  YOUTUBE_QUERIES_PER_DAY,
  buildDirectoryItem,
  buildForumAnswerPrompt,
  buildInstagramCommentPrompt,
  buildOutreachItem,
  buildPrItem,
  buildYoutubeCommentPrompt,
  dayIndex,
  dedupeKeyFor,
  feedKeywords,
  filterYoutubeVideos,
  finalizeDraft,
  hostOf,
  isGoogleAlertsFeed,
  isMetaPermissionError,
  isRecentThread,
  matchesKeywords,
  nextDirectory,
  rotatingPick,
  type EngagementExtra,
  type EngagementFeed,
  type EngagementKind,
  type ForumThread,
  type InstagramMediaInfo,
  type NewEngagementItem,
  type PrOpportunityRow,
  type YoutubeVideoInfo,
} from "./core";
import type { SourceStatus } from "./email";

// Tabele pr_* nie są w wygenerowanych typach Supabase — klient bez generyka.
const db = supabaseAdmin as unknown as SupabaseClient;

const DAY_MS = 86_400_000;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type CollectorContext = {
  now: Date;
  /** Zaległe, jeszcze aktualne pozycje 'new' per rodzaj. */
  backlog: Partial<Record<EngagementKind, number>>;
  /** Po tym czasie (ms epoch) nie zaczynamy kolejnych zapytań do AI. */
  deadline: number;
};

/** Ile nowych pozycji danego rodzaju warto dziś przygotować. */
function needFor(ctx: CollectorContext, kind: EngagementKind): number {
  return Math.max(0, DIGEST_LIMITS[kind] - (ctx.backlog[kind] ?? 0));
}

const timeUp = (ctx: CollectorContext) => Date.now() > ctx.deadline;

const BACKLOG_NOTE = "zaległe pozycje z poprzednich dni wystarczą";

/** Które z kluczy już są w rejestrze (dowolny status). */
async function existingKeys(keys: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("engagement_opportunities")
      .select("dedupe_key")
      .in("dedupe_key", keys.slice(i, i + 200));
    if (error) throw new Error(`engagement_opportunities: ${error.message}`);
    for (const r of data ?? []) out.add(r.dedupe_key);
  }
  return out;
}

/** Zapis pozycji; duplikat klucza (równoległy przebieg) jest pomijany. */
async function insertItems(items: NewEngagementItem[]): Promise<number> {
  if (!items.length) return 0;
  const { data, error } = await supabaseAdmin
    .from("engagement_opportunities")
    .upsert(
      items.map((i) => ({ ...i, extra: i.extra as Json })),
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`engagement_opportunities: ${error.message}`);
  return data?.length ?? 0;
}

/** Odrzucona okazja — zapamiętana jako 'skipped', żeby nie wracała co dzień. */
async function rememberRejected(
  kind: EngagementKind,
  ref: { dedupe_key: string; url: string; title: string | null; source: string | null },
  reason: string,
): Promise<void> {
  const { error } = await supabaseAdmin.from("engagement_opportunities").upsert(
    {
      kind,
      dedupe_key: ref.dedupe_key,
      url: ref.url,
      title: ref.title,
      source: ref.source,
      status: "skipped",
      extra: { auto_skip_reason: reason.slice(0, 300) },
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (error) console.warn(`[engagement] zapis odrzuconej okazji: ${error.message}`);
}

type DraftResult = { ok: true; text: string } | { ok: false; reason: string; aiDown?: boolean };

/**
 * Szkic modelu po twardych regułach (vetDraft). Model niedostępny (limit,
 * awaria, czas) = `aiDown` — pętla źródła kończy się, a okazja nie jest
 * zapamiętywana jako odrzucona (wróci jutro).
 */
async function aiDraft(
  kind: EngagementKind,
  prompt: { system: string; user: string },
): Promise<DraftResult> {
  const { lovableAiJson } = await import("../lovable-ai.server");
  let raw: unknown;
  try {
    raw = await lovableAiJson({ ...prompt, temperature: 0.5, timeoutMs: 30_000 });
  } catch (e) {
    console.warn(`[engagement] AI: ${errMsg(e)}`);
    return { ok: false, reason: errMsg(e), aiDown: true };
  }
  return finalizeDraft(kind, raw);
}

// ── YouTube ─────────────────────────────────────────────────────────────────

type YtSearchItem = {
  id?: { videoId?: string };
  snippet?: { liveBroadcastContent?: string };
};
type YtVideo = {
  id?: string;
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    title?: string;
    description?: string;
    liveBroadcastContent?: string;
  };
  statistics?: { viewCount?: string; commentCount?: string };
  status?: { madeForKids?: boolean };
};

export async function collectYoutube(ctx: CollectorContext): Promise<SourceStatus> {
  const need = needFor(ctx, "youtube_comment");
  if (!need) return { key: "youtube", state: "skipped", added: 0, note: BACKLOG_NOTE };
  const yt = await import("../youtube-api.server");
  const channel = await yt.getMyChannel();
  const ownChannelId = channel?.id ? String(channel.id) : null;

  const queries = rotatingPick(YOUTUBE_KEYWORDS, YOUTUBE_QUERIES_PER_DAY, dayIndex(ctx.now));
  const publishedAfter = new Date(ctx.now.getTime() - 7 * DAY_MS).toISOString();
  const ids: string[] = [];
  for (const q of queries) {
    const json = await yt.youtubeRequest("/search", {
      query: {
        part: "snippet",
        type: "video",
        q,
        regionCode: "PL",
        relevanceLanguage: "pl",
        publishedAfter,
        order: "viewCount",
        maxResults: 15,
        safeSearch: "moderate",
      },
    });
    for (const it of (json?.items ?? []) as YtSearchItem[]) {
      const id = it?.id?.videoId;
      if (id && (it?.snippet?.liveBroadcastContent ?? "none") === "none") ids.push(id);
    }
  }
  const unique = [...new Set(ids)];
  const known = await existingKeys(unique.map((id) => dedupeKeyFor("youtube_comment", id)));
  const fresh = unique.filter((id) => !known.has(dedupeKeyFor("youtube_comment", id)));
  if (!fresh.length) return { key: "youtube", state: "ok", added: 0, note: queries.join(", ") };

  const videos: YoutubeVideoInfo[] = ((await yt.listVideos(fresh.slice(0, 50))) as YtVideo[]).map(
    (v) => ({
      id: String(v?.id ?? ""),
      channelId: String(v?.snippet?.channelId ?? ""),
      channelTitle: String(v?.snippet?.channelTitle ?? ""),
      title: String(v?.snippet?.title ?? ""),
      description: String(v?.snippet?.description ?? ""),
      views: v?.statistics?.viewCount != null ? Number(v.statistics.viewCount) : null,
      commentsEnabled: v?.statistics?.commentCount != null,
      madeForKids: v?.status?.madeForKids === true,
    }),
  );
  const candidates = filterYoutubeVideos(videos, { ownChannelId, known });

  const items: NewEngagementItem[] = [];
  let attempts = 0;
  for (const v of candidates) {
    if (items.length >= need || attempts >= need * 3 || timeUp(ctx)) break;
    attempts += 1;
    const url = `https://www.youtube.com/watch?v=${v.id}`;
    const key = dedupeKeyFor("youtube_comment", v.id);
    const draft = await aiDraft("youtube_comment", buildYoutubeCommentPrompt(v));
    if (!draft.ok) {
      if (draft.aiDown) break;
      await rememberRejected(
        "youtube_comment",
        { dedupe_key: key, url, title: v.title, source: v.channelTitle },
        draft.reason,
      );
      continue;
    }
    items.push({
      kind: "youtube_comment",
      source: v.channelTitle || "YouTube",
      url,
      title: v.title,
      snippet: v.description.replace(/\s+/g, " ").trim().slice(0, 500) || null,
      suggested_text: draft.text,
      extra: { page_url: url, views: v.views, queries },
      dedupe_key: key,
    });
  }
  return { key: "youtube", state: "ok", added: await insertItems(items) };
}

// ── Instagram ───────────────────────────────────────────────────────────────

type IgHashtagMedia = {
  id?: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
};

export async function collectInstagram(ctx: CollectorContext): Promise<SourceStatus> {
  const need = needFor(ctx, "instagram_comment");
  if (!need) return { key: "instagram", state: "skipped", added: 0, note: BACKLOG_NOTE };
  const m = await import("../meta-api.server");
  let igUserId: string;
  try {
    igUserId = m.requireIgUserId();
  } catch (e) {
    return { key: "instagram", state: "unavailable", added: 0, note: errMsg(e) };
  }
  const own = new Set<string>();
  try {
    for (const md of await m.listIgMedia({ limit: 25 })) own.add(String(md?.id ?? ""));
  } catch {
    // Lista własnych mediów to tylko filtr — bez niej idziemy dalej.
  }

  const tags = rotatingPick(INSTAGRAM_HASHTAGS, INSTAGRAM_HASHTAGS_PER_DAY, dayIndex(ctx.now));
  const found: InstagramMediaInfo[] = [];
  const errors: string[] = [];
  for (const tag of tags) {
    try {
      const search = await m.graphRequest("ig_hashtag_search", {
        query: { user_id: igUserId, q: tag },
        token: "ig",
      });
      const hashtagId = search?.data?.[0]?.id;
      if (!hashtagId) continue;
      const media = await m.graphRequest(`${hashtagId}/recent_media`, {
        query: {
          user_id: igUserId,
          fields: "id,caption,permalink,timestamp,like_count,comments_count",
          limit: 30,
        },
        token: "ig",
      });
      for (const md of (media?.data ?? []) as IgHashtagMedia[]) {
        if (!md?.id || !md.permalink || own.has(md.id)) continue;
        const caption = String(md.caption ?? "");
        // Instagram ukrywa czasem liczbę polubień — brak danych przepuszczamy.
        if (
          caption.trim().length < 40 ||
          (md.like_count ?? INSTAGRAM_MIN_LIKES) < INSTAGRAM_MIN_LIKES
        ) {
          continue;
        }
        found.push({
          id: md.id,
          caption,
          permalink: md.permalink,
          hashtag: tag,
          likes: md.like_count ?? null,
          comments: md.comments_count ?? null,
          timestamp: md.timestamp ?? null,
        });
      }
    } catch (e) {
      const msg = errMsg(e);
      // Brak funkcji Public Content Access / uprawnień — cała sekcja niedostępna.
      if (isMetaPermissionError(msg)) {
        return {
          key: "instagram",
          state: "unavailable",
          added: 0,
          note: INSTAGRAM_UNAVAILABLE_HINT,
        };
      }
      errors.push(`#${tag}: ${msg.slice(0, 120)}`);
    }
  }
  if (!found.length && errors.length) throw new Error(errors.join("; "));

  const uniq = [...new Map(found.map((f) => [f.id, f])).values()];
  const known = await existingKeys(uniq.map((f) => dedupeKeyFor("instagram_comment", f.id)));
  const candidates = uniq
    .filter((f) => !known.has(dedupeKeyFor("instagram_comment", f.id)))
    .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));

  const items: NewEngagementItem[] = [];
  let attempts = 0;
  for (const f of candidates) {
    if (items.length >= need || attempts >= need * 3 || timeUp(ctx)) break;
    attempts += 1;
    const key = dedupeKeyFor("instagram_comment", f.id);
    const draft = await aiDraft("instagram_comment", buildInstagramCommentPrompt(f));
    if (!draft.ok) {
      if (draft.aiDown) break;
      await rememberRejected(
        "instagram_comment",
        { dedupe_key: key, url: f.permalink, title: `#${f.hashtag}`, source: "Instagram" },
        draft.reason,
      );
      continue;
    }
    items.push({
      kind: "instagram_comment",
      source: `Instagram #${f.hashtag}`,
      url: f.permalink,
      title: `Post z #${f.hashtag}`,
      snippet: f.caption.replace(/\s+/g, " ").trim().slice(0, 500),
      suggested_text: draft.text,
      extra: { page_url: f.permalink, likes: f.likes, hashtag: f.hashtag },
      dedupe_key: key,
    });
  }
  return {
    key: "instagram",
    state: "ok",
    added: await insertItems(items),
    ...(errors.length ? { note: errors.join("; ") } : {}),
  };
}

// ── Fora (RSS / Atom i wyszukiwarka) ────────────────────────────────────────

const MAX_FORUM_CANDIDATES = 40;

type ForumCandidate = ForumThread & { publishedAt: string | null; extra: EngagementExtra };

/**
 * Wspólny tor wątków z RSS i z wyszukiwarki: deduplikacja z rejestrem,
 * szkic AI + twarde reguły, zapis. Zapisane pozycje powiększają zaległości
 * w `ctx`, żeby kolejne źródło forów dorabiało już tylko brakujące.
 */
async function draftForumAnswers(
  ctx: CollectorContext,
  threads: Map<string, ForumCandidate>,
  need: number,
): Promise<number> {
  if (!threads.size || need <= 0) return 0;
  const known = await existingKeys([...threads.keys()]);
  const candidates = [...threads.entries()]
    .filter(([key]) => !known.has(key))
    .sort(
      ([, a], [, b]) =>
        new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime(),
    )
    .slice(0, MAX_FORUM_CANDIDATES);
  if (!candidates.length) return 0;

  const { ensureTrackingLink } = await import("../publish-first-comment.server");
  const link = await ensureTrackingLink({
    name: "Forum — odpowiedzi eksperckie",
    utmSource: "forum",
    utmMedium: "referral",
    utmCampaign: "forum",
    notes: "Link w odpowiedziach na forach z porannego digestu zaangażowania (wklejane ręcznie).",
  });

  const items: NewEngagementItem[] = [];
  let attempts = 0;
  for (const [key, t] of candidates) {
    if (items.length >= need || attempts >= need * 3 || timeUp(ctx)) break;
    attempts += 1;
    const draft = await aiDraft("forum_reply", buildForumAnswerPrompt(t, link));
    if (!draft.ok) {
      if (draft.aiDown) break;
      await rememberRejected(
        "forum_reply",
        { dedupe_key: key, url: t.url, title: t.title, source: t.source },
        draft.reason,
      );
      continue;
    }
    items.push({
      kind: "forum_reply",
      source: t.source,
      url: t.url,
      title: t.title,
      snippet: t.snippet || null,
      suggested_text: draft.text,
      extra: { page_url: t.url, ...t.extra },
      dedupe_key: key,
    });
  }
  const added = await insertItems(items);
  ctx.backlog.forum_reply = (ctx.backlog.forum_reply ?? 0) + added;
  return added;
}

export async function collectForums(ctx: CollectorContext): Promise<SourceStatus> {
  const need = needFor(ctx, "forum_reply");
  if (!need) return { key: "forum", state: "skipped", added: 0, note: BACKLOG_NOTE };
  const { data: feedRows, error } = await supabaseAdmin
    .from("engagement_feeds")
    .select("id, url, label, keywords")
    .eq("active", true)
    .limit(50);
  if (error) throw new Error(`engagement_feeds: ${error.message}`);
  const feeds = (feedRows ?? []) as EngagementFeed[];
  if (!feeds.length) {
    return {
      key: "forum",
      state: "skipped",
      added: 0,
      note: "brak feedów — dodaj adresy RSS w tabeli engagement_feeds (w poniedziałki digest sam szuka feedów forów z listy FEED_DISCOVERY_PAGES)",
    };
  }

  const threads = new Map<string, ForumCandidate>();
  const errors: string[] = [];
  for (const feed of feeds) {
    let lastError: string | null = null;
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "FinanceYou-Engagement/1.0 (+https://financeyou.pl)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fallback = feed.label || hostOf(feed.url) || "RSS";
      const keywords = feedKeywords(feed);
      const alerts = isGoogleAlertsFeed(feed.url);
      for (const item of parseRssItems(await res.text(), fallback).slice(0, 50)) {
        if (!matchesKeywords(item, keywords)) continue;
        if (!isRecentThread(item.publishedAt, ctx.now)) continue;
        const key = dedupeKeyFor("forum_reply", item.url);
        if (threads.has(key)) continue;
        threads.set(key, {
          url: item.url,
          title: item.title,
          snippet: item.snippet,
          // Google Alerts nie podaje źródła — nazwą jest host wątku.
          source: alerts ? hostOf(item.url) || fallback : item.source,
          publishedAt: item.publishedAt,
          extra: { feed_id: feed.id },
        });
      }
    } catch (e) {
      lastError = errMsg(e).slice(0, 500);
      errors.push(`${feed.label || hostOf(feed.url)}: ${lastError}`);
    }
    await supabaseAdmin
      .from("engagement_feeds")
      .update({ last_fetched_at: ctx.now.toISOString(), last_error: lastError })
      .eq("id", feed.id);
  }
  if (!threads.size && errors.length === feeds.length) throw new Error(errors.join("; "));

  return {
    key: "forum",
    state: "ok",
    added: await draftForumAnswers(ctx, threads, need),
    ...(errors.length ? { note: errors.join("; ") } : {}),
  };
}

/**
 * Wątki z Google Programmable Search (zamiast Google Alerts): 4 rotowane
 * zapytania dziennie (słowo kluczowe × serwis), wyniki z 7 dni. Bez
 * GOOGLE_CSE_KEY / GOOGLE_CSE_CX — „niedostępne" z podpowiedzią w mailu.
 */
export async function collectWebSearch(ctx: CollectorContext): Promise<SourceStatus> {
  const cfg = webSearchConfig(process.env);
  if (!cfg) {
    return { key: "websearch", state: "unavailable", added: 0, note: WEB_SEARCH_UNAVAILABLE_HINT };
  }
  const need = needFor(ctx, "forum_reply");
  if (!need) return { key: "websearch", state: "skipped", added: 0, note: BACKLOG_NOTE };

  const queries = rotatingPick(WEB_SEARCH_QUERIES, WEB_SEARCH_QUERIES_PER_DAY, dayIndex(ctx.now));
  const threads = new Map<string, ForumCandidate>();
  const errors: string[] = [];
  for (const q of queries) {
    try {
      const res = await fetch(buildWebSearchUrl(cfg, q), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        errors.push(webSearchErrorMessage(res.status, json));
        // Limit dzienny / zły klucz — kolejne zapytania skończą się tak samo.
        if (res.status === 429 || res.status === 403 || res.status === 400) break;
        continue;
      }
      for (const hit of parseWebSearchItems(json)) {
        if (!isRecentThread(hit.publishedAt, ctx.now)) continue;
        const key = dedupeKeyFor("forum_reply", hit.url);
        if (threads.has(key)) continue;
        threads.set(key, {
          url: hit.url,
          title: hit.title,
          snippet: hit.snippet,
          source: hit.source,
          publishedAt: hit.publishedAt,
          extra: { search_query: q },
        });
      }
    } catch (e) {
      // Bez adresu zapytania w komunikacie — zawiera klucz API.
      errors.push(
        `„${q}": ${errMsg(e)
          .replace(/key=[^&\s]+/g, "key=…")
          .slice(0, 160)}`,
      );
    }
  }
  if (!threads.size && errors.length) throw new Error(errors.join("; "));

  return {
    key: "websearch",
    state: "ok",
    added: await draftForumAnswers(ctx, threads, need),
    note: [`zapytania: ${queries.join(" | ")}`, ...errors].join("; "),
  };
}

/**
 * Autodiscovery feedów: w poniedziałki pobiera strony z FEED_DISCOVERY_PAGES,
 * szuka <link rel="alternate" type="application/rss+xml|atom+xml"> i dopisuje
 * nowe feedy do engagement_feeds (aktywne, domyślne słowa kluczowe).
 * Istniejących wierszy nie rusza (wyłączony ręcznie feed zostaje wyłączony).
 * Błąd sieci pojedynczej strony jest pomijany.
 */
export async function discoverForumFeeds(
  now: Date,
  opts: { force?: boolean } = {},
): Promise<Record<string, unknown>> {
  if (!opts.force && !isFeedDiscoveryDay(now)) return { ran: false };
  const { fetchPage, mapWithLimit } = await import("../page-fetch.server");
  const failed: string[] = [];
  const found = await mapWithLimit(FEED_DISCOVERY_PAGES, 4, async (page) => {
    const r = await fetchPage(page, { timeoutMs: 8_000 });
    if (r.kind !== "ok") {
      failed.push(
        `${hostOf(page)}: ${r.kind === "network_error" ? r.message.slice(0, 80) : r.kind === "http_error" ? `HTTP ${r.status}` : "nie HTML"}`,
      );
      return [];
    }
    return extractFeedLinks(r.html, r.url)
      .slice(0, FEEDS_PER_PAGE)
      .map((f) => ({ ...f, page }));
  });
  const feeds = [...new Map(found.flat().map((f) => [f.url, f])).values()];
  if (!feeds.length) return { ran: true, pages: FEED_DISCOVERY_PAGES.length, added: 0, failed };

  const { data, error } = await supabaseAdmin
    .from("engagement_feeds")
    .upsert(
      feeds.map((f) => ({
        url: f.url,
        label: `auto: ${(f.title ?? hostOf(f.page)).slice(0, 80)}`,
        keywords: [...FORUM_DEFAULT_KEYWORDS],
        active: true,
      })),
      { onConflict: "url", ignoreDuplicates: true },
    )
    .select("url");
  if (error) return { ran: true, error: `engagement_feeds: ${error.message}`, failed };
  return {
    ran: true,
    pages: FEED_DISCOVERY_PAGES.length,
    found: feeds.length,
    added: (data ?? []).map((r) => r.url),
    failed,
  };
}

// ── Digital PR ──────────────────────────────────────────────────────────────

export async function collectPr(ctx: CollectorContext): Promise<SourceStatus> {
  const need = needFor(ctx, "pr_pitch");
  if (!need) return { key: "pr", state: "skipped", added: 0, note: BACKLOG_NOTE };
  const since = new Date(ctx.now.getTime() - 14 * DAY_MS).toISOString();
  const { data, error } = await db
    .from("pr_opportunities")
    .select("id, source, url, topic, snippet, draft_subject, draft_body, recipient_email")
    .in("status", ["new", "drafted", "approved"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`pr_opportunities: ${error.message}`);
  const rows = (data ?? []) as PrOpportunityRow[];
  const known = await existingKeys(rows.map((r) => dedupeKeyFor("pr_pitch", r.id)));

  const items: NewEngagementItem[] = [];
  let attempts = 0;
  for (const row of rows) {
    if (items.length >= need || attempts >= need * 2 || timeUp(ctx)) break;
    if (known.has(dedupeKeyFor("pr_pitch", row.id))) continue;
    let opp = row;
    if (!opp.draft_subject || !opp.draft_body) {
      attempts += 1;
      const { generatePrDraft } = await import("../pr/draft.server");
      const draft = await generatePrDraft(row.id);
      if (!draft.ok || !draft.subject || !draft.body) {
        console.warn(`[engagement] PR draft ${row.id}: ${draft.error ?? "brak treści"}`);
        continue;
      }
      opp = { ...row, draft_subject: draft.subject, draft_body: draft.body };
    }
    const item = buildPrItem(opp);
    if (item) items.push(item);
  }
  return { key: "pr", state: "ok", added: await insertItems(items) };
}

// ── Outreach ────────────────────────────────────────────────────────────────

export async function collectOutreach(ctx: CollectorContext): Promise<SourceStatus> {
  const need = needFor(ctx, "outreach_pitch");
  if (!need) return { key: "outreach", state: "skipped", added: 0, note: BACKLOG_NOTE };
  const { data: targets, error } = await supabaseAdmin
    .from("ai_outreach_targets")
    .select("id, domain, url, contact_email, niche, notes")
    .eq("status", "new")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(`ai_outreach_targets: ${error.message}`);
  if (!targets?.length) {
    return {
      key: "outreach",
      state: "skipped",
      added: 0,
      note: "brak celów 'new' — dodaj portale w Marketing → Outreach (albo discover_outreach_targets)",
    };
  }
  const known = await existingKeys(targets.map((t) => dedupeKeyFor("outreach_pitch", t.id)));
  const target = targets.find((t) => !known.has(dedupeKeyFor("outreach_pitch", t.id)));
  if (!target) return { key: "outreach", state: "ok", added: 0 };

  const { generateOutreachMessage } = await import("../ai-outreach.server");
  const { message } = await generateOutreachMessage(supabaseAdmin, null, {
    target_id: target.id,
    goal: OUTREACH_GOAL,
    angle: OUTREACH_ANGLE,
    step: 1,
    parent_id: null,
  });
  const added = await insertItems([
    buildOutreachItem(target, { id: message.id, subject: message.subject, body: message.body }),
  ]);
  // Cel w kolejce — nie wróci jutro jako 'new'.
  await supabaseAdmin
    .from("ai_outreach_targets")
    .update({ status: "queued" })
    .eq("id", target.id)
    .eq("status", "new");
  return { key: "outreach", state: "ok", added };
}

// ── Katalogi firm ───────────────────────────────────────────────────────────

export async function collectDirectories(ctx: CollectorContext): Promise<SourceStatus> {
  const need = needFor(ctx, "directory_listing");
  if (!need) return { key: "directory", state: "skipped", added: 0, note: BACKLOG_NOTE };
  const known = await existingKeys(DIRECTORIES.map((d) => dedupeKeyFor("directory_listing", d.id)));
  const next = nextDirectory(known);
  if (!next) {
    return {
      key: "directory",
      state: "skipped",
      added: 0,
      note: "wszystkie katalogi z listy już były",
    };
  }
  return { key: "directory", state: "ok", added: await insertItems([buildDirectoryItem(next)]) };
}

export const COLLECTORS: Array<
  [SourceStatus["key"], (ctx: CollectorContext) => Promise<SourceStatus>]
> = [
  ["pr", collectPr],
  ["outreach", collectOutreach],
  ["directory", collectDirectories],
  ["websearch", collectWebSearch],
  ["forum", collectForums],
  ["youtube", collectYoutube],
  ["instagram", collectInstagram],
];
