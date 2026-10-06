// Tygodniowy raport social media — zbieranie danych i wysyłka maila.
// Hook: /api/public/hooks/social-weekly-report (pg_cron w poniedziałki
// 06:00 UTC, migracja 20261006120000). Adresat: SOCIAL_REPORT_EMAIL,
// potem TEAM_NOTIFY_EMAIL, na końcu kontakt@financeyou.pl.
//
// Sekcja „Backlinki": stan ai_backlinks po niedzielnym backlinks-check-tick
// (aktywne, nowe live i utracone w ostatnich 7 dniach — status_changed_at).
//
// Każda sekcja jest odporna na awarię: błąd API jednej platformy albo
// zapytania do bazy daje w mailu „brak danych", a nie wywraca raportu.
// Po wysyłce zapisujemy obserwujących do social_stats_snapshots (baza
// różnic tydzień do tygodnia). Ten zapis jest też znacznikiem przebiegu:
// drugi raport w ciągu 6 dni wychodzi tylko z `force` (prywatny sekret).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  summarizeBacklinks,
  type BacklinkReportRow,
  type BacklinkStats,
} from "./backlinks-monitor";
import { teamAlertEmail, type ReplyAction, type SocialPlatform } from "./social-auto-reply";
import {
  buildWeeklyReportEmail,
  computeTakeaways,
  type ClickStats,
  type FollowerStat,
  type PublishedItem,
  type ReplyStats,
  type Section,
  type WeeklyReportData,
} from "./social-report";

const DAY_MS = 86_400_000;
/** Ile materiałów najwyżej odpytujemy o statystyki (Meta: 1 zapytanie na materiał). */
const MAX_STAT_LOOKUPS = 30;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function section<T>(fn: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

// ── Obserwujący ─────────────────────────────────────────────────────────────

async function currentFollowers(
  platform: SocialPlatform,
): Promise<{ followers: number; metrics: Record<string, number> }> {
  if (platform === "youtube") {
    const yt = await import("./youtube-api.server");
    const ch = await yt.getMyChannel();
    if (!ch) throw new Error("Brak kanału YouTube.");
    const st = ch.statistics ?? {};
    return {
      followers: Number(st.subscriberCount ?? 0),
      metrics: { views: Number(st.viewCount ?? 0), videos: Number(st.videoCount ?? 0) },
    };
  }
  const m = await import("./meta-api.server");
  if (platform === "instagram") {
    const acc = await m.getIgAccount();
    return {
      followers: Number(acc?.followers_count ?? 0),
      metrics: { media: Number(acc?.media_count ?? 0) },
    };
  }
  const page = await m.getPage("id,name,followers_count,fan_count");
  return {
    followers: Number(page?.followers_count ?? page?.fan_count ?? 0),
    metrics: { fans: Number(page?.fan_count ?? 0) },
  };
}

async function previousFollowers(platform: SocialPlatform, before: Date): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from("social_stats_snapshots")
    .select("followers")
    .eq("platform", platform)
    .not("followers", "is", null)
    .lte("captured_at", before.toISOString())
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.followers ?? null;
}

// ── Publikacje i ich statystyki ─────────────────────────────────────────────

