// Meta — Facebook (strona, posty, statystyki, komentarze, publikacja),
// Instagram (media, statystyki, komentarze, publikacja), Messenger / Direct
// (rozmowy z API), reklamy (konta, kampanie, zestawy, reklamy, wyniki, pauza,
// budżet), formularze leadów, Conversions API, ogólne wywołanie Graph.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  DESTRUCTIVE,
  SENDS,
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  clampLimit,
  fail,
  handle,
  isoDate,
  ok,
  okWith,
  requireRolesAdmin,
  requireTeam,
  requireTeamAdmin,
  snippet,
} from "../_helpers";

const ADMIN_ONLY = ["administrator"] as const;
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;

const insightsToMap = (rows: any[]) => {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    if (r?.total_value && typeof r.total_value === "object") {
      // metric_type=total_value: jedna liczba za cały okres (nowe API Instagrama)
      out[r?.name] = r.total_value.value ?? r.total_value;
      continue;
    }
    const vals = r?.values ?? [];
    out[r?.name] =
      vals.length === 1
        ? vals[0]?.value
        : vals.map((v: any) => ({ end_time: v?.end_time, value: v?.value }));
  }
  return out;
};

function fbPost(p: any) {
  return {
    post_id: p?.id,
    message: snippet(p?.message ?? p?.story, 500),
    created_time: p?.created_time,
    permalink_url: p?.permalink_url,
    status_type: p?.status_type,
    is_published: p?.is_published,
    scheduled_publish_time: p?.scheduled_publish_time ?? null,
    shares: p?.shares?.count ?? 0,
    likes: p?.likes?.summary?.total_count ?? 0,
    comments: p?.comments?.summary?.total_count ?? 0,
    picture: p?.full_picture ?? null,
  };
}

function igMedia(m: any) {
  return {
    media_id: m?.id,
    media_type: m?.media_type,
    product_type: m?.media_product_type,
    caption: snippet(m?.caption, 400),
    permalink: m?.permalink,
    timestamp: m?.timestamp,
    likes: m?.like_count ?? 0,
    comments: m?.comments_count ?? 0,
    media_url: m?.media_url ?? m?.thumbnail_url ?? null,
  };
}

/** Obraz do podglądu wpisu IG: kadr dla wideo, plik dla zdjęcia / karuzeli. */
function igImageUrl(m: any): string | null {
  return m?.media_type === "VIDEO"
    ? (m?.thumbnail_url ?? null)
    : (m?.media_url ?? m?.thumbnail_url ?? null);
}

async function previewImages(urls: (string | null | undefined)[], max = 4) {
  const { fetchImageBlocks } = await import("@/lib/media-storage.server");
  return fetchImageBlocks(urls, { max });
}

function adsInsights(rows: any[]) {
  return rows.map((r) => ({
    date_start: r?.date_start,
    date_stop: r?.date_stop,
    spend: Number(r?.spend ?? 0),
    impressions: Number(r?.impressions ?? 0),
    reach: Number(r?.reach ?? 0),
    frequency: Number(r?.frequency ?? 0),
    clicks: Number(r?.clicks ?? 0),
    ctr: Number(r?.ctr ?? 0),
    cpc: Number(r?.cpc ?? 0),
    cpm: Number(r?.cpm ?? 0),
    leads: Number((r?.actions ?? []).find((a: any) => a?.action_type === "lead")?.value ?? 0),
    cost_per_lead: Number(
      (r?.cost_per_action_type ?? []).find((a: any) => a?.action_type === "lead")?.value ?? 0,
    ),
    actions: (r?.actions ?? []).map((a: any) => ({
      type: a?.action_type,
      value: Number(a?.value ?? 0),
    })),
    ...(r?.age || r?.gender || r?.publisher_platform
      ? {
          breakdown: {
            age: r?.age,
            gender: r?.gender,
            publisher_platform: r?.publisher_platform,
            region: r?.region,
          },
        }
      : {}),
  }));
}

// ── Status ──────────────────────────────────────────────────────────────────

export const metaStatus = defineTool({
  name: "meta_status",
  title: "Meta (Facebook / Instagram / Ads) status",
  description:
    "Stan integracji Meta: które tokeny są ustawione (strona, Instagram, reklamy, piksel), strona (nazwa, obserwujący), konto Instagram (nazwa, obserwujący, liczba postów), konta reklamowe z API. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const { metaTokenHealth } = await import("@/lib/meta-tokens.server");
      const health = await metaTokenHealth();
      const env = m.metaEnv();
      const errors: string[] = [];
      const [page, ig, accounts] = await Promise.all([
        env.hasPageToken && env.pageId
          ? m.getPage().catch((e) => (errors.push(`page: ${(e as Error).message}`), null))
          : null,
        env.hasIgToken && env.igUserId
          ? m.getIgAccount().catch((e) => (errors.push(`instagram: ${(e as Error).message}`), null))
          : null,
        env.hasUserToken
          ? m
              .listAdAccounts()
              .catch((e) => (errors.push(`ads: ${(e as Error).message}`), [] as any[]))
          : ([] as any[]),
      ]);
      return ok({
        token_health: health,

        configured: {
          page_token: env.hasPageToken,
          instagram_token: env.hasIgToken,
          ads_token: env.hasUserToken,
          pixel_token: env.hasPixelToken,
          page_id: env.pageId || null,
          ig_user_id: env.igUserId || null,
        },
        page: page
          ? {
              id: page.id,
              name: page.name,
              category: page.category,
              fans: page.fan_count,
              followers: page.followers_count,
              link: page.link,
            }
          : null,
        instagram: ig
          ? {
              id: ig.id,
              username: ig.username,
              name: ig.name,
              followers: ig.followers_count,
              follows: ig.follows_count,
              media_count: ig.media_count,
            }
          : null,
        ad_accounts: accounts.map((a: any) => ({
          account_id: a.account_id,
          name: a.name,
          currency: a.currency,
          status: a.account_status,
          amount_spent: Number(a.amount_spent ?? 0) / 100,
          balance: Number(a.balance ?? 0) / 100,
        })),
        errors,
      });
    }),
});

