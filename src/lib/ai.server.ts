/**
 * Warstwa AI po odejściu od bramki Lovable (ai.gateway.lovable.dev).
 *
 * Czat/ekstrakcja/narzędzia: Anthropic Claude (SDK @anthropic-ai/sdk, Messages API).
 * Embeddingi (1536 wymiarów, kolumny `vector(1536)` w bazie) i transkrypcja audio: OpenAI API
 * bezpośrednio — ten sam model co dotąd przez bramkę, więc zapisane wektory pozostają zgodne.
 * Generowanie obrazów: Google Gemini API bezpośrednio (gemini-2.5-flash-image).
 *
 * `aiFetch(url, init)` udaje `fetch` do bramki: przyjmuje ciało w formacie OpenAI chat/completions
 * (messages, tools, response_format, …), tłumaczy je na Claude i zwraca `Response` z JSON-em
 * w kształcie OpenAI (`choices[0].message.content` / `.tool_calls` / `.images`), żeby miejsca
 * wywołań zmieniały tylko transport. Błędy API wracają jako `Response` z kodem HTTP (429, 400…).
 *
 * Zmienne środowiskowe: ANTHROPIC_API_KEY (wymagana), OPENAI_API_KEY (embeddingi, transkrypcja),
 * GEMINI_API_KEY (obrazy), opcjonalnie AI_MODEL_FAST / AI_MODEL_PRO (domyślnie claude-opus-5-5;
 * tańsza alternatywa dla prostych zadań: claude-haiku-5-5) i AI_EFFORT (low|medium|high, domyślnie low).
 */
import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL_FAST = process.env.AI_MODEL_FAST || "claude-opus-5-5";
export const AI_MODEL_PRO = process.env.AI_MODEL_PRO || "claude-opus-5-5";
const AI_EFFORT = (process.env.AI_EFFORT || "low") as "low" | "medium" | "high";
const DEFAULT_MAX_TOKENS = 16000;
const EMBED_MODEL = "text-embedding-3-small";
const IMAGE_MODEL = process.env.AI_IMAGE_MODEL || "gemini-2.5-flash-image";

export class AiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "AiError";
    this.status = status;
  }
}

export function hasAiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function anthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiError("Brak ANTHROPIC_API_KEY w środowisku serwera.", 500);
  return new Anthropic({ apiKey, maxRetries: 2 });
}

/** Mapowanie nazw modeli z czasów bramki (google/gemini-2.5-flash|pro, openai/…) na Claude. */
export function resolveModel(requested?: string | null): string {
  if (!requested) return AI_MODEL_FAST;
  if (requested.startsWith("claude-")) return requested;
  return /pro|opus|sonnet/i.test(requested) ? AI_MODEL_PRO : AI_MODEL_FAST;
}

export function isImageModel(model?: string | null): boolean {
  return Boolean(model && /image/i.test(model));
}

// ---------- OpenAI-kształtne typy wejścia/wyjścia (minimalne) ----------
type OaiPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } }
  | { type: string; [k: string]: any };
