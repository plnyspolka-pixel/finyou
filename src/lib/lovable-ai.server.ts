// Wspólne wywołanie AI z odpowiedzią w JSON (dawniej przez bramkę Lovable AI Gateway,
// teraz przez warstwę `ai.server.ts` → Anthropic Claude). Model nie przeszukuje sieci:
// twarde dane (oferty z portali, wyniki wyszukiwania, newsy z RSS) przekazujemy mu
// w prompcie, a on je analizuje. Server-only. Plik zachowuje dawne nazwy eksportów,
// żeby dotychczasowe importy działały bez zmian.

import { AI_MODEL_FAST, AI_MODEL_PRO, AiError, aiChatCompletions } from "./ai.server";

export { AI_MODEL_FAST, AI_MODEL_PRO };
/** Zachowane dla zgodności — adres nie jest już używany do wywołań. */
export const AI_GATEWAY_URL = "https://api.anthropic.com/v1/messages";

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
  if (!process.env.ANTHROPIC_API_KEY) throw new LovableAiError("Brak ANTHROPIC_API_KEY.");
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new LovableAiError("AI: przekroczono czas odpowiedzi.")), args.timeoutMs ?? 180_000),
  );
  try {
    const json = await Promise.race([
      aiChatCompletions({
        model: args.model ?? AI_MODEL_FAST,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
        response_format: { type: "json_object" },
      }),
      timeout,
    ]);
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonLoose(content);
    if (parsed == null) throw new LovableAiError("AI: odpowiedź nie jest poprawnym JSON-em.");
    return parsed as T;
  } catch (e: any) {
    if (e instanceof AiError) throw new LovableAiError(`AI HTTP ${e.status}: ${e.message.slice(0, 200)}`);
    throw e;
  }
}
