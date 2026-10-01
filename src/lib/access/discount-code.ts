// Kody rabatowe do płatności za dostęp. Wysokość zniżki wynika z SAMEJ treści
// kodu — nie ma osobnej tabeli kodów:
//
//   RABAT20-311226-7K2M-Q9X4HT3P
//   └─┬──┘  └─┬──┘ └┬─┘ └──┬───┘
//     │       │     │      └ podpis HMAC (8 znaków) obejmujący procent, datę
//     │       │     │        i identyfikator — bez sekretu nie da się go
//     │       │     │        policzyć, więc zmiana „20" na „90" albo
//     │       │     │        przesunięcie daty unieważnia kod
//     │       │     └ losowy identyfikator — każdy wygenerowany kod jest inny
//     │       └ ważny do (DDMMRR) — włącznie, do końca dnia czasu polskiego
//     └ zniżka w procentach (1–90)
//
// Kod jest jednorazowy: po zaksięgowanej płatności z danym kodem kolejna próba
// jest odrzucana (sprawdza checkout po kolumnie access_payments.discount_code).
// Moduł bez zależności serwerowych — Web Crypto działa w przeglądarce, Node
// i Workerze; sekret podaje wyłącznie serwer.

export const DISCOUNT_PREFIX = "RABAT";
export const DISCOUNT_MIN_PCT = 1;
export const DISCOUNT_MAX_PCT = 90;

// Crockford base32 — bez I, L, O, U (nie myli się z 1/0 przy przepisywaniu).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const NONCE_LEN = 4;
const SIG_LEN = 8;

const CODE_RE = new RegExp(
  `^${DISCOUNT_PREFIX}(\\d{1,2})-(\\d{6})-([${ALPHABET}]{${NONCE_LEN}})-([${ALPHABET}]{${SIG_LEN}})$`,
);

/** Najdłuższa ważność kodu przy generowaniu. */
export const DISCOUNT_MAX_VALID_DAYS = 2 * 365;

export interface ParsedDiscountCode {
  /** Kod w postaci kanonicznej (wielkie litery, z myślnikami). */
  code: string;
  pct: number;
  /** Ostatni dzień ważności, YYYY-MM-DD (czas polski, włącznie). */
  validUntil: string;
  nonce: string;
  sig: string;
}

/** Dzisiejsza data w Polsce, YYYY-MM-DD. */
export function warsawToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** YYYY-MM-DD → DDMMRR (segment kodu). */
function toCodeDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}${m}${y.slice(2)}`;
}

/** DDMMRR → YYYY-MM-DD albo null, gdy data nie istnieje (np. 310226). */
function fromCodeDate(seg: string): string | null {
  const d = Number(seg.slice(0, 2));
  const m = Number(seg.slice(2, 4));
  const y = 2000 + Number(seg.slice(4, 6));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${seg.slice(2, 4)}-${seg.slice(0, 2)}`;
}

