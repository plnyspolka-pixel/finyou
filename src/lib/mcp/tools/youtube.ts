// YouTube — kanał, filmy i statystyki, edycja metadanych, komentarze,
// playlisty, kolejka publikacji Shorts, ogólne wywołanie API.
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

function videoSummary(v: any) {
  return {
    video_id: v?.id,
    title: v?.snippet?.title,
    published_at: v?.snippet?.publishedAt,
    privacy_status: v?.status?.privacyStatus,
    upload_status: v?.status?.uploadStatus,
    duration: v?.contentDetails?.duration,
    views: Number(v?.statistics?.viewCount ?? 0),
    likes: Number(v?.statistics?.likeCount ?? 0),
    comments: Number(v?.statistics?.commentCount ?? 0),
    tags: v?.snippet?.tags ?? [],
    thumbnail: v?.snippet?.thumbnails?.high?.url ?? v?.snippet?.thumbnails?.default?.url ?? null,
    url: v?.id ? `https://www.youtube.com/watch?v=${v.id}` : null,
  };
}

export const youtubeStatus = defineTool({
  name: "youtube_status",
  title: "YouTube status",
  description:
    "Stan integracji YouTube: czy klient OAuth jest skonfigurowany i kanał połączony, dane kanału (nazwa, subskrybenci, filmy, wyświetlenia), ostatni błąd, kolejka Shorts po statusie. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const { getYoutubeEnv, getIntegrationRow } = await import("@/lib/youtube-shorts.server");
      const env = getYoutubeEnv();
      const row = await getIntegrationRow();
      const errors: string[] = [];
      let channel: any = null;
      if (env.configured && row.refresh_token) {
        try {
          const yt = await import("@/lib/youtube-api.server");
          const ch = await yt.getMyChannel();
          channel = ch
            ? {
                channel_id: ch.id,
                title: ch.snippet?.title,
                custom_url: ch.snippet?.customUrl,
                subscribers: Number(ch.statistics?.subscriberCount ?? 0),
                videos: Number(ch.statistics?.videoCount ?? 0),
                views: Number(ch.statistics?.viewCount ?? 0),
              }
            : null;
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
      const { data: queue } = await s.from("youtube_publish_queue").select("status");
      const byStatus: Record<string, number> = {};
      for (const q of (queue ?? []) as { status: string }[])
        byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
      return ok({
        oauth_configured: env.configured,
        connected: Boolean(row.refresh_token),
        connected_at: row.connected_at,
        channel_title: row.channel_title,
        last_error: row.last_error,
        channel,
        queue_by_status: byStatus,
        errors,
      });
    }),
});

export const listYoutubeVideos = defineTool({
  name: "list_youtube_videos",
  title: "List channel videos",
  description:
    "Filmy na kanale (najnowsze pierwsze) ze statystykami: wyświetlenia, polubienia, komentarze, prywatność, długość. Stronicowanie `page_token`. Tylko administrator/operator.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional(),
    page_token: z.string().optional(),
    preview: z.boolean().default(false).describe("Pokaż w czacie do 4 miniatur z wyniku."),
  },
  annotations: READ,
  handler: ({ limit, page_token, preview }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const yt = await import("@/lib/youtube-api.server");
      const r = await yt.listMyVideos({ limit: clampLimit(limit, 25, 50), pageToken: page_token });
      const videos = r.videos.map(videoSummary);
      const { fetchImageBlocks } = await import("@/lib/media-storage.server");
      const images = preview
        ? await fetchImageBlocks(
            videos.map((v) => v.thumbnail),
            { max: 4 },
          )
        : [];
      return okWith({ videos, next_page_token: r.nextPageToken }, images);
    }),
});

export const searchYoutubeVideos = defineTool({
  name: "search_youtube_videos",
  title: "Search my videos",
  description: "Szukanie filmów na kanale po frazie (tytuł/opis). Tylko administrator/operator.",
  inputSchema: { query: z.string().min(2), limit: z.number().int().min(1).max(50).optional() },
  annotations: READ,
  handler: ({ query, limit }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const yt = await import("@/lib/youtube-api.server");
      const videos = await yt.searchMyVideos(query, clampLimit(limit, 25, 50));
      return ok({ videos: videos.map(videoSummary) });
    }),
});

export const getYoutubeVideo = defineTool({
  name: "get_youtube_video",
  title: "Get video details",
  description:
    "Pełne dane filmu: tytuł, opis, tagi, kategoria, prywatność, statystyki, długość, status przetwarzania. Tylko administrator/operator.",
  inputSchema: {
    video_id: z.string().min(5),
    preview: z.boolean().default(true).describe("Pokaż miniaturę filmu w czacie."),
  },
  annotations: READ,
  handler: ({ video_id, preview }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const yt = await import("@/lib/youtube-api.server");
      const v = (await yt.listVideos([video_id]))[0];
      if (!v) return fail("Nie znaleziono filmu.");
      const summary = videoSummary(v);
      const { fetchImageBlock } = await import("@/lib/media-storage.server");
      const img = preview ? await fetchImageBlock(summary.thumbnail) : null;
      return okWith(
        {
          ...summary,
          description: v.snippet?.description,
          category_id: v.snippet?.categoryId,
          made_for_kids: v.status?.selfDeclaredMadeForKids,
          publish_at: v.status?.publishAt ?? null,
          license: v.status?.license,
        },
        img ? [img] : [],
      );
    }),
});

