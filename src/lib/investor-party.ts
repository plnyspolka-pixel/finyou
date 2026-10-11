// ════════════════════════════════════════════════════════════════════
// INWESTOR JAKO STRONA (wierzyciel / pożyczkodawca) — czyste funkcje.
//
// Pisma windykacyjne, SMS-y, e-maile, raport dowodowy i autouzupełnianie
// wzorów DOCX wystawiamy w imieniu inwestora — właściciela sprawy — na
// podstawie jego profilu (public.investors). Ten moduł zamienia wiersz
// profilu na oznaczenie strony: nazwę, komparycję, nagłówek, podpis
// i listę braków. Bez dostępu do bazy — działa po stronie serwera
// i w przeglądarce.
//
// Rodzaj podmiotu rozstrzyga `entity_variant` (zapisywane przez pipeline
// i profil). `entity_type` ma w bazie DEFAULT 'osoba_fizyczna', więc
// spółka założona w pipeline może mieć tam „osobę fizyczną" — nie ufamy mu.
// ════════════════════════════════════════════════════════════════════

import { COMPANY_DATA } from "@/lib/company";
import { jestKobieta, odmienBiernik } from "@/lib/contract-engine/facts";
import {
  companyValueForField,
  isFinanceYouAccountField,
  type CompanyBundle,
  type DocField,
} from "@/lib/document-fields";

export type CreditorKind = "osoba_fizyczna" | "jdg" | "spolka";
/** Skąd dane strony: profil inwestora albo Finance You (sprawy personelu). */
export type CreditorSource = "investor" | "finance_you";
/** Pismo do dłużnika albo wniosek / zawiadomienie do sądu, komornika, policji. */
export type CreditorPurpose = "pismo" | "wniosek";
export type EntityVariant = "osoba_fizyczna" | "jdg" | "osoba_prawna";

/** Kolumny public.investors potrzebne do oznaczenia strony. */
export interface InvestorPartyRow {
  entity_variant?: string | null;
  entity_type?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  pesel?: string | null;
  nip?: string | null;
  krs?: string | null;
  regon?: string | null;
  legal_form?: string | null;
  street?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
  bank_account?: string | null;
  representative_first_name?: string | null;
  representative_last_name?: string | null;
  representative_role?: string | null;
}

/** Wierzyciel jako strona pisma (same napisy — bezpieczne do serializacji). */
export interface CreditorParty {
  kind: CreditorKind;
  source: CreditorSource;
  /** Pełna nazwa: firma (JDG, spółka) albo imię i nazwisko. */
  legalName: string;
  /** Krótka nazwa — podpis SMS-a, nadawca e-maila, telefon AI. */
  shortName: string;
  /** Imię i nazwisko osoby fizycznej / właściciela JDG ("" gdy brak). */
  personName: string;
  /** Jednozdaniowe oznaczenie strony (komparycja) — do pism do dłużnika. */
  description: string;
  /** Nagłówek pisma: nazwa, adres, identyfikatory. */
  headerLines: string[];
  /** Blok podpisu (linie rozdzielone \n). */
  signature: string;
  /** Ulica i numer. */
  address: string;
  postalCode: string;
  city: string;
  /** „ul. …, 00-000 Miasto". */
  addressFull: string;
  pesel: string | null;
  nip: string | null;
  regon: string | null;
  krs: string | null;
  legalForm: string | null;
  /** Reprezentant spółki (imię i nazwisko). */
  representative: string | null;
  representativeRole: string | null;
  email: string | null;
  phone: string | null;
  bankAccount: string | null;
}

/** Dane wierzyciela sprawy dla karty sprawy i raportu (getWindCase). */
export interface WindCreditorView {
  party: CreditorParty | null;
  /** Braki w profilu: dla pism do dłużnika i dla wniosków / zawiadomień. */
  missing: { pismo: string[]; wniosek: string[] };
  /** Pożyczkodawca z umowy (wind_loans.pozyczkodawca) ≠ wierzyciel z profilu. */
  conflictWithContract: boolean;
  /** Powód, dla którego nie da się ustalić wierzyciela. */
  error: string | null;
  /** Rodzaj błędu: brak profilu inwestora albo chwilowy błąd odczytu. */
  errorKind: "no_profile" | "read_failed" | null;
}

/** Ścieżka zakładki z danymi inwestora. */
export const INVESTOR_PROFILE_PATH = "/inwestor/profil";

