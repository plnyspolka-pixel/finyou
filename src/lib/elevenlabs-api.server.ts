/**
 * Klient API ElevenLabs — jedno miejsce z uwierzytelnieniem (`ELEVENLABS_API_KEY`)
 * i typowanymi wywołaniami dla funkcji, których używa Finance You:
 * agenty konwersacyjne (ConvAI), rozmowy i nagrania, numery telefonów,
 * baza wiedzy, głosy, TTS, STT (Scribe), efekty dźwiękowe, muzyka, dubbing
 * wideo/audio oraz generowanie wideo (endpoint konfigurowalny).
 *
 * Używany przez narzędzia MCP (`src/lib/mcp/tools/elevenlabs.ts`) i dostępny
 * dla panelu / server functions. Nie loguje kluczy. `elevenRequest` jest
 * ogólnym wywołaniem — każda nowa funkcja API jest dostępna bez zmiany kodu.
 */

const EL_BASE = "https://api.elevenlabs.io";
const DEFAULT_TIMEOUT_MS = 60_000;

export function elevenApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Brak ELEVENLABS_API_KEY w środowisku serwera.");
  return key;
}

export function hasElevenApiKey(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export type ElevenResponse = {
  ok: boolean;
  status: number;
  contentType: string;
  /** Odpowiedź JSON (gdy content-type to application/json). */
  json?: any;
  /** Odpowiedź binarna (audio / wideo / plik). */
  bytes?: ArrayBuffer;
  /** Odpowiedź tekstowa (gdy nie JSON i nie binarna). */
  text?: string;
};

export type ElevenRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  json?: unknown;
  form?: FormData;
  accept?: string;
  timeoutMs?: number;
};

function errorMessage(res: ElevenResponse): string {
  const j = res.json;
  const detail =
    j?.detail?.message ??
    (typeof j?.detail === "string" ? j.detail : undefined) ??
    j?.message ??
    (Array.isArray(j?.detail) ? JSON.stringify(j.detail).slice(0, 300) : undefined) ??
    res.text?.slice(0, 300);
  return `ElevenLabs HTTP ${res.status}${detail ? `: ${detail}` : ""}`;
}

/**
 * Ogólne wywołanie API ElevenLabs. `path` musi zaczynać się od `/v1/` lub `/v2/`.
 * Rzuca `Error` przy statusie ≠ 2xx (z komunikatem z API).
 */
export async function elevenRequest(
  path: string,
  opts: ElevenRequestOptions = {},
): Promise<ElevenResponse> {
  if (!/^\/v[12]\/[A-Za-z0-9_\-./%]+$/.test(path) || path.includes("..")) {
    throw new Error("Ścieżka musi mieć postać /v1/... albo /v2/... (bez znaków specjalnych).");
  }
  const key = elevenApiKey();
  const url = new URL(EL_BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { "xi-api-key": key };
  if (opts.accept) headers.accept = opts.accept;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.json !== undefined) {
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
  const out: ElevenResponse = { ok: res.ok, status: res.status, contentType };
  if (contentType.includes("application/json")) {
    out.json = await res.json().catch(() => null);
  } else if (contentType.startsWith("text/")) {
    out.text = await res.text().catch(() => "");
  } else {
    out.bytes = await res.arrayBuffer();
  }
  if (!res.ok) throw new Error(errorMessage(out));
  return out;
}

async function elevenJson<T = any>(path: string, opts: ElevenRequestOptions = {}): Promise<T> {
  const r = await elevenRequest(path, { accept: "application/json", ...opts });
  return (r.json ?? {}) as T;
}

async function elevenBytes(
  path: string,
  opts: ElevenRequestOptions = {},
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const r = await elevenRequest(path, opts);
  if (!r.bytes) {
    throw new Error(`ElevenLabs zwrócił ${r.contentType || "tekst"} zamiast pliku.`);
  }
  return { bytes: r.bytes, contentType: r.contentType || "application/octet-stream" };
}

// ── Konto ───────────────────────────────────────────────────────────────────

export async function getSubscription() {
  return elevenJson("/v1/user/subscription");
}

// ── Głosy / TTS / STT ───────────────────────────────────────────────────────

export type ElevenVoice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
  description?: string;
};

export async function listVoices(opts: { search?: string; pageSize?: number } = {}) {
  const all: ElevenVoice[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const json: { voices?: ElevenVoice[]; has_more?: boolean; next_page_token?: string | null } =
      await elevenJson("/v2/voices", {
        query: {
          page_size: opts.pageSize ?? 100,
          search: opts.search,
          next_page_token: pageToken ?? undefined,
        },
      });
    all.push(...(json.voices ?? []));
    if (!json.has_more || !json.next_page_token) break;
    pageToken = json.next_page_token;
  }
  return all;
}

