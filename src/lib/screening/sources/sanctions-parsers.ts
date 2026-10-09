// Parsery list sankcyjnych → SanctionRecord. Czyste funkcje (string → rekordy),
// testowane na zapisanych próbkach odpowiedzi (__fixtures__).
//
// Formaty zweryfikowane 2026-10-09:
//  * UE FSF: XML „xmlFullSanctionsList_1_1” (namespace http://eu.europa.ec/fpi/fsd/export),
//    element <sanctionEntity> z <nameAlias>, <birthdate>, <citizenship>, <regulation>.
//  * ONZ: XML „consolidated.xml” — <INDIVIDUAL> / <ENTITY>.
//  * OFAC: SDN.CSV (bez nagłówka; 12 kolumn) + ALT.CSV (aliasy).
//  * MSWiA: strona gov.pl z dwiema tabelami HTML (Osoby, Podmioty).
import { attrs, elements, stripTags, text } from "./xml";
import { normalizeCountry, parsePartialDate, parsePolishTextDate } from "../normalize";
import type { SanctionName, SanctionRecord } from "./types";

function uniq<T>(a: T[]): T[] {
  return [...new Set(a)];
}

// --- UE ---------------------------------------------------------------------------

export function parseEuFsf(xml: string): SanctionRecord[] {
  const out: SanctionRecord[] = [];
  for (const el of elements(xml, "sanctionEntity")) {
    const a = attrs(el);
    const subject = attrs(elements(el, "subjectType")[0] ?? "").code ?? "";
    const names: SanctionName[] = [];
    for (const na of elements(el, "nameAlias")) {
      const n = attrs(na);
      const whole = (n.wholeName || [n.firstName, n.middleName, n.lastName].filter(Boolean).join(" ")).trim();
      if (!whole) continue;
      names.push({
        name: whole,
        first: n.firstName || null,
        last: n.lastName || null,
        strong: n.strong === "true",
        lang: n.nameLanguage || null,
      });
    }
    if (names.length === 0) continue;
    const births = elements(el, "birthdate").map((b) => {
      const x = attrs(b);
      if (x.birthdate) return x.birthdate;
      return x.year ? x.year : "";
    });
    const nats = elements(el, "citizenship")
      .map((c) => attrs(c).countryIso2Code)
      .filter((c): c is string => !!c && c !== "00");
    const regs = elements(el, "regulation").map((r) => attrs(r));
    const listed = regs.map((r) => r.publicationDate).filter(Boolean).sort()[0] ?? null;
    const primary = names.find((n) => n.strong && (!n.lang || n.lang === "EN")) ?? names[0];
    out.push({
      sourceId: a.logicalId || a.euReferenceNumber,
      entityType: subject === "person" ? "person" : subject === "enterprise" ? "entity" : "unknown",
      names,
      primaryName: primary.name,
      birthDates: uniq(births.filter(Boolean)),
      nationalities: uniq(nats.map((c) => c.toUpperCase())),
      programme: regs.find((r) => r.programme)?.programme ?? null,
      listedAt: listed,
      delistedAt: null,
      remarks: [a.euReferenceNumber && `EU ref: ${a.euReferenceNumber}`, text(el, "remark")].filter(Boolean).join(" | ") || null,
      sourceUrl: text(elements(el, "regulation")[0] ?? "", "publicationUrl"),
    });
  }
  return out;
}

// --- ONZ --------------------------------------------------------------------------

function unDates(el: string): string[] {
  const out: string[] = [];
  for (const d of elements(el, "INDIVIDUAL_DATE_OF_BIRTH")) {
    const date = text(d, "DATE");
    if (date) {
      out.push(date.slice(0, 10));
      continue;
    }
    const year = text(d, "YEAR");
    if (year) out.push(year);
    const from = Number(text(d, "FROM_YEAR"));
    const to = Number(text(d, "TO_YEAR"));
    if (from && to && to >= from && to - from <= 10) for (let y = from; y <= to; y++) out.push(String(y));
  }
  return uniq(out);
}

