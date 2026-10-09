// ════════════════════════════════════════════════════════════════════
// FORMULARZE WINDYKACJI — czyste funkcje UI (bez Reacta i I/O).
//
//   • harmonogram rat w edytorze (wiersze jako tekst, generator z
//     parametrów umowy) — walidacja tą samą funkcją co serwer
//     (harmonogramFromInput), więc błędny wiersz widać przed zapisem;
//   • edycja danych pożyczki i dłużnika na karcie sprawy — wysyłamy tylko
//     pola, które użytkownik faktycznie zmienił (dane z bazy, których nie
//     ruszał, nie mogą zablokować zapisu walidacją);
//   • podpowiedź procedury z bieżącą migawką sprawy (opóźnienie na dziś).
// ════════════════════════════════════════════════════════════════════
import {
  generateHarmonogram,
  normalizeHarmonogram,
  parseDataISO,
  parseKwota,
  type RataStan,
  type WindRata,
  type ZalegloscWynik,
} from "@/lib/windykacja-harmonogram";
import { formatRachunekSplaty, harmonogramFromInput } from "@/lib/windykacja-recalc";
import type { WindDebtSnapshot } from "@/lib/windykacja-debt";
import type { WindCaseLite } from "@/lib/windykacja-procedure";
import type { WindBorrower, WindLoan } from "@/lib/windykacja.functions";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Kwota z groszami („11 956,69 zł") — kwoty sprawy komunikowane dłużnikowi i w aktach. */
export function formatZl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(n));
}

/** Data RRRR-MM-DD → „DD.MM.RRRR" (bez przeliczania stref czasowych). */
export function formatDataPL(iso: string | null | undefined): string {
  const d = parseDataISO(iso);
  return d ? d.split("-").reverse().join(".") : "—";
}

