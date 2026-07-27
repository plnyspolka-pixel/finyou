/**
 * Most `ClientProfile` (+ kalkulacja) → `UmowaData` (dane wejściowe silnika umów).
 *
 * To jest linchpin punktu 3.4: łączy model danych aplikacji (profil klienta,
 * payload kalkulatora, wynik mapowania KW) z kontraktem `umowaSchema`, na
 * podstawie którego renderer składa dokument. Mapper jest CZYSTY (bez I/O), więc
 * daje się zweryfikować oraz przetestować w izolacji.
 *
 * Zasada nadrzędna: mapujemy wszystko, co wynika z danych; braki (np. PESEL
 * inwestora, miejscowość zawarcia umowy, sąd wieczystoksięgowy) zostawiamy puste
 * albo pobieramy z `overrides` — a `waliduj()` / `walidujSchemat()` wskaże je
 * operatorowi jako pola do uzupełnienia. Model finansowy jest zgodny z silnikiem:
 * pełna wypłata Kwoty Pożyczki, prowizja NIE potrącana, rozłożona równo na raty.
 */
import type {
  ClientProfile,
  BorrowerType,
  PropertyType,
  InvestorData,
} from "../client-profile-types";
import type { LoanCalcPayload } from "../loan-calc-pdf";
import type { UmowaData } from "./schema";
import { formatKwotaPL, parseKwota, payloadDoRaty } from "./schedule";
import { buildEngineSchedule } from "./loan-schedule";
import { amountToWordsPLN } from "../amount-to-words-pl";

// ── konwersje pomocnicze ───────────────────────────────────────

/** "2026-07-25" → "25.07.2026"; "25.07.2026" przepuszcza; inne → "". */
function toDataPl(s: string | null | undefined): string {
  if (!s) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  return "";
}

/** Liczba → { cyframi: "50 000,00", slownie: "pięćdziesiąt tysięcy…" }. */
function kwota(n: number | null | undefined): { cyframi: string; slownie: string } {
  const v = Number(n) || 0;
  return { cyframi: formatKwotaPL(v), slownie: amountToWordsPLN(v) || "zero złotych 00/100" };
}

/** Oprocentowanie roczne → "12,5" (regex silnika: 1–2 cyfry, przecinek, 1 cyfra). */
function oprocentowanie(annual: number | null | undefined): string {
  const v = Number(annual) || 0;
  return v.toFixed(1).replace(".", ",");
}

/** Dzień miesiąca z daty PL, przycięty do zakresu schematu [1, 28]. */
function dzienMiesiaca(dataPl: string): number {
  const m = /^(\d{2})\./.exec(dataPl);
  const d = m ? Number(m[1]) : 1;
  return Math.min(28, Math.max(1, d || 1));
}

// ── mapy enumów ────────────────────────────────────────────────

const FORMA_Z_TYPU: Record<Exclude<BorrowerType, "JDG" | "inny">, string> = {
  sp_zoo: "sp_z_oo",
  sp_cywilna: "spolka_cywilna",
  sp_jawna: "spolka_jawna",
  sp_komandytowa: "spolka_komandytowa",
  sp_akcyjna: "sa",
  psa: "prosta_sa",
};

const RODZAJ_NIERUCHOMOSCI: Record<PropertyType, string> = {
  mieszkanie: "lokal",
  dom: "dom",
  lokal_uslugowy: "lokal_uzytkowy",
  dzialka_budowlana: "dzialka_budowlana",
  grunt_rolny: "grunt_rolny",
  inna: "inne",
};

/** JDG oraz „inny przedsiębiorca" traktujemy jako osobę fizyczną prowadzącą działalność. */
function borrowerJestOsobaFizyczna(t: BorrowerType): boolean {
  return t === "JDG" || t === "inny";
}

// ── budowa stron umowy ─────────────────────────────────────────

