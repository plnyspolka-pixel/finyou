// Jedno wywołanie Claude ze structured outputs (JSON wg schematu) — dla
// projektanta elementów dynamicznych i opisu grafik B-roll. `fetch` zamiast
// SDK: moduł poświadczeń SDK importuje statycznie node:child_process /
// node:fs, a ten kod chodzi na Cloudflare Workerze (jak ai-admin.server.ts).

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Model Studia (projekt elementów, opis B-rolli) — wybór administratora. */
export const STUDIO_CLAUDE_MODEL = "claude-sonnet-5-5";

export const isClaudeConfigured = (): boolean => !!(process.env.ANTHROPIC_API_KEY ?? "").trim();

/**
 * Wpis w `external_api_logs` (podgląd: MCP `list_external_api_calls`) — bez
 * niego porażka projektanta znika w logach Workera, a rolka po cichu dostaje
 * stare karty. Nigdy nie rzuca.
 */
export async function logClaudeCall(entry: {
  label: string;
  success: boolean;
  error?: string | null;
  ms?: number | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("external_api_logs").insert({
      provider: "Anthropic",
      query_type: entry.label,
      query_value: STUDIO_CLAUDE_MODEL,
      success: entry.success,
      error_code: entry.error ? entry.error.slice(0, 500) : null,
      response_time_ms: entry.ms ?? null,
    });
  } catch {
    // Dziennik to diagnostyka — nie może psuć rolki.
  }
}

export type ClaudeContent =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string };
    };

type AnthropicResponse = {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
};

export async function claudeJson<T>(args: Parameters<typeof claudeJsonRaw>[0]): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await claudeJsonRaw<T>(args);
    await logClaudeCall({ label: args.label, success: true, ms: Date.now() - t0 });
    return out;
  } catch (e) {
    await logClaudeCall({
      label: args.label,
      success: false,
      error: e instanceof Error ? e.message : String(e),
      ms: Date.now() - t0,
    });
    throw e;
  }
}

async function claudeJsonRaw<T>(args: {
  system: string;
  content: ClaudeContent[];
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  label: string;
}): Promise<T> {
  const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY nie jest ustawiony.");
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: STUDIO_CLAUDE_MODEL,
      max_tokens: args.maxTokens ?? 16000,
      system: args.system,
      messages: [{ role: "user", content: args.content }],
      output_config: {
        effort: args.effort ?? "high",
        format: { type: "json_schema", schema: args.schema },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `${args.label} (Claude) HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`,
    );
  }
  const body = (await res.json()) as AnthropicResponse;
  if (body.stop_reason === "refusal") throw new Error(`${args.label} (Claude): odmowa odpowiedzi.`);
  if (body.stop_reason === "max_tokens")
    throw new Error(`${args.label} (Claude): ucięta odpowiedź.`);
  const text = body.content.find((b) => b.type === "text")?.text ?? "";
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${args.label} (Claude): niepoprawny JSON: ${text.slice(0, 200)}`);
  }
}

/**
 * Zapasowy czat JSON bez schematu — gdy Lovable AI gateway odmawia (brak
 * kredytów 402, limit 429, awaria 5xx). 04.11.2026 wyczerpane kredyty
 * Lovable zatrzymały produkcję rolek na wiele godzin; z tym zapasem scenariusz
 * powstaje na Claude, a dziennik `external_api_logs` pokazuje przełączenie.
 */
export async function claudeChatJsonLoose(
  system: string,
  user: string,
  label = "studio_ai_fallback",
): Promise<Record<string, unknown>> {
  const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY nie jest ustawiony.");
  const t0 = Date.now();
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: STUDIO_CLAUDE_MODEL,
        max_tokens: 8000,
        system: `${system}\n\nOdpowiedz WYŁĄCZNIE jednym obiektem JSON, bez komentarzy i bez bloków kodu.`,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      throw new Error(`${label} (Claude) HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    const body = (await res.json()) as AnthropicResponse;
    const text = body.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = parseLooseJsonObject(text);
    if (!parsed) throw new Error(`${label} (Claude): niepoprawny JSON: ${text.slice(0, 200)}`);
    await logClaudeCall({ label, success: true, ms: Date.now() - t0 });
    return parsed;
  } catch (e) {
    await logClaudeCall({
      label,
      success: false,
      error: e instanceof Error ? e.message : String(e),
      ms: Date.now() - t0,
    });
    throw e;
  }
}

/** Obiekt JSON z odpowiedzi modelu (dopuszcza otoczkę ```json … ``` i tekst wokół). */
export function parseLooseJsonObject(text: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(text.trim());
  if (direct) return direct;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? tryParse(text.slice(start, end + 1)) : null;
}
