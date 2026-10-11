// Wywołanie modelu dla agenta wzrostu: JSON + szacunek kosztu (PLN) z liczby
// tokenów, żeby dzienny budżet był liczony z faktycznego zużycia, a nie
// z liczby wywołań. Server-only.
import {
  AI_GATEWAY_URL,
  AI_MODEL_FAST,
  LovableAiError,
  parseJsonLoose,
} from "@/lib/lovable-ai.server";

/** Orientacyjne stawki (PLN za 1 mln tokenów) — Gemini 2.5 Flash przez bramkę. */
const PLN_PER_M_INPUT = 1.3;
const PLN_PER_M_OUTPUT = 10.5;
/** Grafika z gemini-2.5-flash-image — orientacyjnie za sztukę. */
export const IMAGE_COST_PLN = 0.17;

export interface LlmResult<T> {
  data: T;
  costPln: number;
}

export async function growthLlmJson<T = any>(args: {
  system: string;
  user: string;
  temperature?: number;
  model?: string;
  timeoutMs?: number;
}): Promise<LlmResult<T>> {
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
        temperature: args.temperature ?? 0.7,
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
    const inTok =
      Number(json?.usage?.prompt_tokens) ||
      Math.ceil((args.system.length + args.user.length) / 3.5);
    const outTok = Number(json?.usage?.completion_tokens) || Math.ceil(content.length / 3.5);
    const costPln =
      Math.round(((inTok * PLN_PER_M_INPUT + outTok * PLN_PER_M_OUTPUT) / 1e6) * 10000) / 10000;
    return { data: parsed as T, costPln };
  } catch (e: any) {
    if (e?.name === "AbortError")
      throw new LovableAiError("AI Gateway: przekroczono czas odpowiedzi.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