function czysc<T extends Record<string, any>>(o: T): T {
  for (const k of Object.keys(o)) {
    if (o[k] === undefined || o[k] === null || o[k] === "") delete o[k];
  }
  return o;
}

/** Pożyczkobiorca ze `borrowerData` + `representativeData`. */
function budujPozyczkobiorce(profile: ClientProfile): any {
  const b = profile.borrowerData ?? {};
  const imieNazwisko = [b.firstName, b.lastName].filter(Boolean).join(" ").trim();
  const adres = b.businessAddress || b.correspondenceAddress || b.registeredAddress || "";

  if (borrowerJestOsobaFizyczna(profile.borrowerType)) {
    return czysc({
      typ: "osoba_fizyczna",
      imie_nazwisko: imieNazwisko,
      firma: b.companyName,
      pesel: b.pesel,
      nip: b.nip,
      regon: b.regon,
      adres,
      telefon: b.phone,
      email: b.email,
    });
  }

  const rep = profile.representativeData;
  const reprezentacja =
    rep && (rep.firstName || rep.lastName)
      ? [
          czysc({
            imie_nazwisko: [rep.firstName, rep.lastName].filter(Boolean).join(" ").trim(),
            pesel: rep.pesel,
            funkcja: rep.role || "reprezentant",
            podstawa: undefined,
          }),
        ]
      : undefined;

  const kapital = b.shareCapital ? parseKwota(b.shareCapital) : NaN;

  return czysc({
    typ: "podmiot_gospodarczy",
    nazwa: b.companyName || imieNazwisko,
    forma_prawna: b.legalForm,
    krs: b.krs,
    nip: b.nip,
    regon: b.regon,
    adres: b.registeredAddress || b.businessAddress || "",
    telefon: b.phone,
    email: b.email,
    forma: (FORMA_Z_TYPU as Record<string, string>)[profile.borrowerType] ?? "inna",
    kapital_zakladowy: Number.isFinite(kapital) && kapital > 0 ? kwota(kapital) : undefined,
    reprezentacja,
  });
}

/** Pożyczkodawca z `investorData` (fallback, gdy operator nie poda `overrides.pozyczkodawca`). */
function budujPozyczkodawce(inv: InvestorData): any {
  const isPodmiot = !!(inv.companyName && inv.companyName.trim());
  if (isPodmiot) {
    const rep = inv.representativeName;
    return czysc({
      typ: "podmiot_gospodarczy",
      nazwa: inv.companyName,
      nip: inv.nip,
      adres: inv.address || "",
      telefon: inv.phone,
      email: inv.email,
      reprezentacja: rep ? [czysc({ imie_nazwisko: rep, funkcja: "reprezentant" })] : undefined,
    });
  }
  return czysc({
    typ: "osoba_fizyczna",
    imie_nazwisko: inv.fullName || "",
    adres: inv.address || "",
    telefon: inv.phone,
    email: inv.email,
  });
}

/** Nieruchomość ze `propertyData` (stub — pola niewyprowadzalne z profilu uzupełni operator/KW). */
function budujNieruchomosc(profile: ClientProfile, payload: LoanCalcPayload): any {
  const p = profile.propertyData ?? {};
  const owner = p.owner;
  const wlascicielRef = owner && owner.isBorrower === false ? "osoba_trzecia" : "pozyczkobiorca";
  const opis = [p.description, p.address, p.city].filter(Boolean).join(", ");

  return czysc({
    id: "N1",
    nr_kw: p.landRegisterNumber || "",
    sad: "", // sąd wieczystoksięgowy — z KW lub od operatora
    opis: opis || "nieruchomość",
    rodzaj: p.type ? RODZAJ_NIERUCHOMOSCI[p.type] : undefined,
    wlasciciel_ref: wlascicielRef,
    hipoteka:
      payload.mortgageAmount > 0
        ? {
            kwota: kwota(payload.mortgageAmount),
            pierwszenstwo: "pierwsze",
            oproznione_miejsce_po: undefined,
          }
        : undefined,
  });
}

