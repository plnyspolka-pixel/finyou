// Czysta logika darmowego konta inwestora (bez zależności od bazy).
//
// Darmowy inwestor może w okresie ostatnich 365 dni:
//  - złożyć do 5 ofert na kwoty do 255 550 zł każda,
//  - zawrzeć maksymalnie 2 pożyczki do 255 550 zł każda,
//  - oferty/pożyczki NA KWOTY POWYŻEJ progu — bez limitu liczby.
// Maksymalne oprocentowanie oferty darmowego konta = odsetki maksymalne
// z art. 359 §2¹ KC: 2 × (stopa referencyjna NBP + 3,5 p.p.) — liczone na
// bieżąco z danych NBP.

/** Próg kwotowy darmowego konta (art. 3 ust. 1 ustawy o kredycie konsumenckim). */
export const FREE_AMOUNT_THRESHOLD_PLN = 255_550;
export const FREE_OFFER_LIMIT = 5;
export const FREE_LOAN_LIMIT = 2;
/** Okno liczenia limitów: ostatnie 365 dni (krocząco). */
export const FREE_WINDOW_DAYS = 365;

/** Odsetki maksymalne (art. 359 §2¹ KC): 2 × (stopa referencyjna NBP + 3,5 p.p.). */
export function statutoryMaxAnnualRate(nbpReferenceRatePct: number): number {
  return Math.round((nbpReferenceRatePct + 3.5) * 2 * 100) / 100;
}

/** Czy kwota przekracza próg darmowego konta (powyżej progu — bez limitów liczby). */
export function isAboveFreeThreshold(amountPln: number): boolean {
  return Number(amountPln) > FREE_AMOUNT_THRESHOLD_PLN;
}

export interface FreeInvestorUsage {
  /** Oferty złożone w oknie 365 dni na kwoty ≤ progu. */
  offersLast365: number;
  /** Pożyczki zawarte (oferty zaakceptowane przez klienta) w oknie 365 dni na kwoty ≤ progu. */
  loansLast365: number;
}

export interface FreeLimitDecision {
  allowed: boolean;
  reason?: "offer_limit" | "loan_limit" | "rate_too_high";
  message?: string;
}

/** Czy darmowy inwestor może złożyć ofertę na daną kwotę. */
export function canSubmitFreeOffer(usage: FreeInvestorUsage, amountPln: number): FreeLimitDecision {
  if (isAboveFreeThreshold(amountPln)) return { allowed: true };
  if (usage.offersLast365 >= FREE_OFFER_LIMIT) {
    return {
      allowed: false,
      reason: "offer_limit",
      message: `Na darmowym koncie możesz złożyć maksymalnie ${FREE_OFFER_LIMIT} ofert w ciągu roku na kwoty do ${FREE_AMOUNT_THRESHOLD_PLN.toLocaleString("pl-PL")} zł. Oferty na wyższe kwoty są bez limitu — albo wykup pełny dostęp.`,
    };
  }
  return { allowed: true };
}

/** Czy darmowy inwestor może zawrzeć kolejną pożyczkę na daną kwotę. */
export function canConcludeFreeLoan(
  usage: FreeInvestorUsage,
  amountPln: number,
): FreeLimitDecision {
  if (isAboveFreeThreshold(amountPln)) return { allowed: true };
  if (usage.loansLast365 >= FREE_LOAN_LIMIT) {
    return {
      allowed: false,
      reason: "loan_limit",
      message: `Na darmowym koncie możesz zawrzeć maksymalnie ${FREE_LOAN_LIMIT} pożyczki w ciągu roku na kwoty do ${FREE_AMOUNT_THRESHOLD_PLN.toLocaleString("pl-PL")} zł. Pożyczki na wyższe kwoty są bez limitu — albo wykup pełny dostęp.`,
    };
  }
  return { allowed: true };
}

/** Walidacja oprocentowania oferty względem limitu ustawowego. */
export function validateFreeOfferRate(ratePct: number, maxRatePct: number): FreeLimitDecision {
  if (!Number.isFinite(ratePct) || ratePct <= 0) {
    return { allowed: false, reason: "rate_too_high", message: "Podaj oprocentowanie oferty." };
  }
  // Tolerancja 0,01 p.p. na zaokrąglenia UI.
  if (ratePct > maxRatePct + 0.01) {
    return {
      allowed: false,
      reason: "rate_too_high",
      message: `Maksymalne oprocentowanie zgodne z limitem ustawowym wynosi obecnie ${maxRatePct.toFixed(2)}% rocznie (2 × (stopa referencyjna NBP + 3,5 p.p.)).`,
    };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------
// Anonimizacja treści księgi wieczystej dla darmowego konta.
// Maskuje: numery KW, PESEL-e oraz wskazane frazy (imiona/nazwiska
// właścicieli zebrane z owners_json) w dowolnej strukturze JSON.
// ---------------------------------------------------------------------

const KW_NUMBER_RE = /\b[A-Z]{2}\d[A-Z0-9]\/\d{8}\/\d\b/g;
const PESEL_RE = /\b\d{11}\b/g;

/** Maskuje numer KW: zachowuje kod sądu, kropkuje numer i cyfrę kontrolną. */
export function maskKwNumber(kw: string): string {
  const parts = String(kw ?? "")
    .trim()
    .toUpperCase()
    .split("/");
  if (parts.length !== 3) return String(kw ?? "").replace(/\d/g, "•");
  const [court, num] = parts;
  const masked =
    num.length > 2
      ? num.slice(0, 2) + "•".repeat(Math.max(0, num.length - 2))
      : "•".repeat(num.length);
  return `${court}/${masked}/•`;
}

/** Zbiera frazy osobowe (≥3 znaki) z dowolnej struktury (owners_json). */
export function collectPersonalPhrases(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    const v = value.trim();
    // Frazy wyglądające na dane osobowe: słowa z liter (imiona/nazwiska).
    if (v.length >= 3 && /\p{L}/u.test(v) && !/^\d+$/.test(v)) {
      out.add(v);
      // Także pojedyncze człony ("Jan Kowalski" → "Jan", "Kowalski").
      for (const part of v.split(/\s+/)) {
        if (part.length >= 3 && /\p{L}/u.test(part)) out.add(part);
      }
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPersonalPhrases(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collectPersonalPhrases(v, out);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Redaguje tekst: numery KW, PESEL-e i frazy osobowe → wykropkowane. */
export function redactText(text: string, personalPhrases: Iterable<string>): string {
  let out = String(text ?? "")
    .replace(KW_NUMBER_RE, (m) => maskKwNumber(m))
    .replace(PESEL_RE, "•••••••••••");
  const phrases = [...personalPhrases]
    .filter((p) => p.length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    out = out.replace(new RegExp(escapeRegExp(phrase), "gi"), "•••");
  }
  return out;
}

/** Rekurencyjnie redaguje wszystkie stringi w strukturze JSON. */
export function redactJson<T>(value: T, personalPhrases: Iterable<string>): T {
  const phrases = [...personalPhrases];
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return redactText(v, phrases);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, walk(val)]),
      );
    }
    return v;
  };
  return walk(value) as T;
}
