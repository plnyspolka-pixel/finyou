// X (dawniej Twitter) API v2 — OAuth 2.0 konta + publikacja postów.
//
// Wzorowane 1:1 na module TikToka (src/lib/tiktok.server.ts): tokeny w tabeli
// `x_integration` (singleton, service_role), kolejka wspólna z Meta i TikTokiem
// (`social_publish_queue`, platform='x'), publikacja w istniejącym ticku
// /api/public/hooks/social-publish-tick (pg_cron co 10 min).
//
// Konfiguracja (sekrety środowiska):
//   X_CLIENT_ID / X_CLIENT_SECRET — klient OAuth 2.0 z X Developer Console
//     (Type of App: „Web App, Automated App or Bot" = klient poufny),
//   X_REDIRECT_URI (opcjonalnie) — domyślnie produkcyjny callback,
//   X_POST_MAX_CHARS (opcjonalnie) — podniesienie limitu dla X Premium.
// Akceptujemy też prefiks TWITTER_* dla tych samych wartości, bo konsola
// X-a wciąż bywa opisywana starą nazwą i sekrety trafiają pod oba klucze.
//
// Różnice wobec TikToka, które widać w kodzie niżej:
//   * PKCE jest WYMAGANE nawet dla klienta poufnego — `code_verifier` jedzie
//     do bazy przy „Połącz" i wraca w wymianie kodu.
//   * Klient poufny uwierzytelnia się nagłówkiem Basic, nie polem w body.
//   * access_token żyje 2 h (nie 24 h), a refresh_token jest ROTOWANY przy
//     każdym odświeżeniu — stary przestaje działać natychmiast.
//   * Post tekstowy publikuje się jednym strzałem; dopiero materiał wideo
//     wymaga pollingu (jak kontener IG albo publish_id TikToka).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  X_TEXT_LIMIT,
  pickXMedia,
  planXChunks,
  xMediaFromUrl,
  xPostText,
  type XMedia,
} from "./x-post";

const OAUTH_AUTH_URL = "https://x.com/i/oauth2/authorize";
const OAUTH_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const OAUTH_REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
const TWEETS_URL = "https://api.x.com/2/tweets";
const ME_URL = "https://api.x.com/2/users/me";
const MEDIA_UPLOAD_URL = "https://api.x.com/2/media/upload";

// tweet.write publikuje, media.write wgrywa materiał (BEZ niego upload wraca
// 403 mimo poprawnego tokena), users.read daje @handle do panelu,
// offline.access jest warunkiem wydania refresh tokena.
const OAUTH_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "media.write",
  "offline.access",
].join(" ");

// Jeden post na przebieg ticka — darmowy pułap X-a to 500 postów/miesiąc,
// a limity dzienne są liczone w kilkunastu sztukach (jak przy TikToku).
const MAX_POSTS_PER_TICK = 1;
const MAX_POLLS_PER_TICK = 5;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MIN = 30;

// Polling przetwarzania wideo: kilka prób w ticku, reszta w kolejnych.
const POLL_INTERVAL_MS = 10_000;
const POLLS_INLINE = 3;
const PROCESSING_TIMEOUT_MIN = 60;
// Po tym czasie wpis zawieszony w 'publishing' bez media_id wraca do kolejki.
const STALLED_CLAIM_MIN = 30;

// access_token X-a żyje 2 h, więc zapas musi być znacznie mniejszy niż przy
// TikToku (tam 2 h) — inaczej odświeżalibyśmy token przy każdym ticku.
const REFRESH_MARGIN_MS = 15 * 60 * 1000;

