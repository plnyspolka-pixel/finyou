import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInvestorPro } from "@/lib/investor-plan/pro-middleware";
import {
  dodatniaKwota,
  emptyWindContract,
  ocrData,
  parseOcrJsonText,
  parseWindContractJson,
  type WindContractData,
  type WindOcrReason,
} from "@/lib/windykacja-ocr-parse";

// Typy odczytu umowy żyją w module parsującym (czyste funkcje, testy);
// formularz importuje je stąd.
export type {
  WindContractData,
  WindContractFees,
  WindHarmonogramZrodlo,
  WindOcrReason,
} from "@/lib/windykacja-ocr-parse";

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
  reason: WindOcrReason;
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
  .middleware([requireInvestorPro])
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

    const parsed = parseOcrJsonText(text);
    if (!parsed) return empty("ai_error");
    try {
      return {
        reason: "ok",
        documentType: coerceType(parsed.documentType),
        tytul: typeof parsed.tytul === "string" ? parsed.tytul.slice(0, 200) : "",
        dataISO: ocrData(parsed.dataISO),
        numer_nadania:
          typeof parsed.numer_nadania === "string" && parsed.numer_nadania.trim()
            ? parsed.numer_nadania.trim().slice(0, 60)
            : null,
        kwota: dodatniaKwota(parsed.kwota),
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

const CONTRACT_USER_PROMPT = `To jest umowa pożyczki (z załącznikami, m.in. Załącznik nr 1 — Harmonogram spłat). Wyodrębnij dane i zwróć WYŁĄCZNIE JSON:
{
  "pozyczkodawca": nazwa pożyczkodawcy — strony UDZIELAJĄCEJ pożyczki: imię i nazwisko osoby albo pełna nazwa firmy z formą prawną (np. „Finance You sp. z o.o.”), albo null,
  "imie_nazwisko": pożyczkobiorca (dłużnik): imię i nazwisko osoby fizycznej — także prowadzącej działalność gospodarczą, wtedy BEZ nazwy firmy — albo pełna nazwa spółki / osoby prawnej,
  "typ": "osoba_fizyczna" (osoba fizyczna, także prowadząca jednoosobową działalność gospodarczą — ma PESEL i NIP) albo "firma" (WYŁĄCZNIE spółka lub inna osoba prawna: sp. z o.o., S.A., spółka jawna / komandytowa, fundacja, spółdzielnia),
  "pesel": PESEL pożyczkobiorcy (11 cyfr) albo null,
  "nip": NIP pożyczkobiorcy (10 cyfr; także NIP przedsiębiorcy będącego osobą fizyczną) albo null,
  "email": e-mail pożyczkobiorcy albo null,
  "telefon": telefon pożyczkobiorcy albo null,
  "adres": adres zamieszkania / siedziby pożyczkobiorcy albo null,
  "numer_umowy": numer umowy albo null,
  "data_umowy": data zawarcia umowy w formacie yyyy-mm-dd albo null,
  "kwota_pozyczki_umowy": Kwota Pożyczki określona w umowie („zwana dalej Kwotą Pożyczki”) jako liczba albo null,
  "prowizja": WYŁĄCZNIE prowizja Finance You (Prowizja od Pożyczkobiorcy) potrącana z wypłaty Kwoty Pożyczki — NIE prowizja pożyczkodawcy; gdy umowa jej nie przewiduje — null,
  "kwota_pozyczki": kwota wypłacona na rękę = Kwota Pożyczki minus prowizja Finance You potrącana z wypłaty (gdy takiej prowizji nie ma — Kwota Pożyczki) albo null,
  "prowizja_pozyczkodawcy": prowizja pożyczkodawcy za udzielenie pożyczki jako liczba albo null,
  "prowizja_pozyczkodawcy_potracana": true, gdy prowizja pożyczkodawcy jest potrącana z Kwoty Pożyczki przy wypłacie; false, gdy nie jest potrącana (płatna w ratach wg harmonogramu); null, gdy brak prowizji albo nie wiadomo,
  "kwota_calkowita": kwota do zwrotu BEZ odsetek umownych = Kwota Pożyczki + prowizja pożyczkodawcy (gdy prowizja jest potrącana z wypłaty — sama Kwota Pożyczki); NIE wpisuj sumy rat z odsetkami ani łącznej kwoty do zapłaty; albo null,
  "oprocentowanie_roczne": oprocentowanie umowne (kapitałowe) w % rocznie jako liczba albo null,
  "odsetki_za_opoznienie": stopa odsetek za opóźnienie w % rocznie TYLKO wtedy, gdy umowa podaje ją wprost jako liczbę procent; gdy umowa mówi o „dwukrotności odsetek ustawowych za opóźnienie” albo o odsetkach maksymalnych za opóźnienie bez liczby — null,
  "termin_splaty": termin płatności OSTATNIEJ raty w formacie yyyy-mm-dd albo null,
  "harmonogram": WSZYSTKIE raty z tabeli Załącznika nr 1 (Harmonogram spłat), w kolejności, zwięźle: [{"termin":"yyyy-mm-dd","kwota":rata łącznie,"odsetki":część odsetkowa raty albo null,"prowizja":część prowizyjna raty albo null}] — bez wiersza sumy; gdy w dokumencie nie ma tabeli rat — null,
  "liczba_rat": liczba rat albo null,
  "kwota_raty": kwota (typowej) raty albo null,
  "kwota_ostatniej_raty": kwota ostatniej raty, gdy jest inna niż pozostałe (np. rata końcowa / balonowa), albo null,
  "data_pierwszej_raty": termin pierwszej raty w formacie yyyy-mm-dd albo null,
  "rachunek_splaty": numer rachunku bankowego do spłaty rat (26 cyfr, ewentualnie z prefiksem PL) albo null,
  "numer_kw": numer księgi wieczystej (format AA1A/00000000/0) albo null,
  "kwota_hipoteki": kwota hipoteki umownej („do kwoty … zł”) jako liczba albo null,
  "akt_notarialny_777": opis aktu notarialnego z oświadczeniem o poddaniu się egzekucji (art. 777 § 1 pkt 5 k.p.c.): numer repertorium, data, notariusz, kancelaria — np. „Rep. A nr …/…, notariusz …, Kancelaria Notarialna w …”; gdy umowa nie podaje numeru repertorium — krótki opis postanowienia (np. „oświadczenie o poddaniu się egzekucji w trybie art. 777 § 1 pkt 5 k.p.c.”); gdy brak — null,
  "kwota_777": kwota, do której pożyczkobiorca poddał się egzekucji (art. 777), jako liczba albo null,
  "oplaty_windykacyjne": {
    "sms": opłata w zł za wysłanie SMS-a/monitu SMS albo null,
    "email": opłata w zł za monit e-mail albo null,
    "telefon": opłata w zł za telefoniczne wezwanie/monit albo null,
    "pismo": opłata w zł za pisemne wezwanie do zapłaty (list polecony) albo null,
    "brak_oplat": true, jeśli umowa WYRAŹNIE nie przewiduje opłat za czynności windykacyjne; w przeciwnym razie false
  },
  "podsumowanie": jedno zdanie po polsku podsumowujące umowę
}
Zasady:
- Pożyczkodawcą może być osoba fizyczna (inwestor) albo firma — nazwę weź z komparycji umowy. Pożyczkobiorca to strona, która otrzymuje pożyczkę i ją spłaca; nie myl stron. Finance You sp. z o.o. pobierająca Prowizję od Pożyczkobiorcy nie jest pożyczkobiorcą.
- Kwoty jako liczby w złotych (kropka dziesiętna, bez spacji i waluty). Daty w formacie yyyy-mm-dd.
- Harmonogram: przepisz każdy wiersz tabeli rat (także gdy tabela zajmuje kilka stron) — nie skracaj i nie pomijaj rat.
- Opłaty windykacyjne bierz z tabeli opłat / paragrafu o kosztach windykacji; nie wymyślaj ich.
- Niczego nie zgaduj — jeśli czegoś nie ma w dokumencie, wpisz null. Zwróć wyłącznie JSON.`;

export const analyzeWindContract = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
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
    if (!apiKey) return emptyWindContract("no_key");

    const isPdf = data.mimeType === "application/pdf" || /\.pdf$/i.test(data.fileName ?? "");
    const isImage = data.mimeType.startsWith("image/");
    if (!isPdf && !isImage) return emptyWindContract("unsupported");

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
      if (resp.status === 429) return emptyWindContract("rate_limited");
      if (resp.status === 402) return emptyWindContract("ai_quota");
      if (!resp.ok) return emptyWindContract("ai_error");
      const json = await resp.json();
      text = json?.choices?.[0]?.message?.content ?? "";
    } catch {
      return emptyWindContract("ai_error");
    }

    // Normalizacja kwot, dat, PESEL/NIP, rachunku i harmonogramu —
    // windykacja-ocr-parse.ts (czyste funkcje z testami).
    const p = parseOcrJsonText(text);
    if (!p) return emptyWindContract("ai_error");
    try {
      return parseWindContractJson(p);
    } catch {
      return emptyWindContract("ai_error");
    }
  });
