// Profil gospodarczy — czysta logika (parsowanie odpisów KRS, wykazu VAT,
// CEIDG, robots.txt i stron WWW oraz sygnały ostrzegawcze). Testowalna bez sieci.
import type {
  BusinessFlag,
  CeidgDetails,
  KrsCompanyProfile,
  KrsFinancialFiling,
  KrsHistorySummary,
  VatRegistryInfo,
  WebsiteDocumentLink,
} from "./business-profile.types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const str = (v: unknown): string | null => {
  const s = String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s : null;
};
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const nonEmpty = (v: unknown): boolean =>
  v != null &&
  (Array.isArray(v)
    ? v.length > 0
    : typeof v === "object"
      ? Object.keys(v as object).length > 0
      : String(v).trim() !== "");
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export const redactPesel = (s: string) => s.replace(/\b\d{11}\b/g, "[PESEL ukryty]");

/** „18.10.2018” → „2018-10-18”. */
export function plDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

const monthsBetween = (fromIso: string, toIso: string) =>
  (Date.parse(toIso) - Date.parse(fromIso)) / (30.44 * 864e5);

/** Ostatnia (aktualna) wartość z historii odpisu pełnego lub wartość z odpisu aktualnego. */
function current<T = any>(v: unknown): T | null {
  const list = arr(v);
  if (!list.length) return null;
  const live = list.filter((x) => x && typeof x === "object" && !x.nrWpisuWykr);
  return (live[live.length - 1] ?? list[list.length - 1]) as T;
}

/** Okres sprawozdawczy „OD 01.01.2024 DO 31.12.2024”. */
function parsePeriod(raw: unknown): KrsFinancialFiling | null {
  const s = String(raw ?? "");
  const m = s.match(/(\d{1,2}\.\d{1,2}\.\d{4})\D+(\d{1,2}\.\d{1,2}\.\d{4})/);
  if (!m) return null;
  const from = plDate(m[1]);
  const to = plDate(m[2]);
  return { filedOn: null, period: `${from} – ${to}`, periodEnd: to };
}

/**
 * Termin złożenia sprawozdania: zatwierdzenie do 6 mies. po dniu bilansowym
 * + 15 dni na złożenie. Daje ~6,5 mies.; zapas do 7,5 mies. na opóźnienia rejestru.
 */
