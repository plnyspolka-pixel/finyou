// YouTube Shorts — OAuth 2.0 kanału + upload przez YouTube Data API v3.
//
// Short to zwykły upload videos.insert: pionowe wideo (9:16) do 3 minut YouTube
// klasyfikuje jako Short automatycznie; hasztag #Shorts w tytule pomaga.
//
// Konfiguracja (Cloudflare secrets):
//   YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET — klient OAuth z Google Cloud
//   YOUTUBE_REDIRECT_URI (opcjonalnie) — domyślnie produkcyjny callback
// Refresh token kanału trzymamy w tabeli youtube_integration (service_role),
// zdobywany jednym kliknięciem „Połącz z YouTube" w /admin/youtube-shorts.
//
// Limity: videos.insert = 1600 jednostek z dziennych 10 000 (~6 uploadów/dobę),
// stąd MAX_UPLOADS_PER_TICK = 2 i retry z odroczeniem zamiast pętli.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const YT_API = "https://www.googleapis.com/youtube/v3";
const YT_UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

// Bufor zamiast streamingu: resumable PUT wymaga znanego Content-Length,
// a shorty z HeyGen mają kilkanaście–kilkadziesiąt MB. Twardy limit chroni
// pamięć workera (128 MB).
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_UPLOADS_PER_TICK = 2;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MIN = 30;

export function getYoutubeEnv() {
  const clientId = process.env.YOUTUBE_CLIENT_ID || "";
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";
  const redirectUri =
    process.env.YOUTUBE_REDIRECT_URI || "https://financeyou.pl/api/public/youtube-oauth-callback";
  return { clientId, clientSecret, redirectUri, configured: !!(clientId && clientSecret) };
}

type IntegrationRow = {
  id: number;
  refresh_token: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
  channel_id: string | null;
  channel_title: string | null;
  oauth_state: string | null;
  oauth_state_expires_at: string | null;
  connected_at: string | null;
  last_error: string | null;
};

export async function getIntegrationRow(): Promise<IntegrationRow> {
  const { data, error } = await supabaseAdmin
    .from("youtube_integration")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as IntegrationRow;
  const { data: created, error: insErr } = await supabaseAdmin
    .from("youtube_integration")
    .insert({ id: 1 })
    .select("*")
    .single();
  if (insErr) throw new Error(insErr.message);
  return created as IntegrationRow;
}

type IntegrationPatch = Partial<Omit<IntegrationRow, "id">>;

async function patchIntegration(patch: IntegrationPatch) {
  const { error } = await supabaseAdmin.from("youtube_integration").update(patch).eq("id", 1);
  if (error) throw new Error(error.message);
}

// ── OAuth ────────────────────────────────────────────────────────────────────

