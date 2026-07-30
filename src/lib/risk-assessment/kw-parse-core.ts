// Czyste (bez zależności serwerowych) funkcje parsujące działy księgi wieczystej
// (HTML/tekst z kw_documents) na dane strukturalne. Wydzielone z
// kw-parser.server.ts, żeby ten sam parser dało się użyć w moście
// KwExtraction (kw-extraction.ts) i testować bez klienta Supabase.

import { parsePesel } from "./pesel";
import type { KwLegalAnalysis, KwPropertyParams } from "./types";

export function stripHtml(s: string | null | undefined): string {
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
    const raw = m[1]
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3})/g, "")
      .replace(",", ".");
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
  "wlasciciel",
  "wspolwlasciciel",
  "udzial",
  "prawo",
  "dzial",
  "ksiega",
  "wieczysta",
  "hipoteka",
  "wpis",
  "wzmianka",
  "numer",
  "data",
  "rodzaj",
  "tresc",
  "podstawa",
  "nieruchomosc",
  "lokal",
  "budynek",
  "dzialka",
  "wartosc",
  "kwota",
  "lista",
  "osoba",
  "fizyczna",
  "prawna",
  "imie",
  "imiona",
  "nazwisko",
  "pesel",
  "regon",
  "skarb",
  "panstwa",
  "gmina",
  "miasto",
  "wojewodztwo",
  "sad",
  "rejonowy",
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
  // Układ tabelaryczny EKW: etykieta w nawiasie, wartości po niej rozdzielone
  // przecinkami — "Osoba fizyczna (Imię pierwsze nazwisko, imię ojca, imię
  // matki, PESEL) ANATOLII SLAVINSKYI, PETRO, JEWDOKIJA, 73063017816".
  for (const m of text.matchAll(
    new RegExp(
      `[Oo]soba\\s+fizyczna\\s*\\([^)]{0,160}\\)\\s*(${TOKEN})\\s+(${TOKEN})\\s*,`,
      "gu",
    ),
  )) {
    push(m[1], m[2]);
  }
  // "Imię: JAN … Nazwisko: KOWALSKI"
  for (const m of text.matchAll(
    new RegExp(
      `imi[eę][^:]{0,20}:\\s*(${TOKEN})[\\s\\S]{0,60}?nazwisk[^:]{0,20}:\\s*(${TOKEN})`,
      "giu",
    ),
  )) {
    push(m[1], m[2]);
  }
  // "Nazwisko: KOWALSKI … Imię: JAN"
  for (const m of text.matchAll(
    new RegExp(
      `nazwisk[^:]{0,20}:\\s*(${TOKEN})[\\s\\S]{0,60}?imi[eę][^:]{0,20}:\\s*(${TOKEN})`,
      "giu",
    ),
  )) {
    push(m[2], m[1]);
  }
  // Układ EKW bez dwukropków: "Imię pierwsze JAN … Nazwisko / pierwszy człon
  // nazwiska złożonego SZPAK" — etykiety pisane normalnie, wartości WERSALIKAMI.
  const CAPS = "[A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻ-]+";
  for (const m of text.matchAll(
    new RegExp(
      `[Ii]mi[eę]\\s+pierwsze\\s+(${CAPS})[\\s\\S]{0,140}?[Nn]azwisko[^A-ZĄĆĘŁŃÓŚŹŻ]{0,80}(${CAPS})`,
      "gu",
    ),
  )) {
    push(m[1], m[2]);
  }
  if (out.length > 0) return out.slice(0, 6);

  // Fallback: "Jan Kowalski" (mieszana wielkość liter → kolejność imię-nazwisko)
  const personRe =
    /\b([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+)\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+)?)\b/gu;
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
  // Luka do 90 znaków: w układzie tabelarycznym EKW między etykietą „PESEL"
  // (w nawiasie) a numerem stoją wartości imion i nazwisk rodziców —
  // "…PESEL) ANATOLII SLAVINSKYI, PETRO, JEWDOKIJA, 73063017816". Przed
  // fałszywymi trafieniami chroni walidacja sumy kontrolnej PESEL.
  for (const m of text.matchAll(/pesel[^0-9]{0,90}?(\d{11})(?!\d)/gi)) {
    const pesel = m[1];
    if (seen.has(pesel) || !parsePesel(pesel).valid) continue;
    seen.add(pesel);
    // Imię i nazwisko stoją przed polem PESEL (układ etykietowany) albo między
    // etykietą „PESEL" a numerem (układ tabelaryczny „Osoba fizyczna (…)
    // JAN KOWALSKI, ojciec, matka, 8906…") — okno obejmuje oba przypadki,
    // kończąc się tuż przed cyframi numeru.
    const digitsIdx = (m.index ?? 0) + m[0].length - 11;
    const before = text.slice(Math.max(0, (m.index ?? 0) - 400), digitsIdx);
    const persons = extractKwOwnerPersons(before);
    const nearest = persons.length ? persons[persons.length - 1] : null;
    out.push({ pesel, ownerName: nearest ? `${nearest.firstName} ${nearest.lastName}` : null });
  }
  return out.slice(0, 6);
}

