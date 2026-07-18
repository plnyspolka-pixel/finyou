// Parser prawny księgi wieczystej — przekształca surowe działy (HTML/tekst)
// z kw_documents na ustrukturyzowaną ocenę stanu prawnego.
// Dział II = własność, Dział III = prawa/roszczenia/ograniczenia, Dział IV = hipoteki.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseKwAddress } from "@/lib/kw-address-core";
import { parsePesel } from "./pesel";
import type { KwLegalAnalysis } from "./types";

function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Wyciąga kwotę PLN z tekstu typu "1 234 567,89 zł" / "500000 PLN".
function extractAmountPln(text: string): { amount: number | null; currency: string | null } {
  // Najpierw preferuj kwoty z jednostką waluty.
  const m = text.match(/([\d][\d\s.]*,\d{2}|\d[\d\s]{2,})\s*(z[łl]|pln|eur|chf|usd)/i);
  if (m) {
    const raw = m[1].replace(/\s/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
    const n = Number(raw);
    const curRaw = m[2].toLowerCase();
    const currency = /z[łl]|pln/.test(curRaw) ? "PLN" : curRaw.toUpperCase();
    return { amount: Number.isFinite(n) && n > 0 ? Math.round(n) : null, currency };
  }
  return { amount: null, currency: null };
}

function splitEntries(text: string): string[] {
  // Rozbij dług tekst działu na sensowne fragmenty (wpisy).
  return text
    .split(/(?:\.\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])|;\s+|\n)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

// Słowa, które nie są imieniem/nazwiskiem — odsiewają fałszywe dopasowania.
const NAME_STOPWORDS = new Set([
  "wlasciciel", "wspolwlasciciel", "udzial", "prawo", "dzial", "ksiega", "wieczysta",
  "hipoteka", "wpis", "wzmianka", "numer", "data", "rodzaj", "tresc", "podstawa",
  "nieruchomosc", "lokal", "budynek", "dzialka", "wartosc", "kwota", "lista", "osoba",
  "fizyczna", "prawna", "imie", "imiona", "nazwisko", "pesel", "regon", "skarb", "panstwa",
  "gmina", "miasto", "wojewodztwo", "sad", "rejonowy",
]);

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
}

export type KwOwnerPerson = { firstName: string; lastName: string };

/**
 * Wyciąga z działu II osoby fizyczne z rozdzielonym imieniem i nazwiskiem —
 * do automatycznego podpisywania leada właścicielem nieruchomości.
 * Kolejność pól w EKW bywa różna ("Imię: … Nazwisko: …" i odwrotnie),
 * dlatego obsługujemy obie; fallbackiem są pary "Jan Kowalski" pisane
 * mieszaną wielkością liter (pary CAPS pomijamy — kolejność nieznana).
 */