// ── Facebook ────────────────────────────────────────────────────────────────

export const listFacebookPosts = defineTool({
  name: "list_facebook_posts",
  title: "List Facebook page posts",
  description:
    "Posty na stronie firmowej (także zaplanowane przy `include_unpublished`): treść, data, link, udostępnienia, polubienia, komentarze. Tylko administrator/operator.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional(),
    since: z.string().optional().describe("Od (ISO 8601 lub YYYY-MM-DD)."),
    until: z.string().optional(),
    include_unpublished: z
      .boolean()
      .default(false)
      .describe("Tylko zaplanowane / nieopublikowane."),
    preview: z.boolean().default(false).describe("Pokaż w czacie do 4 grafik z wyniku."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.listPagePosts({
        limit: clampLimit(a.limit, 25, 100),
        since: isoDate(a.since, "since"),
        until: isoDate(a.until, "until"),
        includeUnpublished: a.include_unpublished,
      });
      const images = a.preview ? await previewImages(rows.map((p: any) => p?.full_picture)) : [];
      return okWith({ posts: rows.map(fbPost) }, images);
    }),
});

export const getFacebookPost = defineTool({
  name: "get_facebook_post",
  title: "Get Facebook post with insights",
  description:
    "Jeden post ze strony: pełna treść, załączniki, reakcje oraz statystyki (zasięg, zaangażowanie, kliknięcia, reakcje po typie). Tylko administrator/operator.",
  inputSchema: {
    post_id: z.string().min(5),
    metrics: z.string().optional().describe("Własna lista metryk insights po przecinku."),
    preview: z.boolean().default(true).describe("Pokaż grafikę posta w czacie."),
  },
  annotations: READ,
  handler: ({ post_id, metrics, preview }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const errors: string[] = [];
      const [post, insights] = await Promise.all([
        m.getPost(post_id),
        m
          .getPostInsights(post_id, metrics)
          .catch((e) => (errors.push(`insights: ${(e as Error).message}`), [] as any[])),
      ]);
      const { fetchImageBlock } = await import("@/lib/media-storage.server");
      const img = preview ? await fetchImageBlock(post?.full_picture) : null;
      return okWith(
        {
          ...fbPost(post),
          message_full: post?.message ?? post?.story ?? null,
          attachments: post?.attachments?.data ?? [],
          insights: insightsToMap(insights),
          errors,
        },
        img ? [img] : [],
      );
    }),
});

export const getFacebookPageInsights = defineTool({
  name: "get_facebook_page_insights",
  title: "Get Facebook page insights",
  description:
    "Statystyki strony (dziennie / tygodniowo / 28 dni): zaangażowanie postów, obserwujący, nowi obserwujący (Meta wycofała page_impressions, page_impressions_unique i page_fans; własna lista metryk przez `metrics`). Domyślnie ostatnie 7 dni. Tylko administrator/operator.",
  inputSchema: {
    period: z.enum(["day", "week", "days_28"]).default("day"),
    since: z.string().optional(),
    until: z.string().optional(),
    metrics: z.string().optional().describe("Własna lista metryk po przecinku."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.getPageInsights({
        period: a.period,
        since: isoDate(a.since, "since") ?? new Date(Date.now() - 7 * 86_400_000).toISOString(),
        until: isoDate(a.until, "until"),
        metrics: a.metrics,
      });
      return ok({ period: a.period, insights: insightsToMap(rows) });
    }),
});

export const listFacebookComments = defineTool({
  name: "list_facebook_comments",
  title: "List comments (Facebook post)",
  description:
    "Komentarze pod postem na Facebooku: autor, treść, polubienia, odpowiedzi, ukryte. `object_id` to id posta albo komentarza (odpowiedzi). Tylko administrator/operator.",
  inputSchema: { object_id: z.string().min(5), limit: z.number().int().min(1).max(100).optional() },
  annotations: READ,
  handler: ({ object_id, limit }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.listComments(object_id, { limit: clampLimit(limit, 50, 100) });
      return ok({
        comments: rows.map((c: any) => ({
          comment_id: c.id,
          from: c.from?.name ?? null,
          from_id: c.from?.id ?? null,
          message: snippet(c.message, 1000),
          created_time: c.created_time,
          likes: c.like_count ?? 0,
          replies: c.comment_count ?? 0,
          is_hidden: c.is_hidden ?? false,
          parent_id: c.parent?.id ?? null,
          permalink_url: c.permalink_url ?? null,
        })),
      });
    }),
});

