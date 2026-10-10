/**
 * Most PROFIL INWESTORA (`investors`) → Pożyczkodawca w umowie.
 *
 * Kreator umowy nie pyta inwestora o jego własne dane: bierze wszystko, co
 * zebrał pipeline inwestora (krok 1 „Dane pożyczkodawcy" i krok 2 „Rachunek
 * do spłaty") — wariant podmiotu, imię i nazwisko albo nazwę, PESEL, NIP, KRS,
 * REGON, formę prawną, adres, kontakt, reprezentanta i rachunek do spłaty.
 * Czego w profilu nie ma, tego nie wpisujemy — agent dopyta.
 *
 * Funkcja jest CZYSTA (bez I/O), więc da się ją testować i używać po obu
 * stronach. Identyfikatory przepuszczamy tylko, gdy po odsianiu znaków
 * nieliczbowych mają poprawną długość — inaczej walidator zgłaszałby błąd
 * w polu, którego inwestor nawet nie widział.
 */

/** Wiersz `investors` (tylko pola, które mapujemy) — luźno, bo typy bazy bywają starsze. */
export interface InwestorProfilRow {
  entity_variant?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  pesel?: string | null;
  nip?: string | null;
  krs?: string | null;
  regon?: string | null;
  legal_form?: string | null;
  address?: string | null;
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  representative_first_name?: string | null;
  representative_last_name?: string | null;
  representative_role?: string | null;
  bank_account?: string | null;
}

function txt(v: unknown): string {
  return String(v ?? "").trim();
}

/** Same cyfry; "" gdy po odsianiu długość nie zgadza się ze wzorcem pola. */
function cyfry(v: unknown, dlugosci: number[]): string {
  const d = txt(v).replace(/\D/g, "");
  return dlugosci.includes(d.length) ? d : "";
}

/** Adres jednym wierszem: „ul. Przykładowa 1, 30-001 Kraków". */
export function adresInwestora(row: InwestorProfilRow): string {
  const ulica = txt(row.street) || txt(row.address);
  const miasto = [txt(row.postal_code), txt(row.city)].filter(Boolean).join(" ").trim();
  return [ulica, miasto].filter(Boolean).join(", ");
}

/** Mapa form prawnych z rejestrów (GUS/KRS, też ręcznie) na enum `forma`. */
function forma(legalForm: unknown): string | undefined {
  // „ł" nie rozkłada się przez NFD — podmieniamy ją osobno.
  const s = txt(legalForm).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
  if (!s) return undefined;
  if (/(^|\W)(sp\.? ?z ?o\.? ?o|spolka z ograniczona)/.test(s)) return "sp_z_oo";
  if (/prosta spolka akcyjna|(^|\W)p\.?s\.?a\.?($|\W)/.test(s)) return "prosta_sa";
  if (/spolka akcyjna|(^|\W)s\.? ?a\.?($|\W)/.test(s)) return "sa";
  if (/komandytowo-?akcyjna/.test(s)) return "spolka_komandytowo_akcyjna";
  if (/komandytowa/.test(s)) return "spolka_komandytowa";
  if (/jawna/.test(s)) return "spolka_jawna";
  if (/partnerska/.test(s)) return "spolka_partnerska";
  if (/cywilna/.test(s)) return "spolka_cywilna";
  if (/spoldzielnia/.test(s)) return "spoldzielnia";
  if (/fundacja/.test(s)) return "fundacja";
  if (/stowarzyszenie/.test(s)) return "stowarzyszenie";
  return undefined;
}

function reprezentacja(row: InwestorProfilRow): Array<Record<string, string>> | undefined {
  const imieNazwisko = [txt(row.representative_first_name), txt(row.representative_last_name)]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (imieNazwisko.length < 3) return undefined;
  return [{ imie_nazwisko: imieNazwisko, funkcja: txt(row.representative_role) || "reprezentant" }];
}

function bezPustych<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) {
    const v = (o as Record<string, unknown>)[k];
    if (v === undefined || v === null || v === "") delete (o as Record<string, unknown>)[k];
  }
  return o;
}

/**
 * Pożyczkodawca (`UmowaData.pozyczkodawca`) z profilu inwestora. `null`, gdy
 * profil nie daje nawet nazwy strony — wtedy nie ma czym wypełniać umowy.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fragment szkicu umowy (luźny JSON)
export function pozyczkodawcaZProfilu(row: InwestorProfilRow | null | undefined): any | null {
  if (!row) return null;
  const imieNazwisko = [txt(row.first_name), txt(row.last_name)].filter(Boolean).join(" ").trim();
  const nazwa = txt(row.company_name);
  const adres = adresInwestora(row);
  const wariant = txt(row.entity_variant);

  // Osoba prawna (spółka) — strona „podmiot_gospodarczy".
  if (wariant === "osoba_prawna" || (!wariant && nazwa && !imieNazwisko)) {
    if (!nazwa) return null;
    return bezPustych({
      typ: "podmiot_gospodarczy",
      nazwa,
      forma_prawna: txt(row.legal_form),
      forma: forma(row.legal_form),
      krs: cyfry(row.krs, [10]),
      nip: cyfry(row.nip, [10]),
      regon: cyfry(row.regon, [9, 14]),
      adres,
      telefon: txt(row.phone),
      email: txt(row.email),
      reprezentacja: reprezentacja(row),
    });
  }

  // Osoba fizyczna i JDG — strona „osoba_fizyczna" (JDG dodatkowo z firmą).
  if (!imieNazwisko) return null;
  return bezPustych({
    typ: "osoba_fizyczna",
    imie_nazwisko: imieNazwisko,
    firma: wariant === "jdg" ? nazwa : "",
    pesel: cyfry(row.pesel, [11]),
    nip: wariant === "jdg" ? cyfry(row.nip, [10]) : "",
    regon: wariant === "jdg" ? cyfry(row.regon, [9, 14]) : "",
    adres,
    telefon: txt(row.phone),
    email: txt(row.email),
  });
}

/** Pola występujące tylko u osoby fizycznej / tylko u podmiotu (schemat `.strict()`). */
const KLUCZE_OSOBY = ["imie_nazwisko", "pesel", "firma", "dokument_tozsamosci", "dzialalnosc"];
const KLUCZE_PODMIOTU = ["nazwa", "forma_prawna", "krs", "reprezentacja", "kapital_zakladowy"];