export function extractKwOwnerPersons(dzial2: string | null | undefined): KwOwnerPerson[] {
  const text = stripHtml(dzial2);
  if (!text) return [];
  const out: KwOwnerPerson[] = [];
  const seen = new Set<string>();
  const push = (firstName: string, lastName: string) => {
    const f = firstName.trim();
    const l = lastName.trim();
    if (!f || !l) return;
    if (NAME_STOPWORDS.has(norm(f)) || NAME_STOPWORDS.has(norm(l))) return;
    const key = norm(`${f} ${l}`);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ firstName: f, lastName: l });
  };

  const TOKEN = "[A-ZĄĆĘŁŃÓŚŹŻ][\\p{L}-]+";
  // "Imię: JAN … Nazwisko: KOWALSKI"
  for (const m of text.matchAll(new RegExp(`imi[eę][^:]{0,20}:\\s*(${TOKEN})[\\s\\S]{0,60}?nazwisk[^:]{0,20}:\\s*(${TOKEN})`, "giu"))) {
    push(m[1], m[2]);
  }
  // "Nazwisko: KOWALSKI … Imię: JAN"
  for (const m of text.matchAll(new RegExp(`nazwisk[^:]{0,20}:\\s*(${TOKEN})[\\s\\S]{0,60}?imi[eę][^:]{0,20}:\\s*(${TOKEN})`, "giu"))) {
    push(m[2], m[1]);
  }
  // Układ EKW bez dwukropków: "Imię pierwsze JAN … Nazwisko / pierwszy człon
  // nazwiska złożonego SZPAK" — etykiety pisane normalnie, wartości WERSALIKAMI.
  const CAPS = "[A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻ-]+";
  for (const m of text.matchAll(
    new RegExp(`[Ii]mi[eę]\\s+pierwsze\\s+(${CAPS})[\\s\\S]{0,140}?[Nn]azwisko[^A-ZĄĆĘŁŃÓŚŹŻ]{0,80}(${CAPS})`, "gu"),
  )) {
    push(m[1], m[2]);
  }
  if (out.length > 0) return out.slice(0, 6);

  // Fallback: "Jan Kowalski" (mieszana wielkość liter → kolejność imię-nazwisko)
  const personRe = /\b([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+)\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+)?)\b/gu;
  let m: RegExpExecArray | null;
  while ((m = personRe.exec(text)) !== null) push(m[1], m[2]);
  return out.slice(0, 6);
}

export type KwOwnerPesel = { pesel: string; ownerName: string | null };

/**
 * Wyciąga z działu II KW numery PESEL właścicieli (pole „PESEL" w podrubryce
 * osoby fizycznej EKW) wraz z najbliższym poprzedzającym imieniem i nazwiskiem.
 * Zwraca wyłącznie numery przechodzące walidację (data + suma kontrolna) —
 * odsiewa przypadkowe ciągi 11 cyfr. UWAGA (RODO): wynik służy jedynie do
 * wyznaczenia wieku/płci właściciela i uzupełnienia rekordu klienta — nie
 * trafia do zapisywanego JSON-a oceny.
 */
export function extractKwOwnerPesels(dzial2: string | null | undefined): KwOwnerPesel[] {
  const text = stripHtml(dzial2);
  if (!text) return [];
  const out: KwOwnerPesel[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/pesel[^0-9]{0,30}(\d{11})/gi)) {
    const pesel = m[1];
    if (seen.has(pesel) || !parsePesel(pesel).valid) continue;
    seen.add(pesel);
    // W EKW pola imienia/nazwiska poprzedzają pole PESEL w tej samej podrubryce.
    const before = text.slice(Math.max(0, (m.index ?? 0) - 400), m.index ?? 0);
    const persons = extractKwOwnerPersons(before);
    const nearest = persons.length ? persons[persons.length - 1] : null;
    out.push({ pesel, ownerName: nearest ? `${nearest.firstName} ${nearest.lastName}` : null });
  }
  return out.slice(0, 6);
}

