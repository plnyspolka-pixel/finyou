// Sprawdzenie, czy osoba fizyczna (współwłaściciel z działu II KW) figuruje
// w KRS — jako członek zarządu, wspólnik, prokurent, członek organu itd.
//
// Publiczne API KRS (api-krs.ms.gov.pl) pozwala pobrać odpis TYLKO po numerze
// KRS — nie wyszukuje po osobie ani po PESEL. Dlatego dwustopniowo:
//   1) DISCOVERY — darmowe wyszukiwanie w sieci (DuckDuckGo, web-fetch.server.ts)
//      po imieniu i nazwisku; z wyników (rejestr.io, krs-online, aleo, MSiG…)
//      wyciągamy kandydackie numery KRS podmiotów, w których osoba może występować,
//   2) WERYFIKACJA — dla każdego kandydata pobieramy oficjalny odpis aktualny
//      z api-krs.ms.gov.pl i szukamy osoby w jego treści. Odpis zawiera PESEL
//      osób, więc zgodność z PESEL z księgi wieczystej daje dopasowanie PEWNE.
//
// Gdy wyszukiwarka nie odpowiada, moduł zwraca „niedostępne" (nie przerywa sprawdzenia).

import type { CoOwnerKrsCheck, CoOwnerKrsHit } from "./types";
import { scanKrsOdpisForPerson } from "./core";
import { webSearch, type WebSearchResult } from "@/lib/web-fetch.server";

const KRS_BASE = "https://api-krs.ms.gov.pl/api/krs";
const TIMEOUT_MS = 15_000;
const MAX_CANDIDATES = 4;

export function emptyKrsCheck(note: string, available = false): CoOwnerKrsCheck {
  return { available, found: false, matchConfidence: "none", hits: [], note };
}

function normalizeKrsNumber(input: string): string | null {
  const cleaned = (input ?? "").replace(/[\s\-_.]/g, "");
  if (!/^\d{1,10}$/.test(cleaned)) return null;
  return cleaned.padStart(10, "0");
}

type KrsCandidate = { krs: string; companyName: string | null; role: string | null };

const PL_LOWER = (v: string) => v.toLocaleLowerCase("pl-PL");

/**
 * Numery KRS z wyniku wyszukiwania: 10-cyfrowe „0000123456" w tekście oraz
 * identyfikatory z adresów rejestr.io (/krs/123456/…) i krs-online (…-krs-123456).
 */
export function extractKrsNumbers(r: WebSearchResult): string[] {
  const out = new Set<string>();
  const text = `${r.title} ${r.snippet}`;
  for (const m of text.matchAll(/\bKRS[:\s]*(\d{6,10})\b/gi)) {
    const n = normalizeKrsNumber(m[1]);
    if (n) out.add(n);
  }
  for (const m of text.matchAll(/\b(0{2,}\d{4,8})\b/g)) {
    if (m[1].length === 10) out.add(m[1]);
  }
  const urlPatterns = [/rejestr\.io\/krs\/(\d{1,10})/i, /krs[-_/](\d{6,10})(?:[./-]|$)/i];
  for (const re of urlPatterns) {
    const m = r.url.match(re);
    const n = m ? normalizeKrsNumber(m[1]) : null;
    if (n) out.add(n);
  }
  return [...out];
}

