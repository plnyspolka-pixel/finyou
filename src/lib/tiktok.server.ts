// TikTok Content Posting API (Direct Post) — OAuth 2.0 konta + publikacja wideo.
//
// Wzorowane 1:1 na module YouTube Shorts (src/lib/youtube-shorts.server.ts):
// tokeny w tabeli `tiktok_integration` (singleton, service_role), kolejka
// wspólna z Meta (`social_publish_queue`, platform='tiktok'), publikacja
// w istniejącym ticku /api/public/hooks/social-publish-tick (pg_cron co 10 min).
//
// Konfiguracja (sekrety środowiska):
//   TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET — klient z TikTok for Developers,
//   TIKTOK_REDIRECT_URI (opcjonalnie) — domyślnie produkcyjny callback.
//
// Publikacja jest TRÓJETAPOWA i rozłożona na ticki, bo TikTok transkoduje
// materiał asynchronicznie (jak kontener IG w studio-publishing.server.ts):
//   1. creator_info/query  — WYMAGANE przed każdą publikacją. Służy do
//      SPRAWDZENIA wyborów twórcy (czy wybrany privacy_level jest nadal
//      dozwolony) i domknięcia przełączników ustawieniami konta. Sam wybór
//      robi człowiek w panelu — wytyczne TikToka zabraniają hardkodowania
//      prywatności, a klient bez audytu dostaje wyłącznie SELF_ONLY.
//   2. video/init (FILE_UPLOAD) + PUT chunków — zwraca publish_id i upload_url.
//   3. status/fetch — polling do PUBLISH_COMPLETE / FAILED.
//
// Limity TikToka: ~15 postów/dobę na konto, stąd MAX_POSTS_PER_TICK = 1
// (jeden post na przebieg ticka, zgodnie ze specyfikacją).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  applyCreatorConstraints,
  parseTiktokPostOptions,
  planChunks,
  tiktokTitle,
  type TiktokPostOptions,
} from "./tiktok-upload";

const OAUTH_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const OAUTH_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const OAUTH_REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";
const CREATOR_INFO_URL = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";
const VIDEO_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const STATUS_FETCH_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

// video.publish = Direct Post (film ląduje od razu na profilu).
// user.info.basic daje open_id/nazwę do pokazania w panelu.
const OAUTH_SCOPES = ["user.info.basic", "video.publish"].join(",");

const JSON_CT = "application/json; charset=UTF-8";

// Bufor zamiast streamingu: chunki wymagają znanego Content-Length i
// dokładnych zakresów bajtów, a rolki ze Studia mają kilkanaście–kilkadziesiąt
// MB. Twardy limit chroni pamięć workera (128 MB) — jak przy YouTube.
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

// Jeden post na przebieg — limit TikToka to ok. 15 publikacji/dobę na konto.
const MAX_POSTS_PER_TICK = 1;
const MAX_POLLS_PER_TICK = 5;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MIN = 30;

// Polling: spec chce co 30 s do 10 prób. 10 × 30 s = 5 minut blokowałoby
// workera, więc w jednym ticku robimy do POLLS_INLINE prób po 30 s, a resztę
// dowożą kolejne ticki (wpis czeka w tiktok_status='processing') — dokładnie
// jak dwuetapowa publikacja IG. Łącznie daje to > 10 prób bez blokady.
const POLL_INTERVAL_MS = 30_000;
const POLLS_INLINE = 3;
// Po tym czasie od uploadu uznajemy publikację za przepadłą.
const PROCESSING_TIMEOUT_MIN = 60;
// Po tym czasie wpis zawieszony w 'publishing' bez publish_id wraca do kolejki.
const STALLED_CLAIM_MIN = 30;

export function getTiktokEnv() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || "";
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || "";
  const redirectUri =
    process.env.TIKTOK_REDIRECT_URI || "https://financeyou.pl/api/tiktok/callback";
  return { clientKey, clientSecret, redirectUri, configured: !!(clientKey && clientSecret) };
}

type IntegrationRow = {
  id: number;
  access_token: string | null;
  refresh_token: string | null;
  open_id: string | null;
  token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  connected: boolean;
  oauth_state: string | null;
  oauth_state_expires_at: string | null;
  connected_at: string | null;
  last_error: string | null;
};

