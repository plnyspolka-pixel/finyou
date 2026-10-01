// Kody rabatowe do płatności za dostęp. Wysokość zniżki wynika z SAMEJ treści
// kodu — nie ma osobnej tabeli kodów:
//
//   RABAT20-7K2M-Q9X4HT3P
//   └─┬──┘  └┬─┘ └──┬───┘
//     │      │      └ podpis HMAC (8 znaków) — bez sekretu nie da się go
//     │      │        policzyć, więc „RABAT90-…" wpisany z ręki nie przejdzie
//     │      └ losowy identyfikator — każdy wygenerowany kod jest inny
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
  `^${DISCOUNT_PREFIX}(\\d{1,2})-([${ALPHABET}]{${NONCE_LEN}})-([${ALPHABET}]{${SIG_LEN}})$`,
);

export interface ParsedDiscountCode {
  /** Kod w postaci kanonicznej (wielkie litery, z myślnikami). */
  code: string;
  pct: number;
  nonce: string;
  sig: string;
}

/** Ujednolica wpis klienta: wielkie litery, bez spacji, O→0 / I,L→1. */
export function normalizeDiscountCode(raw: string): string {
  const compact = (raw || "")
    .toUpperCase()
    .replace(/[\s_–—]+/g, "")
    .replace(/-+/g, "-");
  const m = /^RABAT(\d{1,2})-?(.{4})-?(.{8})$/.exec(compact);
  if (!m) return compact;
  const fix = (s: string) => s.replace(/O/g, "0").replace(/[IL]/g, "1");
  return `${DISCOUNT_PREFIX}${m[1]}-${fix(m[2])}-${fix(m[3])}`;
}

/** Rozbiór składni (bez sprawdzania podpisu). */
export function parseDiscountCode(raw: string): ParsedDiscountCode | null {
  const code = normalizeDiscountCode(raw);
  const m = CODE_RE.exec(code);
  if (!m) return null;
  const pct = Number(m[1]);
  if (!Number.isInteger(pct) || pct < DISCOUNT_MIN_PCT || pct > DISCOUNT_MAX_PCT) return null;
  if (m[1].startsWith("0")) return null;
  return { code, pct, nonce: m[2], sig: m[3] };
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

function signedPart(pct: number, nonce: string): string {
  return `discount:v1:${DISCOUNT_PREFIX}${pct}-${nonce}`;
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join("");
}

/** Nowy kod na `pct` procent zniżki. */
export async function generateDiscountCode(pct: number, secret: string): Promise<string> {
  if (!Number.isInteger(pct) || pct < DISCOUNT_MIN_PCT || pct > DISCOUNT_MAX_PCT) {
    throw new Error(`Zniżka musi być liczbą całkowitą ${DISCOUNT_MIN_PCT}–${DISCOUNT_MAX_PCT}%`);
  }
  if (!secret) throw new Error("Brak sekretu kodów rabatowych");
  const nonce = randomNonce();
  const sig = await hmacBase32(secret, signedPart(pct, nonce), SIG_LEN);
  return `${DISCOUNT_PREFIX}${pct}-${nonce}-${sig}`;
}

/** Sprawdza składnię i podpis. Zwraca rozbity kod albo null. */
export async function verifyDiscountCode(
  raw: string,
  secret: string,
): Promise<ParsedDiscountCode | null> {
  const parsed = parseDiscountCode(raw);
  if (!parsed || !secret) return null;
  const expected = await hmacBase32(secret, signedPart(parsed.pct, parsed.nonce), SIG_LEN);
  let diff = 0;
  for (let i = 0; i < SIG_LEN; i++) diff |= expected.charCodeAt(i) ^ parsed.sig.charCodeAt(i);
  return diff === 0 ? parsed : null;
}

/** Cena po zniżce, w groszach — zaokrąglona w górę do pełnego grosza
 *  (nigdy nie dajemy więcej rabatu, niż obiecuje kod). Minimum 1 zł. */
export function applyDiscountGrosz(amountGrosz: number, pct: number): number {
  return Math.max(100, Math.ceil((amountGrosz * (100 - pct)) / 100));
}