const clean = (v?: string | null) => (v ?? "").replace(/\s+/g, " ").trim();
const orNull = (v?: string | null) => clean(v) || null;
const joinSp = (...parts: Array<string | null | undefined>) =>
  parts.map(clean).filter(Boolean).join(" ");

const LEGAL_FORM_IN_NAME =
  /\b(sp\.|spółka|s\.\s?a\.|s\.k\.a\.|p\.s\.a\.|spółdzielnia|fundacja|stowarzyszenie)/i;
/** Forma prawna JDG (także opis z GUS: „osoba fizyczna prowadząca działalność"). */
const JDG_FORM = /jednoosobow|osob[ay] fizyczn|działalnoś/i;
/** Forma prawna spółki / osoby prawnej. */
const COMPANY_FORM = /spółk|s\.\s?a\.|spółdzielni|fundacj|stowarzysz|osoba prawna/i;

/**
 * Wariant podmiotu z wiersza profilu: entity_variant, a gdy go brak — z danych
 * firmy. Starsze profile zapisywały tylko entity_type='firma' (KRS był
 * opcjonalny), więc spółkę rozpoznajemy też po formie prawnej, nazwie
 * i reprezentancie; JDG to firma bez żadnego z tych sygnałów.
 */
export function investorEntityVariant(row: InvestorPartyRow | null | undefined): EntityVariant {
  const v = clean(row?.entity_variant);
  if (v === "osoba_fizyczna" || v === "jdg" || v === "osoba_prawna") return v;
  const company = clean(row?.company_name);
  // 'firma' zapisuje tylko profil (świadomy wybór); 'osoba_fizyczna' to też DEFAULT kolumny.
  if (!company && clean(row?.entity_type) !== "firma") return "osoba_fizyczna";
  if (clean(row?.krs)) return "osoba_prawna";
  const form = clean(row?.legal_form);
  if (form && JDG_FORM.test(form)) return "jdg";
  if (COMPANY_FORM.test(form) || LEGAL_FORM_IN_NAME.test(company)) return "osoba_prawna";
  if (clean(row?.representative_first_name) || clean(row?.representative_last_name))
    return "osoba_prawna";
  return "jdg";
}

/** Rodzaj wierzyciela (spółka = osoba prawna z profilu). */
export function investorKind(row: InvestorPartyRow | null | undefined): CreditorKind {
  const v = investorEntityVariant(row);
  return v === "osoba_prawna" ? "spolka" : v;
}

// Miejscownik największych miast — „z siedzibą w Warszawie"; pozostałe
// miejscowości: „z siedzibą w miejscowości X" (bez ryzyka złej odmiany).
const MIEJSCOWNIK: Record<string, string> = {
  warszawa: "Warszawie",
  kraków: "Krakowie",
  łódź: "Łodzi",
  wrocław: "Wrocławiu",
  poznań: "Poznaniu",
  gdańsk: "Gdańsku",
  szczecin: "Szczecinie",
  bydgoszcz: "Bydgoszczy",
  lublin: "Lublinie",
  białystok: "Białymstoku",
  katowice: "Katowicach",
  gdynia: "Gdyni",
  sopot: "Sopocie",
  częstochowa: "Częstochowie",
  radom: "Radomiu",
  rzeszów: "Rzeszowie",
  toruń: "Toruniu",
  kielce: "Kielcach",
  gliwice: "Gliwicach",
  olsztyn: "Olsztynie",
  opole: "Opolu",
  "zielona góra": "Zielonej Górze",
  "bielsko-biała": "Bielsku-Białej",
};

function zSiedziba(city: string): string {
  const loc = MIEJSCOWNIK[city.toLowerCase()];
  return loc ? `z siedzibą w ${loc}` : `z siedzibą w miejscowości ${city}`;
}

/** Forma prawna dopisywana do nazwy spółki, gdy nazwa jej nie zawiera. */
function nameWithForm(name: string, legalForm: string | null): string {
  if (!legalForm || LEGAL_FORM_IN_NAME.test(name)) return name;
  if (name.toLowerCase().includes(legalForm.toLowerCase())) return name;
  return `${name} (${legalForm})`;
}

/** Krótsza nazwa spółki: pełne formy prawne → skróty („sp. z o.o.", „S.A."). */
function shortenLegalForms(name: string): string {
  return name
    .replace(/spółka z ograniczoną odpowiedzialnością/gi, "sp. z o.o.")
    .replace(/spółka komandytowo-akcyjna/gi, "S.K.A.")
    .replace(/prosta spółka akcyjna/gi, "P.S.A.")
    .replace(/spółka akcyjna/gi, "S.A.")
    .replace(/spółka komandytowa/gi, "sp.k.")
    .replace(/spółka jawna/gi, "sp.j.");
}

