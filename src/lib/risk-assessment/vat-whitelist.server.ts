// Działalność gospodarcza właściciela — niezależnie od API CEIDG.
//
// Hurtownia danych CEIDG (dane.biznes.gov.pl) potrafi odrzucać zapytania
// z serwera („Access Denied", HTTP 403) i nie wyszukuje po PESEL. Druga droga:
// oficjalny wykaz podatników VAT Ministerstwa Finansów („biała lista",
// wl-api.mf.gov.pl) — publiczne API bez klucza, po NIP zwraca nazwę, status
// VAT, REGON, adres i datę rejestracji. Obejmuje czynnych i zwolnionych
// podatników VAT (także jednoosobowe działalności).
//
//   1) znany NIP → weryfikacja w wykazie (pewna),
//   2) bez NIP → kandydaci z wyszukiwarki (numery NIP przy imieniu i nazwisku
//      w katalogach firm) → każdy potwierdzany w wykazie: nazwa podmiotu musi
//      zawierać imię i nazwisko właściciela.
import { webSearch } from "@/lib/web-fetch.server";
import type { CeidgActivity } from "./types";

const WL_API = "https://wl-api.mf.gov.pl/api/search/nip";

/** NIP z poprawną sumą kontrolną (wagi 6-5-7-2-3-4-5-6-7, mod 11). */
export function isValidNip(raw: string): boolean {
  const nip = raw.replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(nip)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(nip[i]), 0);
  return sum % 11 === Number(nip[9]);
}

export interface WhiteListSubject {
  name: string;
  nip: string;
  regon: string | null;
  statusVat: string | null;
  registrationDate: string | null;
  address: string | null;
}

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Podmiot z wykazu podatników VAT po NIP (null = brak w wykazie / błąd). */
export async function lookupVatWhiteList(nipRaw: string): Promise<WhiteListSubject | null> {
  const nip = nipRaw.replace(/\D/g, "");
  if (!isValidNip(nip)) return null;
  const date = new Date().toISOString().slice(0, 10);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`${WL_API}/${nip}?date=${date}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: { subject?: any } };
    const s = j.result?.subject;
    if (!s?.name) return null;
    return {
      name: String(s.name),
      nip: String(s.nip ?? nip),
      regon: s.regon ?? null,
      statusVat: s.statusVat ?? null,
      registrationDate: s.registrationLegalDate ?? null,
      address: s.workingAddress ?? s.residenceAddress ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Czy nazwa podmiotu z wykazu należy do tej osoby (imię + nazwisko w nazwie JDG). */
export function subjectMatchesPerson(
  subjectName: string,
  firstName: string | null,
  lastName: string | null,
): boolean {
  if (!lastName) return false;
  const name = ` ${norm(subjectName)} `;
  const last = norm(lastName);
  const first = norm(firstName);
  return name.includes(` ${last} `) && (!first || name.includes(` ${first} `));
}

/** Numery NIP (z poprawną sumą kontrolną) występujące w tekście. */
export function extractNipCandidates(text: string): string[] {
  const out = new Set<string>();
  const re =
    /\bNIP[:\s]*((?:\d[\s-]?){9}\d)\b|\b(\d{3}-\d{3}-\d{2}-\d{2}|\d{3}-\d{2}-\d{2}-\d{3}|\d{10})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const nip = (m[1] ?? m[2] ?? "").replace(/\D/g, "");
    // Inne identyfikatory tej długości (REGON, KRS, PESEL, telefon) — pomijamy.
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (!m[1] && /(regon|krs|pesel|tel)[.:\s]*$/i.test(before)) continue;
    // Kody urzędów skarbowych zaczynają się od 1–9.
    if (nip.length === 10 && nip[0] !== "0" && isValidNip(nip)) out.add(nip);
  }
  return [...out];
}

function statusFromVat(statusVat: string | null): CeidgActivity["status"] {
  const s = (statusVat ?? "").toLowerCase();
  if (s.includes("czynny") || s.includes("zwolniony")) return "aktywny";
  if (s.includes("niezarejestrowany")) return "nieznany";
  return "nieznany";
}

function toActivity(
  s: WhiteListSubject,
  queried: CeidgActivity["queried"],
  confidence: CeidgActivity["matchConfidence"],
  how: string,
): CeidgActivity {
  const status = statusFromVat(s.statusVat);
  return {
    available: true,
    queried,
    isEntrepreneur: status === "aktywny",
    status,
    matchConfidence: confidence,
    activeCount: status === "aktywny" ? 1 : 0,
    company: {
      name: s.name,
      nip: s.nip,
      regon: s.regon,
      startDate: s.registrationDate,
      pkdMain: null,
    },
    note: `Działalność potwierdzona w wykazie podatników VAT MF (${how}): ${s.name}, NIP ${s.nip}, status VAT: ${s.statusVat ?? "—"}.`,
  };
}

/**
 * Działalność osoby według wykazu podatników VAT MF. Z NIP — weryfikacja
 * wprost; bez NIP — kandydaci z wyszukiwarki potwierdzani w wykazie.
 * null = nie potwierdzono działalności.
 */
export async function findBusinessInVatWhiteList(args: {
  firstName: string | null;
  lastName: string | null;
  nip?: string | null;
  city?: string | null;
}): Promise<CeidgActivity | null> {
  const nip = (args.nip ?? "").replace(/\D/g, "");
  if (nip.length === 10) {
    const s = await lookupVatWhiteList(nip);
    if (s) return toActivity(s, "nip", "high", "po NIP klienta");
  }
  if (!args.firstName || !args.lastName) return null;

  const who = `${args.firstName} ${args.lastName}`;
  const queries = [
    `"${who}" NIP${args.city ? ` ${args.city}` : ""}`,
    `"${who}" działalność gospodarcza NIP`,
  ];
  const batches = await Promise.all(
    queries.map((q) => webSearch(q, { limit: 10 }).catch(() => [])),
  );
  const candidates = new Set<string>();
  for (const r of batches.flat()) {
    // Tylko wyniki, w których pada nazwisko — inaczej NIP dotyczy kogoś innego.
    const text = `${r.title} ${r.snippet}`;
    if (!norm(text).includes(norm(args.lastName))) continue;
    for (const c of extractNipCandidates(text)) candidates.add(c);
    if (candidates.size >= 6) break;
  }
  for (const c of candidates) {
    const s = await lookupVatWhiteList(c);
    if (s && subjectMatchesPerson(s.name, args.firstName, args.lastName)) {
      return toActivity(s, "name", "medium", "NIP znaleziony w sieci po imieniu i nazwisku");
    }
  }
  return null;
}
