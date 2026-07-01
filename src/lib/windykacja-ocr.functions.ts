import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ════════════════════════════════════════════════════════════════════
// AUTOMATYCZNE ODCZYTYWANIE PISM WINDYKACYJNYCH ZE ZDJĘCIA.
//
// Inwestor robi zdjęcie dowolnego papierowego dokumentu (dowód nadania,
// zwrotka/ZPO, awizo, zwrot przesyłki, potwierdzenie wpłaty, wezwanie,
// umowa). Model rozpoznaje TYP pisma i wyciąga kluczowe dane — inwestor
// nie musi nic wpisywać, tylko potwierdza.
//
// Wykorzystujemy tę samą bramę AI co reszta projektu (Lovable AI gateway,
// model wizyjny, format zgodny z OpenAI chat/completions).
// ════════════════════════════════════════════════════════════════════

/** Typy pism rozpoznawane ze zdjęcia. */
export type WindOcrDocType =
  | "pismo_nadane" // dowód nadania listu poleconego (książka nadawcza / potwierdzenie)
  | "pismo_doreczone" // zwrotka / potwierdzenie odbioru (ZPO)
  | "pismo_awizo" // awizo
  | "pismo_zwrot" // zwrot przesyłki („nie podjęto w terminie")
  | "wplata" // potwierdzenie przelewu / wpłaty
  | "wezwanie" // wezwanie do zapłaty
  | "umowa" // umowa pożyczki
  | "inne"; // nierozpoznane

export interface WindOcrResult {
  reason: "ok" | "unsupported" | "rate_limited" | "ai_quota" | "ai_error" | "no_key";
  documentType: WindOcrDocType;
  /** Krótki, zrozumiały tytuł rozpoznanego pisma. */
  tytul: string;
  /** Najważniejsza data z dokumentu (nadania/doręczenia/wpłaty) w ISO yyyy-mm-dd. */
  dataISO: string | null;
  /** Numer nadania / śledzenia przesyłki (jeśli występuje). */
  numer_nadania: string | null;
  /** Kwota (dla potwierdzenia wpłaty). */
  kwota: number | null;
  /** Status doręczenia — dla pism doręczeniowych. */
  status_doreczenia: "doreczone" | "awizowane" | "termin_uplynal" | "zwrot" | null;
  /** Krótkie wyjaśnienie po polsku: co to za pismo i co z niego wynika. */
  podsumowanie: string;
}

const DOC_TYPES: WindOcrDocType[] = [
  "pismo_nadane",
  "pismo_doreczone",
  "pismo_awizo",
  "pismo_zwrot",
  "wplata",
  "wezwanie",
  "umowa",
  "inne",
];

const SYSTEM_PROMPT = `Jesteś asystentem OCR dla polskiej firmy pożyczkowej prowadzącej windykację. Rozpoznajesz ze zdjęcia typ papierowego dokumentu i wyciągasz z niego dane. Odpowiadasz WYŁĄCZNIE poprawnym JSON-em, bez komentarzy.`;

const USER_PROMPT = `Rozpoznaj ten dokument i zwróć JSON o polach:
{
  "documentType": jeden z: "pismo_nadane","pismo_doreczone","pismo_awizo","pismo_zwrot","wplata","wezwanie","umowa","inne",
  "tytul": krótki tytuł pisma po polsku,
  "dataISO": najważniejsza data w formacie yyyy-mm-dd (data nadania / doręczenia / wpłaty) albo null,
  "numer_nadania": numer nadania / śledzenia przesyłki (ciąg cyfr, zwykle ~20 znaków) albo null,
  "kwota": kwota w złotych jako liczba (tylko dla potwierdzenia wpłaty) albo null,
  "status_doreczenia": "doreczone" (zwrotka/ZPO podpisana),"awizowane" (awizo),"termin_uplynal" (nie podjęto w terminie),"zwrot" (przesyłka zwrócona) albo null,
  "podsumowanie": jedno–dwa zdania po polsku wyjaśniające, co to za pismo i co z niego wynika
}
Zasady rozpoznawania:
- Dowód/potwierdzenie NADANIA listu poleconego (książka nadawcza, potwierdzenie nadania) → "pismo_nadane".
- Zwrotka / potwierdzenie odbioru (ZPO, "potwierdzenie doręczenia") → "pismo_doreczone", status "doreczone".
- Awizo (zawiadomienie o próbie doręczenia) → "pismo_awizo", status "awizowane".
- Koperta/przesyłka ZWRÓCONA z adnotacją "nie podjęto w terminie" / "zwrot" → "pismo_zwrot", status "termin_uplynal" lub "zwrot".
- Potwierdzenie przelewu/wpłaty → "wplata" (wyciągnij kwotę i datę).
- Wezwanie do zapłaty → "wezwanie". Umowa pożyczki → "umowa".
Jeśli czegoś nie ma — użyj null. Zwróć wyłącznie JSON.`;

function toIsoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd.mm.yyyy albo dd-mm-yyyy → yyyy-mm-dd
  const m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(
      v
        .replace(/[^\d,.-]/g, "")
        .replace(/\s/g, "")
        .replace(",", "."),
    );
    return isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function coerceType(v: unknown): WindOcrDocType {
  return DOC_TYPES.includes(v as WindOcrDocType) ? (v as WindOcrDocType) : "inne";
}

function empty(reason: WindOcrResult["reason"]): WindOcrResult {
  return {
    reason,
    documentType: "inne",
    tytul: "",
    dataISO: null,
    numer_nadania: null,
    kwota: null,
    status_doreczenia: null,
    podsumowanie: "",
  };
}

export const analyzeWindDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        dataUrl: z.string().min(20).max(15_000_000),
        mimeType: z.string().min(3).max(100),
        fileName: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<WindOcrResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return empty("no_key");

    const isPdf = data.mimeType === "application/pdf" || /\.pdf$/i.test(data.fileName ?? "");
    const isImage = data.mimeType.startsWith("image/");
    if (!isPdf && !isImage) return empty("unsupported");

    const userContent: unknown[] = [{ type: "text", text: USER_PROMPT }];
    if (isImage) userContent.push({ type: "image_url", image_url: { url: data.dataUrl } });
    else
      userContent.push({
        type: "file",
        file: { filename: data.fileName ?? "document.pdf", file_data: data.dataUrl },
      });

    let text = "";
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
        }),
      });
      if (resp.status === 429) return empty("rate_limited");
      if (resp.status === 402) return empty("ai_quota");
      if (!resp.ok) return empty("ai_error");
      const json = await resp.json();
      text = json?.choices?.[0]?.message?.content ?? "";
    } catch {
      return empty("ai_error");
    }

    try {
      const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      return {
        reason: "ok",
        documentType: coerceType(parsed.documentType),
        tytul: typeof parsed.tytul === "string" ? parsed.tytul.slice(0, 200) : "",
        dataISO: toIsoDate(parsed.dataISO),
        numer_nadania:
          typeof parsed.numer_nadania === "string" && parsed.numer_nadania.trim()
            ? parsed.numer_nadania.trim().slice(0, 60)
            : null,
        kwota: toNumber(parsed.kwota),
        status_doreczenia: ["doreczone", "awizowane", "termin_uplynal", "zwrot"].includes(
          String(parsed.status_doreczenia),
        )
          ? (parsed.status_doreczenia as WindOcrResult["status_doreczenia"])
          : null,
        podsumowanie:
          typeof parsed.podsumowanie === "string" ? parsed.podsumowanie.slice(0, 500) : "",
      };
    } catch {
      return empty("ai_error");
    }
  });
