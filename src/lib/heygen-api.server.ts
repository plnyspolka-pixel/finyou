/**
 * Klient API HeyGen — jedno miejsce z uwierzytelnieniem (`HEYGEN_API_KEY`) i
 * typowanymi wywołaniami dla funkcji, których używa Finance You: awatary i
 * głosy, limit kredytów, lista i status filmów, generowanie wideo awatara
 * (z tekstu przez ElevenLabs albo głosem HeyGen, z gotowego audio), szablony,
 * tłumaczenie wideo, biblioteka stocku, upload assetów i ogólne wywołanie.
 *
 * Render „studyjny” (TTS ElevenLabs → asset → `POST /v3/videos`) reużywa
 * helperów modułu Awatar FAQ (`avatar-faq.server.ts`), bo ta ścieżka działa
 * na produkcji — nie duplikujemy jej. Używany przez narzędzia MCP
 * (`src/lib/mcp/tools/heygen.ts`) i dostępny dla panelu.
 */
import type { CaptionMode } from "./studio-captions";

const HEYGEN_BASE = "https://api.heygen.com";
const HEYGEN_UPLOAD_BASE = "https://upload.heygen.com";
const DEFAULT_TIMEOUT_MS = 60_000;

export function hasHeygenApiKey(): boolean {
  return Boolean(process.env.HEYGEN_API_KEY);
}

export function heygenApiKey(): string {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new Error("Brak HEYGEN_API_KEY w środowisku serwera.");
  return k;
}

export type HeygenResponse = {
  ok: boolean;
  status: number;
  contentType: string;
  json?: any;
  text?: string;
  bytes?: ArrayBuffer;
};

export type HeygenRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  json?: unknown;
  form?: FormData;
  /** Surowe bajty w body (np. upload zdjęcia na upload.heygen.com). */
  raw?: { bytes: ArrayBuffer | Uint8Array; contentType: string };
  accept?: string;
  timeoutMs?: number;
  /** `upload` = host upload.heygen.com (talking photo, assety v1). */
  host?: "api" | "upload";
};

function errorMessage(res: HeygenResponse): string {
  const j = res.json;
  const detail =
    (typeof j?.error === "string" ? j.error : undefined) ??
    j?.error?.message ??
    j?.message ??
    j?.detail?.message ??
    (typeof j?.detail === "string" ? j.detail : undefined) ??
    res.text?.slice(0, 300);
  const code = j?.error?.code ?? j?.code;
  return `HeyGen HTTP ${res.status}${code ? ` (${code})` : ""}${detail ? `: ${detail}` : ""}`;
}

/**
 * Ogólne wywołanie API HeyGen. `path` musi zaczynać się od `/v1/`, `/v2/`
 * albo `/v3/`. Rzuca `Error` przy statusie ≠ 2xx albo gdy odpowiedź niesie
 * `error` (styl v2: `{ error, data }`).
 */
export async function heygenRequest(
  path: string,
  opts: HeygenRequestOptions = {},
): Promise<HeygenResponse> {
  if (!/^\/v[123]\/[A-Za-z0-9_\-./%]+$/.test(path) || path.includes("..")) {
    throw new Error(
      "Ścieżka musi mieć postać /v1/..., /v2/... albo /v3/... (bez znaków specjalnych).",
    );
  }
  const base = opts.host === "upload" ? HEYGEN_UPLOAD_BASE : HEYGEN_BASE;
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { "X-Api-Key": heygenApiKey() };
  headers.accept = opts.accept ?? "application/json";
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.raw) {
    headers["content-type"] = opts.raw.contentType;
    body = toArrayBuffer(opts.raw.bytes);
  } else if (opts.json !== undefined) {
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
  const contentType = res.headers.get("content-type") ?? "";
  const out: HeygenResponse = { ok: res.ok, status: res.status, contentType };
  if (contentType.includes("application/json")) {
    out.json = await res.json().catch(() => null);
  } else if (contentType.startsWith("text/")) {
    out.text = await res.text().catch(() => "");
  } else {
    out.bytes = await res.arrayBuffer();
  }
  if (!res.ok) throw new Error(errorMessage(out));
  const err = out.json?.error;
  if (err && (typeof err === "string" || typeof err === "object")) {
    out.ok = false;
    throw new Error(errorMessage(out));
  }
  return out;
}