export function parseOwners(dzial2: string | null | undefined): string[] {
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
    const personRe =
      /\b([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+)?)\s+([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+)?)(?:\s+([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+))?\b/gu;
    while ((m = personRe.exec(text)) !== null) {
      const tokens = [m[1], m[2], m[3]].filter(Boolean) as string[];
      if (tokens.some((t) => NAME_STOPWORDS.has(norm(t)))) continue;
      const candidate = tokens.join(" ").trim();
      if (candidate.length >= 5 && candidate.length <= 60) owners.add(candidate);
    }
  }

  // 3) Osoby prawne / instytucje.
  const orgRe =
    /((?:Sp[óo]ł?ka|Sp\.\s*z\s*o\.o\.|S\.A\.|Bank|Gmina|Skarb Pa[ńn]stwa|Wsp[óo]lnota)[^.,;]{0,60})/gi;
  while ((m = orgRe.exec(text)) !== null) {
    const o = m[1].trim();
    if (o.length > 3) owners.add(o);
  }
  return [...owners].slice(0, 12);
}

const ENFORCEMENT_KEYWORDS = [
  "egzekucj",
  "komornik",
  "zajęci",
  "zajecie",
  "wszczęci",
  "wszczecie",
  "licytacj",
];
const USUFRUCT_KEYWORDS = [
  "służebno",
  "sluzebno",
  "dożywoci",
  "dozywoci",
  "użytkowani",
  "uzytkowani doz",
];
const CLAIM_KEYWORDS = [
  "roszczeni",
  "ostrzeżeni",
  "ostrzezeni",
  "zakaz zbywani",
  "prawo pierwokupu",
  "dzierżaw",
  "najem",
  "wpis warunkowy",
];

