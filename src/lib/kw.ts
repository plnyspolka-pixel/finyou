// Walidacja numeru księgi wieczystej. Format: KOD SĄDU (4 znaki, np. WA1M)
// / numer (8 cyfr, dopełniany zerami) / cyfra kontrolna. Plik bez importów —
// używany zarówno po stronie klienta (UI), jak i serwera (bot, promocja leada,
// MCP, silnik umów, scoring lokalizacji).

/** Pełne dopasowanie numeru KW z ukośnikami; numer repertoryjny 1–8 cyfr. */
export const KW_FULL_RE = /^[A-Z0-9]{2}\d[A-Z0-9]\/\d{1,8}\/\d$/;

/** Wyszukiwanie numeru KW wewnątrz dłuższego tekstu (separatory: / \ . - spacja). */
const KW_SEARCH_RE =
  /\b([A-ZŁŃŚŻŹĄĆĘÓ0-9]{2}\d[A-Z0-9])[\s/\\.-]{0,3}(\d{7,8})[\s/\\.-]{0,3}(\d)\b/;
/** Krótszy numer (bez zer wiodących) — tylko z jawnymi separatorami, np. "KR1P 610770 2". */
const KW_SEARCH_SHORT_RE = /\b([A-Z0-9]{2}\d[A-Z0-9])[\s/\\.-]{1,3}(\d{1,8})[\s/\\.-]{1,3}(\d)\b/;

/**
 * Normalizuje surowy zapis numeru KW do postaci "XXXX/NNNNNNNN/C" — numer
 * repertoryjny zawsze dopełniony zerami do 8 cyfr (jak w EKW i CMD), np.
 * "KR1P/610770/2" → "KR1P/00610770/2". Zwraca null, gdy tekst nie zawiera
 * numeru — np. gdy bot zapisał status w rodzaju "przesłany".
 * Cyfry kontrolnej NIE sprawdza (do tego `validateKwNumber`).
 */
export function normalizeKwNumber(raw: unknown): string | null {
  const text = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!text) return null;
  const compact = text.replace(/\s+/g, "");
  if (KW_FULL_RE.test(compact)) {
    const [court, num, check] = compact.split("/");
    return `${court}/${num.padStart(8, "0")}/${check}`;
  }
  const m = KW_SEARCH_RE.exec(text) ?? KW_SEARCH_SHORT_RE.exec(text);
  if (!m) return null;
  return `${m[1]}/${m[2].padStart(8, "0")}/${m[3]}`;
}

/** Czy tekst zawiera numer KW (choćby jako fragment)? Bez sprawdzania cyfry kontrolnej. */
export function containsValidKw(raw: unknown): boolean {
  return normalizeKwNumber(raw) !== null;
}

/**
 * Kompaktowa forma numeru KW (13 znaków, bez ukośników), np. "WL1A000068627".
 * DOKŁADNIE w tej formie kw_documents.kw_number przechowuje numery (tak wymaga
 * CMD KW Engine) — każdy odczyt z tej tabeli musi używać tej funkcji.
 */