export const publishFacebookPostTool = defineTool({
  name: "publish_facebook_post",
  title: "Publish / schedule Facebook post",
  description:
    "Publikuje post na stronie firmowej: tekst (z linkiem), zdjęcie (image_url) albo wideo (video_url). Ze `scheduled_at` post jest zaplanowany (10 minut – 29 dni do przodu; Meta odrzuca dalsze terminy). To publiczna publikacja — użyj po tym, jak użytkownik zobaczył treść i kazał opublikować. Tylko administrator/operator.",
  inputSchema: {
    message: z.string().max(5000).default(""),
    link: z.string().url().optional(),
    image_url: z.string().url().optional(),
    video_url: z.string().url().optional(),
    title: z.string().max(200).optional().describe("Tytuł wideo."),
    scheduled_at: z
      .string()
      .optional()
      .describe("Termin publikacji (ISO 8601), od 10 minut do 29 dni od teraz."),
  },
  annotations: SENDS,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const scheduledAt = isoDate(a.scheduled_at, "scheduled_at");
      if (scheduledAt) {
        const delta = new Date(scheduledAt).getTime() - Date.now();
        if (delta < 10 * 60_000 || delta > 29 * 86_400_000)
          return fail("Termin publikacji musi być od 10 minut do 29 dni od teraz (limit Meta).");
      }
      const m = await import("@/lib/meta-api.server");
      const r = await m.publishFacebookPost({
        message: a.message,
        link: a.link,
        imageUrl: a.image_url,
        videoUrl: a.video_url,
        title: a.title,
        scheduledAt,
      });
      await s.from("automation_events").insert({
        automation_type: "facebook_post_mcp",
        status: "sent",
        sent_payload: {
          kind: r.kind,
          scheduled: r.scheduled,
          message: snippet(a.message, 200),
          actor: actorId(ctx),
        },
        response_payload: { id: r.id },
      });
      return ok({
        ok: true,
        ...r,
        url: r.id && !r.scheduled ? `https://www.facebook.com/${r.id}` : null,
      });
    }),
});

export const deleteFacebookPost = defineTool({
  name: "delete_facebook_post",
  title: "Delete Facebook post",
  description: "Usuwa post ze strony (także zaplanowany). Nieodwracalne. Tylko administrator.",
  inputSchema: { post_id: z.string().min(5) },
  annotations: DESTRUCTIVE,
  handler: ({ post_id }, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const m = await import("@/lib/meta-api.server");
      const r = await m.deleteObject(post_id, "page");
      return ok({ ok: true, deleted: post_id, response: r });
    }),
});

export const replyFacebookComment = defineTool({
  name: "reply_facebook_comment",
  title: "Reply to Facebook comment",
  description:
    "Publiczna odpowiedź pod komentarzem na stronie (albo prywatna wiadomość Messenger do autora komentarza przy `private=true`). Realna publikacja — po potwierdzeniu treści. Tylko administrator/operator.",
  inputSchema: {
    comment_id: z.string().min(5),
    text: z.string().min(1).max(7000),
    private: z.boolean().default(false),
  },
  annotations: SENDS,
  handler: ({ comment_id, text, private: priv }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const mc = await import("@/lib/meta-comments.server");
      const r = priv
        ? await mc.sendPrivateReplyToComment({ commentId: comment_id, text })
        : await mc.replyToCommentPublic({ commentId: comment_id, text });
      return r.ok
        ? ok({ ...r, actor: actorId(ctx) })
        : fail(r.error ?? "Odpowiedź nie powiodła się.");
    }),
});

export const hideFacebookComment = defineTool({
  name: "hide_facebook_comment",
  title: "Hide / unhide Facebook comment",
  description: "Ukrywa (lub przywraca) komentarz pod postem strony. Tylko administrator/operator.",
  inputSchema: { comment_id: z.string().min(5), hidden: z.boolean().default(true) },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ comment_id, hidden }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const m = await import("@/lib/meta-api.server");
      await m.setCommentHidden(comment_id, hidden);
      return ok({ ok: true, comment_id, hidden });
    }),
});

// ── Instagram ───────────────────────────────────────────────────────────────

export const listInstagramMedia = defineTool({
  name: "list_instagram_media",
  title: "List Instagram media",
  description:
    "Posty, rolki i karuzele na koncie Instagram: podpis, typ, link, polubienia, komentarze, data. Tylko administrator/operator.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional(),
    since: z.string().optional(),
    until: z.string().optional(),
    preview: z.boolean().default(false).describe("Pokaż w czacie do 4 obrazów z wyniku."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.listIgMedia({
        limit: clampLimit(a.limit, 25, 100),
        since: isoDate(a.since, "since"),
        until: isoDate(a.until, "until"),
      });
      const images = a.preview ? await previewImages(rows.map(igImageUrl)) : [];
      return okWith({ media: rows.map(igMedia) }, images);
    }),
});

export const getInstagramMedia = defineTool({
  name: "get_instagram_media",
  title: "Get Instagram media with insights",
  description:
    "Jeden post / rolka z Instagrama z podpisem i statystykami (wyświetlenia, zasięg, polubienia, komentarze, udostępnienia, zapisania, interakcje). Tylko administrator/operator.",
  inputSchema: {
    media_id: z.string().min(5),
    metrics: z
      .string()
      .optional()
      .describe("Własna lista metryk po przecinku (zależy od typu media)."),
    preview: z.boolean().default(true).describe("Pokaż obraz / kadr w czacie."),
  },
  annotations: READ,
  handler: ({ media_id, metrics, preview }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const errors: string[] = [];
      const [media, insights] = await Promise.all([
        m.getIgMedia(media_id),
        m
          .getIgMediaInsights(media_id, metrics)
          .catch((e) => (errors.push(`insights: ${(e as Error).message}`), [] as any[])),
      ]);
      const { fetchImageBlock } = await import("@/lib/media-storage.server");
      const img = preview ? await fetchImageBlock(igImageUrl(media)) : null;
      return okWith(
        {
          ...igMedia(media),
          caption_full: media?.caption ?? null,
          insights: insightsToMap(insights),
          errors,
        },
        img ? [img] : [],
      );
    }),
});