function envValue(...names: string[]): string {
  for (const name of names) {
    // .trim() nie jest ozdobą: sekrety wklejane do menedżera łapią spację albo
    // znak nowej linii na końcu, a URLSearchParams zakoduje to jako %0A
    // i X odrzuci żądanie komunikatem o błędnym kliencie.
    const value = (process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

export function getXEnv() {
  const clientId = envValue("X_CLIENT_ID", "TWITTER_CLIENT_ID");
  const clientSecret = envValue("X_CLIENT_SECRET", "TWITTER_CLIENT_SECRET");
  const redirectUri =
    envValue("X_REDIRECT_URI", "TWITTER_REDIRECT_URI") || "https://financeyou.pl/api/x/callback";
  const rawLimit = Number(envValue("X_POST_MAX_CHARS", "TWITTER_POST_MAX_CHARS"));
  // Limit z sekretu tylko w górę i w granicach rozsądku — literówka w zmiennej
  // nie może obciąć postów do zera ani przepuścić treści, którą X odrzuci.
  const postLimit =
    Number.isFinite(rawLimit) && rawLimit >= X_TEXT_LIMIT && rawLimit <= 25_000
      ? Math.floor(rawLimit)
      : X_TEXT_LIMIT;
  return {
    clientId,
    clientSecret,
    redirectUri,
    postLimit,
    configured: !!(clientId && clientSecret),
  };
}

/**
 * Podgląd `client_id` do diagnostyki w panelu. Identyfikator NIE jest sekretem
 * — jedzie jawnie w URL-u zgody, który użytkownik i tak widzi w pasku adresu —
 * ale pokazujemy skrót plus długość, żeby dało się wychwycić wklejoną spację,
 * ucięty znak albo pomyłkowo wstawiony client_secret.
 */
export function describeClientId(): { preview: string; length: number; hadWhitespace: boolean } {
  const raw = process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID || "";
  const id = raw.trim();
  return {
    preview: id ? `${id.slice(0, 6)}…${id.slice(-2)}` : "(puste)",
    length: id.length,
    hadWhitespace: raw !== id,
  };
}

type IntegrationRow = {
  id: number;
  access_token: string | null;
  refresh_token: string | null;
  x_user_id: string | null;
  username: string | null;
  token_expires_at: string | null;
  scope: string | null;
  connected: boolean;
  oauth_state: string | null;
  oauth_state_expires_at: string | null;
  code_verifier: string | null;
  connected_at: string | null;
  last_error: string | null;
};

export async function getIntegrationRow(): Promise<IntegrationRow> {
  const { data, error } = await supabaseAdmin
    .from("x_integration")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as IntegrationRow;
  const { data: created, error: insErr } = await supabaseAdmin
    .from("x_integration")
    .insert({ id: 1 })
    .select("*")
    .single();
  if (insErr) throw new Error(insErr.message);
  return created as IntegrationRow;
}

type IntegrationPatch = Partial<Omit<IntegrationRow, "id">>;

async function patchIntegration(patch: IntegrationPatch) {
  const { error } = await supabaseAdmin.from("x_integration").update(patch).eq("id", 1);
  if (error) throw new Error(error.message);
}

// ── PKCE ─────────────────────────────────────────────────────────────────────

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Verifier PKCE: 43–128 znaków z alfabetu unreserved (RFC 7636). */
function createCodeVerifier(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(48)));
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(digest);
}

// ── OAuth ────────────────────────────────────────────────────────────────────

type TokenJson = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

/**
 * Klient poufny X-a uwierzytelnia się nagłówkiem Basic (client_id:client_secret
 * w base64), a NIE polami w body — inaczej endpoint tokenowy zwraca 401.
 */
function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

async function tokenRequest(
  body: Record<string, string>,
): Promise<{ json: TokenJson; status: number }> {
  const { clientId, clientSecret } = getXEnv();
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(clientId, clientSecret),
    },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as TokenJson;
  return { json, status: res.status };
}

/**
 * X zgłasza błędy tokenowe jako !2xx z `error` w ciele. Status HTTP zostaje
 * w komunikacie, bo przy odpowiedzi spoza JSON-a jest to jedyna informacja
 * diagnostyczna.
 */
function tokenError(json: TokenJson, status: number): string | null {
  if (status < 200 || status >= 300 || json.error || !json.access_token) {
    const what = json.error ?? (json.access_token ? "błąd" : "brak access_token");
    return `${what} ${json.error_description ?? ""}`.trim() + ` (HTTP ${status})`;
  }
  return null;
}