export function parseUnSc(xml: string): SanctionRecord[] {
  const out: SanctionRecord[] = [];
  const build = (el: string, kind: "person" | "entity") => {
    const parts = ["FIRST_NAME", "SECOND_NAME", "THIRD_NAME", "FOURTH_NAME"].map((t) => text(el, t)).filter(Boolean) as string[];
    if (parts.length === 0) return;
    const primary = parts.join(" ");
    const names: SanctionName[] = [{
      name: primary,
      first: kind === "person" ? parts[0] : null,
      last: kind === "person" && parts.length > 1 ? parts.slice(1).join(" ") : null,
      strong: true,
    }];
    const original = text(el, "NAME_ORIGINAL_SCRIPT");
    if (original) names.push({ name: original, strong: true, lang: "original" });
    for (const al of elements(el, kind === "person" ? "INDIVIDUAL_ALIAS" : "ENTITY_ALIAS")) {
      const n = text(al, "ALIAS_NAME");
      if (n) names.push({ name: n, strong: (text(al, "QUALITY") ?? "").toLowerCase() === "good" });
    }
    const nats = elements(el, "NATIONALITY")
      .flatMap((n) => elements(n, "VALUE").map((v) => text(v, "VALUE")))
      .map((v) => normalizeCountry(v))
      .filter((c): c is string => !!c);
    out.push({
      sourceId: text(el, "DATAID") ?? text(el, "REFERENCE_NUMBER") ?? primary,
      entityType: kind,
      names,
      primaryName: primary,
      birthDates: kind === "person" ? unDates(el) : [],
      nationalities: uniq(nats),
      programme: text(el, "UN_LIST_TYPE"),
      listedAt: text(el, "LISTED_ON")?.slice(0, 10) ?? null,
      delistedAt: null,
      remarks: [text(el, "REFERENCE_NUMBER"), text(el, "COMMENTS1")?.slice(0, 1000)].filter(Boolean).join(" | ") || null,
      sourceUrl: "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list",
    });
  };
  for (const el of elements(xml, "INDIVIDUAL")) build(el, "person");
  for (const el of elements(xml, "ENTITY")) build(el, "entity");
  return out;
}

// --- OFAC -------------------------------------------------------------------------

/** Parser CSV zgodny z RFC 4180 (cudzysłowy, przecinki w polach). */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const OFAC_NULL = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "-0-" || t === "" ? null : t;
};