export const getInstagramAccountInsights = defineTool({
  name: "get_instagram_account_insights",
  title: "Get Instagram account insights",
  description:
    "Statystyki konta Instagram: dla okresu dziennego zasięg, obserwujący, wejścia na profil, zaangażowane konta, interakcje; dla week / days_28 Meta udostępnia tylko zasięg. Domyślnie ostatnie 7 dni po dniach. Tylko administrator/operator.",
  inputSchema: {
    period: z.enum(["day", "week", "days_28"]).default("day"),
    since: z.string().optional(),
    until: z.string().optional(),
    metrics: z.string().optional(),
    metric_type: z.enum(["total_value", "time_series"]).optional(),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.getIgAccountInsights({
        period: a.period,
        since: isoDate(a.since, "since") ?? new Date(Date.now() - 7 * 86_400_000).toISOString(),
        until: isoDate(a.until, "until"),
        metrics: a.metrics,
        metricType: a.metric_type,
      });
      return ok({ period: a.period, insights: insightsToMap(rows) });
    }),
});

export const listInstagramComments = defineTool({
  name: "list_instagram_comments",
  title: "List Instagram comments",
  description:
    "Komentarze pod postem / rolką na Instagramie z odpowiedziami. Tylko administrator/operator.",
  inputSchema: { media_id: z.string().min(5), limit: z.number().int().min(1).max(100).optional() },
  annotations: READ,
  handler: ({ media_id, limit }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.listIgComments(media_id, clampLimit(limit, 50, 100));
      return ok({
        comments: rows.map((c: any) => ({
          comment_id: c.id,
          username: c.username,
          text: snippet(c.text, 1000),
          timestamp: c.timestamp,
          likes: c.like_count ?? 0,
          hidden: c.hidden ?? false,
          replies: (c.replies?.data ?? []).map((r: any) => ({
            comment_id: r.id,
            username: r.username,
            text: snippet(r.text, 500),
            timestamp: r.timestamp,
          })),
        })),
      });
    }),
});

export const replyInstagramComment = defineTool({
  name: "reply_instagram_comment",
  title: "Reply to Instagram comment",
  description:
    "Publiczna odpowiedź pod komentarzem na Instagramie — po potwierdzeniu treści. Tylko administrator/operator.",
  inputSchema: { comment_id: z.string().min(5), message: z.string().min(1).max(2200) },
  annotations: SENDS,
  handler: ({ comment_id, message }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const m = await import("@/lib/meta-api.server");
      const r = await m.replyIgComment(comment_id, message);
      return ok({ ok: true, reply_id: r?.id, actor: actorId(ctx) });
    }),
});

export const hideInstagramComment = defineTool({
  name: "hide_instagram_comment",
  title: "Hide / unhide Instagram comment",
  description: "Ukrywa (lub przywraca) komentarz na Instagramie. Tylko administrator/operator.",
  inputSchema: { comment_id: z.string().min(5), hidden: z.boolean().default(true) },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ comment_id, hidden }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const m = await import("@/lib/meta-api.server");
      await m.setIgCommentHidden(comment_id, hidden);
      return ok({ ok: true, comment_id, hidden });
    }),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const publishInstagramPost = defineTool({
  name: "publish_instagram_post",
  title: "Publish Instagram post / reel / story",
  description:
    "Publikuje na Instagramie zdjęcie (image_url, JPG) albo wideo jako rolkę (video_url, MP4 pion 9:16) lub story. Zdjęcia publikują się od razu; wideo Instagram przetwarza — narzędzie czeka do ~60 s, a jeśli nie zdąży, zwraca `creation_id` do dokończenia przez `publish_instagram_container`. Publiczna publikacja — po potwierdzeniu treści. Tylko administrator/operator.",
  inputSchema: {
    caption: z.string().max(2200).default(""),
    image_url: z.string().url().optional(),
    video_url: z.string().url().optional(),
    media_type: z.enum(["IMAGE", "REELS", "STORIES"]).optional(),
    share_to_feed: z.boolean().optional().describe("Dla rolek: pokazać też w siatce profilu."),
    cover_url: z.string().url().optional().describe("Okładka rolki."),
  },
  annotations: SENDS,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const m = await import("@/lib/meta-api.server");
      const creationId = await m.createIgContainer({
        imageUrl: a.image_url,
        videoUrl: a.video_url,
        caption: a.caption,
        mediaType: a.media_type,
        shareToFeed: a.share_to_feed,
        coverUrl: a.cover_url,
      });
      const deadline = Date.now() + 60_000;
      let status = await m.getIgContainerStatus(creationId);
      while (
        status.status_code !== "FINISHED" &&
        status.status_code !== "ERROR" &&
        status.status_code !== "EXPIRED" &&
        Date.now() < deadline
      ) {
        await sleep(5000);
        status = await m.getIgContainerStatus(creationId);
      }
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED")
        return fail(`Instagram odrzucił materiał (${status.status_code}): ${status.status}`);
      if (status.status_code !== "FINISHED") {
        return ok({
          ok: true,
          published: false,
          creation_id: creationId,
          status: status.status_code,
          next: "Wywołaj publish_instagram_container z tym creation_id za minutę.",
        });
      }
      const mediaId = await m.publishIgContainer(creationId);
      await s.from("automation_events").insert({
        automation_type: "instagram_post_mcp",
        status: "sent",
        sent_payload: {
          caption: snippet(a.caption, 200),
          media_type: a.media_type ?? (a.video_url ? "REELS" : "IMAGE"),
          actor: actorId(ctx),
        },
        response_payload: { media_id: mediaId },
      });
      const media = await m.getIgMedia(mediaId).catch(() => null);
      return ok({
        ok: true,
        published: true,
        media_id: mediaId,
        permalink: media?.permalink ?? null,
      });
    }),
});