/**
 * Wydaje jednorazowy `state` + `code_verifier` i URL do /api/x/auth. Wołane
 * TYLKO z admin-only server fn — sam endpoint /api/x/auth wpuszcza wyłącznie
 * z ważnym state, żeby obcy nie podstawił swojego konta X jako firmowego.
 */
export async function startConnect(): Promise<{ state: string; authPath: string }> {
  const { configured } = getXEnv();
  if (!configured) {
    throw new Error("Brak X_CLIENT_ID / X_CLIENT_SECRET w zmiennych środowiskowych.");
  }
  await getIntegrationRow();
  const state = crypto.randomUUID();
  await patchIntegration({
    oauth_state: state,
    oauth_state_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    code_verifier: createCodeVerifier(),
  });
  return { state, authPath: `/api/x/auth?state=${encodeURIComponent(state)}` };
}

/** Sprawdza, że `state` pochodzi z aktywnego „Połącz" w panelu i nie wygasł. */
export async function assertPendingState(state: string): Promise<IntegrationRow> {
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
  if (!row.code_verifier) {
    throw new Error("Brak weryfikatora PKCE — spróbuj połączyć ponownie.");
  }
  return row;
}

/** URL zgody X-a dla zweryfikowanego `state` (redirect z /api/x/auth). */
export async function buildAuthorizeUrl(row: IntegrationRow): Promise<string> {
  const { clientId, redirectUri } = getXEnv();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES,
    state: row.oauth_state!,
    code_challenge: await codeChallenge(row.code_verifier!),
    code_challenge_method: "S256",
  });
  return `${OAUTH_AUTH_URL}?${params}`;
}

/** @me po połączeniu — żeby panel pokazał, CZYJE konto jest podpięte. */
async function fetchMe(token: string): Promise<{ id: string | null; username: string | null }> {
  try {
    const res = await fetch(ME_URL, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { id?: string; username?: string };
    };
    return { id: json.data?.id ?? null, username: json.data?.username ?? null };
  } catch {
    // Kosmetyka panelu nie może wywrócić połączenia.
    return { id: null, username: null };
  }
}

export async function handleOauthCallback(code: string, state: string): Promise<void> {
  const { clientId, redirectUri, configured } = getXEnv();
  if (!configured) throw new Error("Brak konfiguracji X_CLIENT_ID / X_CLIENT_SECRET.");
  const row = await assertPendingState(state);

  const { json, status } = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: row.code_verifier!,
    client_id: clientId,
  });
  const err = tokenError(json, status);
  if (err) throw new Error(`Wymiana kodu OAuth nieudana: ${err}`);
  if (!json.refresh_token) {
    throw new Error(
      "X nie zwrócił refresh tokena — upewnij się, że aplikacja ma zakres offline.access.",
    );
  }

  const me = await fetchMe(json.access_token!);
  await patchIntegration({
    access_token: json.access_token!,
    refresh_token: json.refresh_token,
    x_user_id: me.id,
    username: me.username,
    token_expires_at: new Date(Date.now() + (json.expires_in ?? 7200) * 1000).toISOString(),
    scope: json.scope ?? OAUTH_SCOPES,
    connected: true,
    oauth_state: null,
    oauth_state_expires_at: null,
    code_verifier: null,
    connected_at: new Date().toISOString(),
    last_error: null,
  });
}

export async function disconnectX(): Promise<void> {
  const { clientId, clientSecret, configured } = getXEnv();
  const row = await getIntegrationRow();
  if (row.access_token && configured) {
    // Unieważnij grant po stronie X-a; porażka nie blokuje odpięcia lokalnie.
    try {
      await fetch(OAUTH_REVOKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: basicAuthHeader(clientId, clientSecret),
        },
        body: new URLSearchParams({ token: row.access_token, token_type_hint: "access_token" }),
      });
    } catch {
      /* noop */
    }
  }
  await patchIntegration({
    access_token: null,
    refresh_token: null,
    x_user_id: null,
    username: null,
    token_expires_at: null,
    scope: null,
    connected: false,
    oauth_state: null,
    oauth_state_expires_at: null,
    code_verifier: null,
    connected_at: null,
    last_error: null,
  });
}

// ── Token ────────────────────────────────────────────────────────────────────

