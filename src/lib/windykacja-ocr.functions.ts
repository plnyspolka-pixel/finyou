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

// ════════════════════════════════════════════════════════════════════
// ODCZYT UMOWY POŻYCZKI — wypełnia formularz nowej sprawy danymi z umowy.
// Inwestor robi zdjęcie / wgrywa umowę, a system wyciąga dane dłużnika i
// pożyczki, żeby nie trzeba było niczego przepisywać ręcznie.
// ════════════════════════════════════════════════════════════════════

export interface WindContractData {
  reason: WindOcrResult["reason"];
  imie_nazwisko: string | null;
  typ: "osoba_fizyczna" | "firma" | null;
  pesel: string | null;
  nip: string | null;
  email: string | null;
  telefon: string | null;
  adres: string | null;
  numer_umowy: string | null;
  data_umowy: string | null; // ISO yyyy-mm-dd
  kwota_pozyczki: number | null; // kwota na rękę / wypłacona
  kwota_calkowita: number | null; // całkowita kwota do zwrotu
  prowizja: number | null;
  termin_splaty: string | null; // ISO yyyy-mm-dd
  numer_kw: string | null;
  podsumowanie: string;
}

const CONTRACT_USER_PROMPT = `To jest umowa pożyczki. Wyodrębnij dane i zwróć WYŁĄCZNIE JSON:
{
  "imie_nazwisko": imię i nazwisko pożyczkobiorcy/dłużnika albo nazwa firmy,
  "typ": "osoba_fizyczna" lub "firma",
  "pesel": PESEL pożyczkobiorcy (11 cyfr) albo null,
  "nip": NIP (dla firmy) albo null,
  "email": e-mail pożyczkobiorcy albo null,
  "telefon": telefon pożyczkobiorcy albo null,
  "adres": adres zamieszkania / siedziby pożyczkobiorcy albo null,
  "numer_umowy": numer umowy albo null,
  "data_umowy": data zawarcia umowy w formacie yyyy-mm-dd albo null,
  "kwota_pozyczki": kwota wypłacona/na rękę jako liczba albo null,
  "kwota_calkowita": całkowita kwota do zwrotu jako liczba albo null,
  "prowizja": prowizja jako liczba albo null,
  "termin_splaty": ostateczny termin spłaty w formacie yyyy-mm-dd albo null,
  "numer_kw": numer księgi wieczystej (format AA1A/00000000/0) albo null,
  "podsumowanie": jedno zdanie po polsku podsumowujące umowę
}
Pożyczkodawcą jest firma (np. Finance You) — NIE wpisuj jej jako pożyczkobiorcy. Kwoty bez waluty i spacji. Jeśli czegoś nie ma — null. Zwróć wyłącznie JSON.`;

function str(v: unknown, max = 200): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function emptyContract(reason: WindOcrResult["reason"]): WindContractData {
  return {
    reason,
    imie_nazwisko: null,
    typ: null,
    pesel: null,
    nip: null,
    email: null,
    telefon: null,
    adres: null,
    numer_umowy: null,
    data_umowy: null,
    kwota_pozyczki: null,
    kwota_calkowita: null,
    prowizja: null,
    termin_splaty: null,
    numer_kw: null,
    podsumowanie: "",
  };
}

export const analyzeWindContract = createServerFn({ method: "POST" })
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
  .handler(async ({ data }): Promise<WindContractData> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return emptyContract("no_key");

    const isPdf = data.mimeType === "application/pdf" || /\.pdf$/i.test(data.fileName ?? "");
    const isImage = data.mimeType.startsWith("image/");
    if (!isPdf && !isImage) return emptyContract("unsupported");

    const userContent: unknown[] = [{ type: "text", text: CONTRACT_USER_PROMPT }];
    if (isImage) userContent.push({ type: "image_url", image_url: { url: data.dataUrl } });
    else
      userContent.push({
        type: "file",
        file: { filename: data.fileName ?? "umowa.pdf", file_data: data.dataUrl },
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
      if (resp.status === 429) return emptyContract("rate_limited");
      if (resp.status === 402) return emptyContract("ai_quota");
      if (!resp.ok) return emptyContract("ai_error");
      const json = await resp.json();
      text = json?.choices?.[0]?.message?.content ?? "";
    } catch {
      return emptyContract("ai_error");
    }

    try {
      const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
      const p = JSON.parse(cleaned) as Record<string, unknown>;
      const nip = str(p.nip, 20);
      return {
        reason: "ok",
        imie_nazwisko: str(p.imie_nazwisko),
        typ:
          p.typ === "firma"
            ? "firma"
            : p.typ === "osoba_fizyczna"
              ? "osoba_fizyczna"
              : nip
                ? "firma"
                : "osoba_fizyczna",
        pesel: str(p.pesel, 20),
        nip,
        email: str(p.email, 200),
        telefon: str(p.telefon, 40),
        adres: str(p.adres, 300),
        numer_umowy: str(p.numer_umowy, 80),
        data_umowy: toIsoDate(p.data_umowy),
        kwota_pozyczki: toNumber(p.kwota_pozyczki),
        kwota_calkowita: toNumber(p.kwota_calkowita),
        prowizja: toNumber(p.prowizja),
        termin_splaty: toIsoDate(p.termin_splaty),
        numer_kw: str(p.numer_kw, 40),
        podsumowanie: typeof p.podsumowanie === "string" ? p.podsumowanie.slice(0, 500) : "",
      };
    } catch {
      return emptyContract("ai_error");
    }
  });