function parseOwners(dzial2: string | null | undefined): string[] {
  const text = stripHtml(dzial2);
  if (!text) return [];
  const owners = new Set<string>();

  // 0) Pary imię+nazwisko z układów etykietowanych (dwukropkowy i EKW bez dwukropków).
  for (const p of extractKwOwnerPersons(dzial2)) {
    owners.add(`${p.firstName} ${p.lastName}`);
  }

  // 1) Osoby fizyczne — heurystyka par wielkoliterowych TYLKO gdy układ
  //    etykietowany nic nie znalazł (inaczej dokłada śmieciowe „nazwiska"
  //    z treści wpisów i sztucznie mnoży liczbę właścicieli).
  let m: RegExpExecArray | null;
  if (owners.size === 0) {
    const personRe = /\b([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+)?)\s+([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+)?)(?:\s+([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+))?\b/gu;
    while ((m = personRe.exec(text)) !== null) {
      const tokens = [m[1], m[2], m[3]].filter(Boolean) as string[];
      if (tokens.some((t) => NAME_STOPWORDS.has(norm(t)))) continue;
      const candidate = tokens.join(" ").trim();
      if (candidate.length >= 5 && candidate.length <= 60) owners.add(candidate);
    }
  }

  // 3) Osoby prawne / instytucje.
  const orgRe = /((?:Sp[óo]ł?ka|Sp\.\s*z\s*o\.o\.|S\.A\.|Bank|Gmina|Skarb Pa[ńn]stwa|Wsp[óo]lnota)[^.,;]{0,60})/gi;
  while ((m = orgRe.exec(text)) !== null) {
    const o = m[1].trim();
    if (o.length > 3) owners.add(o);
  }
  return [...owners].slice(0, 12);
}

const ENFORCEMENT_KEYWORDS = ["egzekucj", "komornik", "zajęci", "zajecie", "wszczęci", "wszczecie", "licytacj"];
const USUFRUCT_KEYWORDS = ["służebno", "sluzebno", "dożywoci", "dozywoci", "użytkowani", "uzytkowani doz"];
const CLAIM_KEYWORDS = ["roszczeni", "ostrzeżeni", "ostrzezeni", "zakaz zbywani", "prawo pierwokupu", "dzierżaw", "najem", "wpis warunkowy"];

function parseEncumbrances(dzial3: string | null | undefined): { encumbrances: string[]; hasEnforcement: boolean; hasUsufruct: boolean } {
  const text = stripHtml(dzial3);
  const entries = splitEntries(text);
  const low = text.toLowerCase();
  const hasEnforcement = ENFORCEMENT_KEYWORDS.some((k) => low.includes(k));
  const hasUsufruct = USUFRUCT_KEYWORDS.some((k) => low.includes(k));
  const flagged = entries.filter((e) => {
    const el = e.toLowerCase();
    return (
      ENFORCEMENT_KEYWORDS.some((k) => el.includes(k)) ||
      USUFRUCT_KEYWORDS.some((k) => el.includes(k)) ||
      CLAIM_KEYWORDS.some((k) => el.includes(k))
    );
  });
  // Gdy dział niepusty, ale nic nie sflagowano — pokaż pierwsze wpisy jako ograniczenia.
  const encumbrances = (flagged.length ? flagged : entries).slice(0, 10);
  return { encumbrances, hasEnforcement, hasUsufruct };
}

// Dział I-O: kondygnacja lokalu + liczba kondygnacji budynku.
function parseFloorInfo(dzial1o: string | null | undefined): { kondygnacja: number | null; floorsInBuilding: number | null } {
  const text = stripHtml(dzial1o);
  if (!text) return { kondygnacja: null, floorsInBuilding: null };
  const low = text.toLowerCase();

  // Liczba kondygnacji budynku (jeśli podana) — wyłuskaj najpierw, by nie pomylić z kondygnacją lokalu.
  let floorsInBuilding: number | null = null;
  const liczbaM = low.match(/liczba\s+kondygnacj\w*[^0-9]{0,12}(\d{1,2})/);
  if (liczbaM) {
    const k = Number(liczbaM[1]);
    if (Number.isFinite(k) && k >= 1 && k <= 60) floorsInBuilding = k - 1; // kondygnacje → piętra nad parterem
  }

  // Kondygnacja lokalu (usuwamy frazę „liczba kondygnacji", by nie złapać jej wartości).
  const withoutLiczba = low.replace(/liczba\s+kondygnacj\w*[^0-9]{0,12}\d{1,2}/g, " ");
  let kondygnacja: number | null = null;
  const kondM =
    withoutLiczba.match(/kondygnacj\w*[^0-9]{0,12}(\d{1,2})/) ||
    withoutLiczba.match(/(\d{1,2})\s*kondygnacj/);
  if (kondM) {
    const k = Number(kondM[1]);
    if (Number.isFinite(k) && k >= 1 && k <= 60) kondygnacja = k;
  }
  return { kondygnacja, floorsInBuilding };
}

// Klasa bonitacyjna gruntu z działu I-O (np. „R IVa", „PsIII", „ŁIV").
function parseSoilClass(dzial1o: string | null | undefined): string | null {
  const text = stripHtml(dzial1o);
  if (!text) return null;
  const m = text.match(/\b(R|Ps|[ŁL]|Br|Lz|W|N)\s?(I{1,3}|IV|V|VI)(a|b)?\b/);
  if (!m) return null;
  return `${m[1]} ${m[2]}${m[3] ?? ""}`.replace(/\s+/g, " ").trim();
}

// Wpisy hipoteczne w EKW rozpoznajemy po polach rubryki 4.4 („Rodzaj hipoteki",
// „Numer hipoteki", „Wierzyciel hipoteczny") albo po nazwie rodzaju hipoteki.
const MORTGAGE_ENTRY_RE =
  /rodzaj\s+hipoteki|numer\s+hipoteki|wierzyciel\s+hipoteczn|hipotek[aię]\w*\s+(?:umown|przymusow|kaucyjn|[łl][aą]czn|morsk)/i;

// Kwota hipoteki: pole „Suma (kwota)" — bez „Suma słownie"; waluta bywa w osobnym
// polu „Waluta sumy", więc nie wymagamy jednostki tuż za liczbą.
function extractMortgageAmount(block: string): { amount: number | null; currency: string | null } {
  const direct = extractAmountPln(block);
  const sumaM = block.match(/suma(?!\s*s[łl]ownie)(?:\s*\([^)]*\))?[^0-9]{0,30}(\d[\d\s.]*(?:,\d{1,2})?)/i);
  if (sumaM) {
    const raw = sumaM[1].trim().replace(/\s/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      const walutaM = block.match(/waluta(?:\s+sumy)?[^a-ząćęłńóśźż0-9]{0,10}(z[łl]|pln|eur|chf|usd)/i);
      const cur = (walutaM?.[1] ?? direct.currency ?? "zł").toLowerCase();
      return { amount: Math.round(n), currency: /z[łl]|pln/.test(cur) ? "PLN" : cur.toUpperCase() };
    }
  }
  return direct;
}

