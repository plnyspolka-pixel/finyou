// Wspólne wywołanie Lovable AI Gateway z odpowiedzią w JSON — zastępuje
// dawne zapytania do Perplexity (sonar / sonar-pro). Model nie przeszukuje
// sieci: twarde dane (oferty z portali, wyniki wyszukiwania, newsy z RSS)
// przekazujemy mu w prompcie, a on je analizuje. Server-only.

export const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const AI_MODEL_FAST = "google/gemini-2.5-flash";
export const AI_MODEL_PRO = "google/gemini-2.5-pro";

export class LovableAiError extends Error {}

/** Wyciąga pierwszy obiekt JSON z tekstu (także z otoczki ```json … ```). */
export function parseJsonLoose(s: string): any | null {
  const cleaned = s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

export async function lovableAiJson<T = any>(args: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<T> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new LovableAiError("Brak LOVABLE_API_KEY.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 90_000);
  try {
    const res = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: args.model ?? AI_MODEL_FAST,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
        temperature: args.temperature ?? 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new LovableAiError(`AI Gateway HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonLoose(content);
    if (parsed == null)
      throw new LovableAiError("AI Gateway: odpowiedź nie jest poprawnym JSON-em.");
    return parsed as T;
  } catch (e: any) {
    if (e?.name === "AbortError")
      throw new LovableAiError("AI Gateway: przekroczono czas odpowiedzi.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
