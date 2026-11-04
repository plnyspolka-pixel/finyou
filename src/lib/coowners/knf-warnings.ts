// Lista ostrzeżeń publicznych KNF — parser tabel ze strony KNF i dopasowanie
// podmiotów (czysta logika, testowalna bez sieci).
// Źródło: https://www.knf.gov.pl/dla_konsumenta/ostrzezenia_publiczne (robots.txt: Allow /).

export const KNF_WARNINGS_URL = "https://www.knf.gov.pl/dla_konsumenta/ostrzezenia_publiczne";

export interface KnfWarningEntry {
  /** Rodzaj zawiadomienia (nagłówek tabeli), np. „… art. 171 ust. 1–3 ustawy Prawo bankowe …”. */
  category: string;
  lp: string;
  names: string[];
  krs: string[];
  nips: string[];
  regons: string[];
  domains: string[];
  /** Identyfikator → indeks nazwy w `names` (numerowane listy „1. … 2. …”). */
  idOwner: Record<string, number>;
  prosecutor: string | null;
  rulings: string | null;
  info: string | null;
}

export type KnfMatchKind = "identifier" | "domain" | "name";

export interface KnfWarningHit {
  match: KnfMatchKind;
  /** Co się zgodziło, np. „KRS 0000544100”, „domena loanme.pl”, „nazwa”. */
  matchedOn: string;
  category: string;
  lp: string;
  entryName: string;
  prosecutor: string | null;
  info: string | null;
  rulings: string | null;
}

export interface KnfSubject {
  name: string;
  kind: "person" | "company";
  firstName?: string | null;
  lastName?: string | null;
  krs?: string[];
  nips?: string[];
  regons?: string[];
  domains?: string[];
}

const decode = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const clean = (s: string) =>
  decode(s)
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
const orNull = (s: string) => (s && s !== "-" && !/^brak danych$/i.test(s) ? s : null);

/** Nazwy z komórki: lista numerowana „1. … 2. …” albo pojedyncza nazwa. */
function splitNames(cell: string): string[] {
  const lines = cell
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const numbered = lines.filter((l) => /^\d+\.\s/.test(l));
  const list =
    numbered.length >= 1 && numbered.length === lines.length
      ? lines.map((l) => l.replace(/^\d+\.\s*/, ""))
      : [lines.join(" ")];
  return list.map((n) => n.slice(0, 400)).filter(Boolean);
}

function domainsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,24})\b/gi)) {
    const d = m[1].toLowerCase().replace(/^www\./, "");
    if (
      /^(sp|s\.a|z\.o\.o|o\.o)$/.test(d) ||
      /\.(o|a|k|j)$/.test(d) ||
      !/[a-z]{2,}\.[a-z]{2,}/.test(d)
    )
      continue;
    if (/^(knf|gov)\./.test(d) || d.endsWith("gov.pl")) continue;
    out.add(d);
  }
  return [...out].slice(0, 20);
}

/** Przypisanie identyfikatorów do pozycji numerowanej listy nazw. */
function idOwners(idCell: string, namesCount: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (namesCount < 2) return out;
  const parts = idCell.split(/(?:^|\n)\s*(\d+)\.\s+/);
  for (let i = 1; i < parts.length; i += 2) {
    const idx = Number(parts[i]) - 1;
    if (idx < 0 || idx >= namesCount) continue;
    for (const m of (parts[i + 1] ?? "").matchAll(
      /\b(\d{14}|\d{10}|\d{9})\b|\b((?:\d[\s-]?){9}\d)\b/g,
    ))
      out[(m[1] ?? m[2]).replace(/\D/g, "")] = idx;
  }
  return out;
}