export type OaiMessage = {
  role: "system" | "user" | "assistant" | "tool" | "developer";
  content?: string | OaiPart[] | null;
  tool_calls?: Array<{ id: string; type?: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
};
export type OaiChatBody = {
  model?: string;
  messages: OaiMessage[];
  tools?: Array<{ type?: string; function: { name: string; description?: string; parameters?: any } }>;
  tool_choice?: any;
  response_format?: { type: "json_object" | "json_schema" | "text"; json_schema?: { name?: string; schema?: any } };
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  [k: string]: any;
};
export type OaiChatResponse = {
  id: string;
  object: "chat.completion";
  model: string;
  choices: Array<{
    index: number;
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter";
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
      images?: Array<{ type: "image_url"; image_url: { url: string } }>;
    };
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

const MEDIA_RE = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,(.+)$/s;

function toImageBlock(url: string): Anthropic.Beta.BetaImageBlockParam | null {
  const m = MEDIA_RE.exec(url.trim());
  if (m) {
    const mt = (m[1] === "image/jpg" ? "image/jpeg" : m[1]) as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
    return { type: "image", source: { type: "base64", media_type: mt, data: m[2].replace(/\s+/g, "") } };
  }
  if (/^https?:\/\//.test(url)) return { type: "image", source: { type: "url", url } };
  return null;
}

function partsToBlocks(content: OaiMessage["content"]): Anthropic.Beta.BetaContentBlockParam[] {
  if (content == null) return [];
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  const out: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const p of content) {
    if (p.type === "text" && typeof (p as any).text === "string") {
      if ((p as any).text) out.push({ type: "text", text: (p as any).text });
    } else if (p.type === "image_url") {
      const b = toImageBlock((p as any).image_url?.url ?? "");
      if (b) out.push(b);
    } else if (p.type === "image" && (p as any).source) {
      out.push(p as any);
    }
  }
  return out;
}

function textOf(content: OaiMessage["content"]): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content.map((p) => (p.type === "text" ? (p as any).text ?? "" : "")).join("\n");
}

type Converted = {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools?: Anthropic.Beta.BetaToolUnion[];
  outputFormat?: { type: "json_schema"; schema: any };
  jsonOnly: boolean;
};

export function convertOpenAiBody(body: OaiChatBody): Converted {
  const systemParts: string[] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of body.messages ?? []) {
    if (m.role === "system" || m.role === "developer") {
      const t = textOf(m.content);
      if (t) systemParts.push(t);
      continue;
    }
    if (m.role === "tool") {
      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.tool_call_id ?? "call_0", content: textOf(m.content) }],
      });
      continue;
    }
    if (m.role === "assistant") {
      const blocks: Anthropic.Beta.BetaContentBlockParam[] = partsToBlocks(m.content);
      for (const tc of m.tool_calls ?? []) {
        let input: any = {};
        try {
          input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          input = { raw: tc.function.arguments };
        }
        blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
      }
      if (blocks.length) messages.push({ role: "assistant", content: blocks });
      continue;
    }
    const blocks = partsToBlocks(m.content);
    messages.push({ role: "user", content: blocks.length ? blocks : [{ type: "text", text: "(pusto)" }] });
  }
  // Claude wymaga, by pierwsza wiadomość była od użytkownika i by role się przeplatały.
  const merged: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      const a = Array.isArray(last.content) ? last.content : [{ type: "text" as const, text: String(last.content) }];
      const b = Array.isArray(m.content) ? m.content : [{ type: "text" as const, text: String(m.content) }];
      last.content = [...a, ...b] as any;
    } else merged.push({ ...m });
  }
  if (!merged.length || merged[0].role !== "user") merged.unshift({ role: "user", content: [{ type: "text", text: "Zacznij." }] });

  let tools: Anthropic.Beta.BetaToolUnion[] | undefined;
  if (body.tools?.length) {
    tools = body.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description ?? "",
      input_schema: (t.function.parameters ?? { type: "object", properties: {} }) as any,
    }));
    const forced = body.tool_choice;
    const forcedName =
      forced && typeof forced === "object" ? forced.function?.name ?? forced.name : forced === "required" ? (tools[0] as any)?.name : null;
    if (forcedName) systemParts.push(`Odpowiedz wyłącznie wywołaniem narzędzia \`${forcedName}\` (bez tekstu poza nim).`);
  }

  let outputFormat: Converted["outputFormat"];
  let jsonOnly = false;
  const rf = body.response_format;
  if (rf?.type === "json_schema" && rf.json_schema?.schema) {
    outputFormat = { type: "json_schema", schema: rf.json_schema.schema };
  } else if (rf?.type === "json_object" || rf?.type === "json_schema") {
    jsonOnly = true;
    systemParts.push("Odpowiadaj wyłącznie jednym poprawnym obiektem JSON, bez komentarzy ani formatowania Markdown.");
  }
  return { system: systemParts.join("\n\n"), messages: merged, tools, outputFormat, jsonOnly };
}