export async function getIntegrationRow(): Promise<IntegrationRow> {
  const { data, error } = await supabaseAdmin
    .from("tiktok_integration")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as IntegrationRow;
  const { data: created, error: insErr } = await supabaseAdmin
    .from("tiktok_integration")
    .insert({ id: 1 })
    .select("*")
    .single();
  if (insErr) throw new Error(insErr.message);
  return created as IntegrationRow;
}

type IntegrationPatch = Partial<Omit<IntegrationRow, "id">>;

async function patchIntegration(patch: IntegrationPatch) {
  const { error } = await supabaseAdmin.from("tiktok_integration").update(patch).eq("id", 1);
  if (error) throw new Error(error.message);
}

// ── OAuth ────────────────────────────────────────────────────────────────────

type TokenJson = {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(
  body: Record<string, string>,
): Promise<{ json: TokenJson; status: number }> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // TikTok odrzuca żądania tokenowe z cache'owaną odpowiedzią.
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as TokenJson;
  return { json, status: res.status };
}

/**
 * TikTok zgłasza błędy tokenowe i jako !2xx, i jako 200 z `error` w ciele —
 * sprawdzamy oba. Status HTTP zostaje w komunikacie, bo przy odpowiedzi spoza
 * JSON-a jest to jedyna informacja diagnostyczna.
 */
function tokenError(json: TokenJson, status: number): string | null {
  if (status < 200 || status >= 300 || json.error || !json.access_token) {
    const what = json.error ?? (json.access_token ? "błąd" : "brak access_token");
    return `${what} ${json.error_description ?? ""}`.trim() + ` (HTTP ${status})`;
  }
  return null;
}

/**
 * Wydaje jednorazowy `state` i URL do /api/tiktok/auth. Wołane TYLKO z
 * admin-only server fn — sam endpoint /api/tiktok/auth wpuszcza wyłącznie
 * z ważnym state, żeby obcy nie podstawił swojego konta TikTok jako firmowego.
 */
export async function startConnect(): Promise<{ state: string; authPath: string }> {
  const { configured } = getTiktokEnv();
  if (!configured) {
    throw new Error("Brak TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET w zmiennych środowiskowych.");
  }
  await getIntegrationRow();
  const state = crypto.randomUUID();
  await patchIntegration({
    oauth_state: state,
    oauth_state_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  return { state, authPath: `/api/tiktok/auth?state=${encodeURIComponent(state)}` };
}

/** Sprawdza, że `state` pochodzi z aktywnego „Połącz" w panelu i nie wygasł. */
export async function assertPendingState(state: string): Promise<void> {
  const row = await getIntegrationRow();
  if (
    !state ||
    !row.oauth_state ||
    row.oauth_state !== state ||
    !row.oauth_state_expires_at ||
    new Date(row.oauth_state_expires_at).getTime() < Date.now()
  ) {
    throw new Error("Nieprawidłowy lub wygasły stan OAuth — spróbuj połączyć ponownie.");
  }
}

/** URL zgody TikToka dla zweryfikowanego `state` (redirect z /api/tiktok/auth). */
export function buildAuthorizeUrl(state: string): string {
  const { clientKey, redirectUri } = getTiktokEnv();
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: OAUTH_SCOPES,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });
  return `${OAUTH_AUTH_URL}?${params}`;
}