// ── warunki + harmonogram ──────────────────────────────────────

function budujWarunki(profile: ClientProfile, payload: LoanCalcPayload): any {
  const sched = payload.schedule ?? [];
  const prowizjaCalk =
    (Number(payload.commissionPln) || 0) + (Number(payload.financeYouFeePln) || 0);
  const prowizjaRaty = sched.map((r) => Number(r.prow) || 0);
  const raty = payloadDoRaty(payload, prowizjaRaty);

  const pierwszaData = toDataPl(sched[0]?.date) || toDataPl(profile.offerData?.payoutDate);
  const balon = Number(payload.balloon) || 0;
  const inv = profile.investorData ?? {};

  return czysc({
    kwota_pozyczki: kwota(payload.nominal),
    prowizja: czysc({ kwota: kwota(prowizjaCalk), model: "nie_potracana_raty" }),
    oprocentowanie: oprocentowanie(payload.annualRate),
    cel: profile.borrowerData?.loanPurpose || "",
    harmonogram: czysc({
      liczba_rat: sched.length || Number(payload.months) || 0,
      typ: balon > 0 ? "balonowy" : "rowne_raty",
      data_pierwszej_raty: pierwszaData,
      dzien_miesiaca: dzienMiesiaca(pierwszaData),
      kwota_raty: kwota(payload.monthlyPayment),
      kwota_raty_koncowej: balon > 0 ? kwota(balon) : undefined,
      raty: raty.length ? raty : undefined,
    }),
    rachunki: { wyplata: inv.bankAccount || "", splata: inv.bankAccount || "" },
  });
}

function budujZabezpieczenia(profile: ClientProfile, payload: LoanCalcPayload): any {
  const sched = payload.schedule ?? [];
  const ostatnia = toDataPl(sched[sched.length - 1]?.date);
  const dataGraniczna = toDataPl(profile.securityData?.art777ClauseDeadline) || ostatnia;

  return czysc({
    egzekucja_777: czysc({
      kwota: kwota(payload.art777Amount),
      poddaje_sie: ["pozyczkobiorca"],
      data_graniczna: dataGraniczna,
      // Standardowy termin wezwania do zapłaty (spójny ze scenariuszami wzorcowymi).
      termin_wezwania_dni: 7,
    }),
  });
}

// ── deep merge nadpisań ────────────────────────────────────────

