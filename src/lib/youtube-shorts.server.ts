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
import { withOriginFilter } from "@/lib/autopilot/state.server";

const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const YT_API = "https://www.googleapis.com/youtube/v3";
const YT_UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  // Edycja filmów, odpowiedzi na komentarze i usuwanie (konektor MCP) —
  // po dodaniu zakresu kanał trzeba raz ponownie połączyć w panelu.
  "https://www.googleapis.com/auth/youtube.force-ssl",
  // Search Console, GA4 i Indexing API dla konektora MCP (narzędzia Google) —
  // alternatywa dla konta usługi GOOGLE_SERVICE_ACCOUNT_JSON; wymaga
  // ponownego połączenia kanału kontem z dostępem do tych usług.
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/indexing",
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
  /** Moment przejęcia do uploadu (null = wpis sprzed śledzenia sesji). */
  upload_claimed_at?: string | null;
  /** Adres sesji resumable upload — zapisany zaraz po inicjacji. */
  upload_session_url?: string | null;
  upload_bytes?: number | null;
};

function shortsTitle(title: string): string {
  const t = title.trim();
  const withTag = /#shorts/i.test(t) ? t : `${t} #Shorts`;
  return withTag.length <= 100 ? withTag : t.slice(0, 100);
}

async function uploadShort(item: QueueRow): Promise<string> {
  const accessToken = await getAccessToken();

  // Kompresja do profilu publikacji (≤ 60 MB, H.264) — rzuca
  // VideoPreparingError, gdy plik jeszcze się przygotowuje.
  const { ensurePublishableVideo } = await import("./video-rendition.server");
  const sourceUrl = await ensurePublishableVideo(item.source_video_url);

  const videoRes = await fetch(sourceUrl);
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
        // Ujawnienie treści zmienionej/syntetycznej (awatar AI, lektor AI) –
        // wymóg YouTube i AI Act art. 50. Domyślnie true: kolejka zasilana jest
        // ze Studia (100% AI); materiał nagrany przez człowieka ma flagę false.
        containsSyntheticMedia:
          (item as { contains_synthetic_media?: boolean | null }).contains_synthetic_media !==
          false,
      },
    }),
  });
  if (!initRes.ok) {
    const t = await initRes.text();
    throw new Error(`Inicjacja uploadu nieudana: HTTP ${initRes.status} ${t.slice(0, 500)}`);
  }
  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) throw new Error("Brak nagłówka Location w odpowiedzi inicjującej upload.");
  // Adres sesji zapisany PRZED wysyłką pliku: gdy przebieg zostanie ucięty
  // w trakcie, tick zapyta YouTube o stan tej sesji (youtube-stalled-upload.ts)
  // zamiast zostawić wpis w `uploading` na zawsze albo zrobić duplikat.
  {
    const { error: saveErr } = await supabaseAdmin
      .from("youtube_publish_queue")
      .update({ upload_session_url: uploadUrl, upload_bytes: videoBytes.byteLength })
      .eq("id", item.id);
    if (saveErr) console.warn(`[youtube] zapis sesji uploadu ${item.id}: ${saveErr.message}`);
  }

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

/** Kolumny sesji uploadu (migracja 0054). */
const UPLOAD_SESSION_COLS = ["upload_claimed_at", "upload_session_url", "upload_bytes"] as const;

function isMissingUploadColumn(err: { message?: string } | null | undefined): boolean {
  return Boolean(err?.message && UPLOAD_SESSION_COLS.some((c) => err.message!.includes(c)));
}

/**
 * Zapis do kolejki odporny na brak migracji 0054: gdy baza nie zna kolumn
 * sesji, ten sam zapis idzie bez nich — publikacja nie może stanąć przez
 * kolejność wdrożenia kodu i migracji.
 */