async function loadPublished(since: Date): Promise<PublishedItem[]> {
  const sinceIso = since.toISOString();
  const [social, yt] = await Promise.all([
    supabaseAdmin
      .from("social_publish_queue")
      .select("platform, title, message, external_post_id, published_at")
      .eq("status", "published")
      .gte("published_at", sinceIso)
      .order("published_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("youtube_publish_queue")
      .select("title, youtube_video_id, published_at")
      .eq("status", "published")
      .gte("published_at", sinceIso)
      .order("published_at", { ascending: false })
      .limit(200),
  ]);
  if (social.error) throw new Error(`social_publish_queue: ${social.error.message}`);
  if (yt.error) throw new Error(`youtube_publish_queue: ${yt.error.message}`);

  const items: Array<PublishedItem & { externalId: string | null }> = [];
  for (const r of yt.data ?? []) {
    items.push({
      platform: "youtube",
      title: r.title,
      publishedAt: r.published_at ?? "",
      externalId: r.youtube_video_id,
      url: r.youtube_video_id ? `https://www.youtube.com/shorts/${r.youtube_video_id}` : null,
      views: null,
      likes: null,
      comments: null,
    });
  }
  for (const r of social.data ?? []) {
    const title = r.title || r.message.split("\n")[0]?.slice(0, 100) || "";
    items.push({
      platform: r.platform,
      title,
      publishedAt: r.published_at ?? "",
      externalId: r.external_post_id,
      url:
        r.external_post_id && r.platform.startsWith("facebook")
          ? `https://www.facebook.com/${r.external_post_id}`
          : null,
      views: null,
      likes: null,
      comments: null,
    });
  }
  await fillStats(items);
  return items.map(({ externalId: _id, ...rest }) => rest);
}

/** Statystyki materiałów — błąd pojedynczego odczytu zostawia „—" w tabeli. */
async function fillStats(items: Array<PublishedItem & { externalId: string | null }>) {
  const ytItems = items.filter((i) => i.platform === "youtube" && i.externalId);
  if (ytItems.length) {
    try {
      const yt = await import("./youtube-api.server");
      const byId = new Map<
        string,
        { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }
      >();
      const ids = ytItems.map((i) => i.externalId!);
      for (let k = 0; k < ids.length; k += 50) {
        for (const v of await yt.listVideos(ids.slice(k, k + 50))) byId.set(String(v.id), v);
      }
      for (const i of ytItems) {
        const st = byId.get(i.externalId!)?.statistics;
        if (!st) continue;
        i.views = Number(st.viewCount ?? 0);
        i.likes = Number(st.likeCount ?? 0);
        i.comments = Number(st.commentCount ?? 0);
      }
    } catch (e) {
      console.warn(`[social-report] youtube stats: ${errMsg(e)}`);
    }
  }

  const metaItems = items
    .filter(
      (i) =>
        i.externalId && (i.platform === "instagram_reels" || i.platform.startsWith("facebook")),
    )
    .slice(0, MAX_STAT_LOOKUPS);
  if (!metaItems.length) return;
  const m = await import("./meta-api.server");
  for (const i of metaItems) {
    try {
      if (i.platform === "instagram_reels") {
        const md = await m.getIgMedia(i.externalId!);
        i.likes = Number(md?.like_count ?? 0);
        i.comments = Number(md?.comments_count ?? 0);
        i.url = md?.permalink ?? i.url;
        try {
          const ins = await m.getIgMediaInsights(i.externalId!, "views");
          const v = (
            ins as Array<{
              name?: string;
              values?: Array<{ value?: number }>;
              total_value?: { value?: number };
            }>
          ).find((r) => r?.name === "views");
          const val = v?.values?.[0]?.value ?? v?.total_value?.value;
          if (val != null) i.views = Number(val);
        } catch {
          // Wyświetlenia IG bywają niedostępne (świeży materiał, uprawnienia) — zostają „—".
        }
      } else {
        // Post i wideo (Reels) FB mają te same krawędzie reakcji i komentarzy.
        const obj = await m.graphRequest(i.externalId!, {
          query: {
            fields: "likes.summary(true).limit(0),comments.summary(true).limit(0)",
          },
          token: "page",
        });
        i.likes = Number(obj?.likes?.summary?.total_count ?? 0);
        i.comments = Number(obj?.comments?.summary?.total_count ?? 0);
      }
    } catch (e) {
      console.warn(`[social-report] ${i.platform}/${i.externalId}: ${errMsg(e)}`);
    }
  }
}

// ── Kliknięcia ──────────────────────────────────────────────────────────────

async function countClicks(ids: string[], from: Date, to: Date): Promise<number> {
  if (!ids.length) return 0;
  const { count, error } = await supabaseAdmin
    .from("campaign_clicks")
    .select("id", { count: "exact", head: true })
    .in("campaign_id", ids)
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString());
  if (error) throw new Error(`campaign_clicks: ${error.message}`);
  return count ?? 0;
}

