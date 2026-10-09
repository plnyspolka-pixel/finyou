// Parsery i budowniczowie zapytań dla źródeł PEP → PepRecord.
//
//  * API Sejmu: GET https://api.sejm.gov.pl/sejm/term{N}/MP — JSON, pola
//    firstName, secondName, lastName, birthDate, active, mandateExpiryDate.
//    Kadencje: GET https://api.sejm.gov.pl/sejm/term (from/to).
//  * Wikidata (CC0): SPARQL na query.wikidata.org — osoby z P39 (zajmowane
//    stanowisko) wskazanym w katalogu, z kwalifikatorami P580/P582,
//    datą urodzenia P569 (z precyzją) i obywatelstwem P27 → kod ISO P297.
import { parsePartialDate } from "../normalize";
import type { PepRecord } from "./types";

// --- Sejm ----------------------------------------------------------------------------

export interface SejmTerm {
  num: number;
  from: string;
  to?: string | null;
  current?: boolean;
}

interface SejmMp {
  id: number;
  firstName: string;
  secondName?: string;
  lastName: string;
  birthDate?: string;
  active: boolean;
  mandateExpiryDate?: string;
  oathDate?: string;
}

/** Klucz scalania posła między kadencjami (API nie ma globalnego ID osoby). */
export function sejmPersonKey(mp: { firstName: string; lastName: string; birthDate?: string | null }): string {
  return `${mp.lastName}|${mp.firstName}|${mp.birthDate ?? ""}`.toLowerCase();
}

/** Scala listy posłów z kilku kadencji w rekordy osób z listą mandatów. */
export function parseSejmMps(terms: Array<{ term: SejmTerm; mps: SejmMp[] }>): PepRecord[] {
  const byKey = new Map<string, PepRecord>();
  for (const { term, mps } of terms) {
    for (const mp of mps) {
      if (!mp.firstName || !mp.lastName) continue;
      const key = sejmPersonKey(mp);
      const from = mp.oathDate ?? term.from;
      const to = mp.active ? (term.to ?? null) : (mp.mandateExpiryDate ?? term.to ?? null);
      const position = { title: `Poseł na Sejm RP (${term.num}. kadencja)`, catalogCode: "PL-007", from, to };
      const fullName = [mp.firstName, mp.secondName, mp.lastName].filter(Boolean).join(" ");
      const current = !!(mp.active && term.current !== false && !term.to);
      const existing = byKey.get(key);
      if (existing) {
        existing.positions.push(position);
        existing.current ||= current;
        continue;
      }
      const birth = parsePartialDate(mp.birthDate);
      byKey.set(key, {
        sourceId: key,
        fullName,
        lastName: mp.lastName,
        aliases: mp.secondName ? [`${mp.firstName} ${mp.lastName}`] : [],
        birthDate: birth.date,
        birthYear: birth.year,
        nationality: ["PL"],
        positions: [position],
        current,
        sourceUrl: `https://www.sejm.gov.pl/Sejm${term.num}.nsf/posel.xsp?id=${String(mp.id).padStart(3, "0")}&type=A`,
      });
    }
  }
  return [...byKey.values()];
}

// --- Wikidata --------------------------------------------------------------------------

export type WikidataMode = "direct" | "subclass_pl" | "subclass_any";

/** Zapytanie o listę stanowisk (QID) będących podklasą wskazanych (tryby subclass_*). */
export function wikidataPositionsQuery(rootQids: string[], mode: WikidataMode): string {
  const values = rootQids.map((q) => `wd:${q}`).join(" ");
  const pl = mode === "subclass_pl" ? "?pos wdt:P1001 wd:Q36 ." : "";
  return `SELECT DISTINCT ?pos WHERE { VALUES ?root { ${values} } ?pos wdt:P279* ?root . ${pl} }`;
}

/**
 * Zapytanie o osoby piastujące stanowiska (partia ≤ ~50 QID). Zwraca po
 * jednym wierszu na oświadczenie P39; agregacja po osobie w parserze.
 */
export function wikidataHoldersQuery(positionQids: string[], minEndYear: number): string {
  const values = positionQids.map((q) => `wd:${q}`).join(" ");
  return `SELECT ?person ?namePl ?nameEn ?birth ?prec ?pos ?posLabel ?start ?end
  (GROUP_CONCAT(DISTINCT ?cit; separator="|") AS ?cits)
  (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
WHERE {
  VALUES ?pos { ${values} }
  ?person p:P39 ?st . ?st ps:P39 ?pos .
  ?person wdt:P31 wd:Q5 .
  OPTIONAL { ?st pq:P580 ?start }
  OPTIONAL { ?st pq:P582 ?end }
  FILTER(!BOUND(?end) || YEAR(?end) >= ${Math.trunc(minEndYear)})
  OPTIONAL { ?person p:P569/psv:P569 [ wikibase:timeValue ?birth ; wikibase:timePrecision ?prec ] }
  OPTIONAL { ?person wdt:P27/wdt:P297 ?cit }
  OPTIONAL { ?person rdfs:label ?namePl FILTER(LANG(?namePl) = "pl") }
  OPTIONAL { ?person rdfs:label ?nameEn FILTER(LANG(?nameEn) = "en") }
  OPTIONAL { ?person skos:altLabel ?alias FILTER(LANG(?alias) IN ("pl", "en")) }
  OPTIONAL { ?pos rdfs:label ?posLabel FILTER(LANG(?posLabel) = "pl") }
}
GROUP BY ?person ?namePl ?nameEn ?birth ?prec ?pos ?posLabel ?start ?end`;
}