export const listYoutubeComments = defineTool({
  name: "list_youtube_comments",
  title: "List video comments",
  description:
    "Komentarze pod filmem (wątki z odpowiedziami): autor, treść, polubienia, data. Tylko administrator/operator.",
  inputSchema: {
    video_id: z.string().min(5),
    limit: z.number().int().min(1).max(100).optional(),
    order: z.enum(["time", "relevance"]).default("time"),
    search: z.string().optional(),
    page_token: z.string().optional(),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const yt = await import("@/lib/youtube-api.server");
      const r = await yt.listCommentThreads(a.video_id, {
        limit: clampLimit(a.limit, 30, 100),
        order: a.order,
        searchTerms: a.search,
        pageToken: a.page_token,
      });
      const mapC = (c: any) => ({
        comment_id: c?.id,
        author: c?.snippet?.authorDisplayName,
        text: snippet(c?.snippet?.textDisplay ?? c?.snippet?.textOriginal, 1000),
        likes: c?.snippet?.likeCount,
        published_at: c?.snippet?.publishedAt,
      });
      return ok({
        threads: r.threads.map((t: any) => ({
          ...mapC(t?.snippet?.topLevelComment),
          reply_count: t?.snippet?.totalReplyCount ?? 0,
          replies: (t?.replies?.comments ?? []).map(mapC),
        })),
        next_page_token: r.nextPageToken,
      });
    }),
});

export const listYoutubePlaylists = defineTool({
  name: "list_youtube_playlists",
  title: "List playlists",
  description: "Playlisty kanału: tytuł, liczba filmów, prywatność. Tylko administrator/operator.",
  inputSchema: { limit: z.number().int().min(1).max(50).optional() },
  annotations: READ,
  handler: ({ limit }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const yt = await import("@/lib/youtube-api.server");
      const rows = await yt.listPlaylists(clampLimit(limit, 25, 50));
      return ok({
        playlists: rows.map((p: any) => ({
          playlist_id: p.id,
          title: p.snippet?.title,
          items: p.contentDetails?.itemCount,
          privacy_status: p.status?.privacyStatus,
          url: `https://www.youtube.com/playlist?list=${p.id}`,
        })),
      });
    }),
});

export const updateYoutubeVideo = defineTool({
  name: "update_youtube_video",
  title: "Update video metadata",
  description:
    "Zmienia tytuł, opis, tagi, kategorię, prywatność (public / unlisted / private) albo termin publikacji filmu. Zmiana prywatności na public jest widoczna od razu. Wymaga zakresu youtube.force-ssl (ponowne połączenie kanału po aktualizacji). Tylko administrator/operator.",
  inputSchema: {
    video_id: z.string().min(5),
    title: z.string().min(1).max(100).optional(),
    description: z.string().max(5000).optional(),
    tags: z.array(z.string().min(1)).max(50).optional(),
    category_id: z.string().max(5).optional(),
    privacy_status: z.enum(["public", "unlisted", "private"]).optional(),
    publish_at: z
      .string()
      .optional()
      .describe("Zaplanowana publikacja (ISO 8601; film musi być private)."),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const yt = await import("@/lib/youtube-api.server");
      const v = await yt.updateVideo(a.video_id, {
        title: a.title,
        description: a.description,
        tags: a.tags,
        categoryId: a.category_id,
        privacyStatus: a.privacy_status,
        publishAt: isoDate(a.publish_at, "publish_at"),
      });
      return ok({ ok: true, video: videoSummary(v) });
    }),
});

export const replyYoutubeComment = defineTool({
  name: "reply_youtube_comment",
  title: "Reply to a YouTube comment",
  description:
    "Publikuje odpowiedź pod komentarzem (widoczna publicznie od razu) — użyj tylko po tym, jak użytkownik zobaczył treść i kazał wysłać. Wymaga zakresu youtube.force-ssl. Tylko administrator/operator.",
  inputSchema: { comment_id: z.string().min(5), text: z.string().min(1).max(10000) },
  annotations: SENDS,
  handler: ({ comment_id, text }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const yt = await import("@/lib/youtube-api.server");
      const c = await yt.replyToComment(comment_id, text);
      return ok({ ok: true, reply_id: c?.id, actor: actorId(ctx) });
    }),
});