async function loadClicks(start: Date, end: Date): Promise<ClickStats> {
  const { data: campaigns, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("id, name, utm_source")
    .ilike("utm_medium", "social")
    .limit(500);
  if (error) throw new Error(`marketing_campaigns: ${error.message}`);
  const list = campaigns ?? [];
  const perCampaign = await Promise.all(
    list.map(async (c) => ({
      name: c.name,
      source: c.utm_source,
      clicks: await countClicks([c.id], start, end),
    })),
  );
  const total = perCampaign.reduce((s, c) => s + c.clicks, 0);
  const prevStart = new Date(start.getTime() - 7 * DAY_MS);
  let previousTotal: number | null = null;
  try {
    previousTotal = await countClicks(
      list.map((c) => c.id),
      prevStart,
      start,
    );
  } catch {
    previousTotal = null;
  }
  return { total, previousTotal, campaigns: perCampaign };
}

// ── Autoodpowiedzi ──────────────────────────────────────────────────────────

async function loadReplies(start: Date): Promise<ReplyStats> {
  const { data, error } = await supabaseAdmin
    .from("social_comment_replies")
    .select("platform, action, author_name, comment_text, reason, permalink, created_at")
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`social_comment_replies: ${error.message}`);
  const counts: Partial<Record<ReplyAction, number>> = {};
  for (const r of data ?? []) {
    const a = r.action as ReplyAction;
    counts[a] = (counts[a] ?? 0) + 1;
  }
  const escalated = (data ?? [])
    .filter((r) => r.action === "escalated")
    .slice(0, 20)
    .map((r) => ({
      platform: r.platform as SocialPlatform,
      authorName: r.author_name,
      text: r.comment_text ?? "",
      reason: r.reason,
      permalink: r.permalink,
      createdAt: r.created_at,
    }));
  return { counts, escalated };
}

// ── Backlinki ───────────────────────────────────────────────────────────────

/**
 * Stan ai_backlinks: wszystkie 'live' + zmiany statusu (live / lost)
 * z ostatnich 7 dni — status_changed_at ustawia trigger w bazie,
 * a statusy aktualizuje niedzielny backlinks-check-tick.
 */
async function loadBacklinks(start: Date, end: Date): Promise<BacklinkStats> {
  const cols =
    "source_url, source_domain, status, dofollow, status_changed_at, last_checked_at, last_error";
  const [live, changed, checked] = await Promise.all([
    supabaseAdmin.from("ai_backlinks").select(cols).eq("status", "live").limit(5000),
    supabaseAdmin
      .from("ai_backlinks")
      .select(cols)
      .eq("status", "lost")
      .gte("status_changed_at", start.toISOString())
      .limit(500),
    supabaseAdmin
      .from("ai_backlinks")
      .select("last_checked_at")
      .not("last_checked_at", "is", null)
      .order("last_checked_at", { ascending: false })
      .limit(1),
  ]);
  if (live.error) throw new Error(`ai_backlinks: ${live.error.message}`);
  if (changed.error) throw new Error(`ai_backlinks: ${changed.error.message}`);
  const rows = [...(live.data ?? []), ...(changed.data ?? [])] as BacklinkReportRow[];
  const stats = summarizeBacklinks(rows, start, end);
  // Ostatnie sprawdzenie także z wierszy 'lost' / 'pending' spoza powyższych list.
  const last = checked.data?.[0]?.last_checked_at ?? null;
  if (last && (!stats.lastCheckedAt || last > stats.lastCheckedAt)) stats.lastCheckedAt = last;
  return stats;
}