/** Wywołanie zwracające `data` z koperty HeyGen (albo całe JSON, gdy koperty nie ma). */
export async function heygenData<T = any>(
  path: string,
  opts: HeygenRequestOptions = {},
): Promise<T> {
  const r = await heygenRequest(path, opts);
  const j = r.json ?? {};
  return (j.data !== undefined && j.data !== null ? j.data : j) as T;
}

/** Kopia bajtów jako zwykły ArrayBuffer (fetch/Blob nie przyjmują widoków na SharedArrayBuffer). */
function toArrayBuffer(b: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (b instanceof Uint8Array)
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return b;
}

const isNotFound = (e: unknown) => /HTTP 40[45]/.test(e instanceof Error ? e.message : String(e));

export const unixToIso = (v: unknown): string | null =>
  typeof v === "number" && v > 0
    ? new Date(v > 1e12 ? v : v * 1000).toISOString()
    : typeof v === "string" && v
      ? v
      : null;

// ── Konto ───────────────────────────────────────────────────────────────────

export async function getRemainingQuota(): Promise<{
  remaining_quota: number | null;
  /** Orientacyjnie: HeyGen liczy 60 jednostek = 1 kredyt (≈ 1 min wideo). */
  credits_estimate: number | null;
  details: unknown;
}> {
  const d = await heygenData("/v2/user/remaining_quota");
  const q = typeof d?.remaining_quota === "number" ? d.remaining_quota : null;
  return {
    remaining_quota: q,
    credits_estimate: q === null ? null : Math.round((q / 60) * 100) / 100,
    details: d?.details ?? null,
  };
}

// ── Awatary i głosy ─────────────────────────────────────────────────────────

export type HeygenVoice = {
  voice_id: string;
  name: string;
  language: string | null;
  gender: string | null;
  preview_audio: string | null;
  support_pause: boolean | null;
  emotion_support: boolean | null;
};

export async function listVoices(): Promise<HeygenVoice[]> {
  const d = await heygenData("/v2/voices");
  const list: any[] = Array.isArray(d?.voices) ? d.voices : Array.isArray(d) ? d : [];
  return list.map((v) => ({
    voice_id: String(v.voice_id ?? v.id ?? ""),
    name: String(v.name ?? v.display_name ?? ""),
    language: v.language ?? null,
    gender: v.gender ?? null,
    preview_audio: v.preview_audio ?? null,
    support_pause: typeof v.support_pause === "boolean" ? v.support_pause : null,
    emotion_support: typeof v.emotion_support === "boolean" ? v.emotion_support : null,
  }));
}

export async function listAvatarGroups(includePublic = false): Promise<any[]> {
  const d = await heygenData("/v2/avatar_group.list", { query: { include_public: includePublic } });
  return Array.isArray(d?.avatar_group_list) ? d.avatar_group_list : [];
}

export async function getAvatarDetails(avatarId: string): Promise<any> {
  return heygenData(`/v2/avatar/${encodeURIComponent(avatarId)}/details`);
}

// ── Filmy ───────────────────────────────────────────────────────────────────

export type HeygenVideoListItem = {
  video_id: string;
  status: string | null;
  title: string | null;
  type: string | null;
  created_at: string | null;
  thumbnail_url: string | null;
  duration: number | null;
};

export async function listVideos(opts: { limit?: number; token?: string } = {}): Promise<{
  videos: HeygenVideoListItem[];
  next_token: string | null;
}> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  let d: any;
  try {
    d = await heygenData("/v1/video.list", { query: { limit, token: opts.token } });
  } catch (e) {
    if (!isNotFound(e)) throw e;
    d = await heygenData("/v3/videos", { query: { limit, page_token: opts.token } });
  }
  const raw: any[] = Array.isArray(d?.videos)
    ? d.videos
    : Array.isArray(d?.items)
      ? d.items
      : Array.isArray(d?.list)
        ? d.list
        : Array.isArray(d)
          ? d
          : [];
  return {
    videos: raw.map((v) => ({
      video_id: String(v.video_id ?? v.id ?? ""),
      status: v.status ?? null,
      title: v.video_title ?? v.title ?? null,
      type: v.type ?? null,
      created_at: unixToIso(v.created_at),
      thumbnail_url: v.thumbnail_url ?? null,
      duration: typeof v.duration === "number" ? v.duration : null,
    })),
    next_token: d?.token ?? d?.next_page_token ?? d?.next_token ?? null,
  };
}