export async function textToSpeech(opts: {
  voiceId: string;
  text: string;
  modelId?: string;
  outputFormat?: string;
  voiceSettings?: { stability?: number; similarity_boost?: number; style?: number; speed?: number };
  languageCode?: string;
}): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  return elevenBytes(`/v1/text-to-speech/${encodeURIComponent(opts.voiceId)}`, {
    method: "POST",
    query: { output_format: opts.outputFormat ?? "mp3_44100_128" },
    json: {
      text: opts.text,
      model_id: opts.modelId ?? "eleven_multilingual_v2",
      language_code: opts.languageCode,
      voice_settings: opts.voiceSettings ?? { stability: 0.55, similarity_boost: 0.8 },
    },
    timeoutMs: 120_000,
  });
}

export async function speechToText(opts: {
  bytes: ArrayBuffer;
  filename: string;
  contentType?: string;
  languageCode?: string;
  diarize?: boolean;
  modelId?: string;
}): Promise<{ text: string; language_code?: string; words?: unknown[]; raw: any }> {
  const fd = new FormData();
  fd.append(
    "file",
    new Blob([opts.bytes], { type: opts.contentType ?? "audio/mpeg" }),
    opts.filename,
  );
  fd.append("model_id", opts.modelId ?? "scribe_v1");
  if (opts.languageCode) fd.append("language_code", opts.languageCode);
  fd.append("diarize", opts.diarize ? "true" : "false");
  fd.append("tag_audio_events", "false");
  const json = await elevenJson("/v1/speech-to-text", {
    method: "POST",
    form: fd,
    timeoutMs: 300_000,
  });
  return {
    text: String(json?.text ?? "").trim(),
    language_code: json?.language_code,
    words: json?.words,
    raw: json,
  };
}

// ── Efekty dźwiękowe / muzyka ───────────────────────────────────────────────

export async function generateSoundEffect(opts: {
  text: string;
  durationSeconds?: number;
  promptInfluence?: number;
}) {
  return elevenBytes("/v1/sound-generation", {
    method: "POST",
    json: {
      text: opts.text,
      duration_seconds: opts.durationSeconds,
      prompt_influence: opts.promptInfluence,
    },
    timeoutMs: 120_000,
  });
}

export async function composeMusic(opts: { prompt: string; lengthMs?: number; modelId?: string }) {
  return elevenBytes("/v1/music", {
    method: "POST",
    json: {
      prompt: opts.prompt,
      music_length_ms: opts.lengthMs,
      model_id: opts.modelId,
    },
    timeoutMs: 300_000,
  });
}

// ── Agenty konwersacyjne ────────────────────────────────────────────────────

export async function listAgents(
  opts: { search?: string; pageSize?: number; cursor?: string } = {},
) {
  return elevenJson<{ agents?: any[]; has_more?: boolean; next_cursor?: string | null }>(
    "/v1/convai/agents",
    { query: { search: opts.search, page_size: opts.pageSize ?? 30, cursor: opts.cursor } },
  );
}

export async function getAgent(agentId: string) {
  return elevenJson(`/v1/convai/agents/${encodeURIComponent(agentId)}`);
}

/**
 * PATCH agenta. Najpierw z `dynamic_variable_placeholders` (żeby rozmowa bez
 * zmiennych nie padła), a gdy API odrzuci to pole — bez niego (jak w
 * `elevenlabs-agents.server.ts`).
 */