async function updateQueue(
  patch: Record<string, unknown>,
  filter: (q: any) => any,
  finish: (q: any) => any = (q) => q,
): Promise<{ data: any; error: { message: string } | null }> {
  const run = (p: Record<string, unknown>) =>
    finish(filter(supabaseAdmin.from("youtube_publish_queue").update(p as never)));
  const first = await run(patch);
  if (!isMissingUploadColumn(first.error)) return first;
  const reduced = Object.fromEntries(
    Object.entries(patch).filter(([k]) => !(UPLOAD_SESSION_COLS as readonly string[]).includes(k)),
  );
  return run(reduced);
}

/**
 * Domknięcie wpisu z filmem na kanale: status, pierwszy komentarz i powiązanie
 * z lead magnetem. Wspólne dla zwykłego uploadu i naprawy zawieszonego wpisu.
 */
async function finishPublished(item: QueueRow, videoId: string, note: string | null) {
  const id = item.id;
  await updateQueue(
    {
      status: "published",
      youtube_video_id: videoId,
      published_at: new Date().toISOString(),
      last_error: note,
      attempt_count: item.attempt_count + 1,
      upload_session_url: null,
    },
    (q) => q.eq("id", id),
  );
  // Isolated from upload errors: failure must never requeue an uploaded film.
  try {
    const { addYoutubeFirstComment } = await import("./youtube-first-comment.server");
    await addYoutubeFirstComment(id, videoId);
  } catch {
    console.warn("[growth_engine] Nie udało się uruchomić pierwszego komentarza YouTube.");
  }
  // Wpis z lead magnetem (autopilot): film pod automat komentarzy YouTube.
  const leadMagnetId = (item as { lead_magnet_id?: string | null }).lead_magnet_id;
  if (leadMagnetId) {
    try {
      const { linkPublishedPost } = await import("./lead-magnets/lead-magnets.server");
      await linkPublishedPost({
        leadMagnetId,
        queuePlatform: "youtube",
        externalPostId: videoId,
        label: item.title || null,
        postUrl: `https://www.youtube.com/watch?v=${videoId}`,
      });
    } catch (e) {
      console.warn(
        `[lead-magnet] powiązanie filmu ${videoId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

/** Stan sesji resumable upload: PUT bez treści z `Content-Range: bytes *\/<rozmiar>`. */
async function probeUploadSession(
  sessionUrl: string,
  bytes: number | null,
): Promise<import("./youtube-stalled-upload").UploadProbe> {
  const { videoIdFromUploadResponse } = await import("./youtube-stalled-upload");
  try {
    const accessToken = await getAccessToken();
    const res = await fetch(sessionUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Length": "0",
        "Content-Range": `bytes */${bytes && bytes > 0 ? bytes : "*"}`,
      },
    });
    let videoId: string | null = null;
    if (res.status === 200 || res.status === 201) {
      videoId = videoIdFromUploadResponse(await res.json().catch(() => null));
    }
    return { status: res.status, videoId };
  } catch (e) {
    console.warn(`[youtube] stan sesji uploadu: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Wpisy wiszące w `uploading` (przebieg ucięty między przejęciem a zapisem
 * wyniku): stan sesji z YouTube → opublikowane / czekamy / ponowienie.
 */
export async function healStalledYoutubeUploads(now: Date = new Date()): Promise<number> {
  const { STALLED_YOUTUBE_UPLOAD_MIN, decideStalledYoutubeUpload } =
    await import("./youtube-stalled-upload");
  const cutoff = new Date(now.getTime() - STALLED_YOUTUBE_UPLOAD_MIN * 60_000).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("youtube_publish_queue")
    .select("*")
    .eq("status", "uploading")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(5);
  if (error) {
    console.error("[youtube] healStalledYoutubeUploads:", error.message);
    return 0;
  }
  let handled = 0;
  for (const raw of rows ?? []) {
    const item = raw as QueueRow;
    const since = item.upload_claimed_at ?? item.updated_at;
    const stalledHours = (now.getTime() - new Date(since).getTime()) / 3_600_000;
    const sessionUrl = item.upload_session_url ?? null;
    const probe = sessionUrl
      ? await probeUploadSession(sessionUrl, item.upload_bytes ?? null)
      : null;
    const decision = decideStalledYoutubeUpload({
      claimTracked: Boolean(item.upload_claimed_at),
      sessionUrl,
      probe,
      stalledHours,
    });
    // Tylko wpis nadal w `uploading` (równoległy przebieg mógł go już domknąć).
    const guard = (q: any) => q.eq("id", item.id).eq("status", "uploading");
    if (decision.action === "wait") continue;
    if (decision.action === "published") {
      const { data: still } = await guard(
        supabaseAdmin.from("youtube_publish_queue").select("id"),
      ).maybeSingle();
      if (!still) continue;
      await finishPublished(
        item,
        decision.videoId,
        "Domknięte automatycznie: przebieg ucięty po uploadzie, YouTube potwierdził film.",
      );
    } else if (decision.action === "requeue") {
      const attempts = item.attempt_count + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await updateQueue(
        {
          status: exhausted ? "failed" : "pending",
          attempt_count: attempts,
          last_error: `Upload przerwany: ${decision.reason}.${exhausted ? "" : " Ponowienie automatyczne."}`,
          upload_session_url: null,
          upload_bytes: null,
          ...(exhausted ? {} : { scheduled_at: now.toISOString() }),
        },
        guard,
      );
    } else {
      await updateQueue({ status: "failed", last_error: decision.reason }, guard);
    }
    handled += 1;
  }
  return handled;
}

// Publikacja jednego wpisu kolejki: optymistyczne przejęcie (pending →
// uploading) chroni przed podwójnym uploadem przy nakładających się tickach.
export async function processQueueItem(
  id: string,
): Promise<{ ok: boolean; videoId?: string; preparing?: boolean; error?: string }> {
  const { data: claimed, error: claimErr } = await updateQueue(
    {
      status: "uploading",
      upload_claimed_at: new Date().toISOString(),
      upload_session_url: null,
      upload_bytes: null,
    },
    (q) => q.eq("id", id).in("status", ["pending", "failed"]),
    (q) => q.select("*").maybeSingle(),
  );
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed) return { ok: false, error: "Wpis nie jest w stanie do publikacji." };

  const item = claimed as QueueRow;
  {
    // Kontrola końcowa compliance przed wysyłką (brief 5.7).
    const { gateClaimedItem } = await import("./autopilot/publish-gate.server");
    const gate = await gateClaimedItem("youtube_publish_queue", {
      ...item,
      platform: "youtube",
      message: item.description,
    });
    if (!gate.proceed) return { ok: false, error: gate.error };
    item.description = gate.message;
  }
  try {
    const videoId = await uploadShort(item);
    await finishPublished(item, videoId, null);
    return { ok: true, videoId };
  } catch (err) {
    const { VideoPreparingError } = await import("./video-rendition.server");
    if (err instanceof VideoPreparingError) {
      // Wideo się kompresuje — wpis wraca do kolejki na kilka minut,
      // BEZ zużycia próby (to nie jest błąd publikacji).
      await supabaseAdmin
        .from("youtube_publish_queue")
        .update({
          status: "pending",
          last_error: err.note,
          scheduled_at: err.nextAt.toISOString(),
        })
        .eq("id", id);
      return { ok: true, preparing: true };
    }
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

  // Najpierw zawieszone uploady — rozstrzygnięte przed nowymi, bez duplikatów.
  try {
    await healStalledYoutubeUploads();
  } catch (e) {
    console.error(`[youtube] naprawa zawieszonych: ${e instanceof Error ? e.message : String(e)}`);
  }

  const { data: due, error } = await withOriginFilter(
    // Pauza autopilota wstrzymuje tylko jego wpisy (ręczne idą dalej).
    supabaseAdmin
      .from("youtube_publish_queue")
      .select("id")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(MAX_UPLOADS_PER_TICK),
  );
  if (error) throw new Error(error.message);

  let published = 0;
  const errors: string[] = [];
  for (const item of due ?? []) {
    const result = await processQueueItem(item.id);
    if (result.ok && !result.preparing) published += 1;
    else if (result.error) errors.push(result.error);
  }
  return { ok: true, processed: (due ?? []).length, published, errors };
}