export async function handleOauthCallback(code: string, state: string): Promise<void> {
  const { clientKey, clientSecret, redirectUri, configured } = getTiktokEnv();
  if (!configured) throw new Error("Brak konfiguracji TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET.");
  await assertPendingState(state);

  const { json, status } = await tokenRequest({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const err = tokenError(json, status);
  if (err) throw new Error(`Wymiana kodu OAuth nieudana: ${err}`);
  if (!json.refresh_token) {
    throw new Error("TikTok nie zwrócił refresh tokena — połącz konto ponownie.");
  }

  await patchIntegration({
    access_token: json.access_token!,
    refresh_token: json.refresh_token,
    open_id: json.open_id ?? null,
    token_expires_at: new Date(Date.now() + (json.expires_in ?? 86_400) * 1000).toISOString(),
    refresh_token_expires_at: new Date(
      Date.now() + (json.refresh_expires_in ?? 365 * 86_400) * 1000,
    ).toISOString(),
    connected: true,
    oauth_state: null,
    oauth_state_expires_at: null,
    connected_at: new Date().toISOString(),
    last_error: null,
  });
}

export async function disconnectTiktok(): Promise<void> {
  const { clientKey, clientSecret } = getTiktokEnv();
  const row = await getIntegrationRow();
  if (row.access_token && clientKey && clientSecret) {
    // Unieważnij grant po stronie TikToka; porażka nie blokuje odpięcia lokalnie.
    try {
      await fetch(OAUTH_REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          token: row.access_token,
        }),
      });
    } catch {
      /* noop */
    }
  }
  await patchIntegration({
    access_token: null,
    refresh_token: null,
    open_id: null,
    token_expires_at: null,
    refresh_token_expires_at: null,
    connected: false,
    connected_at: null,
    last_error: null,
  });
}

// ── Token ────────────────────────────────────────────────────────────────────

// Odświeżamy z 2 h zapasem — publikacja w środku ticka nie może stracić tokena.
const REFRESH_MARGIN_MS = 2 * 60 * 60 * 1000;

function needsRefresh(row: IntegrationRow): boolean {
  if (!row.access_token) return true;
  if (!row.token_expires_at) return true;
  return new Date(row.token_expires_at).getTime() < Date.now() + REFRESH_MARGIN_MS;
}

async function refreshAccessToken(row: IntegrationRow): Promise<string> {
  const { clientKey, clientSecret } = getTiktokEnv();
  if (!row.refresh_token) throw new Error("Konto TikTok nie jest połączone.");
  const { json, status } = await tokenRequest({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });
  const err = tokenError(json, status);
  if (err) {
    const msg = `Odświeżenie tokena TikTok nieudane: ${err}`;
    await patchIntegration({ last_error: msg });
    throw new Error(msg);
  }
  const accessToken = json.access_token!;
  await patchIntegration({
    access_token: accessToken,
    // TikTok rotuje refresh_token przy każdym odświeżeniu — zapisujemy nowy,
    // inaczej po 24 h integracja umiera na starym.
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    open_id: json.open_id ?? row.open_id,
    token_expires_at: new Date(Date.now() + (json.expires_in ?? 86_400) * 1000).toISOString(),
    ...(json.refresh_expires_in
      ? {
          refresh_token_expires_at: new Date(
            Date.now() + json.refresh_expires_in * 1000,
          ).toISOString(),
        }
      : {}),
    connected: true,
    last_error: null,
  });
  return accessToken;
}

export async function getAccessToken(): Promise<string> {
  const { configured } = getTiktokEnv();
  if (!configured) throw new Error("Brak konfiguracji TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET.");
  const row = await getIntegrationRow();
  if (!row.refresh_token) {
    throw new Error("Konto TikTok nie jest połączone (panel → Studio publikacji → Połącz TikTok).");
  }
  if (!needsRefresh(row)) return row.access_token!;
  return refreshAccessToken(row);
}

/**
 * Proaktywne odświeżenie tokena z ticka (spec: gdy expires_at < now + 2 h).
 * Nie rzuca — brak połączenia albo cofnięta zgoda nie mogą wywalić ticka.
 */
export async function refreshTiktokTokenIfNeeded(): Promise<{
  refreshed: boolean;
  error?: string;
}> {
  try {
    const { configured } = getTiktokEnv();
    if (!configured) return { refreshed: false };
    const row = await getIntegrationRow();
    if (!row.refresh_token || !needsRefresh(row)) return { refreshed: false };
    await refreshAccessToken(row);
    return { refreshed: true };
  } catch (err) {
    return { refreshed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Wywołania API ────────────────────────────────────────────────────────────

type ApiJson = {
  data?: Record<string, unknown>;
  error?: { code?: string; message?: string; log_id?: string };
};

// TikTok zawsze odpowiada 200 z `error.code` — 'ok' znaczy sukces.
async function tiktokPost(url: string, token: string, body: unknown): Promise<ApiJson> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": JSON_CT },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as ApiJson;
  const code = json.error?.code ?? "";
  if (!res.ok || (code && code !== "ok")) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`TikTok API ${code || res.status}: ${msg}`);
  }
  return json;
}

