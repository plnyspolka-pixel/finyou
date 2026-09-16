// Bezpiecznik na zmyślone dane kontaktowe w wiadomościach bota.
//
// Powód: bot podał klientowi na Messengerze numer telefonu, którego nie ma w
// naszych danych — po prostu go wymyślił. Sam prompt tego nie wyklucza (model
// potrafi zmyślić mimo zakazu), więc każdą wychodzącą wiadomość przepuszczamy
// jeszcze przez ten filtr.
//
// Zasada: w wiadomości bota może zostać numer / e-mail / adres, który:
//   1) należy do Finance You (dane firmowe, linki na financeyou.pl), albo
//   2) pojawił się wcześniej w tej rozmowie lub w danych leada (czyli podał go
//      klient, a bot go najwyżej powtarza).
// Wszystko inne to zmyślenie — wycinamy CAŁE zdanie, w którym się znalazło,
// bo zwykle jest to zdanie typu „proszę zadzwonić pod numer…", które i tak
// nie powinno paść.
//
// Świadomie po stronie kodu, nie promptu: prompt jest sugestią, to jest gwarancja.

import { COMPANY, SITE_URL } from "@/lib/seo/company";

export type RedactionKind = "telefon" | "email" | "adres";

export interface Redaction {
  kind: RedactionKind;
  /** Wartość dokładnie tak, jak napisał ją bot. */
  value: string;
  /** Zdanie, które przez nią wypadło. */
  sentence: string;
}

export interface ContactGuardResult {
  /** Wiadomość po usunięciu zmyśleń. */
  text: string;
  /** Co wycięliśmy — do logu i do panelu. */
  redactions: Redaction[];
  /** true, gdy po czyszczeniu nie zostało nic i użyliśmy zdania zastępczego. */
  usedFallback: boolean;
}

export interface ContactGuardOptions {
  /**
   * Teksty, w których dane kontaktowe są legalne: wcześniejsze wiadomości
   * rozmowy, e-mail i telefon leada, wygenerowany link do wniosku.
   */
  knownText?: Array<string | null | undefined>;
  /** Zdanie użyte, gdy po czyszczeniu nie zostaje nic sensownego. */
  fallback?: string;
}

const DEFAULT_FALLBACK =
  "Wróćmy do wniosku — wszystko, czego potrzeba, zbierzemy tutaj. Na czym skończyliśmy?";

/** Domeny, których linki i adresy e-mail są nasze. */
const ALLOWED_DOMAINS = ["financeyou.pl"];

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

/** Sprowadza numer do 9 cyfr krajowych; null = to nie wygląda na polski numer. */
export function nationalPhoneDigits(raw: string): string | null {
  const d = digitsOf(raw);
  if (d.length === 9) return d;
  if (d.length === 11 && d.startsWith("48")) return d.slice(2);
  if (d.length === 13 && d.startsWith("0048")) return d.slice(4);
  return null;
}

function isAllowedDomain(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return ALLOWED_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

// Ciąg wyglądający na numer: cyfry z typowymi separatorami, opcjonalnie z
// prefiksem kierunkowym. Walidację długości robi nationalPhoneDigits.
const PHONE_CANDIDATE = /(?:\+|00)?\d[\d\s().-]{7,17}\d/g;
const EMAIL_CANDIDATE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_CANDIDATE = /(?:https?:\/\/|www\.)[^\s<>"')]+/gi;

// Konteksty, w których 9 cyfr to NIE telefon: kwoty, metraże, numery ksiąg.
const NOT_A_PHONE_CONTEXT = /(zł|pln|tys|mln|%|m2|m²|nip|regon|pesel|kw\b|nr kw)/i;

function looksLikeMoneyOrId(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 16), start);
  const after = text.slice(end, end + 16);
  if (NOT_A_PHONE_CONTEXT.test(before) || NOT_A_PHONE_CONTEXT.test(after)) return true;
  // Numer księgi wieczystej: cyfry wewnątrz tokenu z ukośnikami (WA1M/00123456/7).
  if (/[/]\s*$/.test(before) || /^\s*[/]/.test(after)) return true;
  return false;
}

/** Dzieli tekst na zdania, zachowując oryginalne znaki i przejścia do nowej linii. */
function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?…])\s+|\n+/);
  return parts.filter((p) => p !== undefined);
}

/**
 * Czyści wiadomość bota ze zmyślonych danych kontaktowych.
 *
 * Nie rusza niczego, co klient sam podał w rozmowie, ani danych Finance You —
 * bot musi móc potwierdzić klientowi jego własny numer albo podać nasz adres.
 */
export function guardOutboundContactDetails(
  message: string,
  options: ContactGuardOptions = {},
): ContactGuardResult {
  const text = String(message ?? "");
  if (!text.trim()) return { text, redactions: [], usedFallback: false };

  const known = (options.knownText ?? []).filter(Boolean).join("\n").toLowerCase();
  const knownPhones = new Set<string>();
  for (const m of known.match(PHONE_CANDIDATE) ?? []) {
    const national = nationalPhoneDigits(m);
    if (national) knownPhones.add(national);
  }
  const companyPhone = nationalPhoneDigits(COMPANY.phone);
  if (companyPhone) knownPhones.add(companyPhone);

  const knownEmails = new Set<string>(
    (known.match(EMAIL_CANDIDATE) ?? []).map((e) => e.toLowerCase()),
  );
  knownEmails.add(COMPANY.email.toLowerCase());

  const redactions: Redaction[] = [];

  const sentences = splitSentences(text);
  const kept: string[] = [];

  for (const sentence of sentences) {
    const offending = findOffendingContact(sentence, { knownPhones, knownEmails, known });
    if (offending) {
      redactions.push({ ...offending, sentence: sentence.trim() });
      continue;
    }
    kept.push(sentence);
  }

  if (redactions.length === 0) return { text, redactions: [], usedFallback: false };

  const cleaned = kept
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (cleaned.length >= 15) return { text: cleaned, redactions, usedFallback: false };

  return { text: options.fallback ?? DEFAULT_FALLBACK, redactions, usedFallback: true };
}

function findOffendingContact(
  sentence: string,
  ctx: { knownPhones: Set<string>; knownEmails: Set<string>; known: string },
): { kind: RedactionKind; value: string } | null {
  // E-mail
  for (const match of sentence.match(EMAIL_CANDIDATE) ?? []) {
    const value = match.toLowerCase();
    const domain = value.split("@")[1] ?? "";
    if (isAllowedDomain(domain) || ctx.knownEmails.has(value)) continue;
    return { kind: "email", value: match };
  }

  // Adres WWW
  for (const match of sentence.match(URL_CANDIDATE) ?? []) {
    const withScheme = match.startsWith("http") ? match : `https://${match}`;
    let host = "";
    try {
      host = new URL(withScheme).hostname;
    } catch {
      continue;
    }
    if (isAllowedDomain(host) || host === new URL(SITE_URL).hostname) continue;
    if (ctx.known.includes(match.toLowerCase())) continue;
    return { kind: "adres", value: match };
  }

  // Telefon
  PHONE_CANDIDATE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PHONE_CANDIDATE.exec(sentence)) !== null) {
    const raw = m[0].trim();
    const national = nationalPhoneDigits(raw);
    if (!national) continue;
    if (looksLikeMoneyOrId(sentence, m.index, m.index + m[0].length)) continue;
    if (ctx.knownPhones.has(national)) continue;
    return { kind: "telefon", value: raw };
  }

  return null;
}