/** YYYY-MM-DD → DD.MM.RRRR (do komunikatów). */
export function formatValidUntil(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

/** Czy kod jest jeszcze ważny w dniu `today` (YYYY-MM-DD, czas polski). */
export function isDiscountCodeActive(parsed: ParsedDiscountCode, today = warsawToday()): boolean {
  return today <= parsed.validUntil;
}

/** Ujednolica wpis klienta: wielkie litery, bez spacji, O→0 / I,L→1. */
export function normalizeDiscountCode(raw: string): string {
  const compact = (raw || "")
    .toUpperCase()
    .replace(/[\s_–—]+/g, "")
    .replace(/-+/g, "-");
  // Długości segmentów są stałe, więc kod wpisany bez myślników też się rozkłada.
  const m = /^RABAT(\d{1,2})-?(\d{6})-?(.{4})-?(.{8})$/.exec(compact);
  if (!m) return compact;
  const fix = (s: string) => s.replace(/O/g, "0").replace(/[IL]/g, "1");
  return `${DISCOUNT_PREFIX}${m[1]}-${m[2]}-${fix(m[3])}-${fix(m[4])}`;
}

/** Rozbiór składni (bez sprawdzania podpisu). */
export function parseDiscountCode(raw: string): ParsedDiscountCode | null {
  const code = normalizeDiscountCode(raw);
  const m = CODE_RE.exec(code);
  if (!m) return null;
  const pct = Number(m[1]);
  if (!Number.isInteger(pct) || pct < DISCOUNT_MIN_PCT || pct > DISCOUNT_MAX_PCT) return null;
  if (m[1].startsWith("0")) return null;
  const validUntil = fromCodeDate(m[2]);
  if (!validUntil) return null;
  return { code, pct, validUntil, nonce: m[3], sig: m[4] };
}

async function hmacBase32(secret: string, message: string, len: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
  // 5 bitów na znak.
  let out = "";
  let buf = 0;
  let bits = 0;
  for (const b of bytes) {
    buf = (buf << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < len) {
      out += ALPHABET[(buf >> (bits - 5)) & 31];
      bits -= 5;
    }
    buf &= (1 << bits) - 1;
    if (out.length >= len) break;
  }
  return out;
}

function signedPart(pct: number, validUntil: string, nonce: string): string {
  return `discount:v2:${DISCOUNT_PREFIX}${pct}-${toCodeDate(validUntil)}-${nonce}`;
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join("");
}

/**
 * Nowy kod na `pct` procent zniżki, ważny do `validUntil` (YYYY-MM-DD, włącznie).
 * `today` — do testów; domyślnie dzisiejsza data w Polsce.
 */
export async function generateDiscountCode(
  pct: number,
  validUntil: string,
  secret: string,
  today: string = warsawToday(),
): Promise<string> {
  if (!Number.isInteger(pct) || pct < DISCOUNT_MIN_PCT || pct > DISCOUNT_MAX_PCT) {
    throw new Error(`Zniżka musi być liczbą całkowitą ${DISCOUNT_MIN_PCT}–${DISCOUNT_MAX_PCT}%`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || !fromCodeDate(toCodeDate(validUntil))) {
    throw new Error("Podaj prawidłową datę ważności kodu");
  }
  if (validUntil < today) throw new Error("Data ważności nie może być wcześniejsza niż dziś");
  const maxDate = new Date(`${today}T00:00:00Z`);
  maxDate.setUTCDate(maxDate.getUTCDate() + DISCOUNT_MAX_VALID_DAYS);
  if (validUntil > maxDate.toISOString().slice(0, 10)) {
    throw new Error(`Kod może być ważny najdłużej ${DISCOUNT_MAX_VALID_DAYS} dni`);
  }
  if (!secret) throw new Error("Brak sekretu kodów rabatowych");
  const nonce = randomNonce();
  const sig = await hmacBase32(secret, signedPart(pct, validUntil, nonce), SIG_LEN);
  return `${DISCOUNT_PREFIX}${pct}-${toCodeDate(validUntil)}-${nonce}-${sig}`;
}

/** Sprawdza składnię i podpis (NIE datę — patrz isDiscountCodeActive).
 *  Zwraca rozbity kod albo null. */
export async function verifyDiscountCode(
  raw: string,
  secret: string,
): Promise<ParsedDiscountCode | null> {
  const parsed = parseDiscountCode(raw);
  if (!parsed || !secret) return null;
  const expected = await hmacBase32(
    secret,
    signedPart(parsed.pct, parsed.validUntil, parsed.nonce),
    SIG_LEN,
  );
  let diff = 0;
  for (let i = 0; i < SIG_LEN; i++) diff |= expected.charCodeAt(i) ^ parsed.sig.charCodeAt(i);
  return diff === 0 ? parsed : null;
}

/** Cena po zniżce, w groszach — zaokrąglona w górę do pełnego grosza
 *  (nigdy nie dajemy więcej rabatu, niż obiecuje kod). Minimum 1 zł. */
export function applyDiscountGrosz(amountGrosz: number, pct: number): number {
  return Math.max(100, Math.ceil((amountGrosz * (100 - pct)) / 100));
}