export type CreatorInfo = {
  nickname: string | null;
  username: string | null;
  avatarUrl: string | null;
  /** Dozwolone poziomy prywatności — to z nich twórca wybiera w panelu. */
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
};

/**
 * creator_info/query — WYMAGANE przed każdą publikacją (wymóg TikToka).
 * Zwraca to, co panel pokazuje twórcy (nick, dozwolone poziomy prywatności,
 * które interakcje blokuje jego konto) i czym tick weryfikuje jego wybory.
 */
export async function queryCreatorInfo(token: string): Promise<CreatorInfo> {
  const json = await tiktokPost(CREATOR_INFO_URL, token, {});
  const d = (json.data ?? {}) as Record<string, unknown>;
  const privacyOptions = Array.isArray(d.privacy_level_options)
    ? (d.privacy_level_options as unknown[]).filter(
        (o): o is string => typeof o === "string" && o.length > 0,
      )
    : [];
  if (!privacyOptions.length) {
    throw new Error(
      "TikTok nie zwrócił dozwolonych poziomów prywatności (privacy_level_options) — nie publikujemy bez nich.",
    );
  }
  return {
    nickname: typeof d.creator_nickname === "string" ? d.creator_nickname : null,
    username: typeof d.creator_username === "string" ? d.creator_username : null,
    avatarUrl: typeof d.creator_avatar_url === "string" ? d.creator_avatar_url : null,
    privacyOptions,
    commentDisabled: d.comment_disabled === true,
    duetDisabled: d.duet_disabled === true,
    stitchDisabled: d.stitch_disabled === true,
    maxVideoPostDurationSec:
      typeof d.max_video_post_duration_sec === "number" ? d.max_video_post_duration_sec : null,
  };
}

export type TiktokQueueRow = {
  id: string;
  platform: string;
  title: string;
  message: string;
  video_url: string | null;
  scheduled_at: string;
  status: string;
  attempt_count: number;
  tiktok_publish_id: string | null;
  tiktok_status: string | null;
  tiktok_fail_reason: string | null;
  tiktok_upload_at: string | null;
  tiktok_post_options: unknown;
  external_post_id: string | null;
  last_error: string | null;
  published_at: string | null;
  updated_at: string;
};

/**
 * Krok 4b — init FILE_UPLOAD + wysyłka chunków. Zwraca publish_id.
 * Materiał pobieramy z Supabase Storage (publiczny URL z kolejki).
 */