export async function buildConnectUrl(): Promise<string> {
  const { clientId, redirectUri, configured } = getYoutubeEnv();
  if (!configured) {
    throw new Error("Brak YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET w zmiennych środowiskowych.");
  }
  await getIntegrationRow();
  const state = crypto.randomUUID();
  await patchIntegration({
    oauth_state: state,
    oauth_state_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: OAUTH_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${OAUTH_AUTH_URL}?${params}`;
}

export async function handleOauthCallback(code: string, state: string): Promise<void> {
  const { clientId, clientSecret, redirectUri } = getYoutubeEnv();
  const row = await getIntegrationRow();
  if (
    !row.oauth_state ||
    row.oauth_state !== state ||
    !row.oauth_state_expires_at ||
    new Date(row.oauth_state_expires_at).getTime() < Date.now()
  ) {
    throw new Error("Nieprawidłowy lub wygasły stan OAuth — spróbuj połączyć ponownie.");
  }

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Wymiana kodu OAuth nieudana: ${json.error ?? res.status} ${json.error_description ?? ""}`,
    );
  }
  if (!json.refresh_token) {
    throw new Error(
      "Google nie zwrócił refresh tokena. Odepnij aplikację na https://myaccount.google.com/permissions i połącz ponownie.",
    );
  }

  // Nazwa kanału do panelu (scope youtube.readonly).
  let channelId: string | null = null;
  let channelTitle: string | null = null;
  try {
    const chRes = await fetch(`${YT_API}/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    const chJson = (await chRes.json()) as {
      items?: Array<{ id: string; snippet?: { title?: string } }>;
    };
    channelId = chJson.items?.[0]?.id ?? null;
    channelTitle = chJson.items?.[0]?.snippet?.title ?? null;
  } catch {
    // Brak nazwy kanału nie blokuje połączenia.
  }

  await patchIntegration({
    refresh_token: json.refresh_token,
    access_token: json.access_token,
    access_token_expires_at: new Date(
      Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
    ).toISOString(),
    channel_id: channelId,
    channel_title: channelTitle,
    oauth_state: null,
    oauth_state_expires_at: null,
    connected_at: new Date().toISOString(),
    last_error: null,
  });
}

export async function disconnectYoutubeChannel(): Promise<void> {
  const row = await getIntegrationRow();
  if (row.refresh_token) {
    // Unieważnij grant po stronie Google; porażka nie blokuje odpięcia lokalnie.
    try {
      await fetch(`${OAUTH_REVOKE_URL}?token=${encodeURIComponent(row.refresh_token)}`, {
        method: "POST",
      });
    } catch {
      /* noop */
    }
  }
  await patchIntegration({
    refresh_token: null,
    access_token: null,
    access_token_expires_at: null,
    channel_id: null,
    channel_title: null,
    connected_at: null,
    last_error: null,
  });
}

async function getAccessToken(): Promise<string> {
  const { clientId, clientSecret, configured } = getYoutubeEnv();
  if (!configured) throw new Error("Brak konfiguracji YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET.");
  const row = await getIntegrationRow();
  if (!row.refresh_token) throw new Error("Kanał YouTube nie jest połączony.");
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
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    const msg = `Odświeżenie tokena nieudane: ${json.error ?? res.status} ${json.error_description ?? ""}`;
    // invalid_grant = cofnięta zgoda / wygasły token — wymaga ponownego połączenia.
    await patchIntegration({ last_error: msg });
    throw new Error(msg);
  }
  await patchIntegration({
    access_token: json.access_token,
    access_token_expires_at: new Date(
      Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
    ).toISOString(),
    last_error: null,
  });
  return json.access_token;
}

// ── Upload ───────────────────────────────────────────────────────────────────

export type QueueRow = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  source_video_url: string;
  privacy_status: string;
  scheduled_at: string;
  status: string;
  attempt_count: number;
  youtube_video_id: string | null;
  last_error: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function shortsTitle(title: string): string {
  const t = title.trim();
  const withTag = /#shorts/i.test(t) ? t : `${t} #Shorts`;
  return withTag.length <= 100 ? withTag : t.slice(0, 100);
}

async function uploadShort(item: QueueRow): Promise<string> {
  const accessToken = await getAccessToken();

  const videoRes = await fetch(item.source_video_url);
  if (!videoRes.ok) throw new Error(`Pobranie wideo nieudane: HTTP ${videoRes.status}`);
  const declared = Number(videoRes.headers.get("content-length") || 0);
  if (declared > MAX_VIDEO_BYTES) {
    throw new Error(`Plik za duży (${Math.round(declared / 1e6)} MB, limit 100 MB).`);
  }
  const videoBytes = await videoRes.arrayBuffer();
  if (videoBytes.byteLength > MAX_VIDEO_BYTES) {
    throw new Error(`Plik za duży (${Math.round(videoBytes.byteLength / 1e6)} MB, limit 100 MB).`);
  }

  const initRes = await fetch(YT_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(videoBytes.byteLength),
    },
    body: JSON.stringify({
      snippet: {
        title: shortsTitle(item.title),
        description: item.description,
        tags: item.tags?.length ? item.tags : undefined,
        // 27 = Education (finanse/edukacja); YouTube i tak klasyfikuje Shorta po formacie.
        categoryId: "27",
        defaultLanguage: "pl",
        defaultAudioLanguage: "pl",
      },
      status: {
        privacyStatus: item.privacy_status,
        selfDeclaredMadeForKids: false,
      },
    }),
  });
  if (!initRes.ok) {
    const t = await initRes.text();
    throw new Error(`Inicjacja uploadu nieudana: HTTP ${initRes.status} ${t.slice(0, 500)}`);
  }
  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) throw new Error("Brak nagłówka Location w odpowiedzi inicjującej upload.");

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(videoBytes.byteLength) },
    body: videoBytes,
  });
  if (!putRes.ok) {
    const t = await putRes.text();
    throw new Error(`Upload nieudany: HTTP ${putRes.status} ${t.slice(0, 500)}`);
  }
  const uploaded = (await putRes.json()) as { id?: string };
  if (!uploaded.id) throw new Error("YouTube nie zwrócił ID filmu.");
  return uploaded.id;
}

// Publikacja jednego wpisu kolejki: optymistyczne przejęcie (pending →
// uploading) chroni przed podwójnym uploadem przy nakładających się tickach.
export async function processQueueItem(
  id: string,
): Promise<{ ok: boolean; videoId?: string; error?: string }> {
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("youtube_publish_queue")
    .update({ status: "uploading" })
    .eq("id", id)
    .in("status", ["pending", "failed"])
    .select("*")
    .maybeSingle();
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed) return { ok: false, error: "Wpis nie jest w stanie do publikacji." };

  const item = claimed as QueueRow;
  try {
    const videoId = await uploadShort(item);
    await supabaseAdmin
      .from("youtube_publish_queue")
      .update({
        status: "published",
        youtube_video_id: videoId,
        published_at: new Date().toISOString(),
        last_error: null,
        attempt_count: item.attempt_count + 1,
      })
      .eq("id", id);
    return { ok: true, videoId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const attempts = item.attempt_count + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await supabaseAdmin
      .from("youtube_publish_queue")
      .update({
        status: exhausted ? "failed" : "pending",
        attempt_count: attempts,
        last_error: msg,
        // Odrocz kolejną próbę, żeby nie mielić limitu API na tym samym błędzie.
        ...(exhausted
          ? {}
          : { scheduled_at: new Date(Date.now() + RETRY_DELAY_MIN * 60 * 1000).toISOString() }),
      })
      .eq("id", id);
    return { ok: false, error: msg };
  }
}

export async function runYoutubeShortsTick(): Promise<{
  ok: boolean;
  processed: number;
  published: number;
  errors: string[];
}> {
  const row = await getIntegrationRow();
  if (!row.refresh_token) return { ok: true, processed: 0, published: 0, errors: [] };

  const { data: due, error } = await supabaseAdmin
    .from("youtube_publish_queue")
    .select("id")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(MAX_UPLOADS_PER_TICK);
  if (error) throw new Error(error.message);

  let published = 0;
  const errors: string[] = [];
  for (const item of due ?? []) {
    const result = await processQueueItem(item.id);
    if (result.ok) published += 1;
    else if (result.error) errors.push(result.error);
  }
  return { ok: true, processed: (due ?? []).length, published, errors };
}