/** Funkcja reprezentanta do podpisu — tylko krótka (KRS daje czasem cały „sposób reprezentacji"). */
function shortRole(role: string | null): string | null {
  return role && role.length <= 60 ? role : null;
}

interface PartyParts {
  kind: CreditorKind;
  source: CreditorSource;
  companyName: string;
  personName: string;
  pesel: string | null;
  nip: string | null;
  regon: string | null;
  krs: string | null;
  legalForm: string | null;
  representative: string | null;
  representativeRole: string | null;
  address: string;
  postalCode: string;
  city: string;
  email: string | null;
  phone: string | null;
  bankAccount: string | null;
}

function composeParty(p: PartyParts): CreditorParty {
  const cityLine = joinSp(p.postalCode, p.city);
  // Starsze profile trzymały cały adres w jednym polu (z kodem pocztowym).
  const addressFull =
    p.address && /\d{2}-\d{3}/.test(p.address)
      ? p.address
      : [p.address, cityLine].filter(Boolean).join(", ");

  const legalName =
    p.kind === "osoba_fizyczna"
      ? p.personName
      : p.kind === "jdg"
        ? p.companyName || p.personName
        : p.companyName;
  const shortName = p.kind === "spolka" ? shortenLegalForms(legalName) : legalName;
  const role = shortRole(p.representativeRole);
  const ids = (...pairs: Array<[string, string | null]>) =>
    pairs.filter(([, v]) => v).map(([label, v]) => `${label} ${v}`);

  let description: string;
  let headerLines: string[];
  let signature: string;
  if (p.kind === "osoba_fizyczna") {
    description = [legalName, addressFull].filter(Boolean).join(", ");
    headerLines = [legalName, p.address, cityLine];
    signature = legalName;
  } else if (p.kind === "jdg") {
    const prowadzacy = jestKobieta({
      typ: "osoba_fizyczna",
      imie_nazwisko: p.personName,
      pesel: p.pesel,
    })
      ? "prowadząca"
      : "prowadzący";
    const who =
      p.personName && p.companyName
        ? `${p.personName}, ${prowadzacy} działalność gospodarczą pod firmą ${p.companyName}`
        : legalName;
    description = [who, addressFull, ...ids(["NIP", p.nip], ["REGON", p.regon])]
      .filter(Boolean)
      .join(", ");
    headerLines = [legalName, p.address, cityLine, ...ids(["NIP", p.nip], ["REGON", p.regon])];
    signature = [
      p.personName || legalName,
      "właściciel",
      p.personName && p.companyName ? p.companyName : null,
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    const named = nameWithForm(legalName, p.legalForm);
    const parts = [
      [named, p.city ? zSiedziba(p.city) : null].filter(Boolean).join(" "),
      addressFull,
      ...ids(["KRS", p.krs], ["NIP", p.nip]),
    ];
    if (p.representative)
      parts.push(
        `reprezentowana przez ${odmienBiernik(p.representative)}${role ? ` (${role})` : ""}`,
      );
    description = parts.filter(Boolean).join(", ");
    headerLines = [named, p.address, cityLine, ...ids(["KRS", p.krs], ["NIP", p.nip])];
    signature = [p.representative, role, legalName].filter(Boolean).join("\n");
  }

  return {
    kind: p.kind,
    source: p.source,
    legalName,
    shortName,
    personName: p.personName,
    description,
    headerLines: headerLines.filter(Boolean),
    signature,
    address: p.address,
    postalCode: p.postalCode,
    city: p.city,
    addressFull,
    pesel: p.pesel,
    nip: p.nip,
    regon: p.regon,
    krs: p.krs,
    legalForm: p.legalForm,
    representative: p.representative,
    representativeRole: p.representativeRole,
    email: p.email,
    phone: p.phone,
    bankAccount: p.bankAccount,
  };
}

/** Wierzyciel z profilu inwestora (wiersz public.investors). */
export function buildCreditorParty(row: InvestorPartyRow): CreditorParty {
  const kind = investorKind(row);
  const companyName = kind === "osoba_fizyczna" ? "" : clean(row.company_name);
  const legalForm =
    kind === "osoba_fizyczna"
      ? null
      : (orNull(row.legal_form) ??
        (kind === "jdg" ? "jednoosobowa działalność gospodarcza" : null));
  return composeParty({
    kind,
    source: "investor",
    companyName,
    personName: joinSp(row.first_name, row.last_name),
    // PESEL osoby fizycznej (także właściciela JDG) — nigdy jako dane spółki,
    // nawet gdy w profilu został po zmianie rodzaju podmiotu.
    pesel: kind === "spolka" ? null : orNull(row.pesel)?.replace(/\D/g, "") || null,
    nip: kind === "osoba_fizyczna" ? null : orNull(row.nip),
    regon: kind === "osoba_fizyczna" ? null : orNull(row.regon),
    krs: kind === "spolka" ? orNull(row.krs) : null,
    legalForm,
    representative:
      kind === "spolka"
        ? joinSp(row.representative_first_name, row.representative_last_name) || null
        : null,
    representativeRole: kind === "spolka" ? orNull(row.representative_role) : null,
    address: clean(row.street) || clean(row.address),
    postalCode: clean(row.postal_code),
    city: clean(row.city),
    email: orNull(row.email),
    phone: orNull(row.phone),
    bankAccount: orNull(row.bank_account),
  });
}

/**
 * Finance You jako wierzyciel — tylko sprawy personelu bez profilu inwestora.
 * Reprezentant z COMPANY_DATA (jedno źródło prawdy).
 */
export function financeYouCreditor(): CreditorParty {
  const [repName, repRole] = COMPANY_DATA.representative.split(/\s*[–-]\s*/);
  const party = composeParty({
    kind: "spolka",
    source: "finance_you",
    companyName: COMPANY_DATA.legalName,
    personName: "",
    pesel: null,
    nip: COMPANY_DATA.nip,
    regon: COMPANY_DATA.regon,
    krs: COMPANY_DATA.krs,
    legalForm: COMPANY_DATA.legalForm,
    representative: clean(repName) || null,
    representativeRole: clean(repRole) || null,
    address: COMPANY_DATA.street,
    postalCode: COMPANY_DATA.postalCode,
    city: COMPANY_DATA.city,
    email: COMPANY_DATA.email,
    phone: COMPANY_DATA.phone.display,
    bankAccount: COMPANY_DATA.bankAccount,
  });
  return { ...party, shortName: COMPANY_DATA.name };
}

/** Oznaczenie strony dla danego celu — we wnioskach osoba fizyczna z PESEL. */
export function creditorDescription(party: CreditorParty, purpose: CreditorPurpose): string {
  if (purpose === "wniosek" && party.kind === "osoba_fizyczna" && party.pesel)
    return `${party.description}, PESEL ${party.pesel}`;
  return party.description;
}

/**
 * Brakujące dane wierzyciela (po polsku). Każde pismo: nazwa, ulica, kod
 * pocztowy, miejscowość. Wnioski i zawiadomienia dodatkowo: PESEL (osoba
 * fizyczna) albo NIP (JDG, spółka) i KRS (spółka).
 */
export function creditorMissing(party: CreditorParty, purpose: CreditorPurpose): string[] {
  const missing: string[] = [];
  if (!party.legalName)
    missing.push(party.kind === "osoba_fizyczna" ? "imię i nazwisko" : "nazwa firmy");
  if (!party.address) missing.push("ulica i numer");
  if (!party.postalCode) missing.push("kod pocztowy");
  if (!party.city) missing.push("miejscowość");
  if (purpose === "wniosek") {
    if (party.kind === "osoba_fizyczna") {
      if (!party.pesel) missing.push("PESEL");
    } else {
      if (!party.nip) missing.push("NIP");
      if (party.kind === "spolka" && !party.krs) missing.push("numer KRS");
    }
  }
  return missing;
}

/** „zakładce Profil (/inwestor/profil)" — ścieżka pomijana, gdy obok jest link. */
const profilTab = (withPath: boolean) =>
  withPath ? `zakładce Profil (${INVESTOR_PROFILE_PATH})` : "zakładce Profil";

/** Komunikat o niekompletnym profilu — z odesłaniem do zakładki Profil. */
export function creditorMissingMessage(missing: string[], own = true, withPath = true): string {
  const list = missing.join(", ");
  return own
    ? `Pisma windykacyjne wystawiamy w Twoim imieniu na podstawie profilu inwestora. Brakuje danych: ${list}. Uzupełnij je w ${profilTab(withPath)}.`
    : `Pisma windykacyjne wystawiamy w imieniu właściciela sprawy na podstawie jego profilu inwestora. Brakuje danych: ${list}. Właściciel sprawy musi je uzupełnić w ${profilTab(withPath)}.`;
}

/** Komunikat, gdy właściciel sprawy nie ma profilu inwestora. */
export function creditorNoProfileMessage(own = true, withPath = true): string {
  return own
    ? `Pisma windykacyjne wystawiamy w Twoim imieniu na podstawie profilu inwestora, a profil nie jest jeszcze uzupełniony. Uzupełnij dane w ${profilTab(withPath)}.`
    : `Pisma windykacyjne wystawiamy w imieniu właściciela sprawy, a nie ma on uzupełnionego profilu inwestora. Właściciel sprawy musi uzupełnić dane w ${profilTab(withPath)}.`;
}

/**
 * SMS / e-mail bez nadawcy: właściciel sprawy nie ma profilu inwestora,
 * a w sprawie nie wpisano pożyczkodawcy z umowy.
 */
export function creditorNoSenderMessage(own = true): string {
  return own
    ? `SMS-y i e-maile windykacyjne wysyłamy w Twoim imieniu, a profil inwestora nie jest uzupełniony i w sprawie nie wpisano pożyczkodawcy z umowy. Uzupełnij dane w ${profilTab(true)}.`
    : `SMS-y i e-maile windykacyjne wysyłamy w imieniu właściciela sprawy, a nie ma on profilu inwestora i w sprawie nie wpisano pożyczkodawcy z umowy. Właściciel sprawy musi uzupełnić dane w ${profilTab(true)}.`;
}

/** Nazwa do porównań: bez wielkości liter, znaków diakrytycznych, interpunkcji i form prawnych. */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(spolka z ograniczona odpowiedzialnoscia|spolka komandytowo akcyjna|prosta spolka akcyjna|spolka akcyjna|spolka komandytowa|spolka jawna|sp z o o|s k a|p s a|s a|sp k|sp j)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Słowa nazwy w porządku alfabetycznym — „Nowak Anna" = „Anna Nowak". */
const sortedWords = (s: string) =>
  s
    .split(" ")
    .filter((w) => w.length >= 2)
    .sort()
    .join(" ");

function namesMatch(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const sx = sortedWords(x);
  if (sx && sx === sortedWords(y)) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && ` ${long} `.includes(` ${short} `);
}

/**
 * Czy pożyczkodawca wpisany z umowy (tekst dowolny) to inna strona niż
 * wierzyciel z profilu. Puste pole umowy — brak konfliktu.
 */
export function creditorConflictsWithContract(
  party: CreditorParty | null,
  pozyczkodawca: string | null | undefined,
): boolean {
  const contract = clean(pozyczkodawca);
  if (!party || !contract) return false;
  return ![party.legalName, party.shortName, party.personName].some(
    (n) => n && namesMatch(n, contract),
  );
}

/** Dane wierzyciela w kształcie paczki danych firmowych (pola wzorów DOCX). */
export function creditorBundle(party: CreditorParty): CompanyBundle {
  const rep =
    party.kind === "spolka"
      ? { name: party.representative, role: shortRole(party.representativeRole) }
      : party.kind === "jdg" && party.personName
        ? { name: party.personName, role: "właściciel" }
        : { name: null, role: null };
  return {
    name: party.legalName || undefined,
    nip: party.nip ?? undefined,
    regon: party.regon ?? undefined,
    krs: party.krs ?? undefined,
    legalForm: party.legalForm ?? undefined,
    addressFull: party.addressFull || undefined,
    phone: party.phone ?? undefined,
    email: party.email ?? undefined,
    bankAccount: party.bankAccount ?? undefined,
    representativeName: rep.name ?? undefined,
    representativeRole: rep.role ?? undefined,
  };
}

/**
 * Wartość pola strony „Pożyczkodawca / Wierzyciel" wzoru DOCX z profilu
 * wierzyciela; null = pole spoza tej strony albo brak danych.
 */
export function creditorFieldValue(field: DocField, party: CreditorParty): string | null {
  if (field.groupKey !== "pozyczkodawca") return null;
  // Rachunek prowizji Finance You nie jest rachunkiem wierzyciela.
  if (isFinanceYouAccountField(field)) return null;
  const v = companyValueForField(field, creditorBundle(party));
  if (v) return v;
  if (party.pesel) {
    if (field.semantic === "pesel") return party.pesel;
    if (field.semantic === "idLine" && party.kind === "osoba_fizyczna")
      return `PESEL ${party.pesel}`;
  }
  return null;
}