function extractMortgageCreditor(block: string): string | null {
  // „na rzecz X" / „wierzyciel: X" (starsze układy).
  const inline = block.match(/(?:na rzecz|wierzyciel[a-z]*:)\s+([^.,;]{3,60})/i);
  if (inline) return inline[1].trim();
  // Układ EKW: sekcja „Wierzyciel hipoteczny" → osoba prawna z polem „Nazwa" albo instytucja.
  const wIdx = block.search(/wierzyciel/i);
  if (wIdx >= 0) {
    const rest = block.slice(wIdx);
    const nazwaM = rest.match(/nazwa(?:\s*\([^)]*\))?\s+([A-ZĄĆĘŁŃÓŚŹŻ][^;]{2,80}?)(?=\s+(?:siedziba|regon|kraj|lp\b|numer|tre[śs][ćc]|$))/i);
    if (nazwaM) return nazwaM[1].trim();
    const orgM = rest.match(/((?:bank|sp[óo][łl]dzielcz\w+|kasa|fundusz|towarzystwo|sp[óo][łl]ka|s\.a\.|sp\.\s*z\s*o\.o\.|skarb pa[ńn]stwa)[^.,;]{0,60})/i);
    if (orgM) return orgM[1].trim();
    const persons = extractKwOwnerPersons(rest.slice(0, 400));
    if (persons.length) return `${persons[0].firstName} ${persons[0].lastName}`;
  }
  return null;
}