/** Wariant strony ze szkicu — z pola `typ`, a gdy go nie ma, z obecnych pól. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- strona szkicu umowy
function wariantStrony(strona: any): string | null {
  if (!strona || typeof strona !== "object") return null;
  if (typeof strona.typ === "string" && strona.typ) return strona.typ;
  if (KLUCZE_PODMIOTU.some((k) => strona[k] != null)) return "podmiot_gospodarczy";
  if (KLUCZE_OSOBY.some((k) => strona[k] != null)) return "osoba_fizyczna";
  return null;
}

/**
 * Pożyczkodawca z profilu + to, co jest już w szkicu (rozmowa z agentem,
 * ręczna zmiana). Szkic ma pierwszeństwo pole po polu, ale gdy wskazuje INNEGO
 * rodzaju stronę niż profil (np. spółkę przy profilu osoby fizycznej), profilu
 * NIE mieszamy — schemat umowy jest `.strict()`, więc zlepek pól osoby
 * fizycznej i podmiotu zostałby odrzucony.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- strona szkicu umowy
export function scalPozyczkodawce(zProfilu: any | null, zeSzkicu: any): any | null {
  if (!zProfilu) return zeSzkicu ?? null;
  const wariantSzkicu = wariantStrony(zeSzkicu);
  if (!wariantSzkicu) return zProfilu;
  if (wariantSzkicu !== zProfilu.typ) return zeSzkicu;
  // Puste wartości ze szkicu nie wymazują danych z profilu.
  const nadpisania: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(zeSzkicu as Record<string, unknown>)) {
    if (v === undefined || v === "") continue;
    nadpisania[k] = v;
  }
  return { ...zProfilu, ...nadpisania };
}

/**
 * Szkic umowy uzupełniony danymi inwestora: Pożyczkodawca (scalony jak wyżej)
 * i rachunek do spłaty z kroku 2 pipeline'u (tylko gdy w szkicu go nie ma).
 * Nie modyfikuje wejścia.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- szkic umowy
export function dolaczProfilInwestoraDoSzkicu(
  szkic: any,
  row: InwestorProfilRow | null | undefined,
): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- szkic umowy
  const out: any = szkic && typeof szkic === "object" ? structuredClone(szkic) : {};
  const pozyczkodawca = scalPozyczkodawce(pozyczkodawcaZProfilu(row), out.pozyczkodawca);
  if (pozyczkodawca) out.pozyczkodawca = pozyczkodawca;
  const splata = txt(row?.bank_account);
  if (splata) {
    const warunki = (out.warunki ??= {});
    const rachunki = (warunki.rachunki ??= {});
    if (!txt(rachunki.splata)) rachunki.splata = splata;
  }
  return out;
}

/** Kolumny `investors`, których potrzebuje mapper (do SELECT-a po stronie serwera). */
export const INWESTOR_UMOWA_COLUMNS =
  "entity_variant, first_name, last_name, company_name, pesel, nip, krs, regon, legal_form, " +
  "address, street, postal_code, city, country, email, phone, " +
  "representative_first_name, representative_last_name, representative_role, bank_account";

/**
 * Ten sam profil inwestora → `InvestorData` profilu klienta (ekran „Dane
 * stron" i kreator dokumentów). Zwraca tylko pola, które w profilu są —
 * wywołujący decyduje, czy nie nadpisuje nimi wartości wpisanych ręcznie.
 */
export function inwestorDoProfiluKlienta(
  row: InwestorProfilRow | null | undefined,
): Record<string, string> {
  if (!row) return {};
  const out: Record<string, string> = {
    fullName: [txt(row.first_name), txt(row.last_name)].filter(Boolean).join(" ").trim(),
    companyName: txt(row.company_name),
    entityVariant: txt(row.entity_variant),
    pesel: cyfry(row.pesel, [11]),
    nip: cyfry(row.nip, [10]),
    krs: cyfry(row.krs, [10]),
    regon: cyfry(row.regon, [9, 14]),
    legalForm: txt(row.legal_form),
    address: adresInwestora(row),
    phone: txt(row.phone),
    email: txt(row.email),
    bankAccount: txt(row.bank_account),
    representativeName: [txt(row.representative_first_name), txt(row.representative_last_name)]
      .filter(Boolean)
      .join(" ")
      .trim(),
    representativeRole: txt(row.representative_role),
  };
  return bezPustych(out);
}
