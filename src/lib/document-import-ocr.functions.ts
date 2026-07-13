import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ════════════════════════════════════════════════════════════════════
// KREATOR DOKUMENTÓW — WCZYTANIE DANYCH Z INNEGO DOKUMENTU.
//
// Użytkownik wgrywa dowolny dokument (zdjęcie, skan, PDF, tekst) — np.
// umowę, odpis KRS, fakturę, dowód osobisty, pismo — a system odczytuje
// jego treść (OCR uruchamia się automatycznie dla skanów/zdjęć przez
// model wizyjny) i mapuje wykryte dane na pola AKTUALNIE wybranego wzoru.
// Zwracamy tylko wartości dla pól, które realnie występują w dokumencie —
// model ma zakaz zgadywania.
//
// Ta sama brama AI co pozostałe OCR-y w projekcie (Lovable AI gateway,
// model wizyjny, format zgodny z OpenAI chat/completions).
// ════════════════════════════════════════════════════════════════════

/** Opis pojedynczego pola wzoru przekazywany do modelu. */
export interface DocImportField {
  /** Indeks wystąpienia placeholdera — klucz wartości w formularzu kreatora. */
  id: string;
  label: string;
  /** Nazwa grupy (np. "Pożyczkobiorca / Dłużnik") — mówi modelowi, o czyje dane chodzi. */
  group: string;
  /** Semantyka pola z silnika wzorów (amount/date/nip/bank/…). */
  kind: string;
  /** Dozwolone warianty dla pól wyboru. */
  options?: string[];
}

export interface DocImportResult {
  reason: "ok" | "unsupported" | "rate_limited" | "ai_quota" | "ai_error" | "no_key";
  /** Krótki opis rozpoznanego dokumentu (np. "Umowa pożyczki z 12.03.2026"). */
  tytul: string;
  /** 1–2 zdania po polsku: co odczytano i skąd. */
  podsumowanie: string;
  /** Mapa: id pola wzoru → odczytana wartość. */
  values: Record<string, string>;
}

const SYSTEM_PROMPT = `Jesteś asystentem OCR dla polskiej firmy pożyczkowej. Odczytujesz treść dokumentów (także ze zdjęć i skanów) i wyciągasz z nich dane do formularza. Odpowiadasz WYŁĄCZNIE poprawnym JSON-em, bez komentarzy.`;

const KIND_HINTS: Record<string, string> = {
  amount: "kwota",
  date: "data DD.MM.RRRR",
  nip: "NIP",
  regon: "REGON",
  krs: "KRS",
  pesel: "PESEL",
  idLine: "identyfikatory (KRS/NIP/REGON/PESEL)",
  bank: "numer rachunku bankowego",
  phone: "telefon",
  email: "e-mail",
  kw: "numer księgi wieczystej",
  interest: "oprocentowanie",
  months: "liczba miesięcy",
  number: "liczba",
  name: "nazwa / imię i nazwisko",
  address: "adres",
  representative: "reprezentant / osoba",
  legalForm: "forma prawna",
  choice: "wybór wariantu",
};

function buildUserPrompt(templateName: string, fields: DocImportField[]): string {
  const lines = fields.map((f) => {
    const hint = KIND_HINTS[f.kind];
    const opts = f.options?.length ? ` — dozwolone wartości: ${f.options.join(" / ")}` : "";
    return `"${f.id}" | ${f.group} | ${f.label}${hint ? ` (${hint})` : ""}${opts}`;
  });
  return `Użytkownik wypełnia wzór dokumentu „${templateName}". Poniżej pola formularza w formacie: id | grupa (czyja to strona) | etykieta (typ).

${lines.join("\n")}

Odczytaj załączony dokument źródłowy (może to być umowa, odpis KRS/CEIDG, faktura, pismo, dowód, zaświadczenie itp. — także zdjęcie lub skan) i wyciągnij z niego wartości pasujące do powyższych pól. Zwróć WYŁĄCZNIE JSON:
{
  "tytul": krótki opis rozpoznanego dokumentu po polsku,
  "podsumowanie": 1-2 zdania po polsku, co udało się odczytać,
  "values": { "<id pola>": "wartość", ... }
}
Zasady:
- Wpisuj TYLKO dane, które faktycznie występują w dokumencie źródłowym — niczego nie zgaduj i nie wymyślaj.
- Zwracaj wyłącznie id z powyższej listy. Pola, dla których nie ma danych, POMIŃ (nie wpisuj pustych ani "brak").
- Zwróć uwagę na grupę pola: dane pożyczkobiorcy/dłużnika wpisuj tylko w pola jego grupy, dane pożyczkodawcy/wierzyciela w jego — nie mieszaj stron.
- Daty w formacie DD.MM.RRRR.
- Kwoty w formacie polskim z dwoma miejscami po przecinku, bez waluty, np. "50 000,00".
- NIP/REGON/KRS/PESEL jako same cyfry; numer rachunku jako 26 cyfr (spacje dozwolone).
- Dla pól wyboru użyj dokładnie jednej z dozwolonych wartości albo pomiń pole.
Zwróć wyłącznie JSON.`;
}

