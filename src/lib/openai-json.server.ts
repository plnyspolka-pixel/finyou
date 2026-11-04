// Drugi zapas dla czatu JSON Studia (po Claude): OpenAI Chat Completions.
// `fetch` zamiast SDK — kod chodzi na Cloudflare Workerze. Model można
// zmienić zmienną OPENAI_MODEL bez wdrożenia kodu.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

export const isOpenAiConfigured = (): boolean => !!(process.env.OPENAI_API_KEY ?? "").trim();

export function openAiModel(): string {
  return (process.env.OPENAI_MODEL ?? "").trim() || DEFAULT_OPENAI_MODEL;
}

async function logOpenAiCall(entry: {
  label: string;
  success: boolean;
  error?: string | null;
  ms: number;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("external_api_logs").insert({
      provider: "OpenAI",
      query_type: entry.label,
      query_value: openAiModel(),
      success: entry.success,
      error_code: entry.error ? entry.error.slice(0, 500) : null,
      response_time_ms: entry.ms,
    });
  } catch {
    // diagnostyka — nie psuje rolki
  }
}

export async function openAiChatJson(
  system: string,
  user: string,
  label = "studio_ai_fallback_openai",
): Promise<Record<string, unknown>> {
  const key = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!key) throw new Error("OPENAI_API_KEY nie jest ustawiony.");
  const t0 = Date.now();
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: openAiModel(),
        messages: [
          { role: "system", content: `${system}\n\nOdpowiedz wyłącznie obiektem JSON.` },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      throw new Error(`${label} (OpenAI) HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "";
    const { parseLooseJsonObject } = await import("./claude-json.server");
    const parsed = parseLooseJsonObject(text);
    if (!parsed) throw new Error(`${label} (OpenAI): niepoprawny JSON: ${text.slice(0, 200)}`);
    await logOpenAiCall({ label, success: true, ms: Date.now() - t0 });
    return parsed;
  } catch (e) {
    await logOpenAiCall({
      label,
      success: false,
      error: e instanceof Error ? e.message : String(e),
      ms: Date.now() - t0,
    });
    throw e;
  }
}