export function parseEncumbrances(dzial3: string | null | undefined): {
  encumbrances: string[];
  hasEnforcement: boolean;
  hasUsufruct: boolean;
} {
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
export function parseFloorInfo(dzial1o: string | null | undefined): {
  kondygnacja: number | null;
  floorsInBuilding: number | null;
} {
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

// Granica wartości pola działu I-O — lookahead na kolejną etykietę EKW lub koniec.
const IO_FIELD_BOUNDARY =
  "(?=\\s+(?:przeznaczenie|obszar|kondygnacj|liczba|numer|nr\\b|obr[eę]b|spos[óo]b|pole|powierzchni|imi[eę]|nazwisk|dzia[łl]|po[łl]o[żz]|umiejscowieni|informacj|wpis|ulica|budynk|lokal\\b|opis|odr[eę]bno|przy[łl][aą]czeni)|[.;]|$)";

// Parsuje liczbę w formacie PL („45,50" / „1 250,00" / „0,0450") na Number.
function parsePlNumber(raw: string): number | null {
  const n = Number(
    raw
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3}\b)/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Dział I-O (oznaczenie nieruchomości): parametry do wyceny — rodzaj, powierzchnia,
// obszar działki, liczba izb, sposób korzystania. Czytane z JSON-a KW Engine
// (renderowanego do tabel HTML działów), robustnie po etykietach.
export function parseKwPropertyParams(dzial1o: string | null | undefined): KwPropertyParams {
  const empty: KwPropertyParams = {
    kind: null,
    usableAreaM2: null,
    landAreaM2: null,
    landAreaHa: null,
    roomCount: null,
    landUse: null,
  };
  const text = stripHtml(dzial1o);
  if (!text) return empty;
  const low = text.toLowerCase();

  // Powierzchnia użytkowa lokalu. Etykieta EKW bywa długa, np. „Pole powierzchni
  // użytkowej lokalu wraz z powierzchnią pomieszczeń przynależnych 64,5100 M2" —
  // stąd luka do 80 znaków; bezpieczna, bo wartość musi kończyć się jednostką m².
  let usableAreaM2: number | null = null;
  const puM = low.match(
    /(?:pole\s+powierzchni\s+u[żz]ytkowej[^0-9]{0,80}|powierzchni[ai]\s+u[żz]ytkow\w*[^0-9]{0,80})(\d[\d\s.]*(?:,\d+)?)\s*m\s*(?:²|2)\b/,
  );
  if (puM) usableAreaM2 = parsePlNumber(puM[1]);

  // Obszar: „45,50 M2" (lokal/budynek) lub „0,0450 HA" (działka).
  let landAreaHa: number | null = null;
  let landAreaM2: number | null = null;
  // Luka do 40 znaków: pełna etykieta EKW to „Obszar całej nieruchomości".
  const obszarHa = low.match(/obszar[^0-9]{0,40}(\d[\d\s.]*(?:,\d+)?)\s*ha\b/);
  const obszarM2 = low.match(/obszar[^0-9]{0,40}(\d[\d\s.]*(?:,\d+)?)\s*m\s*(?:²|2)\b/);
  if (obszarHa) landAreaHa = parsePlNumber(obszarHa[1]);
  if (obszarM2) {
    const v = parsePlNumber(obszarM2[1]);
    if (v != null) {
      landAreaM2 = v;
      // Dla lokalu obszar w m² bywa jego powierzchnią użytkową.
      if (usableAreaM2 == null && /lokal/.test(low)) usableAreaM2 = v;
    }
  }
  if (landAreaHa != null && landAreaM2 == null) landAreaM2 = Math.round(landAreaHa * 10_000);

  // Liczba izb / pokoi. Fallback: „Opis lokalu (rodzaj izby - liczba)
  // POKÓJ - 3, KUCHNIA - 1, …" → liczba pokoi z pozycji POKÓJ.
  let roomCount: number | null = null;
  const izbM = low.match(/liczba\s+(?:izb|pokoi)[^0-9]{0,12}(\d{1,2})/);
  if (izbM) {
    const k = Number(izbM[1]);
    if (Number.isFinite(k) && k >= 1 && k <= 30) roomCount = k;
  }
  if (roomCount == null) {
    const pokojM = low.match(/pok[óo]j\w*\s*[-–—]\s*(\d{1,2})\b/);
    if (pokojM) {
      const k = Number(pokojM[1]);
      if (Number.isFinite(k) && k >= 1 && k <= 30) roomCount = k;
    }
  }

  // Rodzaj / przeznaczenie nieruchomości lub lokalu. Wartość wyłuskujemy leniwie
  // aż do kolejnej etykiety EKW (pola I-O bywają CAPS lub mieszane).
  let kind: string | null = null;
  const kindM = text.match(
    new RegExp(
      `(?:przeznaczenie|rodzaj)\\s+(?:lokalu|nieruchomo[śs]ci|budynku)\\s*(?:\\([^)]*\\))?[:\\s]{0,4}([\\s\\S]{2,60}?)${IO_FIELD_BOUNDARY}`,
      "i",
    ),
  );
  if (kindM) {
    const v = kindM[1]
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[.,;]+$/, "");
    if (v && !/^brak\b/i.test(v)) kind = v.toLowerCase();
  }

  // Sposób korzystania z gruntu (dla działek), np. „B - tereny mieszkaniowe".
  let landUse: string | null = null;
  const useM = text.match(
    new RegExp(
      `spos[óo]b\\s+korzystania\\s*(?:\\([^)]*\\))?[:\\s]{0,4}([\\s\\S]{1,60}?)${IO_FIELD_BOUNDARY}`,
      "i",
    ),
  );
  if (useM) {
    const v = useM[1]
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[.,;]+$/, "");
    if (v && !/^brak\b/i.test(v)) landUse = v;
  }

  return { kind, usableAreaM2, landAreaM2, landAreaHa, roomCount, landUse };
}