/** Wycina JSON z odpowiedzi (płoty ```json, tekst wokół). */
export function extractJsonText(text: string): string {
  const t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) return fence[1].trim();
  const start = t.search(/[{[]/);
  if (start > 0) return t.slice(start);
  return t;
}

export async function aiChatCompletions(body: OaiChatBody): Promise<OaiChatResponse> {
  const client = anthropic();
  const conv = convertOpenAiBody(body);
  const model = resolveModel(body.model);
  const maxTokens = Math.min(Math.max(body.max_tokens ?? body.max_completion_tokens ?? DEFAULT_MAX_TOKENS, 256), 32000);
  const outputConfig: any = { effort: AI_EFFORT };
  if (conv.outputFormat) outputConfig.format = conv.outputFormat;
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create({
      model,
      max_tokens: maxTokens,
      system: conv.system || undefined,
      messages: conv.messages,
      tools: conv.tools,
      output_config: outputConfig,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    } as any);
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude API ${e.status}: ${e.message}`, e.status ?? 502);
    throw new AiError(e instanceof Error ? e.message : String(e), 502);
  }
  const texts: string[] = [];
  const toolCalls: NonNullable<OaiChatResponse["choices"][0]["message"]["tool_calls"]> = [];
  for (const block of res.content) {
    if (block.type === "text") texts.push(block.text);
    else if (block.type === "tool_use")
      toolCalls.push({ id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } });
  }
  let content: string | null = texts.join("");
  if (conv.jsonOnly && content) content = extractJsonText(content);
  const finish: OaiChatResponse["choices"][0]["finish_reason"] =
    res.stop_reason === "refusal" ? "content_filter" : res.stop_reason === "max_tokens" ? "length" : toolCalls.length ? "tool_calls" : "stop";
  if (res.stop_reason === "refusal") content = "";
  return {
    id: res.id,
    object: "chat.completion",
    model: res.model,
    choices: [
      {
        index: 0,
        finish_reason: finish,
        message: { role: "assistant", content: content || (toolCalls.length ? null : ""), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
      },
    ],
    usage: {
      prompt_tokens: res.usage.input_tokens,
      completion_tokens: res.usage.output_tokens,
      total_tokens: res.usage.input_tokens + res.usage.output_tokens,
    },
  };
}

/** Prosty czat: system + user → tekst. */
export async function aiText(args: { system?: string; user: string; model?: string; maxTokens?: number }): Promise<string> {
  const r = await aiChatCompletions({
    model: args.model,
    max_tokens: args.maxTokens,
    messages: [...(args.system ? [{ role: "system" as const, content: args.system }] : []), { role: "user" as const, content: args.user }],
  });
  return r.choices[0]?.message?.content ?? "";
}

// ---------- Embeddingi i transkrypcja (OpenAI API bezpośrednio) ----------
function openaiKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new AiError("Brak OPENAI_API_KEY (embeddingi/transkrypcja).", 500);
  return k;
}

export async function aiEmbeddings(input: string | string[], model?: string): Promise<{ data: Array<{ embedding: number[]; index: number }>; model: string }> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey()}` },
    body: JSON.stringify({ model: (model ?? EMBED_MODEL).replace(/^openai\//, ""), input }),
  });
  if (!r.ok) throw new AiError(`OpenAI embeddings ${r.status}: ${(await r.text()).slice(0, 300)}`, r.status);
  return (await r.json()) as any;
}

export async function aiTranscribe(form: FormData): Promise<Response> {
  const model = String(form.get("model") ?? "gpt-4o-transcribe").replace(/^openai\//, "");
  form.set("model", model);
  return fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey()}` },
    body: form,
  });
}

// ---------- Obrazy (Gemini API bezpośrednio) ----------
export async function aiImage(args: { prompt: string; images?: string[]; model?: string }): Promise<{ dataUrl: string; mimeType: string; base64: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError("Brak GEMINI_API_KEY (generowanie obrazów).", 500);
  const model = (args.model && !/^google\//.test(args.model) && /gemini/.test(args.model) ? args.model : IMAGE_MODEL).replace(/^google\//, "");
  const parts: any[] = [{ text: args.prompt }];
  for (const url of args.images ?? []) {
    const m = MEDIA_RE.exec(url.trim());
    if (m) parts.push({ inlineData: { mimeType: m[1] === "image/jpg" ? "image/jpeg" : m[1], data: m[2].replace(/\s+/g, "") } });
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }),
  });
  if (!r.ok) throw new AiError(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`, r.status);
  const j: any = await r.json();
  const img = (j.candidates?.[0]?.content?.parts ?? []).find((p: any) => p.inlineData?.data);
  if (!img) throw new AiError("Gemini nie zwróciło obrazu.", 502);
  const mimeType = img.inlineData.mimeType || "image/png";
  return { dataUrl: `data:${mimeType};base64,${img.inlineData.data}`, mimeType, base64: img.inlineData.data };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Zamiennik `fetch(<adres bramki Lovable>, init)`: rozpoznaje po ścieżce adresu, czy to czat,
 * embeddingi, obrazy czy transkrypcja, i zwraca `Response` w kształcie OpenAI.
 */
export async function aiFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const u = String(url);
  try {
    if (/\/audio\/transcriptions/.test(u)) {
      const form = init?.body instanceof FormData ? init.body : new FormData();
      return await aiTranscribe(form);
    }
    const raw = typeof init?.body === "string" ? init.body : init?.body ? await new Response(init.body as any).text() : "{}";
    const body: any = raw ? JSON.parse(raw) : {};
    if (/\/embeddings/.test(u)) return jsonResponse(await aiEmbeddings(body.input, body.model));
    if (/\/images\/generations/.test(u)) {
      const img = await aiImage({ prompt: String(body.prompt ?? ""), model: body.model });
      return jsonResponse({ created: Math.floor(Date.now() / 1000), data: [{ b64_json: img.base64 }] });
    }
    if (isImageModel(body.model)) {
      const last = [...(body.messages ?? [])].reverse().find((m: any) => m.role === "user");
      const images: string[] = [];
      let prompt = "";
      if (last) {
        if (typeof last.content === "string") prompt = last.content;
        else for (const p of last.content ?? []) {
          if (p.type === "text") prompt += (prompt ? "\n" : "") + (p.text ?? "");
          else if (p.type === "image_url" && p.image_url?.url) images.push(p.image_url.url);
        }
      }
      const img = await aiImage({ prompt, images, model: body.model });
      return jsonResponse({
        id: `img_${Date.now()}`,
        object: "chat.completion",
        model: IMAGE_MODEL,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "", images: [{ type: "image_url", image_url: { url: img.dataUrl } }] } }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }
    return jsonResponse(await aiChatCompletions(body as OaiChatBody));
  } catch (e) {
    const status = e instanceof AiError ? e.status : 502;
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: { message, type: "ai_error" } }, status >= 400 && status < 600 ? status : 502);
  }
}