export const publishInstagramContainer = defineTool({
  name: "publish_instagram_container",
  title: "Finish Instagram publication (container)",
  description:
    "Sprawdza status kontenera mediów Instagram (`creation_id` z `publish_instagram_post`) i publikuje go, gdy jest gotowy. Tylko administrator/operator.",
  inputSchema: { creation_id: z.string().min(5) },
  annotations: SENDS,
  handler: ({ creation_id }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const m = await import("@/lib/meta-api.server");
      const status = await m.getIgContainerStatus(creation_id);
      if (status.status_code === "PUBLISHED")
        return ok({
          ok: true,
          published: true,
          media_id: creation_id,
          note: "Kontener był już opublikowany.",
        });
      if (status.status_code !== "FINISHED")
        return ok({
          ok: true,
          published: false,
          status: status.status_code,
          detail: status.status,
        });
      const mediaId = await m.publishIgContainer(creation_id);
      const media = await m.getIgMedia(mediaId).catch(() => null);
      return ok({
        ok: true,
        published: true,
        media_id: mediaId,
        permalink: media?.permalink ?? null,
      });
    }),
});

// ── Messenger / Direct ──────────────────────────────────────────────────────

export const listMessengerConversations = defineTool({
  name: "list_messenger_conversations",
  title: "List Messenger / Instagram Direct conversations (API)",
  description:
    "Rozmowy strony w Messengerze albo Instagram Direct prosto z Graph API: uczestnik, ostatnia wiadomość, nieprzeczytane, liczba wiadomości, czy można odpisać (okno 24 h). Historia w CRM jest w `list_inbox_threads`. Tylko administrator/operator.",
  inputSchema: {
    platform: z.enum(["messenger", "instagram"]).default("messenger"),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: READ,
  handler: ({ platform, limit }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.listConversations({ platform, limit: clampLimit(limit, 25, 100) });
      return ok({
        conversations: rows.map((c: any) => ({
          conversation_id: c.id,
          participants: (c.participants?.data ?? []).map((p: any) => ({
            id: p.id,
            name: p.name ?? p.username ?? null,
          })),
          snippet: snippet(c.snippet, 200),
          updated_time: c.updated_time,
          unread_count: c.unread_count ?? 0,
          message_count: c.message_count ?? null,
          can_reply: c.can_reply ?? null,
        })),
      });
    }),
});

export const getMessengerConversation = defineTool({
  name: "get_messenger_conversation",
  title: "Get Messenger / Direct conversation messages (API)",
  description:
    "Wiadomości jednej rozmowy z Graph API (nadawca, treść, załączniki, czas). Odpowiadanie: `send_messenger_message` po lead_id. Tylko administrator/operator.",
  inputSchema: {
    preview: z.boolean().default(false).describe("Pokaż w czacie do 4 obrazów z załączników."),
    conversation_id: z.string().min(5),
    platform: z.enum(["messenger", "instagram"]).default("messenger"),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: READ,
  handler: ({ conversation_id, platform, limit, preview }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.getConversationMessages(conversation_id, {
        platform,
        limit: clampLimit(limit, 50, 100),
      });
      const messages = rows.reverse().map((x: any) => ({
        message_id: x.id,
        from: x.from?.name ?? x.from?.username ?? null,
        from_id: x.from?.id ?? null,
        message: x.message ?? "",
        created_time: x.created_time,
        attachments: (x.attachments?.data ?? []).map((att: any) => ({
          name: att.name,
          mime_type: att.mime_type,
          url: att.file_url ?? att.image_data?.url ?? null,
        })),
      }));
      const images = preview
        ? await previewImages(
            messages.flatMap((mm: any) => mm.attachments.map((at: any) => at.url as string | null)),
          )
        : [];
      return okWith({ messages }, images);
    }),
});

// ── Reklamy ─────────────────────────────────────────────────────────────────

export const listMetaAdAccounts = defineTool({
  name: "list_meta_ad_accounts",
  title: "List Meta ad accounts (API)",
  description:
    "Konta reklamowe dostępne dla tokena: id, nazwa, waluta, status, wydano, saldo. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.listAdAccounts();
      return ok({
        ad_accounts: rows.map((a: any) => ({
          account_id: a.account_id,
          act_id: a.id,
          name: a.name,
          currency: a.currency,
          status: a.account_status,
          business_name: a.business_name,
          amount_spent: Number(a.amount_spent ?? 0) / 100,
          balance: Number(a.balance ?? 0) / 100,
          timezone: a.timezone_name,
        })),
      });
    }),
});

export const getMetaCampaignsLive = defineTool({
  name: "get_meta_campaigns_live",
  title: "List Meta campaigns with results (live API)",
  description:
    "Kampanie z konta reklamowego prosto z API z wynikami za okres (domyślnie 30 dni): status, budżety, wydatki, zasięg, kliknięcia, CTR, CPC, leady, koszt leada. Zsynchronizowane lokalnie dane daje `list_meta_campaigns`. Tylko administrator/operator.",
  inputSchema: {
    account_id: z.string().min(3).describe("Id konta (z list_meta_ad_accounts), z lub bez act_."),
    status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]).optional(),
    date_preset: z
      .string()
      .default("last_30d")
      .describe("np. today, yesterday, last_7d, last_30d, this_month, last_month, maximum"),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.listCampaigns(a.account_id, {
        status: a.status,
        datePreset: a.date_preset,
        limit: clampLimit(a.limit, 50, 200),
      });
      return ok({
        campaigns: rows.map((c: any) => ({
          campaign_id: c.id,
          name: c.name,
          objective: c.objective,
          status: c.status,
          effective_status: c.effective_status,
          daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
          lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
          start_time: c.start_time,
          stop_time: c.stop_time,
          results: adsInsights(c.insights?.data ?? [])[0] ?? null,
        })),
      });
    }),
});