async function uploadVideo(
  item: TiktokQueueRow,
  token: string,
  creator: CreatorInfo,
  options: TiktokPostOptions,
): Promise<string> {
  if (!item.video_url) throw new Error("Publikacja na TikToku wymaga URL wideo (MP4, pion 9:16).");

  const videoRes = await fetch(item.video_url);
  if (!videoRes.ok) throw new Error(`Pobranie wideo nieudane: HTTP ${videoRes.status}`);
  const declared = Number(videoRes.headers.get("content-length") || 0);
  if (declared > MAX_VIDEO_BYTES) {
    throw new Error(`Plik za duży (${Math.round(declared / 1e6)} MB, limit 100 MB).`);
  }
  const buffer = await videoRes.arrayBuffer();
  const totalBytes = buffer.byteLength;
  if (totalBytes > MAX_VIDEO_BYTES) {
    throw new Error(`Plik za duży (${Math.round(totalBytes / 1e6)} MB, limit 100 MB).`);
  }
  const plan = planChunks(totalBytes);

  // Tytuł: publish_title z joba (item.title), a w ostateczności początek opisu.
  const title = tiktokTitle(item.title || item.message);
  if (!title) throw new Error("Publikacja na TikToku wymaga tytułu.");

  // Przełączniki: wybór twórcy domknięty ograniczeniami jego konta.
  const effective = applyCreatorConstraints(options, creator);
  const init = await tiktokPost(VIDEO_INIT_URL, token, {
    post_info: {
      title,
      // Wybór twórcy z panelu, zweryfikowany względem creator_info.
      privacy_level: effective.privacyLevel,
      disable_comment: effective.disableComment,
      disable_duet: effective.disableDuet,
      disable_stitch: effective.disableStitch,
      // Ujawnienie treści komercyjnej („Your brand" / „Branded content").
      brand_organic_toggle: effective.brandOrganic,
      brand_content_toggle: effective.brandedContent,
    },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: totalBytes,
      chunk_size: plan.chunkSize,
      total_chunk_count: plan.totalChunkCount,
    },
  });
  const data = (init.data ?? {}) as Record<string, unknown>;
  const publishId = typeof data.publish_id === "string" ? data.publish_id : null;
  const uploadUrl = typeof data.upload_url === "string" ? data.upload_url : null;
  if (!publishId || !uploadUrl) throw new Error("TikTok nie zwrócił publish_id / upload_url.");

  // publish_id zapisujemy PRZED uploadem — gdyby worker padł w środku,
  // kolejny tick domknie wpis pollingiem zamiast publikować drugi raz.
  await supabaseAdmin
    .from("social_publish_queue")
    .update({ tiktok_publish_id: publishId, tiktok_status: "uploading" })
    .eq("id", item.id);

  for (const [i, range] of plan.ranges.entries()) {
    const length = range.end - range.start + 1;
    // Widok na bufor — bez kopii (peak RAM = rozmiar pliku, nie +chunk).
    const body = new Uint8Array(buffer, range.start, length);
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(length),
        "Content-Range": `bytes ${range.start}-${range.end}/${totalBytes}`,
      },
      body,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(
        `Upload chunka ${i + 1}/${plan.totalChunkCount} nieudany: HTTP ${res.status} ${t.slice(0, 300)}`,
      );
    }
  }
  // Znacznik startu przetwarzania po stronie TikToka — od niego liczymy
  // PROCESSING_TIMEOUT_MIN (updated_at rusza się przy każdym ticku).
  await supabaseAdmin
    .from("social_publish_queue")
    .update({ tiktok_upload_at: new Date().toISOString() })
    .eq("id", item.id);
  return publishId;
}

// ── Polling statusu ──────────────────────────────────────────────────────────

type PollResult =
  | { state: "complete"; postId: string | null }
  | { state: "failed"; reason: string }
  | { state: "pending"; status: string };

export async function fetchPublishStatus(token: string, publishId: string): Promise<PollResult> {
  const json = await tiktokPost(STATUS_FETCH_URL, token, { publish_id: publishId });
  const d = (json.data ?? {}) as Record<string, unknown>;
  const status = typeof d.status === "string" ? d.status : "";
  if (status === "PUBLISH_COMPLETE") {
    const ids = Array.isArray(d.publicaly_available_post_id)
      ? (d.publicaly_available_post_id as unknown[])
      : [];
    const first = ids.find((v) => typeof v === "string" || typeof v === "number");
    return { state: "complete", postId: first != null ? String(first) : null };
  }
  if (status === "FAILED") {
    const reason = typeof d.fail_reason === "string" && d.fail_reason ? d.fail_reason : "FAILED";
    return { state: "failed", reason };
  }
  return { state: "pending", status: status || "PROCESSING" };
}