export async function patchAgent(
  agentId: string,
  patch: {
    name?: string;
    first_message?: string;
    prompt?: string;
    language?: string;
    llm?: string;
    voice_id?: string;
    tts_model_id?: string;
    knowledge_base?: unknown[];
    dynamic_variable_placeholders?: Record<string, string>;
  },
) {
  const agent: Record<string, unknown> = {};
  if (patch.first_message !== undefined) agent.first_message = patch.first_message;
  if (patch.language !== undefined) agent.language = patch.language;
  const prompt: Record<string, unknown> = {};
  if (patch.prompt !== undefined) prompt.prompt = patch.prompt;
  if (patch.llm !== undefined) prompt.llm = patch.llm;
  if (patch.knowledge_base !== undefined) prompt.knowledge_base = patch.knowledge_base;
  if (Object.keys(prompt).length) agent.prompt = prompt;
  const tts: Record<string, unknown> = {};
  if (patch.voice_id !== undefined) tts.voice_id = patch.voice_id;
  if (patch.tts_model_id !== undefined) tts.model_id = patch.tts_model_id;

  const build = (extra: Record<string, unknown>) => {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    const cc: Record<string, unknown> = {};
    const agentCfg = { ...agent, ...extra };
    if (Object.keys(agentCfg).length) cc.agent = agentCfg;
    if (Object.keys(tts).length) cc.tts = tts;
    if (Object.keys(cc).length) body.conversation_config = cc;
    return body;
  };
  const path = `/v1/convai/agents/${encodeURIComponent(agentId)}`;
  if (patch.dynamic_variable_placeholders) {
    try {
      return await elevenJson(path, {
        method: "PATCH",
        json: build({
          dynamic_variables: {
            dynamic_variable_placeholders: patch.dynamic_variable_placeholders,
          },
        }),
      });
    } catch {
      /* API odrzuciło pole — próba bez niego */
    }
  }
  return elevenJson(path, { method: "PATCH", json: build({}) });
}

export async function listConversations(
  opts: {
    agentId?: string;
    pageSize?: number;
    cursor?: string;
    callStartAfterUnix?: number;
    callStartBeforeUnix?: number;
    callSuccessful?: "success" | "failure" | "unknown";
  } = {},
) {
  return elevenJson<{ conversations?: any[]; has_more?: boolean; next_cursor?: string | null }>(
    "/v1/convai/conversations",
    {
      query: {
        agent_id: opts.agentId,
        page_size: opts.pageSize ?? 30,
        cursor: opts.cursor,
        call_start_after_unix: opts.callStartAfterUnix,
        call_start_before_unix: opts.callStartBeforeUnix,
        call_successful: opts.callSuccessful,
      },
    },
  );
}

export async function getConversation(conversationId: string) {
  return elevenJson(`/v1/convai/conversations/${encodeURIComponent(conversationId)}`);
}

export async function getConversationAudio(conversationId: string) {
  return elevenBytes(`/v1/convai/conversations/${encodeURIComponent(conversationId)}/audio`, {
    timeoutMs: 120_000,
  });
}

export async function listPhoneNumbers() {
  return elevenJson<any[]>("/v1/convai/phone-numbers");
}

export async function outboundCall(opts: {
  agentId: string;
  agentPhoneNumberId: string;
  toNumber: string;
  dynamicVariables?: Record<string, string | number | boolean>;
}) {
  return elevenJson("/v1/convai/twilio/outbound-call", {
    method: "POST",
    json: {
      agent_id: opts.agentId,
      agent_phone_number_id: opts.agentPhoneNumberId,
      to_number: opts.toNumber,
      conversation_initiation_client_data: opts.dynamicVariables
        ? { dynamic_variables: opts.dynamicVariables }
        : undefined,
    },
  });
}

// ── Baza wiedzy agentów ─────────────────────────────────────────────────────

export async function listKnowledgeBase(opts: { pageSize?: number; search?: string } = {}) {
  return elevenJson<{ documents?: any[]; has_more?: boolean; next_cursor?: string | null }>(
    "/v1/convai/knowledge-base",
    { query: { page_size: opts.pageSize ?? 50, search: opts.search } },
  );
}

export async function createKnowledgeText(opts: { name: string; text: string }) {
  return elevenJson<{ id: string; name: string }>("/v1/convai/knowledge-base/text", {
    method: "POST",
    json: { name: opts.name, text: opts.text },
  });
}

export async function createKnowledgeUrl(opts: { name?: string; url: string }) {
  return elevenJson<{ id: string; name: string }>("/v1/convai/knowledge-base/url", {
    method: "POST",
    json: { name: opts.name, url: opts.url },
  });
}

/** Dopina dokument bazy wiedzy do agenta (dokleja do listy w prompt.knowledge_base). */
export async function attachKnowledgeToAgent(
  agentId: string,
  doc: { id: string; name: string; type: "text" | "url" | "file" },
) {
  const agent = await getAgent(agentId);
  const existing: unknown[] = agent?.conversation_config?.agent?.prompt?.knowledge_base ?? [];
  const already = existing.some((d: any) => d?.id === doc.id);
  if (already) return { attached: false, reason: "już dopięty" };
  await patchAgent(agentId, {
    knowledge_base: [
      ...existing,
      { type: doc.type, id: doc.id, name: doc.name, usage_mode: "auto" },
    ],
  });
  return { attached: true };
}

// ── Dubbing (wideo / audio w innym języku) ──────────────────────────────────