// ── Raport ──────────────────────────────────────────────────────────────────

const PLATFORMS: SocialPlatform[] = ["facebook", "instagram", "youtube"];

export async function runSocialWeeklyReport(
  opts: { force?: boolean; now?: Date } = {},
): Promise<Record<string, unknown>> {
  const now = opts.now ?? new Date();
  const start = new Date(now.getTime() - 7 * DAY_MS);

  // Ochrona przed zdublowanym raportem (hook przyjmuje też publiczny klucz).
  if (!opts.force) {
    const { data: recent } = await supabaseAdmin
      .from("social_stats_snapshots")
      .select("captured_at")
      .gte("captured_at", new Date(now.getTime() - 6 * DAY_MS).toISOString())
      .limit(1);
    if (recent?.length) {
      return {
        ok: true,
        skipped: "raport z ostatnich 6 dni już wysłany",
        at: recent[0].captured_at,
      };
    }
  }

  const snapshots: Array<{
    platform: SocialPlatform;
    followers: number | null;
    metrics: Record<string, number>;
  }> = [];
  const followers: FollowerStat[] = [];
  for (const platform of PLATFORMS) {
    let previous: number | null = null;
    try {
      previous = await previousFollowers(platform, new Date(now.getTime() - 6 * DAY_MS));
    } catch {
      previous = null;
    }
    try {
      const cur = await currentFollowers(platform);
      followers.push({ platform, followers: cur.followers, previous });
      snapshots.push({ platform, followers: cur.followers, metrics: cur.metrics });
    } catch (e) {
      followers.push({ platform, followers: null, previous, error: errMsg(e) });
      snapshots.push({ platform, followers: null, metrics: {} });
    }
  }

  const [published, clicks, replies, backlinks] = await Promise.all([
    section(() => loadPublished(start)),
    section(() => loadClicks(start, now)),
    section(() => loadReplies(start)),
    section(() => loadBacklinks(start, now)),
  ]);

  const data: WeeklyReportData = {
    periodStart: start.toISOString(),
    periodEnd: now.toISOString(),
    followers,
    published,
    clicks,
    replies,
    backlinks,
  };
  const takeaways = computeTakeaways(data);
  const mail = buildWeeklyReportEmail(data, takeaways);
  const to = teamAlertEmail(process.env, "SOCIAL_REPORT_EMAIL");

  const { sendResendEmail } = await import("./resend-send.server");
  const sent = await sendResendEmail({
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    noBranding: true,
    // Raport wewnętrzny dla zespołu — nigdy nie podlega wypisowi.
    category: "transactional",
  });
  if (!sent.ok) {
    // Bez zapisu migawek — kolejne wywołanie może ponowić wysyłkę.
    return { ok: false, error: `Wysyłka raportu nieudana: ${sent.error ?? "?"}`, to };
  }

  const { error: snapErr } = await supabaseAdmin.from("social_stats_snapshots").insert(
    snapshots.map((s) => ({
      platform: s.platform,
      followers: s.followers,
      metrics: s.metrics,
      captured_at: now.toISOString(),
    })),
  );

  return {
    ok: true,
    to,
    takeaways,
    sections: {
      followers: followers.map((f) => ({ platform: f.platform, ok: f.followers != null })),
      published: published.ok ? published.data.length : `brak danych: ${published.error}`,
      clicks: clicks.ok ? clicks.data.total : `brak danych: ${clicks.error}`,
      replies: replies.ok ? replies.data.counts : `brak danych: ${replies.error}`,
      backlinks: backlinks.ok
        ? {
            live: backlinks.data.live,
            newly_live: backlinks.data.newlyLive.length,
            newly_lost: backlinks.data.newlyLost.length,
          }
        : `brak danych: ${backlinks.error}`,
    },
    snapshot_error: snapErr?.message ?? null,
  };
}
