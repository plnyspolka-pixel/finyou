// Sprawdzenie, czy osoba fizyczna (współwłaściciel z działu II KW) figuruje
// w KRS — jako członek zarządu, wspólnik, prokurent, członek organu itd.
//
// Publiczne API KRS (api-krs.ms.gov.pl) pozwala pobrać odpis TYLKO po numerze
// KRS — nie wyszukuje po osobie ani po PESEL. Dlatego dwustopniowo:
//   1) DISCOVERY — Perplexity Sonar (web search) wskazuje kandydackie numery
//      KRS podmiotów, w których osoba może występować,
//   2) WERYFIKACJA — dla każdego kandydata pobieramy oficjalny odpis aktualny
//      z api-krs.ms.gov.pl i szukamy osoby w jego treści. Odpis zawiera PESEL
//      osób, więc zgodność z PESEL z księgi wieczystej daje dopasowanie PEWNE.
//
// Bez PERPLEXITY_API_KEY moduł zwraca „niedostępne" (nie przerywa sprawdzenia).

import type { CoOwnerKrsCheck, CoOwnerKrsHit } from "./types";
import { scanKrsOdpisForPerson } from "./core";

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

async function discoverKrsCandidates(args: {
  fullName: string;
  birthYear: number | null;
  city: string | null;
  voivodeship: string | null;
}): Promise<KrsCandidate[] | { error: string }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return { error: "Brak PERPLEXITY_API_KEY" };

  const hints = [
    args.birthYear ? `rocznik ok. ${args.birthYear}` : null,
    args.city ? `powiązana z miejscowością ${args.city}` : null,
    args.voivodeship ? `woj. ${args.voivodeship}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const prompt =
    `Sprawdź, czy osoba "${args.fullName}"${hints ? ` (${hints})` : ""} występuje w polskim ` +
    `Krajowym Rejestrze Sądowym (KRS) — jako członek zarządu, wspólnik, akcjonariusz, prokurent, ` +
    `członek rady nadzorczej lub likwidator jakiegokolwiek podmiotu. Przeszukaj bazy wpisów KRS ` +
    `(rejestr.io, krs-online, aleo.com, imsig.pl, ogłoszenia MSiG) i strony podmiotów. ` +
    `Zwróć WYŁĄCZNIE poprawny JSON: {"candidates":[{"krs":"0000123456","companyName":"…","role":"…"}]} ` +
    `— maksymalnie ${MAX_CANDIDATES} podmiotów z 10-cyfrowym numerem KRS. ` +
    `Jeżeli nie znajdziesz nic wiarygodnego, zwróć {"candidates":[]}.`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "Jesteś analitykiem polskich rejestrów gospodarczych. Odpowiadasz wyłącznie JSON-em.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "candidates",
            schema: {
              type: "object",
              properties: {
                candidates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      krs: { type: "string" },
                      companyName: { type: "string" },
                      role: { type: "string" },
                    },
                    required: ["krs"],
                  },
                },
              },
              required: ["candidates"],
            },
          },
        },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { error: `Perplexity HTTP ${res.status}: ${t.slice(0, 120)}` };
    }
    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { error: "Perplexity: niepoprawny JSON odpowiedzi" };
    }
    const arr = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    const out: KrsCandidate[] = [];
    const seen = new Set<string>();
    for (const c of arr) {
      const krs = normalizeKrsNumber(String(c?.krs ?? ""));
      if (!krs || seen.has(krs)) continue;
      seen.add(krs);
      out.push({
        krs,
        companyName: c?.companyName ? String(c.companyName).trim() : null,
        role: c?.role ? String(c.role).trim() : null,
      });
      if (out.length >= MAX_CANDIDATES) break;
    }
    return out;
  } catch (e: any) {
    return {
      error: e?.name === "AbortError" ? "Perplexity timeout" : (e?.message ?? "błąd sieci"),
    };
  } finally {
    clearTimeout(timer);
  }
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
 * Szuka osoby w KRS: discovery kandydatów (Perplexity) → weryfikacja każdego
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