export type HeygenVideo = {
  video_id: string;
  status: string;
  title: string | null;
  /** Czysty master (bez napisów w obrazie). */
  video_url: string | null;
  /** Ten sam render z wypalonymi napisami (gdy zamówiono). */
  captioned_video_url: string | null;
  thumbnail_url: string | null;
  gif_url: string | null;
  subtitle_url: string | null;
  duration: number | null;
  created_at: string | null;
  error: string | null;
  raw: any;
};

export async function getVideo(videoId: string): Promise<HeygenVideo> {
  let d: any;
  try {
    d = await heygenData(`/v3/videos/${encodeURIComponent(videoId)}`);
  } catch (e) {
    if (!isNotFound(e)) throw e;
    d = await heygenData("/v1/video_status.get", { query: { video_id: videoId } });
  }
  const err = d?.failure_message ?? d?.failure_code ?? d?.error;
  return {
    video_id: String(d?.video_id ?? d?.id ?? videoId),
    status: d?.status ?? "unknown",
    title: d?.video_title ?? d?.title ?? null,
    video_url: d?.video_url ?? null,
    captioned_video_url: d?.captioned_video_url ?? null,
    thumbnail_url: d?.thumbnail_url ?? null,
    gif_url: d?.gif_url ?? null,
    subtitle_url: d?.caption_url ?? d?.subtitle_url ?? d?.srt_url ?? d?.caption?.url ?? null,
    duration: typeof d?.duration === "number" ? d.duration : null,
    created_at: unixToIso(d?.created_at),
    error: err ? (typeof err === "string" ? err : JSON.stringify(err)) : null,
    raw: d ?? null,
  };
}

/** Animowany podgląd GIF (API v1 zwraca `gif_url` dla gotowych filmów); `null`, gdy brak. */
export async function getVideoGif(videoId: string): Promise<string | null> {
  try {
    const d = await heygenData("/v1/video_status.get", { query: { video_id: videoId } });
    return typeof d?.gif_url === "string" && d.gif_url ? d.gif_url : null;
  } catch {
    return null;
  }
}

export async function deleteVideo(videoId: string): Promise<void> {
  try {
    await heygenRequest(`/v3/videos/${encodeURIComponent(videoId)}`, { method: "DELETE" });
  } catch (e) {
    if (!isNotFound(e)) throw e;
    await heygenRequest("/v1/video.delete", { method: "DELETE", query: { video_id: videoId } });
  }
}

// ── Assety i stock ──────────────────────────────────────────────────────────

export type HeygenAsset = { asset_id: string; url: string | null; type: string | null; raw: any };

/** Upload pliku (audio / obraz / wideo) do biblioteki HeyGen — `POST /v3/assets`. */
export async function uploadAsset(
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
  filename = "asset",
): Promise<HeygenAsset> {
  const form = new FormData();
  const blob = new Blob([toArrayBuffer(bytes)], { type: contentType });
  form.append("file", blob, filename);
  const d = await heygenData("/v3/assets", { method: "POST", form, timeoutMs: 180_000 });
  const id = d?.asset_id ?? d?.id;
  if (!id)
    throw new Error(`HeyGen upload: brak asset id w odpowiedzi ${JSON.stringify(d).slice(0, 200)}`);
  return {
    asset_id: String(id),
    url: d?.url ?? null,
    type: d?.type ?? d?.file_type ?? null,
    raw: d,
  };
}

export async function uploadAssetFromUrl(
  url: string,
  opts: { maxBytes?: number; filename?: string } = {},
): Promise<HeygenAsset> {
  const { fetchBytes } = await import("./media-storage.server");
  const file = await fetchBytes(url, opts.maxBytes ?? 100 * 1024 * 1024);
  const name = opts.filename ?? url.split("?")[0].split("/").pop() ?? "asset";
  return uploadAsset(file.bytes, file.contentType, name);
}

export type HeygenStockItem = {
  id: string | null;
  url: string | null;
  thumbnail_url: string | null;
  type: string | null;
  orientation: string | null;
  name: string | null;
};