export const listMetaAdsets = defineTool({
  name: "list_meta_adsets",
  title: "List Meta ad sets",
  description:
    "Zestawy reklam kampanii albo konta (podaj campaign_id lub account_id): status, budżet, cel optymalizacji, targetowanie, wyniki za okres. Tylko administrator/operator.",
  inputSchema: {
    parent_id: z.string().min(3).describe("Id kampanii albo konta (act_…)."),
    date_preset: z.string().default("last_30d"),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const parent =
        /^\d+$/.test(a.parent_id) && a.parent_id.length <= 16 ? m.actId(a.parent_id) : a.parent_id;
      const rows = await m.listAdsets(parent, {
        datePreset: a.date_preset,
        limit: clampLimit(a.limit, 50, 200),
      });
      return ok({
        adsets: rows.map((x: any) => ({
          adset_id: x.id,
          name: x.name,
          campaign_id: x.campaign_id,
          status: x.status,
          effective_status: x.effective_status,
          daily_budget: x.daily_budget ? Number(x.daily_budget) / 100 : null,
          lifetime_budget: x.lifetime_budget ? Number(x.lifetime_budget) / 100 : null,
          optimization_goal: x.optimization_goal,
          bid_strategy: x.bid_strategy,
          start_time: x.start_time,
          end_time: x.end_time,
          targeting: x.targeting,
          results: adsInsights(x.insights?.data ?? [])[0] ?? null,
        })),
      });
    }),
});

export const listMetaAds = defineTool({
  name: "list_meta_ads",
  title: "List Meta ads",
  description:
    "Reklamy w zestawie / kampanii / koncie: nazwa, status, kreacja (miniatura), wyniki za okres. Tylko administrator/operator.",
  inputSchema: {
    parent_id: z.string().min(3).describe("Id zestawu, kampanii albo konta (act_…)."),
    date_preset: z.string().default("last_30d"),
    limit: z.number().int().min(1).max(200).optional(),
    preview: z.boolean().default(false).describe("Pokaż w czacie do 4 miniatur kreacji."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const parent =
        /^\d+$/.test(a.parent_id) && a.parent_id.length <= 16 ? m.actId(a.parent_id) : a.parent_id;
      const rows = await m.listAds(parent, {
        datePreset: a.date_preset,
        limit: clampLimit(a.limit, 50, 200),
      });
      const images = a.preview
        ? await previewImages(rows.map((x: any) => x?.creative?.thumbnail_url))
        : [];
      const ads = rows.map((x: any) => ({
        ad_id: x.id,
        name: x.name,
        adset_id: x.adset_id,
        campaign_id: x.campaign_id,
        status: x.status,
        effective_status: x.effective_status,
        created_time: x.created_time,
        creative: x.creative
          ? { id: x.creative.id, name: x.creative.name, thumbnail_url: x.creative.thumbnail_url }
          : null,
        results: adsInsights(x.insights?.data ?? [])[0] ?? null,
      }));
      return okWith({ ads }, images);
    }),
});

export const getMetaAdsInsights = defineTool({
  name: "get_meta_ads_insights",
  title: "Get Meta ads insights (any level)",
  description:
    "Wyniki reklamowe dla konta / kampanii / zestawu / reklamy w okresie (preset albo zakres dat), opcjonalnie z podziałem (age, gender, publisher_platform, region, dzień). Tylko administrator/operator.",
  inputSchema: {
    object_id: z
      .string()
      .min(3)
      .describe("Id konta (act_… lub liczba), kampanii, zestawu albo reklamy."),
    date_preset: z
      .string()
      .optional()
      .describe("np. last_7d, last_30d, this_month; pomiń, gdy podajesz since/until."),
    since: z.string().optional(),
    until: z.string().optional(),
    level: z.enum(["account", "campaign", "adset", "ad"]).optional(),
    breakdowns: z
      .string()
      .optional()
      .describe("np. age,gender albo publisher_platform albo region"),
    time_increment: z
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .describe("Podział na dni (1 = dziennie)."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.getAdsInsights(a.object_id, {
        datePreset: a.date_preset,
        since: isoDate(a.since, "since"),
        until: isoDate(a.until, "until"),
        level: a.level,
        breakdowns: a.breakdowns,
        fields: a.time_increment ? undefined : undefined,
      });
      return ok({ rows: adsInsights(rows) });
    }),
});

export const updateMetaAdStatus = defineTool({
  name: "update_meta_ad_status",
  title: "Pause / activate / archive campaign, ad set or ad",
  description:
    "Zmienia status obiektu reklamowego (kampania, zestaw, reklama): ACTIVE (wznów — zaczyna wydawać budżet), PAUSED, ARCHIVED. Tylko administrator.",
  inputSchema: { object_id: z.string().min(5), status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]) },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ object_id, status }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const m = await import("@/lib/meta-api.server");
      const r = await m.updateAdObject(object_id, { status });
      await s.from("automation_events").insert({
        automation_type: "meta_ads_status_mcp",
        status: "sent",
        sent_payload: { object_id, status, actor: actorId(ctx) },
        response_payload: r,
      });
      return ok({ ok: true, object_id, status, response: r });
    }),
});

export const updateMetaAdBudget = defineTool({
  name: "update_meta_ad_budget",
  title: "Update campaign / ad set budget or name",
  description:
    "Zmienia budżet dzienny lub całkowity (w PLN) albo nazwę kampanii / zestawu reklam. Tylko administrator.",
  inputSchema: {
    object_id: z.string().min(5),
    daily_budget_pln: z.number().min(1).optional(),
    lifetime_budget_pln: z.number().min(1).optional(),
    name: z.string().max(200).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const m = await import("@/lib/meta-api.server");
      const r = await m.updateAdObject(a.object_id, {
        daily_budget_pln: a.daily_budget_pln,
        lifetime_budget_pln: a.lifetime_budget_pln,
        name: a.name,
      });
      await s.from("automation_events").insert({
        automation_type: "meta_ads_budget_mcp",
        status: "sent",
        sent_payload: { ...a, actor: actorId(ctx) },
        response_payload: r,
      });
      return ok({ ok: true, object_id: a.object_id, response: r });
    }),
});