function empty(reason: DocImportResult["reason"]): DocImportResult {
  return { reason, tytul: "", podsumowanie: "", values: {} };
}

const PL_NUM = (n: number) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Math.round(n * 100) / 100,
  );

/** ISO yyyy-mm-dd → DD.MM.RRRR (model czasem zwraca ISO mimo instrukcji). */
function normalizeDate(v: string): string {
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
}

function sanitizeValue(raw: unknown, kind: string): string | null {
  if (typeof raw === "number" && isFinite(raw)) {
    return kind === "amount" ? PL_NUM(raw) : String(raw);
  }
  if (typeof raw !== "string") return null;
  let v = raw.trim().slice(0, 500);
  if (!v) return null;
  if (kind === "date") v = normalizeDate(v);
  return v;
}

export const extractDocumentDataForTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        /** Plik jako data URL (obraz lub PDF) — wymagany, gdy brak rawText. */
        dataUrl: z.string().min(20).max(15_000_000).optional(),
        /** Treść dokumentu tekstowego (np. .txt) — alternatywa dla dataUrl. */
        rawText: z.string().min(1).max(200_000).optional(),
        mimeType: z.string().min(3).max(100),
        fileName: z.string().max(200).optional(),
        templateName: z.string().max(300),
        fields: z
          .array(
            z.object({
              id: z.string().min(1).max(12),
              label: z.string().max(200),
              group: z.string().max(120),
              kind: z.string().max(40),
              options: z.array(z.string().max(80)).max(12).optional(),
            }),
          )
          .min(1)
          .max(300),
      })
      .refine((d) => d.dataUrl || d.rawText, { message: "Brak pliku do odczytu." })
      .parse(input),
  )
  .handler(async ({ data }): Promise<DocImportResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return empty("no_key");

    const userContent: unknown[] = [
      { type: "text", text: buildUserPrompt(data.templateName, data.fields) },
    ];

    if (data.rawText) {
      userContent.push({
        type: "text",
        text: `Treść dokumentu źródłowego${data.fileName ? ` (${data.fileName})` : ""}:\n\n${data.rawText}`,
      });
    } else {
      const isPdf = data.mimeType === "application/pdf" || /\.pdf$/i.test(data.fileName ?? "");
      const isImage = data.mimeType.startsWith("image/");
      if (!isPdf && !isImage) return empty("unsupported");
      if (isImage) userContent.push({ type: "image_url", image_url: { url: data.dataUrl } });
      else
        userContent.push({
          type: "file",
          file: { filename: data.fileName ?? "dokument.pdf", file_data: data.dataUrl },
        });
    }

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
      const kindById = new Map(data.fields.map((f) => [f.id, f.kind]));
      const values: Record<string, string> = {};
      const rawValues =
        parsed.values && typeof parsed.values === "object"
          ? (parsed.values as Record<string, unknown>)
          : {};
      for (const [id, raw] of Object.entries(rawValues)) {
        const kind = kindById.get(id);
        if (!kind) continue; // id spoza listy pól — ignorujemy
        const v = sanitizeValue(raw, kind);
        if (v) values[id] = v;
      }
      return {
        reason: "ok",
        tytul: typeof parsed.tytul === "string" ? parsed.tytul.slice(0, 200) : "",
        podsumowanie:
          typeof parsed.podsumowanie === "string" ? parsed.podsumowanie.slice(0, 500) : "",
        values,
      };
    } catch {
      return empty("ai_error");
    }
  });
