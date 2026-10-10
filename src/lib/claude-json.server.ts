// Jedno wywołanie Claude ze structured outputs (JSON wg schematu) — dla
// projektanta elementów dynamicznych i opisu grafik B-roll. `fetch` zamiast
// SDK: moduł poświadczeń SDK importuje statycznie node:child_process /
// node:fs, a ten kod chodzi na Cloudflare Workerze (jak ai-admin.server.ts).

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Model Studia (projekt elementów, opis B-rolli) — wybór administratora. */
export const STUDIO_CLAUDE_MODEL = "claude-sonnet-5-5";

export const isClaudeConfigured = (): boolean => !!(process.env.ANTHROPIC_API_KEY ?? "").trim();

export type ClaudeContent =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

type AnthropicResponse = {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
};

export async function claudeJson<T>(args: {
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