export const syncMetaAds = defineTool({
  name: "sync_meta_ads",
  title: "Sync Meta ad accounts & campaigns to CRM",
  description:
    "Pobiera z API konta reklamowe i kampanie z wynikami (maximum) i zapisuje w tabelach panelu (meta_ad_accounts, meta_campaigns) — to samo co przycisk synchronizacji w /admin/meta. Tylko administrator/operator.",
  inputSchema: {},
  annotations: WRITE_IDEMPOTENT,
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const m = await import("@/lib/meta-api.server");
      const accounts = await m.listAdAccounts();
      const now = new Date().toISOString();
      let campaignsSynced = 0;
      const errors: string[] = [];
      for (const a of accounts) {
        const metaAccountId = a.account_id ?? String(a.id ?? "").replace("act_", "");
        const { data: accRow, error } = await s
          .from("meta_ad_accounts")
          .upsert(
            {
              meta_account_id: metaAccountId,
              name: a.name,
              currency: a.currency,
              account_status: a.account_status,
              business_name: a.business_name,
              amount_spent: Number(a.amount_spent ?? 0) / 100,
              balance: Number(a.balance ?? 0) / 100,
              last_synced_at: now,
            },
            { onConflict: "meta_account_id" },
          )
          .select("id")
          .single();
        if (error || !accRow) {
          errors.push(`${metaAccountId}: ${error?.message ?? "upsert"}`);
          continue;
        }
        try {
          const camps = await m.listCampaigns(metaAccountId, { datePreset: "maximum", limit: 200 });
          for (const c of camps) {
            const ins = c.insights?.data?.[0] ?? {};
            const lead = (ins.actions ?? []).find((x: any) => x.action_type === "lead");
            const cpl = (ins.cost_per_action_type ?? []).find((x: any) => x.action_type === "lead");
            const { error: cErr } = await s.from("meta_campaigns").upsert(
              {
                meta_campaign_id: c.id,
                ad_account_id: accRow.id,
                name: c.name,
                objective: c.objective,
                status: c.status,
                daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
                lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
                start_time: c.start_time,
                stop_time: c.stop_time,
                spend: Number(ins.spend ?? 0),
                impressions: Number(ins.impressions ?? 0),
                clicks: Number(ins.clicks ?? 0),
                ctr: Number(ins.ctr ?? 0),
                cpc: Number(ins.cpc ?? 0),
                leads_count: Number(lead?.value ?? 0),
                cost_per_lead: Number(cpl?.value ?? 0),
                last_synced_at: now,
              },
              { onConflict: "meta_campaign_id" },
            );
            if (cErr) errors.push(`${c.id}: ${cErr.message}`);
            else campaignsSynced += 1;
          }
        } catch (e) {
          errors.push(`${metaAccountId} campaigns: ${(e as Error).message}`);
        }
      }
      return ok({ ok: true, accounts: accounts.length, campaigns_synced: campaignsSynced, errors });
    }),
});

// ── Formularze leadów ───────────────────────────────────────────────────────

export const listMetaLeadForms = defineTool({
  name: "list_meta_lead_forms_live",
  title: "List Meta lead forms (API)",
  description:
    "Formularze Lead Ads strony prosto z API: nazwa, status, liczba leadów, data. Przypisania i statystyki lokalne: tabela meta_lead_forms w panelu. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.listLeadgenForms();
      return ok({
        forms: rows.map((f: any) => ({
          form_id: f.id,
          name: f.name,
          status: f.status,
          leads_count: f.leads_count,
          created_time: f.created_time,
          locale: f.locale,
        })),
      });
    }),
});

export const getMetaFormLeads = defineTool({
  name: "get_meta_form_leads",
  title: "Get leads of a Meta lead form (API)",
  description:
    "Zgłoszenia z formularza Lead Ads prosto z API (pola odpowiedzi, reklama, kampania, czas). Zsynchronizowane leady w CRM daje `list_meta_leads`. Tylko administrator/operator.",
  inputSchema: {
    form_id: z.string().min(5),
    limit: z.number().int().min(1).max(100).optional(),
    since: z.string().optional(),
  },
  annotations: READ,
  handler: ({ form_id, limit, since }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/meta-api.server");
      const rows = await m.listFormLeads(form_id, {
        limit: clampLimit(limit, 25, 100),
        since: isoDate(since, "since"),
      });
      return ok({
        leads: rows.map((l: any) => ({
          lead_id: l.id,
          created_time: l.created_time,
          fields: Object.fromEntries(
            (l.field_data ?? []).map((f: any) => [
              f.name,
              Array.isArray(f.values) ? f.values.join(", ") : f.values,
            ]),
          ),
          ad_id: l.ad_id,
          ad_name: l.ad_name,
          campaign_id: l.campaign_id,
          campaign_name: l.campaign_name,
          is_organic: l.is_organic,
          platform: l.platform,
        })),
      });
    }),
});

export const syncMetaLeads = defineTool({
  name: "sync_meta_leads",
  title: "Pull new Meta leads into CRM now",
  description:
    "Uruchamia pobranie nowych leadów z formularzy Meta do CRM (to samo co tick co minutę): zakłada leady i wnioski. UWAGA: dla nowych leadów odpala standardową obsługę (SMS powitalny, telefon voicebota wg ustawień). Tylko administrator/operator.",
  inputSchema: {},
  annotations: { ...WRITE, openWorldHint: true },
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { runMetaLeadsSync } = await import("@/lib/meta-leads-sync.server");
      return ok(await runMetaLeadsSync());
    }),
});