export function overdueFilingNote(args: {
  lastPeriodEnd: string | null;
  firstFiscalYearEnd: string | null;
  registeredOn: string | null;
  today: string;
  inLiquidationOrDeleted?: boolean;
}): string | null {
  const { today } = args;
  const fiscalEnd = args.lastPeriodEnd ?? args.firstFiscalYearEnd;
  // Kolejny dzień bilansowy po ostatnim złożonym (lub pierwszy rok obrotowy).
  let expectedEnd: string | null;
  if (args.lastPeriodEnd) {
    const d = new Date(`${args.lastPeriodEnd}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    expectedEnd = d.toISOString().slice(0, 10);
  } else if (args.firstFiscalYearEnd) {
    expectedEnd = args.firstFiscalYearEnd;
  } else if (args.registeredOn) {
    expectedEnd = `${args.registeredOn.slice(0, 4)}-12-31`;
  } else return null;
  if (!fiscalEnd && !args.registeredOn) return null;
  const months = monthsBetween(expectedEnd, today);
  if (months <= 7.5) return null;
  const overdueYears = Math.floor((months - 7.5) / 12) + 1;
  return (
    `Brak w KRS wzmianki o sprawozdaniu za rok obrotowy kończący się ${expectedEnd}` +
    (overdueYears > 1 ? ` (i ${overdueYears - 1} kolejnych)` : "") +
    " — termin złożenia minął." +
    (args.inLiquidationOrDeleted ? " Podmiot w likwidacji / wykreślony." : "")
  );
}

function personName(p: any): string {
  const last = current(p?.nazwisko)?.nazwisko?.nazwiskoICzlon ?? p?.nazwisko?.nazwiskoICzlon;
  const first = current(p?.imiona)?.imiona?.imie ?? p?.imiona?.imie;
  const nazwa = current(p?.nazwa)?.nazwa ?? (typeof p?.nazwa === "string" ? p.nazwa : null);
  return str([first, last].filter(Boolean).join(" ")) ?? str(nazwa) ?? "—";
}

/** Data wpisu po numerze (z nagłówka odpisu pełnego). */
function entryDates(pelny: any): Map<string, string> {
  const map = new Map<string, string>();
  for (const w of arr(pelny?.odpis?.naglowekP?.wpis)) {
    const d = plDate(w?.dataWpisu);
    if (d) map.set(String(w?.numerWpisu), d);
  }
  return map;
}

function historyFromPelny(pelny: any, today: string): KrsHistorySummary | null {
  const dane = pelny?.odpis?.dane;
  if (!dane) return null;
  const dates = entryDates(pelny);
  const recent = (nr: unknown) => {
    const d = nr != null ? dates.get(String(nr)) : undefined;
    return Boolean(d && monthsBetween(d, today) <= 24);
  };
  const changesOf = (people: any[]) => {
    let n = 0;
    for (const p of people) {
      const marks = arr(p?.nazwisko).length ? arr(p.nazwisko) : arr(p?.nazwa);
      const first = marks[0];
      if (first && recent(first.nrWpisuWprow) && first.nrWpisuWprow !== "1") n += 1;
      const removed = marks.find((x: any) => x?.nrWpisuWykr);
      if (removed && recent(removed.nrWpisuWykr)) n += 1;
    }
    return n;
  };
  const organs = [
    ...arr(dane?.dzial2?.reprezentacja).flatMap((r: any) => arr(r?.sklad)),
    ...arr(dane?.dzial2?.prokurenci),
  ];
  const all = [...dates.values()].sort();
  return {
    entriesTotal: dates.size,
    entriesLast24m: all.filter((d) => monthsBetween(d, today) <= 24).length,
    lastEntryDate: all[all.length - 1] ?? null,
    nameChanges: Math.max(0, arr(dane?.dzial1?.danePodmiotu?.nazwa).length - 1),
    addressChanges: Math.max(0, arr(dane?.dzial1?.siedzibaIAdres?.adres).length - 1),
    capitalChanges: Math.max(0, arr(dane?.dzial1?.kapital?.wysokoscKapitaluZakladowego).length - 1),
    boardChangesLast24m: changesOf(organs),
    shareholderChangesLast24m: changesOf(arr(dane?.dzial1?.wspolnicySpzoo)),
  };
}

const DZIAL4_LABELS: Record<string, string> = {
  zaleglosci: "Zaległości z tytułu należności publicznoprawnych (US/ZUS)",
  wierzytelnosci: "Niezaspokojone wierzytelności (bezskuteczna egzekucja)",
  informacjaOOddaleniuWnioskuOOgloszenieUpadlosci:
    "Oddalenie wniosku o ogłoszenie upadłości (brak majątku)",
  informacjaOOddaleniuWniosku: "Oddalenie wniosku o ogłoszenie upadłości",
  informacjeOOddaleniuWnioskuOOgloszenieUpadlosci:
    "Oddalenie wniosku o ogłoszenie upadłości (brak majątku)",
};
const DZIAL6_LABELS: Record<string, string> = {
  likwidacja: "Likwidacja",
  rozwiazanieUniewaznienie: "Rozwiązanie / unieważnienie",
  postepowanieUpadlosciowe: "Postępowanie upadłościowe",
  upadlosc: "Upadłość",
  postepowanieUkladowe: "Postępowanie układowe",
  postepowanieRestrukturyzacyjne: "Postępowanie restrukturyzacyjne",
  postepowanieNaprawcze: "Postępowanie naprawcze",
  zarzadcaPrzymusowy: "Zarząd przymusowy",
  polaczeniePodzialPrzeksztalcenie: "Połączenie / podział / przekształcenie",
};
const humanize = (k: string) =>
  k.replace(/([a-ząćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

function firstText(v: unknown, depth = 0): string | null {
  if (depth > 4 || v == null) return null;
  if (typeof v === "string" || typeof v === "number") return str(v);
  for (const x of Array.isArray(v)
    ? v
    : Object.entries(v as object)
        .filter(([k]) => !/^nrWpisu/.test(k))
        .map(([, x]) => x)) {
    const t = firstText(x, depth + 1);
    if (t && t.length > 3) return t;
  }
  return null;
}

function sectionEntries(section: any, labels: Record<string, string>, onlyLive: boolean): string[] {
  const out: string[] = [];
  if (!section || typeof section !== "object") return out;
  for (const [key, value] of Object.entries(section)) {
    if (!nonEmpty(value)) continue;
    const items = arr(value).filter(
      (x: any) => !onlyLive || !(x && typeof x === "object" && x.nrWpisuWykr),
    );
    if (!items.length) continue;
    const text = firstText(items[items.length - 1]);
    out.push(
      `${labels[key] ?? humanize(key)}${items.length > 1 ? ` (${items.length} wpisy)` : ""}${text ? `: ${redactPesel(text).slice(0, 220)}` : ""}`,
    );
  }
  return out;
}

function representationRule(rep: unknown): string | null {
  const organ: any = Array.isArray(rep) ? rep[0] : rep;
  const rule = organ?.sposobReprezentacji;
  if (typeof rule === "string") return str(rule);
  const last: any = current(rule);
  return str(typeof last === "string" ? last : last?.sposobReprezentacji);
}

/** Profil spółki z odpisu aktualnego (+ opcjonalnie pełnego) API KRS. */
export function parseKrsCompanyProfile(
  aktualny: any,
  pelny: any | null,
  opts: { krs: string; today?: string; subjectRole?: string | null },
): KrsCompanyProfile | null {
  const odpis = aktualny?.odpis;
  if (!odpis?.dane) return null;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const dane = odpis.dane;
  const naglowek = odpis.naglowekA ?? odpis.naglowekP ?? {};
  const podmiot = dane?.dzial1?.danePodmiotu ?? {};
  const adresy = dane?.dzial1?.siedzibaIAdres ?? {};
  const kapital = dane?.dzial1?.kapital?.wysokoscKapitaluZakladowego;
  const przedmiot = dane?.dzial3?.przedmiotDzialalnosci ?? {};
  const main = arr(przedmiot?.przedmiotPrzewazajacejDzialalnosci)[0];
  const wzmianki = dane?.dzial3?.wzmiankiOZlozonychDokumentach ?? {};
  const filings = arr(wzmianki?.wzmiankaOZlozeniuRocznegoSprawozdaniaFinansowego)
    .map((w: any) => {
      const p = parsePeriod(w?.zaOkresOdDo);
      return p ? { ...p, filedOn: plDate(w?.dataZlozenia) } : null;
    })
    .filter((x): x is KrsFinancialFiling => Boolean(x))
    .sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd)));
  const lastFiledPeriodEnd = filings.length ? filings[filings.length - 1].periodEnd : null;
  const registeredOn = plDate(naglowek?.dataRejestracjiWKRS);
  const deleted = Boolean(
    str(naglowek?.dataWykreslenia) || str(naglowek?.dataDokonaniaWpisuWykreslenia),
  );
  const dzial6 = sectionEntries(dane?.dzial6, DZIAL6_LABELS, true);
  const firstFiscalYearEnd = plDate(
    dane?.dzial3?.informacjaODniuKonczacymRokObrotowy?.dzienKonczacyPierwszyRokObrotowy,
  );
  const needsFiling =
    !/sp[oó][łl]ka\s+cywilna|jawna|partnersk/i.test(String(podmiot?.formaPrawna ?? "")) ||
    filings.length > 0;
  const seat = adresy?.siedziba;
  const cap = kapital;
  return {
    krs: opts.krs,
    name: str(podmiot?.nazwa) ?? `KRS ${opts.krs}`,
    legalForm: str(podmiot?.formaPrawna),
    nip: digits(podmiot?.identyfikatory?.nip) || null,
    regon: digits(podmiot?.identyfikatory?.regon) || null,
    registeredOn,
    seat: str(
      [
        seat?.miejscowosc,
        seat?.wojewodztwo ? `woj. ${String(seat.wojewodztwo).toLowerCase()}` : null,
      ]
        .filter(Boolean)
        .join(", "),
    ),
    website: str(adresy?.adresStronyInternetowej),
    email: str(adresy?.adresPocztyElektronicznej),
    capital: cap?.wartosc ? `${cap.wartosc} ${cap.waluta ?? "PLN"}` : null,
    mainPkd: main
      ? `${main.kodDzial}.${main.kodKlasa}.${main.kodPodklasa} ${String(main.opis ?? "").toLowerCase()}`.trim()
      : null,
    pkdCount:
      arr(przedmiot?.przedmiotPrzewazajacejDzialalnosci).length +
      arr(przedmiot?.przedmiotPozostalejDzialalnosci).length,
    representationRule: representationRule(dane?.dzial2?.reprezentacja),
    shareholders: arr(dane?.dzial1?.wspolnicySpzoo)
      .slice(0, 8)
      .map((w: any) => ({ name: personName(w), shares: str(w?.posiadaneUdzialy) })),
    filings: filings.slice(-6),
    lastFiledPeriodEnd,
    overdueFiling: needsFiling
      ? overdueFilingNote({
          lastPeriodEnd: lastFiledPeriodEnd,
          firstFiscalYearEnd,
          registeredOn,
          today,
          inLiquidationOrDeleted: deleted || dzial6.length > 0,
        })
      : null,
    dzial4: sectionEntries(dane?.dzial4, DZIAL4_LABELS, true),
    dzial6,
    deleted,
    history: pelny ? historyFromPelny(pelny, today) : null,
    subjectRole: opts.subjectRole ?? null,
    beneficiaries: [],
    crbrNote: null,
  };
}

const parseCapital = (c: string | null) =>
  Number(
    String(c ?? "")
      .replace(/[^\d,]/g, "")
      .replace(",", "."),
  ) || null;

export function companyFlags(
  p: KrsCompanyProfile,
  today = new Date().toISOString().slice(0, 10),
): BusinessFlag[] {
  const f: BusinessFlag[] = [];
  const who = `${p.name} (KRS ${p.krs})`;
  if (p.deleted)
    f.push({ level: "warning", source: "KRS", text: `${who}: podmiot wykreślony z KRS.` });
  // Połączenie / przekształcenie to zwykła zmiana struktury, nie sygnał niewypłacalności.
  for (const d of p.dzial6)
    f.push({
      level: /^Połączenie/.test(d) ? "info" : "alert",
      source: "KRS dział 6",
      text: `${who}: ${d}`,
    });
  for (const d of p.dzial4) f.push({ level: "alert", source: "KRS dział 4", text: `${who}: ${d}` });
  if (p.overdueFiling)
    f.push({ level: "warning", source: "KRS dział 3", text: `${who}: ${p.overdueFiling}` });
  const age = p.registeredOn ? monthsBetween(p.registeredOn, today) : null;
  const capital = parseCapital(p.capital);
  if (age != null && age < 12)
    f.push({
      level: "warning",
      source: "KRS",
      text: `${who}: spółka zarejestrowana ${p.registeredOn} (< 12 mies.)${capital && capital <= 5000 ? `, kapitał minimalny ${p.capital}` : ""}.`,
    });
  const h = p.history;
  // Rotacja w organach jest sygnałem głównie dla małych / młodych spółek.
  const small = (capital ?? 0) < 1_000_000 || (age != null && age < 60);
  if (h && h.boardChangesLast24m >= 3)
    f.push({
      level: small ? "warning" : "info",
      source: "KRS odpis pełny",
      text: `${who}: ${h.boardChangesLast24m} zmian w organach w ostatnich 24 mies.`,
    });
  if (h && h.shareholderChangesLast24m >= 2)
    f.push({
      level: "warning",
      source: "KRS odpis pełny",
      text: `${who}: ${h.shareholderChangesLast24m} zmian wspólników w ostatnich 24 mies.`,
    });
  if (h && h.addressChanges >= 3)
    f.push({
      level: "info",
      source: "KRS odpis pełny",
      text: `${who}: ${h.addressChanges} zmian adresu w historii.`,
    });
  return f;
}

/** Wykaz podatników VAT — pełny podmiot z odpowiedzi wl-api. */
export function parseVatSubject(subject: any): VatRegistryInfo | null {
  if (!subject?.name) return null;
  const people = (list: unknown) =>
    arr(list)
      .map(
        (p: any) =>
          str(p?.companyName) ?? str([p?.firstName, p?.lastName].filter(Boolean).join(" ")),
      )
      .filter((x): x is string => Boolean(x))
      .slice(0, 10);
  return {
    name: String(subject.name),
    nip: digits(subject.nip),
    regon: str(subject.regon),
    krs: str(subject.krs),
    statusVat: str(subject.statusVat),
    registeredOn: str(subject.registrationLegalDate),
    removedOn: str(subject.removalDate),
    removalBasis: str(subject.removalBasis),
    restoredOn: str(subject.restorationDate),
    restorationBasis: str(subject.restorationBasis),
    deniedOn: str(subject.registrationDenialDate),
    denialBasis: str(subject.registrationDenialBasis),
    bankAccounts: arr(subject.accountNumbers).length,
    hasVirtualAccounts: Boolean(subject.hasVirtualAccounts),
    representatives: people(subject.representatives),
    authorizedClerks: people(subject.authorizedClerks),
    partners: people(subject.partners),
  };
}

export function vatFlags(v: VatRegistryInfo): BusinessFlag[] {
  const f: BusinessFlag[] = [];
  const who = `${v.name} (NIP ${v.nip})`;
  if (v.removedOn)
    f.push({
      level: /brak\s+kontakt|nie\s+istnieje|fikcyj|nierzetel|art\.?\s*96\s*ust\.?\s*9/i.test(
        v.removalBasis ?? "",
      )
        ? "alert"
        : "warning",
      source: "Wykaz VAT",
      text: `${who}: wykreślony z rejestru VAT ${v.removedOn}${v.removalBasis ? ` — podstawa: ${v.removalBasis}` : ""}.`,
    });
  if (v.deniedOn)
    f.push({
      level: "alert",
      source: "Wykaz VAT",
      text: `${who}: odmowa rejestracji VAT ${v.deniedOn}${v.denialBasis ? ` — ${v.denialBasis}` : ""}.`,
    });
  if (v.restoredOn)
    f.push({
      level: "info",
      source: "Wykaz VAT",
      text: `${who}: przywrócony do rejestru VAT ${v.restoredOn}.`,
    });
  if (v.statusVat && /czynny/i.test(v.statusVat) && v.bankAccounts === 0)
    f.push({
      level: "info",
      source: "Wykaz VAT",
      text: `${who}: czynny podatnik VAT bez zgłoszonego rachunku bankowego.`,
    });
  return f;
}

/** Szczegóły CEIDG v3 (/firma) — parsowanie odporne na warianty pól. */
export function parseCeidgDetails(f: any): CeidgDetails | null {
  if (!f || typeof f !== "object") return null;
  const owner = f.wlasciciel ?? {};
  const pkdList = arr(f.pkd)
    .map((p: any) =>
      typeof p === "string" ? p : str([p?.kod, p?.nazwa].filter(Boolean).join(" ")),
    )
    .filter((x): x is string => Boolean(x));
  const main = f.pkdGlowny;
  const wm = f.wspolnoscMajatkowa ?? f.czyWspolnoscMajatkowa ?? f.wspolnoscMajatkowaMalzenska;
  return {
    name: str(f.nazwa),
    nip: digits(owner.nip ?? f.nip) || null,
    regon: digits(owner.regon ?? f.regon) || null,
    status: str(f.status),
    startDate: str(f.dataRozpoczecia ?? f.dataRozpoczeciaDzialalnosci),
    suspendedOn: str(f.dataZawieszenia),
    resumedOn: str(f.dataWznowienia),
    endedOn: str(f.dataZakonczenia),
    deletedOn: str(f.dataWykreslenia),
    mainPkd:
      typeof main === "string" ? main : str([main?.kod, main?.nazwa].filter(Boolean).join(" ")),
    pkd: pkdList.slice(0, 20),
    maritalCommunity: wm == null ? null : typeof wm === "boolean" ? (wm ? "tak" : "nie") : str(wm),
    businessCity: str(f.adresDzialalnosci?.miasto ?? f.adresDzialalnosci?.miejscowosc),
    correspondenceCity: str(
      f.adresKorespondencyjny?.miasto ?? f.adresKorespondencyjny?.miejscowosc,
    ),
    hasEDeliveryAddress: Boolean(str(f.adresDoreczenElektronicznych)),
    website: str(f.www),
    civilPartnershipNips: arr(f.spolki)
      .map((s: any) => digits(s?.nip))
      .filter((n) => n.length === 10),
  };
}

export function ceidgFlags(
  c: CeidgDetails,
  today = new Date().toISOString().slice(0, 10),
): BusinessFlag[] {
  const f: BusinessFlag[] = [];
  const who = `${c.name ?? "Działalność"}${c.nip ? ` (NIP ${c.nip})` : ""}`;
  if (c.deletedOn || c.endedOn)
    f.push({
      level: "warning",
      source: "CEIDG",
      text: `${who}: działalność zakończona${c.endedOn ? ` ${c.endedOn}` : ""}${c.deletedOn ? `, wykreślona ${c.deletedOn}` : ""}.`,
    });
  if (c.suspendedOn && (!c.resumedOn || c.resumedOn < c.suspendedOn))
    f.push({
      level: "warning",
      source: "CEIDG",
      text: `${who}: działalność zawieszona od ${c.suspendedOn}.`,
    });
  else if (c.suspendedOn)
    f.push({
      level: "info",
      source: "CEIDG",
      text: `${who}: działalność była zawieszona (${c.suspendedOn} – ${c.resumedOn}).`,
    });
  if (c.startDate && monthsBetween(c.startDate, today) < 12)
    f.push({
      level: "warning",
      source: "CEIDG",
      text: `${who}: działalność od ${c.startDate} (< 12 mies.).`,
    });
  if (c.maritalCommunity && /^(tak|true|posiada)/i.test(c.maritalCommunity))
    f.push({
      level: "info",
      source: "CEIDG",
      text: `${who}: pozostaje we wspólności majątkowej małżeńskiej — przy zabezpieczeniu sprawdź zgodę małżonka.`,
    });
  return f;
}

/* ---------- robots.txt i strona WWW ---------- */

export const WEBSITE_USER_AGENT = "FinanceYou-KYC/1.0 (+https://financeyou.pl)";

/** Czy robots.txt pozwala pobrać ścieżkę naszemu klientowi (grupa „*” lub „FinanceYou-KYC”). */
export function robotsAllows(
  robotsTxt: string | null,
  path: string,
  agent = "financeyou-kyc",
): boolean {
  if (!robotsTxt) return true;
  type Group = { agents: string[]; rules: Array<{ allow: boolean; path: string }> };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (cur && (key === "allow" || key === "disallow")) {
      cur.rules.push({ allow: key === "allow", path: val });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of chosen)
    for (const r of g.rules) {
      if (!r.path) continue; // „Disallow:” bez ścieżki = wszystko dozwolone
      const pattern = new RegExp(
        "^" +
          r.path
            .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*")
            .replace(/\\\$$/, "$"),
      );
      if (
        pattern.test(path) &&
        (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))
      )
        best = { allow: r.allow, len: r.path.length };
    }
  return best ? best.allow : true;
}

export function htmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? (str(m[1].replace(/<[^>]+>/g, ""))?.slice(0, 160) ?? null) : null;
}

export function htmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

/** NIP-y i KRS podane w tekście strony. */
export function identifiersInText(text: string): { nips: string[]; krs: string[] } {
  const nips = new Set<string>();
  const krs = new Set<string>();
  for (const m of text.matchAll(/\bNIP\s*(?:PL)?[:.\s]*((?:\d[\s-]?){9}\d)\b/gi))
    nips.add(digits(m[1]));
  for (const m of text.matchAll(/\bKRS\s*(?:nr|numer)?[:.\s]*(\d{10})\b/gi)) krs.add(m[1]);
  return { nips: [...nips].slice(0, 5), krs: [...krs].slice(0, 5) };
}

const DOC_TEXT =
  /sprawozdani|bilans|rachunek\s+zysk|raport\s+(roczny|okresowy|finansow)|wyniki\s+finansow|annual\s+report|financial\s+statement/i;
const PAGE_HINT =
  /sprawozd|finans|raport|relacj|inwestor|investor|bilans|o-nas|o-firmie|about|kontakt|contact|dane-firmy|impressum|nota-prawna|regulamin/i;

export interface PageLinks {
  documents: WebsiteDocumentLink[];
  pages: string[];
}

/** Linki z HTML: dokumenty finansowe i podstrony warte sprawdzenia (ta sama domena). */
export function extractLinks(html: string, baseUrl: string): PageLinks {
  const base = new URL(baseUrl);
  const documents: WebsiteDocumentLink[] = [];
  const pages: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try {
      url = new URL(m[1], base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    const label = str(m[2].replace(/<[^>]+>/g, " ")) ?? url.pathname;
    const isDoc = /\.(pdf|xml|xhtml|zip)$/i.test(url.pathname);
    if (
      (isDoc && (DOC_TEXT.test(label) || DOC_TEXT.test(url.pathname))) ||
      (DOC_TEXT.test(label) && isDoc)
    ) {
      if (!documents.some((d) => d.url === url.href))
        documents.push({ label: label.slice(0, 120), url: url.href });
    } else if (
      url.hostname === base.hostname &&
      !isDoc &&
      (PAGE_HINT.test(url.pathname) || PAGE_HINT.test(label))
    ) {
      const clean = url.origin + url.pathname;
      if (clean !== base.origin + base.pathname && !pages.includes(clean)) pages.push(clean);
    }
  }
  return { documents: documents.slice(0, 10), pages: pages.slice(0, 60) };
}

/** Kolejność podstron: najpierw finanse/relacje inwestorskie, potem kontakt/o nas. */
export function rankPages(pages: string[]): string[] {
  const score = (u: string) => {
    const path = (() => {
      try {
        return new URL(u).pathname;
      } catch {
        return u;
      }
    })();
    if (
      /sprawozd|wyniki-finans|raporty-(roczne|okresowe|biezace)|raporty-gieldowe|financial/i.test(
        path,
      )
    )
      return 0;
    if (/relacj|inwestor|investor|bilans|finans/i.test(path)) return 1;
    if (/kontakt|contact|dane-firmy|impressum|nota/i.test(path)) return 2;
    return 3;
  };
  const depth = (u: string) => u.split("/").length;
  return [...new Set(pages)].sort((a, b) => score(a) - score(b) || depth(a) - depth(b));
}

export function normalizeWebsite(raw: string | null | undefined): string | null {
  const s = String(raw ?? "")
    .trim()
    .replace(/\s+/g, "");
  if (!s || /@/.test(s)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!/\./.test(u.hostname) || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(u.hostname)) return null;
    return `${u.protocol}//${u.hostname}${u.pathname === "/" ? "/" : u.pathname}`;
  } catch {
    return null;
  }
}
