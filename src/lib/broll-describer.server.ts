// Opis grafiki B-roll przez Claude (vision): tytuł sceny, tagi i orientacja.
// Bank dobiera przebitki po tagach do frazy planera (studio-broll-match.ts),
// a planer opisuje kadry po angielsku („signing mortgage contract”) — stąd
// tytuł po angielsku i tagi w obu językach. Wołane przy uploadzie bez tagów.

import { claudeJson, isClaudeConfigured } from "./claude-json.server";

/** Formaty, które Claude czyta jako obraz (HEIC i AVIF — nie). */
export const VISION_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const SYSTEM = `Opisujesz grafiki do banku przebitek (B-roll) krótkich rolek firmy Finance You — pożyczki pod zastaw nieruchomości i inwestowanie w nie. Przebitki dobiera automat po tagach do angielskich fraz typu "signing mortgage contract", "apartment building exterior", "calculator and documents".

Zwróć:
- title: krótki opis sceny PO ANGIELSKU w stylu frazy stockowej (3–7 słów, bez kropki), np. "couple signing loan documents".
- tags: 8–16 tagów, małymi literami: najpierw angielskie rzeczowniki i czynności widoczne w kadrze (obiekty, miejsce, czynność), potem te same pojęcia po polsku. Bez ogólników typu "image", "photo", "stock".
- orientation: "portrait" (wyższy niż szerszy), "landscape" albo "square".
Gdy dostajesz kadr z klipu wideo, opisz scenę klipu (to, co dzieje się w ujęciu), nie sam kadr.`;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    orientation: { type: "string", enum: ["portrait", "landscape", "square"] },
  },
  required: ["title", "tags", "orientation"],
  additionalProperties: false,
};

/**
 * Opis grafiki (albo kadru z klipu) spod publicznego URL-a — Claude pobiera
 * obraz sam, więc rozmiar pliku nie gra roli. null = brak klucza / format,
 * którego model nie czyta.
 */
export async function describeBrollImage(
  url: string,
  mime: string,
  opts?: { video?: boolean },
): Promise<{ title: string; tags: string[]; orientation: string } | null> {
  if (!isClaudeConfigured() || !VISION_TYPES.has(mime)) return null;
  const out = await claudeJson<{ title?: unknown; tags?: unknown; orientation?: unknown }>({
    system: SYSTEM,
    content: [
      { type: "image", source: { type: "url", url } },
      {
        type: "text",
        text: opts?.video ? "To kadr z klipu wideo. Opisz klip." : "Opisz tę grafikę.",
      },
    ],
    schema: SCHEMA,
    effort: "low",
    maxTokens: 4000,
    label: "Opis B-roll",
  });
  const title = typeof out.title === "string" ? out.title.trim().slice(0, 120) : "";
  const tags = (Array.isArray(out.tags) ? out.tags : [])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && t.length <= 40)
    .slice(0, 20);
  const orientation =
    out.orientation === "portrait" || out.orientation === "square" ? out.orientation : "landscape";
  return title || tags.length ? { title, tags, orientation } : null;
}