// ── Conversions API ─────────────────────────────────────────────────────────

export const sendMetaConversionEvent = defineTool({
  name: "send_meta_conversion_event",
  title: "Send Meta Conversions API event",
  description:
    "Wysyła zdarzenie konwersji do piksela Meta (Conversions API): nazwa zdarzenia (Lead, Purchase, CompleteRegistration…), dane użytkownika (e-mail, telefon — haszowane po stronie serwera), wartość, kod testowy. Tylko administrator.",
  inputSchema: {
    pixel_id: z.string().min(5),
    event_name: z.string().min(2).max(60),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    external_id: z.string().optional(),
    event_source_url: z.string().url().optional(),
    action_source: z
      .enum(["website", "system_generated", "phone_call", "chat", "email", "other"])
      .default("system_generated"),
    value: z.number().optional(),
    currency: z.string().length(3).optional(),
    custom_data: z.record(z.string(), z.unknown()).optional(),
    test_event_code: z.string().optional(),
  },
  annotations: { ...WRITE, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const m = await import("@/lib/meta-api.server");
      const custom = {
        ...(a.custom_data ?? {}),
        ...(a.value !== undefined ? { value: a.value, currency: a.currency ?? "PLN" } : {}),
      };
      const r = await m.sendConversionEvent({
        pixelId: a.pixel_id,
        eventName: a.event_name,
        eventSourceUrl: a.event_source_url,
        actionSource: a.action_source,
        user: {
          email: a.email,
          phone: a.phone,
          firstName: a.first_name,
          lastName: a.last_name,
          externalId: a.external_id,
        },
        customData: Object.keys(custom).length ? custom : undefined,
        testEventCode: a.test_event_code,
      });
      await s
        .from("meta_capi_events")
        .insert({
          pixel_id: a.pixel_id,
          event_name: a.event_name,
          event_id: r.eventId,
          status: "sent",
          value: a.value ?? null,
          currency: a.currency ?? null,
          payload: { source: "mcp", actor: actorId(ctx) },
          response: r.response,
          sent_at: new Date().toISOString(),
        })
        .then(
          () => undefined,
          () => undefined,
        );
      return ok({ ok: true, event_id: r.eventId, response: r.response });
    }),
});

// ── Ogólne wywołanie Graph ──────────────────────────────────────────────────

export const metaApiRequest = defineTool({
  name: "meta_api_request",
  title: "Meta Graph API request (generic)",
  description:
    "Dowolne wywołanie Graph API (ścieżka bez wersji, np. `me/accounts`, `{page-id}/feed`, `act_123/adsets`; GET/POST/DELETE; parametry; pola formularza) z wybranym tokenem (page / ig / user / pixel). Tokeny zostają na serwerze. Tylko administrator.",
  inputSchema: {
    method: z.enum(["GET", "POST", "DELETE"]).default("GET"),
    path: z.string().min(2).max(300),
    token: z.enum(["page", "ig", "user", "pixel"]).default("page"),
    query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    form: z.record(z.string(), z.unknown()).optional(),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const m = await import("@/lib/meta-api.server");
      const json = await m.graphRequest(a.path, {
        method: a.method,
        query: a.query,
        form: a.form,
        token: a.token,
      });
      const text = JSON.stringify(json);
      return ok(text.length > 20000 ? { truncated: true, body: text.slice(0, 20000) } : json);
    }),
});

export const metaRefreshTokens = defineTool({
  name: "meta_refresh_tokens",
  title: "Refresh Meta tokens from system user",
  description:
    "Wymusza wyprowadzenie tokenów strony / Instagrama z tokena użytkownika systemowego (META_SYSTEM_USER_TOKEN) i pokazuje zdrowie wszystkich tokenów Meta (ważność, wygaśnięcie, zakresy). Użyj po dodaniu sekretu albo gdy meta_status zgłasza nieważny token. Tylko administrator.",
  inputSchema: {},
  annotations: WRITE_IDEMPOTENT,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const { ensureMetaTokens, metaTokenHealth } = await import("@/lib/meta-tokens.server");
      const state = await ensureMetaTokens({ force: true });
      const health = await metaTokenHealth();
      return ok({
        page_id: state.pageId,
        page_name: state.pageName,
        ig_user_id: state.igUserId,
        replaced_in_process: state.replaced,
        ...health,
        note:
          state.source === "system_user"
            ? "Tokeny wyprowadzone z użytkownika systemowego działają w tym procesie; każdy nowy proces serwera wyprowadza je sam przy pierwszym wywołaniu Graph."
            : "Brak META_SYSTEM_USER_TOKEN albo nie było potrzeby podmiany — patrz warnings.",
      });
    }),
});

export const metaTools = [
  metaRefreshTokens,
  metaStatus,
  listFacebookPosts,
  getFacebookPost,
  getFacebookPageInsights,
  listFacebookComments,
  publishFacebookPostTool,
  deleteFacebookPost,
  replyFacebookComment,
  hideFacebookComment,
  listInstagramMedia,
  getInstagramMedia,
  getInstagramAccountInsights,
  listInstagramComments,
  replyInstagramComment,
  hideInstagramComment,
  publishInstagramPost,
  publishInstagramContainer,
  listMessengerConversations,
  getMessengerConversation,
  listMetaAdAccounts,
  getMetaCampaignsLive,
  listMetaAdsets,
  listMetaAds,
  getMetaAdsInsights,
  updateMetaAdStatus,
  updateMetaAdBudget,
  syncMetaAds,
  listMetaLeadForms,
  getMetaFormLeads,
  syncMetaLeads,
  sendMetaConversionEvent,
  metaApiRequest,
];