export function parseMortgages(dzial4: string | null | undefined): KwLegalAnalysis["mortgages"] {
  const text = stripHtml(dzial4);
  if (!text) return [];

  const hasEntryMarkers = MORTGAGE_ENTRY_RE.test(text);
  // „brak wpisu" kończy analizę TYLKO, gdy dział naprawdę nie zawiera wpisu
  // hipoteki — fraza pojawia się też w podpolach (np. wzmianki) działu
  // z wpisaną hipoteką i wcześniej powodowała jej pominięcie.
  if (!hasEntryMarkers && /brak wpis/i.test(text)) return [];

  const out: KwLegalAnalysis["mortgages"] = [];
  if (hasEntryMarkers) {
    // Rozbij na bloki per hipoteka — każdy wpis EKW zaczyna się polem „Numer
    // hipoteki (roszczenia) N" (fallback: „Rodzaj hipoteki").
    const splitter = /numer\s+hipoteki/i.test(text) ? /(?=[Nn]umer\s+hipoteki)/ : /(?=[Rr]odzaj\s+hipoteki)/;
    let blocks = text.split(splitter).filter((b) => MORTGAGE_ENTRY_RE.test(b));
    if (blocks.length === 0) blocks = [text];
    for (const b of blocks.slice(0, 10)) {
      const { amount, currency } = extractMortgageAmount(b);
      out.push({
        text: b.trim().slice(0, 240),
        amount,
        currency,
        creditor: extractMortgageCreditor(b),
      });
    }
    return out;
  }

  // Starsze/nietypowe układy: heurystyka fragmentów z frazami hipotecznymi.
  const entries = splitEntries(text).filter((e) => /hipotek|wierzyteln|zabezpiecz|kwota/i.test(e));
  for (const e of entries.slice(0, 10)) {
    const { amount, currency } = extractMortgageAmount(e);
    const creditorM = e.match(/(?:na rzecz|wierzyciel[a-z]*:?)\s+([^.,;]{3,60})/i);
    out.push({
      text: e.slice(0, 240),
      amount,
      currency,
      creditor: creditorM ? creditorM[1].trim() : null,
    });
  }
  return out;
}

function computeLegalRiskScore(a: {
  hasMortgages: boolean;
  totalMortgage: number | null;
  hasEnforcement: boolean;
  hasUsufruct: boolean;
  encumbranceCount: number;
  hasCoOwners: boolean;
}): number {
  let score = 100;
  if (a.hasMortgages) score -= 25;
  if (a.hasEnforcement) score -= 35;
  if (a.hasUsufruct) score -= 20;
  if (a.hasCoOwners) score -= 10;
  score -= Math.min(15, a.encumbranceCount * 3);
  return Math.max(0, Math.min(100, score));
}