async function discoverKrsCandidates(args: {
  fullName: string;
  birthYear: number | null;
  city: string | null;
  voivodeship: string | null;
}): Promise<KrsCandidate[] | { error: string }> {
  const queries = [
    `"${args.fullName}" KRS`,
    `"${args.fullName}" rejestr.io`,
    args.city ? `"${args.fullName}" ${args.city} spółka zarząd` : null,
  ].filter((q): q is string => !!q);

  let results: WebSearchResult[] = [];
  try {
    const batches = await Promise.all(queries.map((q) => webSearch(q, { limit: 10 })));
    results = batches.flat();
  } catch (e: any) {
    return { error: e?.message ?? "błąd wyszukiwarki" };
  }
  if (results.length === 0) return { error: "wyszukiwarka nie zwróciła wyników" };

  // Tylko wyniki, które faktycznie wspominają osobę (nazwisko w tytule/opisie).
  const nameParts = args.fullName.split(/\s+/).filter(Boolean);
  const lastName = PL_LOWER(nameParts[nameParts.length - 1] ?? "");
  const firstName = PL_LOWER(nameParts[0] ?? "");
  const cityLc = args.city ? PL_LOWER(args.city) : null;

  const scored = new Map<string, KrsCandidate & { score: number }>();
  for (const r of results) {
    const text = PL_LOWER(`${r.title} ${r.snippet}`);
    if (!lastName || !text.includes(lastName)) continue;
    let score = 1;
    if (firstName && text.includes(firstName)) score += 2;
    if (cityLc && text.includes(cityLc)) score += 1;
    if (/rejestr\.io|krs-online|aleo\.com|imsig|monitorsadowy/i.test(r.url)) score += 1;
    for (const krs of extractKrsNumbers(r)) {
      const prev = scored.get(krs);
      if (prev) {
        prev.score += score;
        continue;
      }
      scored.set(krs, {
        krs,
        companyName:
          r.title
            .replace(/\s*[-–|].*$/, "")
            .trim()
            .slice(0, 200) || null,
        role: null,
        score,
      });
    }
  }
  return [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map(({ score: _score, ...c }) => c);
}

async function fetchKrsOdpis(krs: string): Promise<any | null> {
  for (const rejestr of ["P", "S"] as const) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${KRS_BASE}/OdpisAktualny/${krs}?rejestr=${rejestr}&format=json`, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const body: any = await res.json().catch(() => null);
      if (body && typeof body === "object" && body.odpis) return body;
    } catch {
      // timeout / sieć — spróbuj kolejnego rejestru
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function nonEmpty(v: any): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return String(v).trim().length > 0;
}

function companyMetaFromOdpis(
  raw: any,
  krs: string,
): {
  name: string;
  legalForm: string | null;
  status: string;
  flags: CoOwnerKrsHit["flags"];
} {
  const odpis = raw?.odpis ?? raw ?? {};
  const dane = odpis?.dane ?? {};
  const podmiot = dane?.dzial1?.danePodmiotu ?? {};
  const d6 = dane?.dzial6 ?? {};
  const naglowek = odpis?.naglowekA ?? odpis?.naglowekP ?? odpis?.naglowek ?? {};
  const deletionDate = naglowek?.dataDokonaniaWpisuWykreslenia ?? "";
  const liquidation = nonEmpty(d6?.likwidacja);
  const bankruptcy = nonEmpty(d6?.postepowanieUpadlosciowe) || nonEmpty(d6?.postepowanieUkladowe);
  const restructuring =
    nonEmpty(d6?.postepowanieRestrukturyzacyjne) || nonEmpty(d6?.postepowanieNaprawcze);
  const status = deletionDate
    ? "Wykreślony z KRS"
    : liquidation
      ? "W likwidacji"
      : bankruptcy
        ? "W upadłości"
        : "Aktywny";
  return {
    name: podmiot?.nazwa ?? `KRS ${krs}`,
    legalForm: podmiot?.formaPrawna ?? null,
    status,
    flags: { liquidation, bankruptcy, restructuring },
  };
}

/**
 * Szuka osoby w KRS: discovery kandydatów (wyszukiwanie w sieci) → weryfikacja każdego
 * kandydata oficjalnym odpisem (dopasowanie po PESEL z KW albo po nazwisku).
 * Do wyniku trafiają wyłącznie podmioty potwierdzone treścią odpisu.
 */
export async function searchKrsForPerson(args: {
  firstName: string | null;
  lastName: string | null;
  /** Pełny PESEL z działu II KW — używany tylko do porównania, nie zapisywany. */
  pesel: string | null;
  birthYear: number | null;
  city: string | null;
  voivodeship: string | null;
}): Promise<CoOwnerKrsCheck> {
  const fullName = [args.firstName, args.lastName].filter(Boolean).join(" ").trim();
  if (!fullName) {
    return emptyKrsCheck("Brak imienia i nazwiska — nie sprawdzono KRS.");
  }

  const candidates = await discoverKrsCandidates({
    fullName,
    birthYear: args.birthYear,
    city: args.city,
    voivodeship: args.voivodeship,
  });
  if (!Array.isArray(candidates)) {
    return emptyKrsCheck(`Wyszukiwanie KRS niedostępne: ${candidates.error}.`);
  }
  if (candidates.length === 0) {
    return {
      available: true,
      found: false,
      matchConfidence: "none",
      hits: [],
      note: "Nie znaleziono osoby w KRS (wyszukiwanie web, brak kandydackich podmiotów).",
    };
  }

  const hits: CoOwnerKrsHit[] = [];
  for (const cand of candidates) {
    const raw = await fetchKrsOdpis(cand.krs);
    if (!raw) continue;
    const scan = scanKrsOdpisForPerson(raw, {
      pesel: args.pesel,
      firstName: args.firstName,
      lastName: args.lastName,
    });
    if (!scan.peselMatched && !scan.nameMatched) continue;
    const meta = companyMetaFromOdpis(raw, cand.krs);
    hits.push({
      krs: cand.krs,
      companyName: meta.name || cand.companyName || `KRS ${cand.krs}`,
      legalForm: meta.legalForm,
      role: scan.roles[0] ?? cand.role,
      companyStatus: meta.status,
      peselMatched: scan.peselMatched,
      nameMatched: scan.nameMatched,
      flags: meta.flags,
    });
  }

  if (hits.length === 0) {
    return {
      available: true,
      found: false,
      matchConfidence: "none",
      hits: [],
      note: `Kandydackie podmioty (${candidates.length}) nie potwierdziły się w oficjalnych odpisach KRS — osoby nie znaleziono.`,
    };
  }

  const anyPesel = hits.some((h) => h.peselMatched);
  return {
    available: true,
    found: true,
    matchConfidence: anyPesel ? "high" : "medium",
    hits: hits.slice(0, 6),
    note: anyPesel
      ? "Osoba potwierdzona w odpisie KRS zgodnością numeru PESEL z działu II KW."
      : "Osoba dopasowana w odpisie KRS po imieniu i nazwisku (PESEL w odpisie nieporównany) — zweryfikuj tożsamość.",
  };
}