export async function searchStock(
  query: string,
  opts: { type?: "image" | "video" | "icon"; limit?: number; scope?: "public" | "private" } = {},
): Promise<HeygenStockItem[]> {
  const d = await heygenData("/v3/assets/search", {
    query: {
      query,
      type: opts.type ?? "image",
      scope: opts.scope ?? "public",
      limit: Math.min(50, Math.max(1, opts.limit ?? 20)),
    },
  });
  const list: any[] = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
  return list.map((i) => ({
    id: i.id ?? i.asset_id ?? null,
    url: i.url ?? null,
    thumbnail_url: i.thumbnail_url ?? i.preview_url ?? null,
    type: i.type ?? null,
    orientation: i.orientation ?? null,
    name: i.name ?? null,
  }));
}

// ── Generowanie wideo awatara ───────────────────────────────────────────────

export type AspectRatio = "9:16" | "16:9" | "1:1";
const DIMENSIONS: Record<
  AspectRatio,
  Record<"720p" | "1080p", { width: number; height: number }>
> = {
  "9:16": { "720p": { width: 720, height: 1280 }, "1080p": { width: 1080, height: 1920 } },
  "16:9": { "720p": { width: 1280, height: 720 }, "1080p": { width: 1920, height: 1080 } },
  "1:1": { "720p": { width: 720, height: 720 }, "1080p": { width: 1080, height: 1080 } },
};

export type CreateAvatarVideoOptions = {
  avatarId: string;
  /** Tekst lektora (gdy nie ma gotowego audio). */
  script?: string;
  /** Głos ElevenLabs dla `script` (domyślnie Filip). Ignorowany przy `heygenVoiceId`. */
  elevenVoiceId?: string;
  /** Głos HeyGen — wtedy tekst czyta HeyGen (API v2), bez ElevenLabs. */
  heygenVoiceId?: string;
  /** Gotowe nagranie lektora: asset HeyGen albo adres https. */
  audioAssetId?: string;
  audioUrl?: string;
  aspectRatio?: AspectRatio;
  resolution?: "720p" | "1080p";
  backgroundColor?: string;
  /** Tło obrazem / wideo — tylko ścieżka v2 (głos HeyGen). */
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;
  captions?: CaptionMode;
  title?: string;
  /** `talking_photo` = awatar ze zdjęcia w API v2. */
  characterKind?: "avatar" | "talking_photo";
  speed?: number;
};

export type CreateAvatarVideoResult = {
  video_id: string;
  caption_mode: CaptionMode;
  engine: "v3_audio" | "v2_text";
  audio_asset_id: string | null;
};

/**
 * Tworzy wideo awatara. Kolejność wyboru ścieżki:
 *  1. `heygenVoiceId` + `script` → `POST /v2/video/generate` (głos HeyGen),
 *  2. `audioAssetId` / `audioUrl` → `POST /v3/videos` z gotowym audio,
 *  3. `script` → ElevenLabs TTS → asset → `POST /v3/videos` (tak jak Studio).
 */
export async function createAvatarVideo(
  o: CreateAvatarVideoOptions,
): Promise<CreateAvatarVideoResult> {
  const aspect = o.aspectRatio ?? "9:16";
  const resolution = o.resolution ?? "720p";
  const captions: CaptionMode = o.captions ?? "sidecar";

  if (o.heygenVoiceId && o.script) {
    const background = o.backgroundVideoUrl
      ? { type: "video", url: o.backgroundVideoUrl, play_style: "loop" }
      : o.backgroundImageUrl
        ? { type: "image", url: o.backgroundImageUrl }
        : { type: "color", value: o.backgroundColor ?? "#101728" };
    const character =
      o.characterKind === "talking_photo"
        ? { type: "talking_photo", talking_photo_id: o.avatarId }
        : { type: "avatar", avatar_id: o.avatarId, avatar_style: "normal" };
    const d = await heygenData("/v2/video/generate", {
      method: "POST",
      json: {
        title: o.title,
        caption: captions !== "off",
        dimension: DIMENSIONS[aspect][resolution],
        video_inputs: [
          {
            character,
            voice: {
              type: "text",
              input_text: o.script,
              voice_id: o.heygenVoiceId,
              speed: o.speed ?? 1.0,
            },
            background,
          },
        ],
      },
      timeoutMs: 120_000,
    });
    const id = d?.video_id;
    if (!id)
      throw new Error(`HeyGen v2 generate: brak video_id ${JSON.stringify(d).slice(0, 200)}`);
    return {
      video_id: String(id),
      caption_mode: captions === "off" ? "off" : "burned",
      engine: "v2_text",
      audio_asset_id: null,
    };
  }

  const { ttsElevenLabs, uploadAudioToHeygen, sendVideoCreate } =
    await import("./avatar-faq.server");
  let assetId = o.audioAssetId ?? null;
  if (!assetId && o.audioUrl) {
    const { fetchBytes } = await import("./media-storage.server");
    const audio = await fetchBytes(o.audioUrl, 50 * 1024 * 1024);
    assetId = await uploadAudioToHeygen(audio.bytes);
  }
  if (!assetId) {
    if (!o.script?.trim())
      throw new Error("Podaj `script` (tekst lektora) albo `audio_url` / `audio_asset_id`.");
    const { FILIP_VOICE_ID } = await import("./heygen-avatars");
    const audio = await ttsElevenLabs({
      text: o.script,
      voiceId: o.elevenVoiceId || FILIP_VOICE_ID,
    });
    assetId = await uploadAudioToHeygen(audio);
  }
  const created = await sendVideoCreate(
    {
      type: "avatar",
      avatar_id: o.avatarId,
      audio_asset_id: assetId,
      aspect_ratio: aspect,
      resolution,
      background: { type: "color", value: o.backgroundColor ?? "#101728" },
    },
    captions,
  );
  return {
    video_id: created.videoId,
    caption_mode: created.captionMode,
    engine: "v3_audio",
    audio_asset_id: assetId,
  };
}