export async function createDubbing(opts: {
  name?: string;
  sourceUrl?: string;
  file?: { bytes: ArrayBuffer; filename: string; contentType: string };
  targetLang: string;
  sourceLang?: string;
  numSpeakers?: number;
  watermark?: boolean;
  highestResolution?: boolean;
}) {
  if (!opts.sourceUrl && !opts.file) throw new Error("Podaj source_url albo plik.");
  const fd = new FormData();
  if (opts.name) fd.append("name", opts.name);
  if (opts.sourceUrl) fd.append("source_url", opts.sourceUrl);
  if (opts.file) {
    fd.append(
      "file",
      new Blob([opts.file.bytes], { type: opts.file.contentType }),
      opts.file.filename,
    );
  }
  fd.append("target_lang", opts.targetLang);
  if (opts.sourceLang) fd.append("source_lang", opts.sourceLang);
  if (opts.numSpeakers !== undefined) fd.append("num_speakers", String(opts.numSpeakers));
  if (opts.watermark !== undefined) fd.append("watermark", String(opts.watermark));
  if (opts.highestResolution !== undefined)
    fd.append("highest_resolution", String(opts.highestResolution));
  return elevenJson<{ dubbing_id: string; expected_duration_sec?: number }>("/v1/dubbing", {
    method: "POST",
    form: fd,
    timeoutMs: 300_000,
  });
}

export async function getDubbing(dubbingId: string) {
  return elevenJson(`/v1/dubbing/${encodeURIComponent(dubbingId)}`);
}

export async function getDubbedFile(dubbingId: string, languageCode: string) {
  return elevenBytes(
    `/v1/dubbing/${encodeURIComponent(dubbingId)}/audio/${encodeURIComponent(languageCode)}`,
    { timeoutMs: 300_000 },
  );
}

// ── Generowanie wideo (endpoint konfigurowalny) ─────────────────────────────
//
// API wideo ElevenLabs zmienia się (modele partnerskie, nowe ścieżki), a ta
// wersja kodu powstała bez dostępu do dokumentacji. Dlatego ścieżki są
// konfigurowalne bez zmiany kodu:
//   ELEVENLABS_VIDEO_CREATE_PATH  — np. /v1/…/generate (POST, body przekazywane 1:1)
//   ELEVENLABS_VIDEO_STATUS_PATH  — np. /v1/…/{id} (GET; {id} = identyfikator zadania)
//   ELEVENLABS_VIDEO_ID_FIELD     — pole z identyfikatorem w odpowiedzi (domyślnie: id,
//                                   video_id, generation_id, job_id, request_id)
// Narzędzia MCP przyjmują też `endpoint_path` jako nadpisanie na jedno wywołanie.

export function videoEndpoints() {
  return {
    createPath: process.env.ELEVENLABS_VIDEO_CREATE_PATH || null,
    statusPath: process.env.ELEVENLABS_VIDEO_STATUS_PATH || null,
    idField: process.env.ELEVENLABS_VIDEO_ID_FIELD || null,
  };
}

export function pickJobId(json: any, preferred?: string | null): string | null {
  const keys = [preferred, "id", "video_id", "generation_id", "job_id", "request_id", "task_id"];
  for (const k of keys) {
    if (k && typeof json?.[k] === "string" && json[k]) return json[k];
  }
  return null;
}

export async function videoGenerate(body: Record<string, unknown>, createPath?: string | null) {
  const path = createPath ?? videoEndpoints().createPath;
  if (!path) {
    throw new Error(
      "Endpoint generowania wideo nie jest skonfigurowany: ustaw ELEVENLABS_VIDEO_CREATE_PATH (i _STATUS_PATH) w środowisku serwera albo podaj endpoint_path. Ścieżkę weź z aktualnej dokumentacji API ElevenLabs.",
    );
  }
  return elevenJson(path, { method: "POST", json: body, timeoutMs: 300_000 });
}

export async function videoStatus(jobId: string, statusPath?: string | null) {
  const tpl = statusPath ?? videoEndpoints().statusPath;
  if (!tpl) {
    throw new Error(
      "Endpoint statusu wideo nie jest skonfigurowany: ustaw ELEVENLABS_VIDEO_STATUS_PATH (z {id}) albo podaj endpoint_path.",
    );
  }
  const path = tpl.includes("{id}")
    ? tpl.replace("{id}", encodeURIComponent(jobId))
    : `${tpl.replace(/\/$/, "")}/${encodeURIComponent(jobId)}`;
  return elevenRequest(path, { timeoutMs: 120_000 });
}