async function markComplete(item: TiktokQueueRow, postId: string | null) {
  await supabaseAdmin
    .from("social_publish_queue")
    .update({
      status: "published",
      tiktok_status: "publish_complete",
      tiktok_fail_reason: null,
      external_post_id: postId,
      published_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", item.id);
}

async function markFailed(item: TiktokQueueRow, msg: string, opts?: { noRetry?: boolean }) {
  const attempts = item.attempt_count + 1;
  const exhausted = opts?.noRetry || attempts >= MAX_ATTEMPTS;
  await supabaseAdmin
    .from("social_publish_queue")
    .update({
      status: exhausted ? "failed" : "pending",
      tiktok_fail_reason: msg.slice(0, 500),
      attempt_count: attempts,
      last_error: msg,
      // Ponowna próba startuje od zera: nowy publish_id z nowego init, a
      // tiktok_status z powrotem NULL — inaczej wpis nie spełniałby warunku
      // wymagalności i utknąłby w kolejce na zawsze.
      ...(exhausted
        ? { tiktok_status: "failed" }
        : {
            tiktok_status: null,
            tiktok_publish_id: null,
            tiktok_upload_at: null,
            scheduled_at: new Date(Date.now() + RETRY_DELAY_MIN * 60 * 1000).toISOString(),
          }),
    })
    .eq("id", item.id);
}

/**
 * Domyka wpis po uploadzie: kilka prób co 30 s w tym ticku, a jeśli TikTok
 * wciąż przetwarza — zostawia go w 'processing' dla kolejnych ticków.
 */
async function pollUntilDoneOrDefer(
  item: TiktokQueueRow,
  token: string,
  publishId: string,
  inlineAttempts: number,
): Promise<{ done: boolean; failed?: boolean; error?: string }> {
  for (let i = 0; i < Math.max(1, inlineAttempts); i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const result = await fetchPublishStatus(token, publishId);
    if (result.state === "complete") {
      await markComplete(item, result.postId);
      return { done: true };
    }
    if (result.state === "failed") {
      await markFailed(item, `TikTok odrzucił materiał: ${result.reason}`, { noRetry: true });
      return { done: true, failed: true, error: result.reason };
    }
  }
  // Wciąż się przetwarza — kolejny tick dokończy (jak kontener IG).
  await supabaseAdmin
    .from("social_publish_queue")
    .update({ status: "processing", tiktok_status: "processing" })
    .eq("id", item.id);
  return { done: false };
}

// ── Publikacja jednego wpisu ─────────────────────────────────────────────────

/**
 * Krok 4a–4c dla jednego wpisu kolejki. Optymistyczne przejęcie
 * (pending → publishing) chroni przed podwójną publikacją przy nakładających
 * się tickach — jak w YouTube/Meta.
 */
export async function processTiktokQueueItem(id: string): Promise<{
  ok: boolean;
  publishId?: string;
  processing?: boolean;
  error?: string;
}> {
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("social_publish_queue")
    .update({ status: "publishing", tiktok_status: "pending" })
    .eq("id", id)
    .eq("platform", "tiktok")
    .in("status", ["pending", "failed"])
    .select("*")
    .maybeSingle();
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed) return { ok: false, error: "Wpis nie jest w stanie do publikacji." };

  const item = claimed as TiktokQueueRow;
  try {
    const token = await getAccessToken();

    // Wpis miał już init (worker padł po uploadzie) — nie publikujemy drugi
    // raz, tylko domykamy pollingiem.
    if (item.tiktok_publish_id) {
      const poll = await pollUntilDoneOrDefer(item, token, item.tiktok_publish_id, POLLS_INLINE);
      if (poll.failed) return { ok: false, error: poll.error };
      return poll.done
        ? { ok: true, publishId: item.tiktok_publish_id }
        : { ok: true, processing: true, publishId: item.tiktok_publish_id };
    }

    // 4a — creator_info WYMAGANE przed każdą publikacją; służy też do
    // sprawdzenia, czy wybory twórcy są nadal dozwolone przez jego konto.
    const creator = await queryCreatorInfo(token);
    const options = parseTiktokPostOptions(item.tiktok_post_options, creator.privacyOptions);
    // 4b — init + chunki.
    const publishId = await uploadVideo(item, token, creator, options);
    // 4c — polling.
    const poll = await pollUntilDoneOrDefer(item, token, publishId, POLLS_INLINE);
    if (poll.failed) return { ok: false, error: poll.error };
    return poll.done ? { ok: true, publishId } : { ok: true, processing: true, publishId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(item, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Wpisy porzucone w 'publishing' PRZED initem (worker padł między claimem
 * a odpowiedzią TikToka) nie mają publish_id, więc polling ich nie domknie,
 * a claim przyjmuje tylko 'pending'/'failed'. Po STALLED_CLAIM_MIN wracają
 * do kolejki — publikacja nie zdążyła się zacząć, więc to nie duplikat.
 */
async function reclaimStalledItems(): Promise<void> {
  const cutoff = new Date(Date.now() - STALLED_CLAIM_MIN * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("social_publish_queue")
    .update({ status: "pending", tiktok_status: null, tiktok_upload_at: null })
    .eq("platform", "tiktok")
    .eq("status", "publishing")
    .is("tiktok_publish_id", null)
    .lt("updated_at", cutoff);
}

// Wpisy po uploadzie: dociągnij status i domknij (analogicznie do kontenerów IG).
async function processProcessingItems(): Promise<{ published: number; errors: string[] }> {
  const { data: rows, error } = await supabaseAdmin
    .from("social_publish_queue")
    .select("*")
    .eq("platform", "tiktok")
    .in("status", ["processing", "publishing"])
    .in("tiktok_status", ["uploading", "processing"])
    .not("tiktok_publish_id", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(MAX_POLLS_PER_TICK);
  if (error) throw new Error(error.message);
  if (!rows?.length) return { published: 0, errors: [] };

  let published = 0;
  const errors: string[] = [];
  const token = await getAccessToken();
  for (const raw of rows) {
    const item = raw as TiktokQueueRow;
    try {
      const result = await fetchPublishStatus(token, item.tiktok_publish_id!);
      if (result.state === "complete") {
        await markComplete(item, result.postId);
        published += 1;
        continue;
      }
      if (result.state === "failed") {
        await markFailed(item, `TikTok odrzucił materiał: ${result.reason}`, { noRetry: true });
        errors.push(`TikTok: ${result.reason}`);
        continue;
      }
      // Wciąż przetwarzanie — po limicie czasu uznaj za przepadłe.
      const startedAt = new Date(item.tiktok_upload_at ?? item.updated_at).getTime();
      if ((Date.now() - startedAt) / 60_000 > PROCESSING_TIMEOUT_MIN) {
        await markFailed(item, "TikTok nie zakończył przetwarzania w limicie czasu.");
        errors.push("TikTok: timeout przetwarzania");
      } else if (item.status !== "processing" || item.tiktok_status !== "processing") {
        // Zapis tylko gdy stan faktycznie się zmienia — pusty UPDATE ruszałby
        // updated_at bez potrzeby.
        await supabaseAdmin
          .from("social_publish_queue")
          .update({ status: "processing", tiktok_status: "processing" })
          .eq("id", item.id);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { published, errors };
}

/**
 * Tick TikToka — wołany z /api/public/hooks/social-publish-tick (ten sam cron
 * co YouTube/FB/IG). Najpierw odświeżenie tokena, potem domknięcie wpisów po
 * uploadzie, na końcu JEDNA nowa publikacja (limit ~15/dobę na konto).
 */
export async function runTiktokPublishTick(): Promise<{
  ok: boolean;
  processed: number;
  published: number;
  processing: number;
  tokenRefreshed: boolean;
  errors: string[];
}> {
  const empty = {
    ok: true as const,
    processed: 0,
    published: 0,
    processing: 0,
    tokenRefreshed: false,
    errors: [] as string[],
  };
  const { configured } = getTiktokEnv();
  if (!configured) return empty;

  const row = await getIntegrationRow();
  if (!row.refresh_token) return empty;

  const errors: string[] = [];
  // Krok 3 — odświeżenie tokena, gdy zostało mniej niż 2 h ważności.
  const refresh = await refreshTiktokTokenIfNeeded();
  if (refresh.error) {
    // Bez tokena nie ma co próbować publikować — zgłoś i wyjdź.
    return { ...empty, tokenRefreshed: false, errors: [refresh.error] };
  }

  await reclaimStalledItems().catch(() => {
    // Odbicie zawieszonych wpisów nie może wywalić ticka.
  });

  const poll = await processProcessingItems().catch((e) => {
    errors.push(e instanceof Error ? e.message : String(e));
    return { published: 0, errors: [] as string[] };
  });
  errors.push(...poll.errors);

  const { data: due, error } = await supabaseAdmin
    .from("social_publish_queue")
    .select("id")
    .eq("platform", "tiktok")
    .eq("status", "pending")
    .is("tiktok_status", null)
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(MAX_POSTS_PER_TICK);
  if (error) throw new Error(error.message);

  let published = poll.published;
  let processing = 0;
  let processed = 0;
  for (const item of due ?? []) {
    processed += 1;
    const result = await processTiktokQueueItem(item.id);
    if (result.ok && result.processing) processing += 1;
    else if (result.ok) published += 1;
    else if (result.error) errors.push(result.error);
  }

  return {
    ok: true,
    processed,
    published,
    processing,
    tokenRefreshed: refresh.refreshed,
    errors,
  };
}
