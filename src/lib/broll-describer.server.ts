// Opis grafiki B-roll przez Claude (vision): tytuł sceny, tagi i orientacja.
// Bank dobiera przebitki po tagach do frazy planera (studio-broll-match.ts),
// a planer opisuje kadry po angielsku („signing mortgage contract”) — stąd
// tytuł po angielsku i tagi w obu językach. Wołane przy uploadzie bez tagów.

import { claudeJson, isClaudeConfigured } from "./claude-json.server";

/** Limit API na obraz (base64 ~ +33%) — większe pliki zostają bez opisu AI. */
const MAX_VISION_BYTES = 3.6 * 1024 * 1024;
const VISION_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const SYSTEM = `Opisujesz grafiki do banku przebitek (B-roll) krótkich rolek firmy Finance You — pożyczki pod zastaw nieruchomości i inwestowanie w nie. Przebitki dobiera automat po tagach do angielskich fraz typu "signing mortgage contract", "apartment building exterior", "calculator and documents".

Zwróć:
- title: krótki opis sceny PO ANGIELSKU w stylu frazy stockowej (3–7 słów, bez kropki), np. "couple signing loan documents".
- tags: 8–16 tagów, małymi literami: najpierw angielskie rzeczowniki i czynności widoczne w kadrze (obiekty, miejsce, czynność), potem te same pojęcia po polsku. Bez ogólników typu "image", "photo", "stock".
- orientation: "portrait" (wyższy niż szerszy), "landscape" albo "square".`;

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

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function describeBrollImage(
  bytes: Uint8Array,
  mime: string,
): Promise<{ title: string; tags: string[]; orientation: string } | null> {
  if (!isClaudeConfigured() || !VISION_TYPES.has(mime) || bytes.byteLength > MAX_VISION_BYTES) {
    return null;
  }
  const out = await claudeJson<{ title?: unknown; tags?: unknown; orientation?: unknown }>({
    system: SYSTEM,
    content: [
      { type: "image", source: { type: "base64", media_type: mime, data: toBase64(bytes) } },
      { type: "text", text: "Opisz tę grafikę." },
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