/** Stopa procentowa po polsku: 18,5. */
export function formatStopa(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return round2(n).toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

// ── Harmonogram w edytorze ───────────────────────────────────────────

/** Wiersz edytora: wszystko jako tekst wpisany przez użytkownika. */
export interface RataForm {
  key: string;
  /** RRRR-MM-DD (input type=date). */
  termin: string;
  kwota: string;
  /** Część odsetkowa raty (opcjonalnie). */
  odsetki: string;
  /** Część prowizyjna raty (opcjonalnie). */
  prowizja: string;
}

/** Parametry generatora harmonogramu (z umowy). */
export interface GeneratorForm {
  pierwszaRata: string;
  liczbaRat: string;
  kwotaRaty: string;
  /** Inna kwota ostatniej raty (np. wyrównanie, rata balonowa); puste = jak pozostałe. */
  kwotaOstatniejRaty: string;
}

export const EMPTY_GENERATOR: GeneratorForm = {
  pierwszaRata: "",
  liczbaRat: "",
  kwotaRaty: "",
  kwotaOstatniejRaty: "",
};

let keySeq = 0;
const newKey = () => `rata_${Date.now().toString(36)}_${(keySeq++).toString(36)}`;

/** Kwota do pola tekstowego: „7868,48" (przecinek dziesiętny, bez separatora tysięcy). */
export function kwotaDoPola(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return String(round2(n)).replace(".", ",");
}

/** Harmonogram (z bazy / odczytu umowy) → wiersze edytora. */
export function harmonogramToForm(h: WindRata[] | null | undefined): RataForm[] {
  return (h ?? []).map((r) => ({
    key: newKey(),
    termin: r.termin,
    kwota: kwotaDoPola(r.kwota),
    odsetki: kwotaDoPola(r.odsetki),
    prowizja: kwotaDoPola(r.prowizja),
  }));
}

const isEmptyRow = (r: RataForm) =>
  !r.termin.trim() && !r.kwota.trim() && !r.odsetki.trim() && !r.prowizja.trim();

/** Czy w edytorze jest choć jedna (niepusta) rata — wtedy zaległość liczymy z rat. */
export function hasRaty(rows: RataForm[]): boolean {
  return rows.some((r) => !isEmptyRow(r));
}

/**
 * Wiersze edytora → harmonogram do zapisu (ta sama walidacja co na
 * serwerze). Błędy z numerem wiersza; brak rat → harmonogram null.
 */
export function formToHarmonogram(rows: RataForm[]): {
  harmonogram: WindRata[] | null;
  bledy: string[];
} {
  return harmonogramFromInput(
    rows.map((r) => ({
      termin: r.termin,
      kwota: r.kwota,
      odsetki: r.odsetki,
      prowizja: r.prowizja,
    })),
  );
}

/** Najczęstsza kwota raty (bez ostatniej) — kwota „typowej" raty do generatora. */
function typowaKwota(h: WindRata[]): number {
  const pool = h.length > 1 ? h.slice(0, -1) : h;
  const count = new Map<number, number>();
  for (const r of pool) count.set(r.kwota, (count.get(r.kwota) ?? 0) + 1);
  let best = pool[0].kwota;
  let bestN = 0;
  for (const [k, n] of count) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

/** Parametry generatora odtworzone z istniejącego harmonogramu. */
export function generatorFromHarmonogram(h: WindRata[] | null | undefined): GeneratorForm {
  if (!h || h.length === 0) return EMPTY_GENERATOR;
  const kwota = typowaKwota(h);
  const ostatnia = h[h.length - 1].kwota;
  return {
    pierwszaRata: h[0].termin,
    liczbaRat: String(h.length),
    kwotaRaty: kwotaDoPola(kwota),
    kwotaOstatniejRaty:
      h.length > 1 && Math.abs(ostatnia - kwota) > 0.005 ? kwotaDoPola(ostatnia) : "",
  };
}

/** Parametry generatora z odczytu umowy (pola mogą być puste). */
export function generatorFromParams(p: {
  data_pierwszej_raty?: string | null;
  liczba_rat?: number | null;
  kwota_raty?: number | null;
  kwota_ostatniej_raty?: number | null;
}): GeneratorForm {
  return {
    pierwszaRata: parseDataISO(p.data_pierwszej_raty) ?? "",
    liczbaRat: p.liczba_rat != null && p.liczba_rat > 0 ? String(Math.floor(p.liczba_rat)) : "",
    kwotaRaty: kwotaDoPola(p.kwota_raty),
    kwotaOstatniejRaty: kwotaDoPola(p.kwota_ostatniej_raty),
  };
}

/** Raty z generatora albo komunikat, czego brakuje. */
export function generateFromForm(g: GeneratorForm): { raty: WindRata[]; blad: string | null } {
  const pierwsza = parseDataISO(g.pierwszaRata);
  const liczbaTxt = g.liczbaRat.trim();
  const liczba = /^\d+$/.test(liczbaTxt) ? Number(liczbaTxt) : Number.NaN;
  const kwota = parseKwota(g.kwotaRaty);
  const ostatnia = g.kwotaOstatniejRaty.trim() ? parseKwota(g.kwotaOstatniejRaty) : null;
  if (!pierwsza) return { raty: [], blad: "Podaj termin pierwszej raty." };
  if (!Number.isInteger(liczba) || liczba < 1 || liczba > 600) {
    return { raty: [], blad: "Liczba rat: liczba całkowita od 1 do 600." };
  }
  if (kwota == null || kwota <= 0) return { raty: [], blad: "Podaj kwotę raty większą od 0." };
  if (g.kwotaOstatniejRaty.trim() && (ostatnia == null || ostatnia <= 0)) {
    return { raty: [], blad: "Kwota ostatniej raty musi być większa od 0 (albo zostaw puste)." };
  }
  return {
    raty: generateHarmonogram({
      pierwszaRata: pierwsza,
      liczbaRat: liczba,
      kwotaRaty: kwota,
      kwotaOstatniejRaty: ostatnia,
    }),
    blad: null,
  };
}

/** Kolejna rata do dopisania ręcznie: miesiąc po ostatniej, ta sama kwota. */
export function nextRataForm(rows: RataForm[]): RataForm {
  const last = [...rows].reverse().find((r) => parseDataISO(r.termin));
  const termin = last
    ? (generateHarmonogram({
        pierwszaRata: last.termin,
        liczbaRat: 2,
        kwotaRaty: 1,
      })[1]?.termin ?? "")
    : "";
  return {
    key: newKey(),
    termin,
    kwota: last?.kwota ?? "",
    odsetki: "",
    prowizja: "",
  };
}

/** Porównanie harmonogramów po treści rat (termin, kwota, rozbicie). */
export function sameHarmonogram(
  a: WindRata[] | null | undefined,
  b: WindRata[] | null | undefined,
): boolean {
  const key = (h: WindRata[] | null | undefined) =>
    JSON.stringify(
      (normalizeHarmonogram(h) ?? []).map((r) => [
        r.termin,
        r.kwota,
        r.odsetki ?? null,
        r.prowizja ?? null,
      ]),
    );
  return key(a) === key(b);
}

// ── Stan rat (karta sprawy, raport) ──────────────────────────────────

export type RataStatus = "zaplacona" | "zalegla" | "przyszla";

export function rataStatus(r: Pick<RataStan, "wymagalna" | "pozostalo">): RataStatus {
  if (r.pozostalo <= 0) return "zaplacona";
  return r.wymagalna ? "zalegla" : "przyszla";
}

export const RATA_STATUS_LABEL: Record<RataStatus, string> = {
  zaplacona: "zapłacona",
  zalegla: "zaległa",
  przyszla: "przyszła",
};

/**
 * Rozliczenie wpłat do dnia `wynik.asOf` (formularz nowej sprawy): ile
 * wpłat było, ile z nich pokryło odsetki za opóźnienie i koszty, ile poszło
 * na raty przyszłe, a ile jest nadpłatą. Zaległe raty = raty wymagalne −
 * (wpłaty − odsetki i koszty − raty przyszłe − nadpłata). Wpłaty z datą
 * późniejszą niż `asOf` kalkulator pomija — tu też.
 */
export function rozliczenieWplat(
  wynik: ZalegloscWynik,
  payments: Array<{ paid_on: string; amount: number }>,
): {
  liczba: number;
  suma: number;
  naOdsetkiIKoszty: number;
  naRatyPrzyszle: number;
  nadplata: number;
} {
  const doDzis = payments.filter((p) => {
    const d = parseDataISO(p.paid_on);
    return d != null && d <= wynik.asOf && Number(p.amount) > 0;
  });
  const suma = round2(doDzis.reduce((s, p) => s + Number(p.amount), 0));
  const naRatyWymagalne = wynik.sumaWymagalna - wynik.zaleglosc;
  return {
    liczba: doDzis.length,
    suma,
    naOdsetkiIKoszty: round2(Math.max(0, suma - wynik.zaplaconoNaRaty - wynik.nadplata)),
    naRatyPrzyszle: round2(Math.max(0, wynik.zaplaconoNaRaty - naRatyWymagalne)),
    nadplata: wynik.nadplata,
  };
}

// ── Podpowiedź procedury z bieżącą migawką ───────────────────────────

/**
 * Sprawa do podpowiedzi procedury (suggestNextAction / needsActionToday)
 * z bieżącymi wartościami: opóźnienie liczone na dziś (a nie zapisane przy
 * zakładaniu sprawy) i kwota do zapłaty teraz (zaległe raty + odsetki za
 * opóźnienie + koszty).
 */
export function liveCaseLite(
  c: Pick<WindCaseLite, "sciezka" | "etap" | "opoznienie_dni" | "kwota_zalegla">,
  snap: WindDebtSnapshot | null,
): WindCaseLite {
  return {
    sciezka: c.sciezka,
    etap: c.etap,
    opoznienie_dni: snap ? snap.dniOpoznienia : Number(c.opoznienie_dni || 0),
    kwota_zalegla: snap ? snap.doZaplatyTeraz : Number(c.kwota_zalegla || 0),
  };
}

// ── Edycja danych pożyczki (karta sprawy) ────────────────────────────

/** Pola pożyczki w formularzu edycji — wszystko jako tekst. */
export interface LoanEditForm {
  pozyczkodawca: string;
  numer_umowy: string;
  data_umowy: string;
  kwota_pozyczki: string;
  prowizja: string;
  kwota_calkowita: string;
  oprocentowanie_roczne: string;
  stopa_odsetek_max: string;
  termin_splaty: string;
  rachunek_splaty: string;
  numer_kw: string;
  kwota_hipoteki: string;
  akt_notarialny_777: string;
  kwota_777: string;
}

type LoanEditSource = Pick<
  WindLoan,
  | "pozyczkodawca"
  | "numer_umowy"
  | "data_umowy"
  | "kwota_pozyczki"
  | "prowizja"
  | "kwota_calkowita"
  | "oprocentowanie_roczne"
  | "stopa_odsetek_max"
  | "termin_splaty"
  | "rachunek_splaty"
  | "numer_kw"
  | "kwota_hipoteki"
  | "akt_notarialny_777"
  | "kwota_777"
  | "harmonogram"
>;

const txt = (v: string | null | undefined) => (v ?? "").trim();
const dataPola = (v: string | null | undefined) => parseDataISO(v) ?? "";

export function loanToEditForm(loan: LoanEditSource): LoanEditForm {
  return {
    pozyczkodawca: txt(loan.pozyczkodawca),
    numer_umowy: txt(loan.numer_umowy),
    data_umowy: dataPola(loan.data_umowy),
    kwota_pozyczki: kwotaDoPola(loan.kwota_pozyczki),
    prowizja: kwotaDoPola(loan.prowizja),
    kwota_calkowita: kwotaDoPola(loan.kwota_calkowita),
    oprocentowanie_roczne: kwotaDoPola(loan.oprocentowanie_roczne),
    stopa_odsetek_max: kwotaDoPola(loan.stopa_odsetek_max),
    termin_splaty: dataPola(loan.termin_splaty),
    rachunek_splaty: txt(loan.rachunek_splaty),
    numer_kw: txt(loan.numer_kw),
    kwota_hipoteki: kwotaDoPola(loan.kwota_hipoteki),
    akt_notarialny_777: txt(loan.akt_notarialny_777),
    kwota_777: kwotaDoPola(loan.kwota_777),
  };
}

const LOAN_TEKST: Array<{ k: keyof LoanEditForm; label: string; max: number }> = [
  { k: "pozyczkodawca", label: "Pożyczkodawca", max: 200 },
  { k: "numer_umowy", label: "Numer umowy", max: 100 },
  { k: "numer_kw", label: "Numer KW", max: 60 },
  { k: "akt_notarialny_777", label: "Akt notarialny (art. 777 k.p.c.)", max: 300 },
];
/** Kwoty w kolumnach NOT NULL — puste pole = 0. */
const LOAN_KWOTA_WYMAGANA: Array<{ k: keyof LoanEditForm; label: string }> = [
  { k: "kwota_pozyczki", label: "Kwota wypłacona (na rękę)" },
  { k: "prowizja", label: "Prowizja Finance You" },
  { k: "kwota_calkowita", label: "Kwota do zwrotu bez odsetek" },
];
/** Kwoty opcjonalne — puste pole = brak (null). */
const LOAN_KWOTA_OPCJ: Array<{ k: keyof LoanEditForm; label: string }> = [
  { k: "kwota_hipoteki", label: "Kwota hipoteki" },
  { k: "kwota_777", label: "Kwota z aktu 777" },
];
const LOAN_DATA: Array<{ k: keyof LoanEditForm; label: string }> = [
  { k: "data_umowy", label: "Data umowy" },
  { k: "termin_splaty", label: "Termin spłaty" },
];

/**
 * Formularz edycji → patch dla updateWindLoan. Tylko pola zmienione względem
 * pożyczki z bazy; walidacja jak na serwerze (komunikaty z nazwą pola).
 * Zmieniony harmonogram przy nieruszonym terminie spłaty → termin spłaty =
 * termin ostatniej raty (spójnie z zakładaniem sprawy).
 */
export function loanEditPatch(
  loan: LoanEditSource,
  form: LoanEditForm,
  raty: RataForm[],
): { patch: Record<string, unknown>; bledy: string[] } {
  const patch: Record<string, unknown> = {};
  const bledy: string[] = [];
  const orig = loanToEditForm(loan);

  for (const { k, label, max } of LOAN_TEKST) {
    const v = form[k].trim();
    if (v === orig[k]) continue;
    if (v.length > max) {
      bledy.push(`${label}: najwyżej ${max} znaków.`);
      continue;
    }
    patch[k] = v || null;
  }

  const kwota = (k: keyof LoanEditForm, label: string, wymagana: boolean) => {
    const raw = form[k].trim();
    const before = (loan as Record<string, unknown>)[k];
    const beforeN = before == null ? null : round2(Number(before));
    if (!raw) {
      const v = wymagana ? 0 : null;
      if (beforeN !== v) patch[k] = v;
      return;
    }
    const n = parseKwota(raw);
    if (n == null || n < 0) {
      bledy.push(`${label}: nieprawidłowa kwota.`);
      return;
    }
    if (beforeN == null || Math.abs(round2(n) - beforeN) > 0.004) patch[k] = round2(n);
  };
  for (const { k, label } of LOAN_KWOTA_WYMAGANA) kwota(k, label, true);
  for (const { k, label } of LOAN_KWOTA_OPCJ) kwota(k, label, false);

  const stopa = (k: "oprocentowanie_roczne" | "stopa_odsetek_max", label: string) => {
    const raw = form[k].trim();
    if (raw === orig[k]) return;
    if (!raw) {
      // Oprocentowanie: puste = 0. Stopa za opóźnienie: puste = odsetki
      // maksymalne za opóźnienie z dnia umowy (ustala serwer).
      patch[k] = k === "oprocentowanie_roczne" ? 0 : null;
      return;
    }
    const n = parseKwota(raw);
    if (n == null || n < 0 || n > 100) {
      bledy.push(`${label}: podaj stopę od 0 do 100% rocznie.`);
      return;
    }
    if (Math.abs(round2(n) - round2(Number(loan[k] ?? 0))) > 0.004) patch[k] = round2(n);
  };
  stopa("oprocentowanie_roczne", "Oprocentowanie roczne");
  stopa("stopa_odsetek_max", "Stopa odsetek za opóźnienie");

  for (const { k, label } of LOAN_DATA) {
    const raw = form[k].trim();
    if (raw === orig[k]) continue;
    if (!raw) {
      patch[k] = null;
      continue;
    }
    const iso = parseDataISO(raw);
    if (!iso) {
      bledy.push(`${label}: nieprawidłowa data (RRRR-MM-DD).`);
      continue;
    }
    if (iso !== orig[k]) patch[k] = iso;
  }

  const rach = form.rachunek_splaty.trim();
  if (rach !== orig.rachunek_splaty) {
    if (!rach) patch.rachunek_splaty = null;
    else {
      const f = formatRachunekSplaty(rach);
      if (!f) bledy.push("Rachunek do spłaty: podaj 26 cyfr numeru rachunku (NRB) albo IBAN PL.");
      else if (f !== formatRachunekSplaty(orig.rachunek_splaty)) patch.rachunek_splaty = f;
    }
  }

  const { harmonogram, bledy: bledyRat } = formToHarmonogram(raty);
  if (bledyRat.length) bledy.push(...bledyRat);
  else if (!sameHarmonogram(harmonogram, loan.harmonogram)) {
    patch.harmonogram = harmonogram;
    const ostatnia = harmonogram?.[harmonogram.length - 1]?.termin ?? null;
    if (
      ostatnia &&
      !("termin_splaty" in patch) &&
      form.termin_splaty.trim() === orig.termin_splaty &&
      ostatnia !== orig.termin_splaty
    ) {
      patch.termin_splaty = ostatnia;
    }
  }

  return { patch, bledy };
}

// ── Edycja danych dłużnika (karta sprawy) ────────────────────────────

export interface BorrowerEditForm {
  imie_nazwisko: string;
  typ: "osoba_fizyczna" | "firma";
  pesel: string;
  nip: string;
  telefon: string;
  email: string;
  adres_zamieszkania: string;
  adres_do_doreczen: string;
}

type BorrowerEditSource = Pick<
  WindBorrower,
  | "imie_nazwisko"
  | "typ"
  | "pesel"
  | "nip"
  | "telefon"
  | "email"
  | "adres_zamieszkania"
  | "adres_do_doreczen"
>;

export function borrowerToEditForm(b: BorrowerEditSource): BorrowerEditForm {
  return {
    imie_nazwisko: txt(b.imie_nazwisko),
    typ: b.typ === "firma" ? "firma" : "osoba_fizyczna",
    pesel: txt(b.pesel),
    nip: txt(b.nip),
    telefon: txt(b.telefon),
    email: txt(b.email),
    adres_zamieszkania: txt(b.adres_zamieszkania),
    adres_do_doreczen: txt(b.adres_do_doreczen),
  };
}

/** Patch dla updateWindBorrower — tylko pola zmienione; walidacja jak na serwerze. */
export function borrowerEditPatch(
  b: BorrowerEditSource,
  form: BorrowerEditForm,
): { patch: Record<string, unknown>; bledy: string[] } {
  const patch: Record<string, unknown> = {};
  const bledy: string[] = [];
  const orig = borrowerToEditForm(b);

  const imie = form.imie_nazwisko.trim();
  if (imie !== orig.imie_nazwisko) {
    if (!imie) bledy.push("Dłużnik: podaj imię i nazwisko albo nazwę dłużnika.");
    else if (imie.length > 300) bledy.push("Dłużnik: najwyżej 300 znaków.");
    else patch.imie_nazwisko = imie;
  }
  if (form.typ !== orig.typ) patch.typ = form.typ;

  const pesel = form.pesel.replace(/\s/g, "");
  if (pesel !== orig.pesel.replace(/\s/g, "")) {
    if (pesel && !/^\d{11}$/.test(pesel)) bledy.push("PESEL: PESEL ma 11 cyfr.");
    else patch.pesel = pesel || null;
  }
  const nip = form.nip.replace(/[\s-]/g, "").replace(/^PL/i, "");
  if (nip !== orig.nip.replace(/[\s-]/g, "").replace(/^PL/i, "")) {
    if (nip && !/^\d{10}$/.test(nip)) bledy.push("NIP: NIP ma 10 cyfr.");
    else patch.nip = nip || null;
  }

  const email = form.email.trim();
  if (email !== orig.email) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      bledy.push("E-mail: nieprawidłowy adres e-mail.");
    } else patch.email = email || null;
  }

  const tekst: Array<{ k: keyof BorrowerEditForm; label: string; max: number }> = [
    { k: "telefon", label: "Telefon", max: 30 },
    { k: "adres_zamieszkania", label: "Adres zamieszkania", max: 500 },
    { k: "adres_do_doreczen", label: "Adres do doręczeń", max: 500 },
  ];
  for (const { k, label, max } of tekst) {
    const v = String(form[k]).trim();
    if (v === orig[k]) continue;
    if (v.length > max) bledy.push(`${label}: najwyżej ${max} znaków.`);
    else patch[k] = v || null;
  }

  return { patch, bledy };
}