function isObj(v: any): v is Record<string, any> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** Głębokie scalenie nadpisań; tablice zastępowane w całości (nieruchomości, poręczyciel…). */
function deepMerge(base: any, over: any): any {
  if (over === undefined) return base;
  if (!isObj(base) || !isObj(over)) return over;
  const out: Record<string, any> = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = isObj(base[k]) && isObj(over[k]) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

/**
 * Wyprowadza `LoanCalcPayload` z oferty w profilu (`offerData` + `securityData`)
 * przy użyciu kanonicznego silnika harmonogramu. Dzięki temu generacja umowy jest
 * w pełni napędzana profilem — nie wymaga osobnego „handoffu" z kalkulatora, choć
 * pozostaje z nim spójna (ten sam `buildEngineSchedule`).
 *
 * Zwraca `null`, gdy brakuje danych krytycznych do policzenia harmonogramu.
 */
export function profileToCalcPayload(profile: ClientProfile): LoanCalcPayload | null {
  const o = profile.offerData ?? {};
  const sec = profile.securityData ?? {};
  const K = Number(o.netAmountToClient ?? 0);
  const P = Number(o.creditedCommission ?? 0);
  const months = Number(o.loanTermMonths ?? 0);
  const maxPay = Number(o.maxMonthlyPaymentByClient ?? 0);
  const annual = Number(o.annualInterestPercent ?? 0);
  if (!K || !months || !maxPay || !o.payoutDate) return null;

  const eng = buildEngineSchedule({
    kwotaPozyczki: K,
    prowizja: P,
    annualRatePercent: annual,
    months,
    maxMonthlyPayment: maxPay,
    firstPaymentDate: dodajMiesiace(o.payoutDate, 1),
  });

  const nazwa =
    [profile.borrowerData?.firstName, profile.borrowerData?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    profile.borrowerData?.companyName ||
    null;

  return {
    v: 1,
    generatedAt: profile.updatedAt ?? "",
    onHand: K,
    nominal: K,
    months,
    annualRate: annual,
    commissionPct: K > 0 ? Math.round((P / K) * 10000) / 100 : 0,
    commissionPln: P,
    financeYouFeePct: 0,
    financeYouFeePln: 0,
    monthlyPayment: eng.regularPayment,
    balloon: eng.balloon,
    totalInterest: eng.totalInterest,
    totalCost: Math.round((P + eng.totalInterest) * 100) / 100,
    totalToRepay: eng.totalToRepay,
    mortgageAmount: Number(sec.mortgageAmount ?? 0),
    art777Amount: Number(sec.art777Amount ?? 0),
    agreementDate: toDataPl(o.agreementDate) || undefined,
    clientName: nazwa,
    schedule: eng.rows.map((r) => ({
      idx: r.nr,
      date: r.termin,
      rata: r.rata_razem,
      kap: r.kapital,
      ods: r.odsetki,
      prow: r.prowizja,
      saldo: r.saldo,
    })),
  };
}

/** Dodaje `n` miesięcy do daty "YYYY-MM-DD" (przycina dzień do długości miesiąca). */
function dodajMiesiace(iso: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const y0 = +m[1],
    mo0 = +m[2],
    d0 = +m[3];
  const total = y0 * 12 + (mo0 - 1) + n;
  const y = Math.floor(total / 12);
  const mo = (total % 12) + 1;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const d = Math.min(d0, dim);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export interface BuildUmowaOptions {
  /** Data zawarcia umowy (YYYY-MM-DD lub DD.MM.RRRR); domyślnie z payload/offer. */
  dataUmowy?: string;
  /** Miejscowość zawarcia umowy — nie wynika z profilu, podaje operator. */
  miejscowosc?: string;
  numerUmowy?: string;
  /**
   * Nieruchomości z mapera KW (`mapujKwDoNieruchomosci`) — jeśli podane,
   * zastępują stub budowany ze `propertyData`.
   */
  nieruchomosci?: any[];
  /** Głębokie nadpisania dowolnych pól `UmowaData` (pola uzupełniane przez operatora). */
  overrides?: Record<string, any>;
}

/**
 * Buduje `UmowaData` z profilu klienta i kalkulacji. Wynik przechodzi renderer,
 * a `waliduj()` wskazuje pola do uzupełnienia. Nie rzuca — braki są sygnalizowane
 * przez walidację, nie przez wyjątek (operator pracuje na niekompletnych danych).
 */
export function buildUmowaData(
  profile: ClientProfile,
  payload: LoanCalcPayload,
  opts: BuildUmowaOptions = {},
): UmowaData {
  const dataUmowy =
    toDataPl(opts.dataUmowy) ||
    toDataPl(payload.agreementDate) ||
    toDataPl(profile.offerData?.agreementDate);

  const nieruchomosci =
    opts.nieruchomosci && opts.nieruchomosci.length
      ? opts.nieruchomosci
      : [budujNieruchomosc(profile, payload)];

  const draft: any = {
    meta: czysc({
      data_umowy: dataUmowy,
      miejscowosc: opts.miejscowosc || profile.propertyData?.city || "",
      numer_umowy: opts.numerUmowy,
    }),
    pozyczkodawca: budujPozyczkodawce(profile.investorData ?? {}),
    pozyczkobiorca: budujPozyczkobiorce(profile),
    warunki: budujWarunki(profile, payload),
    nieruchomosci,
    zabezpieczenia: budujZabezpieczenia(profile, payload),
  };

  return deepMerge(draft, opts.overrides ?? {}) as UmowaData;
}