function needsRefresh(row: IntegrationRow): boolean {
  if (!row.access_token) return true;
  if (!row.token_expires_at) return true;
  return new Date(row.token_expires_at).getTime() < Date.now() + REFRESH_MARGIN_MS;
}

async function refreshAccessToken(row: IntegrationRow): Promise<string> {
  const { clientId } = getXEnv();
  if (!row.refresh_token) throw new Error("Konto X nie jest połączone.");
  const { json, status } = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
    client_id: clientId,
  });
  const err = tokenError(json, status);
  if (err) {
    const msg = `Odświeżenie tokena X nieudane: ${err}`;
    await patchIntegration({ last_error: msg });
    throw new Error(msg);
  }
  const accessToken = json.access_token!;
  await patchIntegration({
    access_token: accessToken,
    // X ROTUJE refresh_token przy każdym odświeżeniu i natychmiast unieważnia
    // poprzedni — bez zapisania nowego integracja umiera po dwóch godzinach.
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    token_expires_at: new Date(Date.now() + (json.expires_in ?? 7200) * 1000).toISOString(),
    ...(json.scope ? { scope: json.scope } : {}),
    connected: true,
    last_error: null,
  });
  return accessToken;
}

export async function getAccessToken(): Promise<string> {
  const { configured } = getXEnv();
  if (!configured) throw new Error("Brak konfiguracji X_CLIENT_ID / X_CLIENT_SECRET.");
  const row = await getIntegrationRow();
  if (!row.refresh_token) {
    throw new Error("Konto X nie jest połączone (panel → Ustawienia → Połącz X).");
  }
  if (!needsRefresh(row)) return row.access_token!;
  return refreshAccessToken(row);
}

/**
 * Proaktywne odświeżenie tokena z ticka. Nie rzuca — brak połączenia albo
 * cofnięta zgoda nie mogą wywalić ticka.
 */
export async function refreshXTokenIfNeeded(): Promise<{ refreshed: boolean; error?: string }> {
  try {
    const { configured } = getXEnv();
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

type ApiError = { detail?: string; title?: string; message?: string };

/**
 * X zwraca błędy albo jako `{errors:[…]}`, albo jako problem+json
 * (`{title, detail}`) — sklejamy obie formy w jeden komunikat dla panelu.
 */
function apiErrorMessage(json: unknown, status: number): string {
  const body = (json ?? {}) as { errors?: ApiError[]; detail?: string; title?: string };
  const first = body.errors?.[0];
  const parts = [body.title, body.detail, first?.title, first?.detail ?? first?.message].filter(
    (p): p is string => !!p,
  );
  return `${parts.join(" — ") || "nieznany błąd"} (HTTP ${status})`;
}

async function xJson(url: string, token: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X API: ${apiErrorMessage(json, res.status)}`);
  return json;
}

// ── Upload mediów ────────────────────────────────────────────────────────────

/**
 * media_id z odpowiedzi X-a. Endpointy v2 zwracają `data.id`, ale część
 * odpowiedzi (i starsze wdrożenia) nadal niesie `media_id_string` — czytamy
 * oba, bo pomyłka kosztuje odrzucony post.
 */
function readMediaId(json: unknown): string | null {
  const body = (json ?? {}) as {
    data?: { id?: string; media_key?: string };
    media_id_string?: string;
    id?: string;
  };
  return body.data?.id ?? body.media_id_string ?? body.id ?? body.data?.media_key ?? null;
}

function readProcessingState(json: unknown): { state: string; error: string | null } {
  const body = (json ?? {}) as {
    data?: { processing_info?: { state?: string; error?: { message?: string } } };
    processing_info?: { state?: string; error?: { message?: string } };
  };
  const info = body.data?.processing_info ?? body.processing_info;
  // Brak processing_info = materiał gotowy od ręki (tak jest dla grafik).
  return {
    state: info?.state ?? "succeeded",
    error: info?.error?.message ?? null,
  };
}

async function downloadMedia(media: XMedia): Promise<ArrayBuffer> {
  const res = await fetch(media.url);
  if (!res.ok) throw new Error(`Pobranie materiału nieudane: HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > media.maxBytes) {
    throw new Error(
      `Materiał za duży (${Math.round(declared / 1e6)} MB, limit ${Math.round(media.maxBytes / 1e6)} MB).`,
    );
  }
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > media.maxBytes) {
    throw new Error(
      `Materiał za duży (${Math.round(buffer.byteLength / 1e6)} MB, limit ${Math.round(media.maxBytes / 1e6)} MB).`,
    );
  }
  if (!buffer.byteLength) throw new Error("Materiał do publikacji na X jest pusty.");
  return buffer;
}