/** „ROTENBERG, Arkady Romanovich” → „Arkady Romanovich ROTENBERG”. */
function ofacName(raw: string, individual: boolean): { name: string; first: string | null; last: string | null } {
  if (individual && raw.includes(",")) {
    const [last, ...rest] = raw.split(",");
    const first = rest.join(",").trim();
    return { name: `${first} ${last.trim()}`.trim(), first: first || null, last: last.trim() };
  }
  return { name: raw.trim(), first: null, last: null };
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function ofacDobs(remarks: string): string[] {
  const out: string[] = [];
  for (const m of remarks.matchAll(/DOB ([^;]+)/g)) {
    for (const part of m[1].split(/;|\bto\b|,/)) {
      const p = part.trim();
      let x = p.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
      if (x && MONTHS[x[2].toLowerCase()]) {
        out.push(`${x[3]}-${MONTHS[x[2].toLowerCase()]}-${x[1].padStart(2, "0")}`);
        continue;
      }
      x = p.match(/(\d{4})/);
      if (x) out.push(x[1]);
    }
  }
  return uniq(out);
}

export function parseOfacSdn(sdnCsv: string, altCsv?: string): SanctionRecord[] {
  const aliases = new Map<string, SanctionName[]>();
  if (altCsv) {
    for (const r of parseCsv(altCsv)) {
      const [entNum, , altType, altName] = r;
      const name = OFAC_NULL(altName);
      if (!entNum || !name) continue;
      const list = aliases.get(entNum.trim()) ?? [];
      list.push({ name: ofacName(name, true).name, strong: (OFAC_NULL(altType) ?? "").toLowerCase() === "aka" });
      aliases.set(entNum.trim(), list);
    }
  }
  const out: SanctionRecord[] = [];
  for (const r of parseCsv(sdnCsv)) {
    if (r.length < 12) continue;
    const [entNum, sdnName, sdnType, program, , , , , , , , remarksRaw] = r;
    const id = entNum.trim();
    if (!/^\d+$/.test(id)) continue;
    const type = (OFAC_NULL(sdnType) ?? "").toLowerCase();
    const individual = type === "individual";
    const n = ofacName(sdnName, individual);
    const remarks = OFAC_NULL(remarksRaw) ?? "";
    const nats = [...remarks.matchAll(/(?:nationality|citizen) ([A-Za-z ]+?)(?:;|\.|$)/g)]
      .map((m) => normalizeCountry(m[1]))
      .filter((c): c is string => !!c);
    out.push({
      sourceId: id,
      entityType: individual ? "person" : type === "vessel" ? "vessel" : type === "aircraft" ? "aircraft" : "entity",
      names: [{ name: n.name, first: n.first, last: n.last, strong: true }, ...(aliases.get(id) ?? [])],
      primaryName: n.name,
      birthDates: individual ? ofacDobs(remarks) : [],
      nationalities: uniq(nats),
      programme: OFAC_NULL(program),
      listedAt: null,
      delistedAt: null,
      remarks: remarks ? remarks.slice(0, 1000) : null,
      sourceUrl: `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${id}`,
    });
  }
  return out;
}

// --- MSWiA --------------------------------------------------------------------------

function plDate(s: string): string | null {
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/**
 * Strona gov.pl MSWiA: pierwsza tabela — osoby, druga — podmioty, trzecia —
 * historia wersji. Kolumny: nazwa | dane identyfikacyjne | uzasadnienie |
 * środki | data umieszczenia | data wykreślenia. Zwraca też numer wersji listy.
 */
export function parseMswia(html: string): { records: SanctionRecord[]; listVersion: string | null } {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  const records: SanctionRecord[] = [];
  let listVersion: string | null = null;
  const parseTable = (table: string, kind: "person" | "entity") => {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    for (const row of rows) {
      const cells = (row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map(stripTags);
      if (cells.length < 5 || /^(Nazwisko|Podmioty|Nazwa)/i.test(cells[0])) continue;
      const [nameCell, idCell, reason, measures, listedCell, delistedCell] = cells;
      if (!nameCell) continue;
      let name = nameCell;
      let first: string | null = null;
      let last: string | null = null;
      if (kind === "person") {
        // „ALAUDINOV Apti Aronovich” — nazwisko wielkimi literami na początku.
        const m = nameCell.match(/^((?:[\p{Lu}-]{2,}\s?)+)\s+(.+)$/u);
        if (m) {
          last = m[1].trim();
          first = m[2].trim();
          name = `${first} ${last}`;
        }
      }
      const birth = kind === "person" ? parsePolishTextDate(idCell ?? "") : { date: null, year: null };
      const alias = (idCell ?? "").match(/(?:znany|znana|znane) (?:również |także )?jako[:\s]+([^.;]+)/i)?.[1];
      records.push({
        sourceId: `${kind}:${nameCell.toUpperCase().replace(/\s+/g, " ").trim()}`,
        entityType: kind,
        names: [
          { name, first, last, strong: true },
          ...(alias ? alias.split(/,| lub /).map((x) => ({ name: x.trim(), strong: false })).filter((x) => x.name) : []),
        ],
        primaryName: name,
        birthDates: birth.date ? [birth.date] : birth.year ? [String(birth.year)] : [],
        nationalities: kind === "person" ? uniq([/Federacji Rosyjskiej|rosyjsk/i.test(reason ?? "") ? "RU" : "", /Białoru|białorusk/i.test(reason ?? "") ? "BY" : ""].filter(Boolean)) : [],
        programme: "PL-UA-2022",
        listedAt: plDate(listedCell ?? ""),
        delistedAt: plDate(delistedCell ?? ""),
        remarks: [idCell, measures?.slice(0, 300)].filter(Boolean).join(" | ").slice(0, 1000) || null,
        sourceUrl: "https://www.gov.pl/web/mswia/lista-osob-i-podmiotow-objetych-sankcjami",
      });
    }
  };
  tables.forEach((t, i) => {
    const header = stripTags(t.slice(0, 600));
    if (/Wersja/i.test(header) && /Tytuł/i.test(header)) {
      const m = stripTags(t).match(/Lista os[oó]b i podmiot[oó]w objętych sankcjami (\d+(?:\.\d+)?)/);
      listVersion = m?.[1] ?? null;
      return;
    }
    parseTable(t, /Podmiot|Nazwa podmiotu/i.test(header) || i === 1 ? "entity" : "person");
  });
  return { records, listVersion };
}

/** Sprawdzenie dat urodzenia rekordu (dla testów i statystyk). */
export function hasBirthDate(r: SanctionRecord): boolean {
  return r.birthDates.some((d) => parsePartialDate(d).year != null);
}