export const deleteYoutubeVideo = defineTool({
  name: "delete_youtube_video",
  title: "Delete video",
  description: "Usuwa film z kanału — nieodwracalnie. Tylko administrator.",
  inputSchema: { video_id: z.string().min(5) },
  annotations: DESTRUCTIVE,
  handler: ({ video_id }, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const yt = await import("@/lib/youtube-api.server");
      await yt.deleteVideo(video_id);
      return ok({ ok: true, deleted: video_id });
    }),
});

export const queueYoutubePublication = defineTool({
  name: "queue_youtube_publication",
  title: "Queue a Short for publication",
  description:
    "Dodaje film (MP4 pod adresem https, do 100 MB, pion 9:16) do kolejki publikacji Shorts: tytuł (dostaje #Shorts), opis, tagi, prywatność, termin. Tick opublikuje go o zadanej porze bez dalszego udziału człowieka. Tylko administrator/operator.",
  inputSchema: {
    title: z.string().min(1).max(100),
    source_video_url: z.string().url(),
    description: z.string().max(5000).default(""),
    tags: z.array(z.string().min(1)).max(30).optional(),
    privacy_status: z.enum(["public", "unlisted", "private"]).default("public"),
    scheduled_at: z
      .string()
      .optional()
      .describe("Kiedy opublikować (ISO 8601); domyślnie od razu w najbliższym ticku."),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      if (!/^https:\/\//.test(a.source_video_url))
        return fail("URL wideo musi zaczynać się od https://");
      const { data, error } = await s
        .from("youtube_publish_queue")
        .insert({
          title: a.title.trim(),
          description: a.description,
          tags: a.tags ?? [],
          source_video_url: a.source_video_url.trim(),
          privacy_status: a.privacy_status,
          scheduled_at: isoDate(a.scheduled_at, "scheduled_at") ?? new Date().toISOString(),
          created_by: actorId(ctx),
        })
        .select("id, title, status, scheduled_at, privacy_status")
        .single();
      if (error) throw new Error(`youtube_publish_queue: ${error.message}`);
      return ok({ ok: true, queued: data });
    }),
});

export const cancelYoutubeQueueItem = defineTool({
  name: "cancel_youtube_queue_item",
  title: "Cancel queued Short",
  description:
    "Anuluje wpis w kolejce Shorts, który jeszcze nie został opublikowany (pending / failed). Tylko administrator/operator.",
  inputSchema: { queue_id: z.string().uuid() },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ queue_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("youtube_publish_queue")
        .update({ status: "cancelled" })
        .eq("id", queue_id)
        .in("status", ["pending", "failed"])
        .select("id, title, status")
        .maybeSingle();
      if (error) throw new Error(`youtube_publish_queue: ${error.message}`);
      if (!data) return fail("Wpis nie istnieje albo nie jest już do anulowania.");
      return ok({ ok: true, item: data });
    }),
});

export const publishYoutubeQueueItemNow = defineTool({
  name: "publish_youtube_queue_item_now",
  title: "Publish queued Short now",
  description:
    "Publikuje wpis z kolejki od razu (upload na kanał) zamiast czekać na termin. Realna publikacja. Tylko administrator/operator.",
  inputSchema: { queue_id: z.string().uuid() },
  annotations: SENDS,
  handler: ({ queue_id }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { processQueueItem } = await import("@/lib/youtube-shorts.server");
      const r = await processQueueItem(queue_id);
      return r.ok
        ? ok({
            ok: true,
            video_id: r.videoId,
            url: r.videoId ? `https://www.youtube.com/watch?v=${r.videoId}` : null,
          })
        : fail(r.error ?? "Publikacja nie powiodła się.");
    }),
});

export const youtubeApiRequest = defineTool({
  name: "youtube_api_request",
  title: "YouTube Data API request (generic)",
  description:
    "Dowolne wywołanie YouTube Data API v3 na tokenie kanału (ścieżka np. /videos, /channels, /commentThreads, /playlistItems; GET/POST/PUT/DELETE; parametry; body JSON). Tylko administrator.",
  inputSchema: {
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
    path: z.string().min(2).max(200),
    query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    json: z.record(z.string(), z.unknown()).optional(),
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
      const yt = await import("@/lib/youtube-api.server");
      const json = await yt.youtubeRequest(a.path, {
        method: a.method,
        query: a.query,
        json: a.json,
      });
      const text = JSON.stringify(json);
      return ok(text.length > 20000 ? { truncated: true, body: text.slice(0, 20000) } : json);
    }),
});

export const youtubeTools = [
  youtubeStatus,
  listYoutubeVideos,
  searchYoutubeVideos,
  getYoutubeVideo,
  listYoutubeComments,
  listYoutubePlaylists,
  updateYoutubeVideo,
  replyYoutubeComment,
  deleteYoutubeVideo,
  queueYoutubePublication,
  cancelYoutubeQueueItem,
  publishYoutubeQueueItemNow,
  youtubeApiRequest,
];