/**
 * Upload chunkowany: initialize → append(segment_index) → finalize.
 * Tą samą ścieżką idą grafiki i wideo — X przyjmuje oba, a jeden tor to
 * jeden zestaw błędów do obsłużenia zamiast dwóch.
 */
async function uploadMedia(source: XMedia, token: string): Promise<string> {
  let media = source;
  if (source.kind === "video") {
    // Kompresja do profilu publikacji (≤ 60 MB, MP4 H.264/AAC — X nie
    // przyjmuje HEVC ani MOV z telefonu). Rzuca VideoPreparingError, gdy
    // plik jeszcze się przygotowuje. Wynik jest zawsze MP4, więc typ
    // materiału liczymy od nowa z jego adresu.
    const { ensurePublishableVideo } = await import("./video-rendition.server");
    const url = await ensurePublishableVideo(source.url);
    if (url !== source.url) media = xMediaFromUrl(url, "video");
  }
  const buffer = await downloadMedia(media);
  const totalBytes = buffer.byteLength;

  const init = await xJson(`${MEDIA_UPLOAD_URL}/initialize`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: media.contentType,
      total_bytes: totalBytes,
      media_category: media.category,
    }),
  });
  const mediaId = readMediaId(init);
  if (!mediaId) throw new Error("X nie zwrócił media_id przy inicjalizacji uploadu.");

  for (const chunk of planXChunks(totalBytes)) {
    // Widok na bufor zamiast slice() — w pamięci trzymamy plik plus jeden
    // segment, a nie plik plus jego pełną kopię.
    const slice = new Uint8Array(buffer, chunk.start, chunk.end - chunk.start + 1);
    const form = new FormData();
    form.append("media", new Blob([slice], { type: media.contentType }));
    form.append("segment_index", String(chunk.index));
    const res = await fetch(`${MEDIA_UPLOAD_URL}/${mediaId}/append`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(`X API (segment ${chunk.index}): ${apiErrorMessage(json, res.status)}`);
    }
  }

  await xJson(`${MEDIA_UPLOAD_URL}/${mediaId}/finalize`, token, { method: "POST" });
  return mediaId;
}

/** STATUS — X transkoduje wideo asynchronicznie; grafiki są gotowe od razu. */
async function fetchMediaStatus(
  mediaId: string,
  token: string,
): Promise<{ state: "ready" | "pending" | "failed"; error?: string }> {
  const params = new URLSearchParams({ command: "STATUS", media_id: mediaId });
  const json = await xJson(`${MEDIA_UPLOAD_URL}?${params}`, token, { method: "GET" });
  const { state, error } = readProcessingState(json);
  if (state === "succeeded") return { state: "ready" };
  if (state === "failed") return { state: "failed", error: error ?? "przetwarzanie nieudane" };
  return { state: "pending" };
}

// ── Publikacja ───────────────────────────────────────────────────────────────

export type XQueueRow = {
  id: string;
  platform: string;
  title: string;
  message: string;
  video_url: string | null;
  image_url: string | null;
  scheduled_at: string;
  status: string;
  attempt_count: number;
  x_media_id: string | null;
  x_media_status: string | null;
  x_media_at: string | null;
  external_post_id: string | null;
  last_error: string | null;
  published_at: string | null;
  updated_at: string;
};

/** POST /2/tweets — zwraca id opublikowanego posta. */
async function postTweet(
  text: string,
  mediaId: string | null,
  token: string,
): Promise<string | null> {
  const json = (await xJson(TWEETS_URL, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      ...(mediaId ? { media: { media_ids: [mediaId] } } : {}),
    }),
  })) as { data?: { id?: string } };
  return json.data?.id ?? null;
}