export function compactKwNumber(raw: unknown): string | null {
  const norm = normalizeKwNumber(raw);
  if (!norm) return null;
  return norm.replace(/\//g, "");
}

/**
 * Forma z ukośnikami do wyświetlania i zapisu w polach formularzy
 * (properties.land_register_number), np. "WL1A/00006862/7".
 * Przyjmuje dowolny zapis (także kompaktowy 13-znakowy z kw_documents).
 */
export function formatKwNumber(raw: unknown): string | null {
  return normalizeKwNumber(raw);
}

// ── cyfra kontrolna ────────────────────────────────────────────
// Algorytm EKW: każdy z 12 znaków (kod wydziału + 8 cyfr numeru) zamieniamy na
// wartość (cyfry 0–9, X = 10, litery A…Z bez Q i V kolejno od 11), mnożymy przez
// wagi 1, 3, 7 powtarzane cyklicznie, sumujemy i bierzemy resztę z dzielenia
// przez 10. Sprawdzone na rzeczywistych księgach (np. ZA1H/00062683/4,
// KR1P/00610770/2, WL1A/00006862/7).
const LITERY_KW = "ABCDEFGHIJKLMNOPRSTUWYZ";
const WAGI_KW = [1, 3, 7];

function wartoscZnakuKw(ch: string): number | null {
  if (/^\d$/.test(ch)) return Number(ch);
  if (ch === "X") return 10;
  const i = LITERY_KW.indexOf(ch);
  return i < 0 ? null : 11 + i;
}

/**
 * Cyfra kontrolna dla kodu wydziału (4 znaki) i numeru (dopełnianego do 8 cyfr).
 * Zwraca null, gdy kod zawiera znak spoza alfabetu EKW.
 */
export function kwCheckDigit(court: string, number: string): number | null {
  const znaki = `${court.toUpperCase()}${number.padStart(8, "0")}`.split("");
  if (znaki.length !== 12) return null;
  let suma = 0;
  for (let i = 0; i < znaki.length; i++) {
    const v = wartoscZnakuKw(znaki[i]);
    if (v === null) return null;
    suma += v * WAGI_KW[i % WAGI_KW.length];
  }
  return suma % 10;
}

export type KwValidation =
  | { ok: true; value: string; compact: string; changed: boolean }
  | {
      ok: false;
      code: "EMPTY" | "FORMAT" | "CHECK_DIGIT";
      message: string;
      /** Numer po normalizacji (gdy format był poprawny). */
      value?: string;
      /** Cyfra kontrolna wynikająca z kodu i numeru (przy CHECK_DIGIT). */
      expected?: number;
    };

/**
 * Ścisła walidacja numeru KW na wejściu (formularze, MCP, silnik umów):
 * normalizacja (dopełnienie numeru do 8 cyfr) + sprawdzenie cyfry kontrolnej.
 * `changed` mówi, czy zapis wejściowy różnił się od znormalizowanego.
 */
export function validateKwNumber(raw: unknown): KwValidation {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, code: "EMPTY", message: "Brak numeru księgi wieczystej." };
  const value = normalizeKwNumber(text);
  if (!value) {
    return {
      ok: false,
      code: "FORMAT",
      message: `Nieprawidłowy format numeru KW: "${text}" (oczekiwany np. WA1M/00012345/6).`,
    };
  }
  const [court, num, check] = value.split("/");
  const expected = kwCheckDigit(court, num);
  if (expected === null || expected !== Number(check)) {
    return {
      ok: false,
      code: "CHECK_DIGIT",
      message:
        expected === null
          ? `Numer KW ${value}: kod wydziału ${court} zawiera niedozwolony znak.`
          : `Numer KW ${value}: błędna cyfra kontrolna (${check}, powinna być ${expected}) — sprawdź numer.`,
      value,
      ...(expected === null ? {} : { expected }),
    };
  }
  return {
    ok: true,
    value,
    compact: value.replace(/\//g, ""),
    changed: text.toUpperCase() !== value,
  };
}

// ── numery KW wewnątrz tekstu (pola formularzy) ────────────────
// Pole KW w formularzach bywa złożone: kilka numerów i dopiski, np.
// "KR1P/610770/2 | KR1P/00610771/X | Pow. użytkowa: 80 m²".
const KW_W_TEKSCIE_RE = /\b([A-Z]{2}\d[A-Z0-9])\s*\/\s*(\d{1,8})\s*\/\s*(\d)\b/gi;

/** Dopełnia zerami do 8 cyfr każdy numer KW (z ukośnikami) w tekście; reszta bez zmian. */
export function normalizeKwNumbersInText(text: string | null | undefined): string | null {
  if (text == null) return null;
  return String(text).replace(
    KW_W_TEKSCIE_RE,
    (_m, court: string, num: string, check: string) =>
      `${court.toUpperCase()}/${num.padStart(8, "0")}/${check}`,
  );
}

/**
 * Komunikat o pierwszym numerze KW w tekście z błędną cyfrą kontrolną
 * (null = wszystkie rozpoznane numery poprawne albo brak numerów).
 */
export function kwCheckDigitError(text: string | null | undefined): string | null {
  for (const m of String(text ?? "").matchAll(KW_W_TEKSCIE_RE)) {
    const r = validateKwNumber(m[0]);
    if (!r.ok && r.code === "CHECK_DIGIT") return r.message;
  }
  return null;
}