interface SparqlBinding {
  [k: string]: { type: string; value: string } | undefined;
}

export function parseWikidataPositions(json: { results: { bindings: SparqlBinding[] } }): string[] {
  return json.results.bindings
    .map((b) => b.pos?.value.split("/").pop())
    .filter((q): q is string => !!q && /^Q\d+$/.test(q));
}

/**
 * Agreguje wiersze SPARQL do rekordów osób. `catalogCodeByQid` mapuje QID
 * stanowiska na kod pozycji katalogu (dla raportu pokrycia).
 */
export function parseWikidataHolders(
  json: { results: { bindings: SparqlBinding[] } },
  catalogCodeByQid: Record<string, string>,
  now: Date = new Date(),
): PepRecord[] {
  const byPerson = new Map<string, PepRecord>();
  for (const b of json.results.bindings) {
    const qid = b.person?.value.split("/").pop();
    if (!qid) continue;
    const name = b.namePl?.value || b.nameEn?.value;
    if (!name || /^Q\d+$/.test(name)) continue;
    const posQid = b.pos?.value.split("/").pop() ?? "";
    const start = b.start?.value ? parsePartialDate(b.start.value).date : null;
    const end = b.end?.value ? parsePartialDate(b.end.value).date : null;
    let rec = byPerson.get(qid);
    if (!rec) {
      // Precyzja daty: 11 = dzień, 10 = miesiąc, 9 = rok (Wikidata).
      const prec = Number(b.prec?.value ?? 0);
      const birth = parsePartialDate(b.birth?.value);
      rec = {
        sourceId: qid,
        fullName: name,
        lastName: null,
        aliases: [],
        birthDate: prec >= 11 ? birth.date : null,
        birthYear: birth.year,
        nationality: [],
        positions: [],
        current: false,
        sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      };
      byPerson.set(qid, rec);
    }
    const aliasList = [b.nameEn?.value, b.namePl?.value, ...(b.aliases?.value ?? "").split("|")]
      .filter((x): x is string => !!x && x !== rec.fullName);
    for (const a of aliasList) if (!rec.aliases.includes(a)) rec.aliases.push(a);
    for (const c of (b.cits?.value ?? "").split("|").filter(Boolean)) {
      const code = c.toUpperCase();
      if (!rec.nationality.includes(code)) rec.nationality.push(code);
    }
    const title = b.posLabel?.value || posQid;
    if (!rec.positions.some((p) => p.title === title && p.from === start && p.to === end)) {
      rec.positions.push({ title, catalogCode: catalogCodeByQid[posQid] ?? null, from: start, to: end });
    }
    // Brak daty końca przy znanym początku z ostatnich 15 lat → traktujemy jako trwające.
    if (!end && (!start || now.getUTCFullYear() - Number(start.slice(0, 4)) <= 15)) rec.current = true;
  }
  return [...byPerson.values()];
}

// --- KPRM (skład Rady Ministrów, gov.pl) --------------------------------------------

/** Kod pozycji katalogu na podstawie opisu funkcji z gov.pl. */
function kprmCatalogCode(position: string): string {
  const p = position.toLowerCase();
  if (p.startsWith("prezes rady ministrów")) return "PL-002";
  if (p.includes("wiceprezes rady ministrów")) return "PL-003";
  if (p.includes("szef kancelarii prezesa rady ministrów")) return "PL-035";
  return "PL-004";
}

/**
 * Strona https://www.gov.pl/web/premier/sklad-rady-ministrow — lista
 * `<div class="title"><a>Imię Nazwisko</a></div><div class="position">…</div>`.
 * Źródło nie podaje dat urodzenia ani dat powołania (from = dzień importu
 * przy pierwszym wystąpieniu ustala runner).
 */
export function parseKprm(html: string, pageUrl: string): PepRecord[] {
  const out: PepRecord[] = [];
  const re = /<div class="title">\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/div>\s*<div class="position">([\s\S]*?)<\/div>/g;
  for (const m of html.matchAll(re)) {
    const name = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const position = m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!name || !position) continue;
    const href = m[1].startsWith("http") ? m[1] : `https://www.gov.pl${m[1]}`;
    out.push({
      sourceId: href.split("/").pop() || name.toLowerCase(),
      fullName: name,
      lastName: null,
      aliases: [],
      birthDate: null,
      birthYear: null,
      nationality: ["PL"],
      positions: [{ title: position, catalogCode: kprmCatalogCode(position), from: null, to: null }],
      current: true,
      sourceUrl: href || pageUrl,
    });
  }
  return out;
}