async function markComplete(item: XQueueRow, postId: string | null) {
  await supabaseAdmin
    .from("social_publish_queue")
    .update({
      status: "published",
      x_media_status: item.x_media_id ? "ready" : null,
      external_post_id: postId,
      published_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", item.id);
}

async function markFailed(item: XQueueRow, msg: string, opts?: { noRetry?: boolean }) {
  const attempts = item.attempt_count + 1;
  const exhausted = opts?.noRetry || attempts >= MAX_ATTEMPTS;
  await supabaseAdmin
    .from("social_publish_queue")
    .update({
      status: exhausted ? "failed" : "pending",
      attempt_count: attempts,
      last_error: msg,
      // Ponowna próba startuje od zera: nowy upload, a x_media_status z powrotem
      // NULL — inaczej wpis nie spełniałby warunku wymagalności i utknąłby
      // w kolejce na zawsze.
      ...(exhausted
        ? { x_media_status: "failed" }
        : {
            x_media_status: null,
            x_media_id: null,
            x_media_at: null,
            scheduled_at: new Date(Date.now() + RETRY_DELAY_MIN * 60 * 1000).toISOString(),
          }),
    })
    .eq("id", item.id);
}

/**
 * Domyka materiał po uploadzie: kilka prób w tym ticku, a jeśli X wciąż
 * przetwarza — zostawia wpis w 'processing' dla kolejnych ticków.
 */
async function awaitMediaOrDefer(
  item: XQueueRow,
  mediaId: string,
  token: string,
  inlineAttempts: number,
): Promise<{ ready: boolean; failed?: boolean; error?: string }> {
  for (let i = 0; i < Math.max(1, inlineAttempts); i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const result = await fetchMediaStatus(mediaId, token);
    if (result.state === "ready") return { ready: true };
    if (result.state === "failed") {
      await markFailed(item, `X odrzucił materiał: ${result.error}`, { noRetry: true });
      return { ready: false, failed: true, error: result.error };
    }
  }
  await supabaseAdmin
    .from("social_publish_queue")
    .update({ status: "processing", x_media_status: "processing" })
    .eq("id", item.id);
  return { ready: false };
}

/** Treść posta: `message` jest właściwą treścią, `title` to zapasowy tytuł. */
function textFor(item: XQueueRow): string {
  const text = xPostText(item.message || item.title, getXEnv().postLimit);
  if (!text) throw new Error("Publikacja na X wymaga treści.");
  return text;
}

/**
 * Publikacja jednego wpisu kolejki. Optymistyczne przejęcie
 * (pending → publishing) chroni przed podwójną publikacją przy nakładających
 * się tickach — jak w TikToku/YouTube/Meta.
 */
export async function processXQueueItem(id: string): Promise<{
  ok: boolean;
  postId?: string | null;
  processing?: boolean;
  /** Wideo w kompresji — wpis odroczony, publikacja ruszy z ticka. */
  preparing?: boolean;
  error?: string;
}> {
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("social_publish_queue")
    .update({ status: "publishing", x_media_status: "pending" })
    .eq("id", id)
    .eq("platform", "x")
    .in("status", ["pending", "failed"])
    .select("*")
    .maybeSingle();
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed) return { ok: false, error: "Wpis nie jest w stanie do publikacji." };

  const item = claimed as XQueueRow;
  try {
    const text = textFor(item);
    const media = pickXMedia(item);
    const token = await getAccessToken();

    if (!media) {
      // Post czysto tekstowy — jeden strzał, bez pollingu.
      const postId = await postTweet(text, null, token);
      await markComplete({ ...item, x_media_id: null }, postId);
      return { ok: true, postId };
    }

    // Wpis miał już upload (worker padł po finalize) — NIE wgrywamy drugi raz.
    let mediaId = item.x_media_id;
    if (!mediaId) {
      await supabaseAdmin
        .from("social_publish_queue")
        .update({ x_media_status: "uploading" })
        .eq("id", item.id);
      mediaId = await uploadMedia(media, token);
      // media_id zapisujemy PRZED publikacją — gdyby worker padł teraz,
      // kolejny tick domknie wpis pollingiem zamiast wgrywać plik od nowa.
      await supabaseAdmin
        .from("social_publish_queue")
        .update({
          x_media_id: mediaId,
          x_media_status: "processing",
          x_media_at: new Date().toISOString(),
        })
        .eq("id", item.id);
    }

    const withMedia: XQueueRow = { ...item, x_media_id: mediaId };
    const wait = await awaitMediaOrDefer(withMedia, mediaId, token, POLLS_INLINE);
    if (wait.failed) return { ok: false, error: wait.error };
    if (!wait.ready) return { ok: true, processing: true };

    const postId = await postTweet(text, mediaId, token);
    await markComplete(withMedia, postId);
    return { ok: true, postId };
  } catch (err) {
    const { VideoPreparingError } = await import("./video-rendition.server");
    if (err instanceof VideoPreparingError) {
      // Wideo się kompresuje — wpis wraca do kolejki na kilka minut BEZ
      // zużycia próby; upload się nie zaczął, więc nic nie poszło na profil.
      await supabaseAdmin
        .from("social_publish_queue")
        .update({
          status: "pending",
          x_media_status: null,
          last_error: err.note,
          scheduled_at: err.nextAt.toISOString(),
        })
        .eq("id", item.id);
      return { ok: true, preparing: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(item, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Wpisy Z MATERIAŁEM porzucone w 'publishing' PRZED uploadem (worker padł
 * między claimem a odpowiedzią X-a) nie mają media_id, więc polling ich nie
 * domknie, a claim przyjmuje tylko 'pending'/'failed'. Po STALLED_CLAIM_MIN
 * wracają do kolejki — upload się nie zaczął, więc nic nie poszło na profil.
 *
 * Postów CZYSTO TEKSTOWYCH świadomie NIE odbijamy: one nie mają uploadu, więc
 * brak media_id niczego nie dowodzi — wpis mógł już wylądować na profilu,
 * a worker paść przed zapisem statusu. Automatyczne wznowienie opublikowałoby
 * go drugi raz, więc taki wpis zostaje widoczny w panelu jako „Publikowanie…"
 * i czeka na decyzję człowieka (przycisk „Ponów"). Lepiej wpis do kliknięcia
 * niż zdublowany post na firmowym koncie.
 */
async function reclaimStalledItems(): Promise<void> {
  const cutoff = new Date(Date.now() - STALLED_CLAIM_MIN * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("social_publish_queue")
    .update({ status: "pending", x_media_status: null, x_media_at: null })
    .eq("platform", "x")
    .eq("status", "publishing")
    .is("x_media_id", null)
    .or("video_url.not.is.null,image_url.not.is.null")
    .lt("updated_at", cutoff);
}

/**
 * Samonaprawa po błędzie toru Meta: do poprawki tick Meta przejmował wpisy X
 * (filtr wykluczał tylko TikToka), robił z nich kontener Instagrama
 * (`ig_creation_id`) i zostawiał w 'processing'. Taki wpis nie ma
 * `x_media_id`, więc tor X go nie widział — „przetwarzanie…" na zawsze.
 *
 * Wracają do kolejki bez śladu IG. Bezpieczne: `x_media_id` jest NULL, więc
 * upload na X się nie zaczął i nic nie poszło na profil; kontener IG nigdy
 * nie został opublikowany (domykanie IG bierze tylko platform='instagram_reels')
 * i sam wygaśnie po 24 h. Przejęcie zabrało jedną próbę — oddajemy ją.
 */
async function reclaimHijackedItems(): Promise<number> {
  const { data: rows, error } = await supabaseAdmin
    .from("social_publish_queue")
    .select("id, attempt_count")
    .eq("platform", "x")
    .eq("status", "processing")
    .is("x_media_id", null)
    .not("ig_creation_id", "is", null)
    .limit(20);
  if (error || !rows?.length) return 0;
  for (const row of rows) {
    await supabaseAdmin
      .from("social_publish_queue")
      .update({
        status: "pending",
        ig_creation_id: null,
        ig_container_at: null,
        x_media_status: null,
        x_media_at: null,
        attempt_count: Math.max(0, row.attempt_count - 1),
        last_error: null,
        scheduled_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "processing")
      .is("x_media_id", null);
  }
  return rows.length;
}

/** Wpisy po uploadzie: dociągnij status materiału i opublikuj, gdy gotowy. */
async function processProcessingItems(): Promise<{ published: number; errors: string[] }> {
  const { data: rows, error } = await supabaseAdmin
    .from("social_publish_queue")
    .select("*")
    .eq("platform", "x")
    .in("status", ["processing", "publishing"])
    .in("x_media_status", ["uploading", "processing"])
    .not("x_media_id", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(MAX_POLLS_PER_TICK);
  if (error) throw new Error(error.message);
  if (!rows?.length) return { published: 0, errors: [] };

  let published = 0;
  const errors: string[] = [];
  const token = await getAccessToken();
  for (const raw of rows) {
    const item = raw as XQueueRow;
    try {
      const result = await fetchMediaStatus(item.x_media_id!, token);
      if (result.state === "ready") {
        const postId = await postTweet(textFor(item), item.x_media_id, token);
        await markComplete(item, postId);
        published += 1;
        continue;
      }
      if (result.state === "failed") {
        await markFailed(item, `X odrzucił materiał: ${result.error}`, { noRetry: true });
        errors.push(`X: ${result.error}`);
        continue;
      }
      // Wciąż przetwarzanie — po limicie czasu uznaj za przepadłe.
      const startedAt = new Date(item.x_media_at ?? item.updated_at).getTime();
      if ((Date.now() - startedAt) / 60_000 > PROCESSING_TIMEOUT_MIN) {
        await markFailed(item, "X nie zakończył przetwarzania materiału w limicie czasu.");
        errors.push("X: timeout przetwarzania");
      } else if (item.status !== "processing" || item.x_media_status !== "processing") {
        // Zapis tylko gdy stan faktycznie się zmienia — pusty UPDATE ruszałby
        // updated_at bez potrzeby.
        await supabaseAdmin
          .from("social_publish_queue")
          .update({ status: "processing", x_media_status: "processing" })
          .eq("id", item.id);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { published, errors };
}

/**
 * Tick X-a — wołany z /api/public/hooks/social-publish-tick (ten sam cron co
 * YouTube/FB/IG/TikTok). Najpierw odświeżenie tokena, potem domknięcie wpisów
 * po uploadzie, na końcu JEDNA nowa publikacja.
 */
export async function runXPublishTick(): Promise<{
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
  const { configured } = getXEnv();
  if (!configured) return empty;

  const row = await getIntegrationRow();
  if (!row.refresh_token) return empty;

  const errors: string[] = [];
  const refresh = await refreshXTokenIfNeeded();
  if (refresh.error) {
    // Bez tokena nie ma co próbować publikować — zgłoś i wyjdź.
    return { ...empty, errors: [refresh.error] };
  }

  await reclaimStalledItems().catch(() => {
    // Odbicie zawieszonych wpisów nie może wywalić ticka.
  });
  await reclaimHijackedItems().catch(() => {
    // Samonaprawa nie może wywalić ticka.
  });

  const poll = await processProcessingItems().catch((e) => {
    errors.push(e instanceof Error ? e.message : String(e));
    return { published: 0, errors: [] as string[] };
  });
  errors.push(...poll.errors);

  const { data: due, error } = await supabaseAdmin
    .from("social_publish_queue")
    .select("id")
    .eq("platform", "x")
    .eq("status", "pending")
    .is("x_media_status", null)
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(MAX_POSTS_PER_TICK);
  if (error) throw new Error(error.message);

  let published = poll.published;
  let processing = 0;
  let processed = 0;
  for (const item of due ?? []) {
    processed += 1;
    const result = await processXQueueItem(item.id);
    if (result.ok && result.processing) processing += 1;
    else if (result.ok && !result.preparing) published += 1;
    else if (result.error) errors.push(result.error);
  }

  return { ok: true, processed, published, processing, tokenRefreshed: refresh.refreshed, errors };
}