// ── Szablony ────────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<any[]> {
  const d = await heygenData("/v2/templates");
  return Array.isArray(d?.templates) ? d.templates : Array.isArray(d) ? d : [];
}

export async function getTemplate(templateId: string): Promise<any> {
  return heygenData(`/v2/template/${encodeURIComponent(templateId)}`);
}

export async function generateFromTemplate(
  templateId: string,
  opts: {
    title?: string;
    variables?: Record<string, unknown>;
    caption?: boolean;
    aspectRatio?: AspectRatio;
    resolution?: "720p" | "1080p";
  } = {},
): Promise<{ video_id: string }> {
  const json: Record<string, unknown> = {
    title: opts.title,
    caption: opts.caption ?? false,
    variables: opts.variables ?? {},
  };
  if (opts.aspectRatio) json.dimension = DIMENSIONS[opts.aspectRatio][opts.resolution ?? "720p"];
  const d = await heygenData(`/v2/template/${encodeURIComponent(templateId)}/generate`, {
    method: "POST",
    json,
    timeoutMs: 120_000,
  });
  const id = d?.video_id;
  if (!id)
    throw new Error(`HeyGen template generate: brak video_id ${JSON.stringify(d).slice(0, 200)}`);
  return { video_id: String(id) };
}

// ── Tłumaczenie wideo ───────────────────────────────────────────────────────

export async function listTranslateLanguages(): Promise<string[]> {
  const d = await heygenData("/v2/video_translate/target_languages");
  const list = Array.isArray(d?.languages) ? d.languages : Array.isArray(d) ? d : [];
  return list.map((l: unknown) => String(l));
}

export async function translateVideo(opts: {
  videoUrl: string;
  outputLanguage: string;
  title?: string;
  translateAudioOnly?: boolean;
  speakerNum?: number;
}): Promise<{ video_translate_id: string }> {
  const d = await heygenData("/v2/video_translate", {
    method: "POST",
    json: {
      video_url: opts.videoUrl,
      output_language: opts.outputLanguage,
      title: opts.title,
      translate_audio_only: opts.translateAudioOnly ?? false,
      speaker_num: opts.speakerNum,
    },
    timeoutMs: 120_000,
  });
  const id = d?.video_translate_id ?? d?.id;
  if (!id)
    throw new Error(`HeyGen translate: brak video_translate_id ${JSON.stringify(d).slice(0, 200)}`);
  return { video_translate_id: String(id) };
}

export async function getTranslation(id: string): Promise<{
  video_translate_id: string;
  status: string;
  title: string | null;
  url: string | null;
  message: string | null;
  raw: any;
}> {
  const d = await heygenData(`/v2/video_translate/${encodeURIComponent(id)}`);
  return {
    video_translate_id: String(d?.video_translate_id ?? id),
    status: d?.status ?? "unknown",
    title: d?.title ?? null,
    url: d?.url ?? d?.video_url ?? null,
    message: d?.message ?? d?.error ?? null,
    raw: d ?? null,
  };
}