export async function analyzeKwLegal(args: {
  kwNumber: string | null;
  hasCoOwners?: boolean | null;
  hasMortgageFlag?: boolean | null;
}): Promise<KwLegalAnalysis> {
  const empty: KwLegalAnalysis = {
    available: false,
    kwNumber: args.kwNumber ?? null,
    address: null,
    owners: [],
    encumbrances: [],
    mortgages: [],
    totalMortgageAmountPln: null,
    hasEnforcement: false,
    hasUsufruct: false,
    kondygnacja: null,
    floorsInBuilding: null,
    soilClass: null,
    legalRiskScore: 60,
    warnings: [],
    summary: "Brak pobranej treści KW — stan prawny wymaga weryfikacji.",
  };
  if (args.hasMortgageFlag) {
    // Deklaracja z wniosku musi być widoczna nawet bez treści KW.
    empty.warnings.push("We wniosku zadeklarowano hipotekę — treść działu IV KW niedostępna, obciążenie wymaga weryfikacji.");
    empty.legalRiskScore = 45;
  }

  const kw = (args.kwNumber ?? "").replace(/\s|\//g, "").toUpperCase();
  if (!kw) return empty;

  const { data: row } = await supabaseAdmin
    .from("kw_documents")
    .select("kw_number, status, dzial_1o, dzial_2, dzial_3, dzial_4")
    .eq("kw_number", kw)
    .maybeSingle();

  if (!row || row.status !== "ready") return empty;

  const owners = parseOwners(row.dzial_2);
  const address = parseKwAddress(row.dzial_1o);
  const { encumbrances, hasEnforcement, hasUsufruct } = parseEncumbrances(row.dzial_3);
  const mortgages = parseMortgages(row.dzial_4);
  const { kondygnacja, floorsInBuilding } = parseFloorInfo(row.dzial_1o);
  const soilClass = parseSoilClass(row.dzial_1o);
  const totalMortgage = mortgages.reduce<number | null>((acc, m) => {
    if (m.amount == null) return acc;
    return (acc ?? 0) + m.amount;
  }, null);

  // Zadeklarowano hipotekę, a dział IV pusty/nieodczytany → ostrożnościowo
  // traktujemy nieruchomość jako obciążoną (dane wniosku vs. parser).
  const dzial4Text = stripHtml(row.dzial_4);
  const declaredMortgageUnconfirmed = !!args.hasMortgageFlag && mortgages.length === 0;

  const hasCoOwners = args.hasCoOwners ?? owners.length > 1;
  const legalRiskScore = computeLegalRiskScore({
    hasMortgages: mortgages.length > 0 || declaredMortgageUnconfirmed,
    totalMortgage,
    hasEnforcement,
    hasUsufruct,
    encumbranceCount: encumbrances.length,
    hasCoOwners: !!hasCoOwners,
  });

  const warnings: string[] = [];
  if (mortgages.length > 0)
    warnings.push(
      `Nieruchomość obciążona hipoteką${totalMortgage ? ` na ok. ${totalMortgage.toLocaleString("pl-PL")} PLN` : ""} (dział IV KW).`,
    );
  if (declaredMortgageUnconfirmed)
    warnings.push(
      dzial4Text
        ? "We wniosku zadeklarowano hipotekę, ale nie rozpoznano wpisów w dziale IV KW — zweryfikuj treść działu IV ręcznie."
        : "We wniosku zadeklarowano hipotekę, a dział IV KW jest pusty/nieodczytany — obciążenie przyjęto ostrożnościowo.",
    );
  if (hasEnforcement) warnings.push("W dziale III KW występują wpisy o egzekucji/zajęciu — bardzo wysokie ryzyko prawne.");
  if (hasUsufruct) warnings.push("W dziale III KW występuje służebność/dożywocie — ograniczenie zbywalności/wartości.");
  if (owners.length > 1) warnings.push(`Wielu właścicieli w dziale II KW (${owners.length}) — wymagana zgoda współwłaścicieli.`);

  const summary =
    `Dział II: ${owners.length ? owners.length + " podmiotów (" + owners.slice(0, 3).join(", ") + (owners.length > 3 ? "…" : "") + ")" : "brak rozpoznanych właścicieli"}. ` +
    `Dział III: ${encumbrances.length ? encumbrances.length + " wpisów" : "brak istotnych wpisów"}${hasEnforcement ? " (w tym egzekucja)" : ""}. ` +
    `Dział IV: ${mortgages.length ? mortgages.length + " hipotek" + (totalMortgage ? ", łącznie ~" + totalMortgage.toLocaleString("pl-PL") + " PLN" : "") : "brak hipotek"}.` +
    (address.fullAddress ? ` Adres (dz. I-O): ${address.fullAddress}.` : "");

  return {
    available: true,
    kwNumber: kw,
    address,
    owners,
    encumbrances,
    mortgages,
    totalMortgageAmountPln: totalMortgage,
    hasEnforcement,
    hasUsufruct,
    kondygnacja,
    floorsInBuilding,
    soilClass,
    legalRiskScore,
    warnings,
    summary: kondygnacja != null ? `${summary} Kondygnacja lokalu: ${kondygnacja} (${kondygnacja <= 1 ? "parter" : (kondygnacja - 1) + ". piętro"}).` : summary,
  };
}