/** Wszystkie tabele z listy ostrzeżeń na stronie KNF. */
export function parseKnfWarnings(html: string): KnfWarningEntry[] {
  const entries: KnfWarningEntry[] = [];
  const sections = html.split(/<section[^>]*table-with-header-parent[^>]*>/i).slice(1);
  for (const section of sections) {
    const title =
      clean(section.match(/<div[^>]*title[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "") ||
      "Lista ostrzeżeń publicznych KNF";
    const tbody = section.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? "";
    for (const row of tbody.split(/<tr[^>]*>/i).slice(1)) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1]));
      if (cells.length < 3) continue;
      const [lp, nameCell, idCell, prosecutor = "", rulings = "", info = ""] = cells;
      const ids = idCell ?? "";
      entries.push({
        category: title.slice(0, 300),
        lp: lp.replace(/\.$/, ""),
        names: splitNames(nameCell),
        krs: [...ids.matchAll(/\bKRS[:\s]*(\d{10})\b/gi)].map((m) => m[1]),
        nips: [...ids.matchAll(/\bNIP[:\s]*((?:\d[\s-]?){9}\d)\b/gi)].map((m) =>
          m[1].replace(/\D/g, ""),
        ),
        regons: [...ids.matchAll(/\bREGON[:\s]*(\d{14}|\d{9})\b/gi)].map((m) => m[1]),
        domains: domainsIn(`${nameCell} ${info}`),
        idOwner: idOwners(ids, splitNames(nameCell).length),
        prosecutor: orNull(prosecutor),
        rulings: orNull(rulings),
        info: orNull(info),
      });
    }
  }
  return entries;
}

const PL: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[„”"'`«»]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LEGAL_TAIL =
  /\b(z siedziba\b.*|w likwidacji\b.*|w upadlosci\b.*|prowadzac\w*\b.*|spolka z ograniczona odpowiedzialnoscia|spolka akcyjna|spolka komandytowa|spolka komandytowo akcyjna|spolka jawna|spolka partnerska|sp z o o|sp zoo|s a|sp k|sp j|sp p|ltd|limited|llc|inc|gmbh|s r o|ou|as)\b/g;

/** Rdzeń nazwy firmy bez formy prawnej i siedziby. */
export function companyCore(name: string): string {
  return normalizeName(name).replace(LEGAL_TAIL, " ").replace(/\s+/g, " ").trim();
}

const wordsIn = (hay: string, needle: string) => ` ${hay} `.includes(` ${needle} `);

function nameMatches(entryName: string, s: KnfSubject): boolean {
  const n = normalizeName(entryName);
  if (s.kind === "person") {
    const first = normalizeName(s.firstName ?? s.name.split(/\s+/)[0] ?? "");
    const last = normalizeName(s.lastName ?? s.name.split(/\s+/).slice(1).join(" "));
    if (first.length < 2 || last.length < 2) return false;
    return wordsIn(n, `${first} ${last}`) || wordsIn(n, `${last} ${first}`);
  }
  const core = companyCore(s.name);
  const entryCore = companyCore(entryName);
  if (core.length < 4 || entryCore.length < 4) return false;
  return core === entryCore || (core.split(" ").length >= 2 && wordsIn(entryCore, core));
}

/** Dopasowanie podmiotu do listy KNF: identyfikator > domena > nazwa. */
export function matchKnfWarnings(entries: KnfWarningEntry[], s: KnfSubject): KnfWarningHit[] {
  const hits: KnfWarningHit[] = [];
  const krs = new Set(s.krs ?? []);
  const nips = new Set(s.nips ?? []);
  const regons = new Set((s.regons ?? []).map((r) => r.slice(0, 9)));
  const domains = new Set((s.domains ?? []).map((d) => d.toLowerCase().replace(/^www\./, "")));
  for (const e of entries) {
    const base = {
      category: e.category,
      lp: e.lp,
      prosecutor: e.prosecutor,
      info: e.info,
      rulings: e.rulings,
    };
    const idValue =
      e.krs.find((k) => krs.has(k)) ??
      e.nips.find((n) => nips.has(n)) ??
      e.regons.find((r) => regons.has(r.slice(0, 9))) ??
      null;
    if (idValue) {
      const label = e.krs.includes(idValue) ? "KRS" : e.nips.includes(idValue) ? "NIP" : "REGON";
      const owner = e.idOwner[idValue];
      hits.push({
        ...base,
        match: "identifier",
        matchedOn: `${label} ${idValue}`,
        entryName: (owner != null ? e.names[owner] : e.names.join("; ")).slice(0, 300),
      });
      continue;
    }
    const dom = e.domains.find((d) =>
      [...domains].some((x) => d === x || d.endsWith(`.${x}`) || x.endsWith(`.${d}`)),
    );
    if (dom) {
      hits.push({
        ...base,
        match: "domain",
        matchedOn: `domena ${dom}`,
        entryName: e.names.join("; ").slice(0, 300),
      });
      continue;
    }
    const byName = e.names.find((n) => nameMatches(n, s));
    if (byName)
      hits.push({ ...base, match: "name", matchedOn: "nazwa", entryName: byName.slice(0, 300) });
  }
  return hits.slice(0, 10);
}
