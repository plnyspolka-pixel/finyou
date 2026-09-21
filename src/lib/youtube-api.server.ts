/**
 * Klient YouTube Data API v3 na tokenie OAuth kanału połączonego w panelu
 * (`youtube_integration`, odświeżanie przez refresh_token jak w
 * `youtube-shorts.server.ts`). Używany przez narzędzia MCP
 * (`src/lib/mcp/tools/youtube.ts`) i dostępny dla panelu.
 *
 * Uwaga na zakresy: upload i odczyt działają na dotychczasowych zgodach;
 * edycja filmów, odpowiedzi na komentarze i usuwanie wymagają zakresu
 * `youtube.force-ssl` — po jego dodaniu do `buildConnectUrl` trzeba raz
 * ponownie połączyć kanał w panelu.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getIntegrationRow, getYoutubeEnv } from "@/lib/youtube-shorts.server";

const API = "https://www.googleapis.com/youtube/v3";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_TIMEOUT_MS = 60_000;

export async function youtubeAccessToken(): Promise<string> {
  const { clientId, clientSecret, configured } = getYoutubeEnv();
  if (!configured) throw new Error("Brak konfiguracji YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET.");
  const row = await getIntegrationRow();
  if (!row.refresh_token)
    throw new Error("Kanał YouTube nie jest połączony (panel → YouTube Shorts → Połącz).");
  if (
    row.access_token &&
    row.access_token_expires_at &&
    new Date(row.access_token_expires_at).getTime() > Date.now()
  ) {
    return row.access_token;
  }
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    const msg =
      `Odświeżenie tokena YouTube nieudane: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim();
    await supabaseAdmin.from("youtube_integration").update({ last_error: msg }).eq("id", 1);
    throw new Error(msg);
  }
  await supabaseAdmin
    .from("youtube_integration")
    .update({
      access_token: json.access_token,
      access_token_expires_at: new Date(
        Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
      ).toISOString(),
      last_error: null,
    })
    .eq("id", 1);
  return json.access_token;
}

export type YoutubeRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  json?: unknown;
  timeoutMs?: number;
};

/** Ogólne wywołanie YouTube Data API v3, `path` np. `/videos`, `/commentThreads`. */
export async function youtubeRequest(path: string, opts: YoutubeRequestOptions = {}): Promise<any> {
  const clean = `/${path.replace(/^\/+/, "")}`;
  if (!/^\/[A-Za-z0-9_/.-]+$/.test(clean) || clean.includes(".."))
    throw new Error("Nieprawidłowa ścieżka YouTube API.");
  const token = await youtubeAccessToken();
  const url = new URL(API + clean);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    accept: "application/json",
  };
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return {};
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = json?.error?.errors?.[0]?.reason ?? "";
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    const hint =
      /insufficient|forbidden|scope/i.test(reason + msg) && res.status === 403
        ? " — brak zakresu OAuth; połącz kanał ponownie w panelu (YouTube Shorts → Połącz), żeby nadać uprawnienia do edycji i komentarzy."
        : "";
    throw new Error(`YouTube API ${res.status}${reason ? ` (${reason})` : ""}: ${msg}${hint}`);
  }
  return json;
}

// ── Kanał i filmy ───────────────────────────────────────────────────────────

export async function getMyChannel() {
  const json = await youtubeRequest("/channels", {
    query: { part: "snippet,statistics,contentDetails,brandingSettings", mine: true },
  });
  return (json?.items ?? [])[0] ?? null;
}

export async function getUploadsPlaylistId(): Promise<string> {
  const ch = await getMyChannel();
  const id = ch?.contentDetails?.relatedPlaylists?.uploads;
  if (!id) throw new Error("Nie udało się ustalić playlisty przesłanych filmów.");
  return id;
}

export async function listVideos(ids: string[]) {
  if (!ids.length) return [];
  const json = await youtubeRequest("/videos", {
    query: { part: "snippet,statistics,status,contentDetails", id: ids.join(","), maxResults: 50 },
  });
  return (json?.items ?? []) as any[];
}

export async function listMyVideos(opts: { limit?: number; pageToken?: string } = {}) {
  const playlistId = await getUploadsPlaylistId();
  const json = await youtubeRequest("/playlistItems", {
    query: {
      part: "contentDetails",
      playlistId,
      maxResults: Math.min(50, opts.limit ?? 25),
      pageToken: opts.pageToken,
    },
  });
  const ids = (json?.items ?? []).map((i: any) => i?.contentDetails?.videoId).filter(Boolean);
  const videos = await listVideos(ids);
  return { videos, nextPageToken: json?.nextPageToken ?? null };
}

export async function searchMyVideos(q: string, limit = 25) {
  const json = await youtubeRequest("/search", {
    query: { part: "id", forMine: true, type: "video", q, maxResults: Math.min(50, limit) },
  });
  const ids = (json?.items ?? []).map((i: any) => i?.id?.videoId).filter(Boolean);
  return listVideos(ids);
}

export async function updateVideo(
  videoId: string,
  patch: {
    title?: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
    privacyStatus?: "public" | "unlisted" | "private";
    publishAt?: string;
    madeForKids?: boolean;
  },
) {
  const current = (await listVideos([videoId]))[0];
  if (!current) throw new Error("Nie znaleziono filmu.");
  const snippet = {
    title: patch.title ?? current.snippet?.title,
    description: patch.description ?? current.snippet?.description ?? "",
    tags: patch.tags ?? current.snippet?.tags,
    categoryId: patch.categoryId ?? current.snippet?.categoryId,
    defaultLanguage: current.snippet?.defaultLanguage,
    defaultAudioLanguage: current.snippet?.defaultAudioLanguage,
  };
  const status = {
    privacyStatus: patch.privacyStatus ?? current.status?.privacyStatus,
    publishAt: patch.publishAt,
    selfDeclaredMadeForKids: patch.madeForKids ?? current.status?.selfDeclaredMadeForKids ?? false,
    embeddable: current.status?.embeddable,
    license: current.status?.license,
  };
  return youtubeRequest("/videos", {
    method: "PUT",
    query: { part: "snippet,status" },
    json: { id: videoId, snippet, status },
  });
}

export async function deleteVideo(videoId: string) {
  return youtubeRequest("/videos", { method: "DELETE", query: { id: videoId } });
}

// ── Komentarze i playlisty ──────────────────────────────────────────────────

export async function listCommentThreads(
  videoId: string,
  opts: {
    limit?: number;
    order?: "time" | "relevance";
    pageToken?: string;
    searchTerms?: string;
  } = {},
) {
  const json = await youtubeRequest("/commentThreads", {
    query: {
      part: "snippet,replies",
      videoId,
      maxResults: Math.min(100, opts.limit ?? 30),
      order: opts.order ?? "time",
      pageToken: opts.pageToken,
      searchTerms: opts.searchTerms,
      textFormat: "plainText",
    },
  });
  return { threads: (json?.items ?? []) as any[], nextPageToken: json?.nextPageToken ?? null };
}

export async function replyToComment(parentId: string, text: string) {
  return youtubeRequest("/comments", {
    method: "POST",
    query: { part: "snippet" },
    json: { snippet: { parentId, textOriginal: text } },
  });
}

export async function listPlaylists(limit = 25) {
  const json = await youtubeRequest("/playlists", {
    query: { part: "snippet,contentDetails,status", mine: true, maxResults: Math.min(50, limit) },
  });
  return (json?.items ?? []) as any[];
}