// Klasa bonitacyjna gruntu z działu I-O (np. „R IVa", „PsIII", „ŁIV").
export function parseSoilClass(dzial1o: string | null | undefined): string | null {
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
  const sumaM = block.match(
    /suma(?!\s*s[łl]ownie)(?:\s*\([^)]*\))?[^0-9]{0,30}(\d[\d\s.]*(?:,\d{1,2})?)/i,
  );
  if (sumaM) {
    const raw = sumaM[1]
      .trim()
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3})/g, "")
      .replace(",", ".");
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      const walutaM = block.match(
        /waluta(?:\s+sumy)?[^a-ząćęłńóśźż0-9]{0,10}(z[łl]|pln|eur|chf|usd)/i,
      );
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
    const nazwaM = rest.match(
      /nazwa(?:\s*\([^)]*\))?\s+([A-ZĄĆĘŁŃÓŚŹŻ][^;]{2,80}?)(?=\s+(?:siedziba|regon|kraj|lp\b|numer|tre[śs][ćc]|$))/i,
    );
    if (nazwaM) return nazwaM[1].trim();
    const orgM = rest.match(
      /((?:bank|sp[óo][łl]dzielcz\w+|kasa|fundusz|towarzystwo|sp[óo][łl]ka|s\.a\.|sp\.\s*z\s*o\.o\.|skarb pa[ńn]stwa)[^.,;]{0,60})/i,
    );
    if (orgM) return orgM[1].trim();
    const persons = extractKwOwnerPersons(rest.slice(0, 400));
    if (persons.length) return `${persons[0].firstName} ${persons[0].lastName}`;
  }
  return null;
}

// Boilerplate strony EKW wokół treści działu IV: nagłówek („TREŚĆ KSIĘGI … DZIAŁ
// IV - HIPOTEKA") zawiera słowo HIPOTEKA i numer własnej KW, a tabela „Komentarz
// do migracji" występuje też w księgach BEZ żadnego wpisu hipoteki (EKW nie
// drukuje wtedy „BRAK WPISÓW"). Bez odcięcia heurystyka fragmentów tworzyła
// fałszywą hipotekę z samego nagłówka.
function stripSectionFourChrome(text: string): string {
  return text
    .replace(/^[\s\S]{0,600}?DZIA[ŁL]\s+IV\s*[-–—]?\s*HIPOTEKA/i, " ")
    .replace(/\bPowr[óo]t\b\s*$/i, " ")
    .replace(
      /komentarz\s+do\s+migracji[\s\S]{0,400}?ostatni\s+numer\s+aktualnego\s+lub\s+wykre[śs]lonego\s+wpisu\s+w\s+danym\s+dziale\s+w\s+dotychczasowej\s+ksi[ęe]dze\s+wieczystej\s*\d*\s*(?:-{2,3})?/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMortgages(dzial4: string | null | undefined): KwLegalAnalysis["mortgages"] {
  const raw = stripHtml(dzial4);
  if (!raw) return [];
  const text = stripSectionFourChrome(raw);
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
    const splitter = /numer\s+hipoteki/i.test(text)
      ? /(?=[Nn]umer\s+hipoteki)/
      : /(?=[Rr]odzaj\s+hipoteki)/;
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
