// FAKTY Z SYSTEMU dla agentów (głos, czat, social media) — liczone z TYCH
// SAMYCH stałych, z których korzystają umowy, kalkulatory i cennik:
//   • src/lib/contract-engine/fees.ts   — prowizja FY, odsetki maksymalne, LTV,
//   • src/lib/investor-plan/plans.ts    — abonament inwestora,
//   • src/lib/company.ts                — dane firmy i oficjalny kontakt.
//
// Po co: agent mówił klientom „prowizja 7%", choć umowa liczy 5% (prompt w
// panelu rozjechał się z kodem), a telefon podawał „1,79–3% miesięcznie" przy
// odsetkach maksymalnych 14,5% rocznie. Liczb nie przepisujemy już ręcznie do
// promptów — blok poniżej generuje się z kodu, więc zmiana stawki w fees.ts
// (np. po decyzji RPP) trafia do agentów przy następnej synchronizacji promptu.
//
// Czyste funkcje, bez I/O — import po stronie serwera, w testach i w skryptach.
import {
  FY_COMMISSION_MIN_PLN,
  FY_COMMISSION_PCT,
  LTV_MAX,
  fyCommission,
  kwotaNaReke,
  maxCapitalRate,
  maxDelayRate,
  maxInterestAt,
  maxLoanAtLtv,
} from "@/lib/contract-engine/fees";
import {
  SUBSCRIPTION_MONTHLY_PLN,
  SUBSCRIPTION_PAYMENT_SENTENCE,
  SUBSCRIPTION_YEARLY_DISCOUNT_PCT,
  SUBSCRIPTION_YEARLY_PLN,
  SUBSCRIPTION_YEARLY_SAVINGS_PLN,
  plnLabel,
} from "@/lib/investor-plan/plans";
import { COMPANY_DATA } from "@/lib/company";
import { monthlyPayment } from "@/lib/loan-math";

export type FactsAudience = "klient" | "inwestor" | "wspolna";

/**
 * Liczba po polsku: przecinek dziesiętny, spacja (nierozdzielająca) co trzy
 * cyfry — także dla liczb 4-cyfrowych, których pl-PL sam nie grupuje
 * („5 000", nie „5000").
 */
export function plNumber(n: number, maxFractionDigits = 2): string {
  const [int, frac] = n
    .toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits, useGrouping: false })
    .split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return frac ? `${grouped},${frac}` : grouped;
}

/** Ustrukturyzowane fakty — do narzędzia `get_offer_facts` i do testów. */
export function liveFacts(date: Date | string = new Date()) {
  const capital = maxCapitalRate(date);
  return {
    asOf: typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10),
    company: {
      name: COMPANY_DATA.legalName,
      krs: COMPANY_DATA.krs,
      nip: COMPANY_DATA.nip,
      address: COMPANY_DATA.addressFull,
      phone: COMPANY_DATA.phone.display,
      email: COMPANY_DATA.email,
      website: "financeyou.pl",
    },
    borrower: {
      fyCommissionPct: FY_COMMISSION_PCT,
      fyCommissionMinPln: FY_COMMISSION_MIN_PLN,
      fyCommissionExample: {
        amount: 100_000,
        commission: fyCommission(100_000),
        netPayout: kwotaNaReke(100_000),
      },
      maxAnnualInterestPct: capital,
      maxDelayInterestPct: maxDelayRate(date),
      maxInterestValidFrom: maxInterestAt(date).from,
      ltvMaxPct: LTV_MAX,
      businessPurposeOnly: true,
      ownedPropertyOnly: true,
      polandOnly: true,
    },
    investor: {
      subscriptionMonthlyPln: SUBSCRIPTION_MONTHLY_PLN,
      subscriptionYearlyPln: SUBSCRIPTION_YEARLY_PLN,
      yearlyDiscountPct: SUBSCRIPTION_YEARLY_DISCOUNT_PCT,
      yearlySavingsPln: SUBSCRIPTION_YEARLY_SAVINGS_PLN,
      successFee: false,
      perProjectFee: false,
      ltvMaxPct: LTV_MAX,
      maxAnnualInterestPct: capital,
    },
  };
}

export type LiveFacts = ReturnType<typeof liveFacts>;

/**
 * Blok faktów do promptu agenta. Nagłówek mówi wprost: liczby podajesz
 * wyłącznie stąd — model nie ma „pamiętać" stawek z innych źródeł.
 */
export function buildLiveFactsBlock(
  audience: FactsAudience,
  date: Date | string = new Date(),
): string {
  const f = liveFacts(date);
  const b = f.borrower;
  const i = f.investor;
  const ex = b.fyCommissionExample;
  const lines: string[] = [];
  lines.push(
    // Bez dzisiejszej daty w nagłówku: odcisk promptu zmienia się tylko wtedy,
    // gdy zmieniają się same fakty (inaczej codzienna synchronizacja agentów).
    `\n\nFAKTY Z SYSTEMU FINANCE YOU (generowane z umów i cennika — liczby i warunki podajesz WYŁĄCZNIE stąd; jeśli czegoś tu nie ma, mówisz, że to zależy od konkretnej sprawy):`,
  );
  if (audience !== "inwestor") {
    lines.push(
      `- Finansujemy WYŁĄCZNIE cel związany z działalnością gospodarczą (B2B) — nie udzielamy kredytów konsumenckich ani hipotecznych na cele prywatne.`,
      `- Zabezpieczeniem jest hipoteka na nieruchomości w Polsce, którą wnioskodawca (albo właściciel, który przystępuje do umowy) JUŻ posiada. Nie finansujemy zakupu nieruchomości pod tę samą nieruchomość.`,
      `- Maksymalne LTV: ${b.ltvMaxPct}% wartości nieruchomości, liczone łącznie z istniejącymi obciążeniami (np. kredytem w banku na pierwszym miejscu).`,
      `- Oprocentowanie ustala inwestor, ale nie może przekroczyć odsetek maksymalnych: obecnie ${plNumber(b.maxAnnualInterestPct)}% w skali roku (od ${b.maxInterestValidFrom}).`,
      `- Prowizja Finance You (Prowizja od Pożyczkobiorcy): ${b.fyCommissionPct}% kwoty pożyczki, nie mniej niż ${plNumber(b.fyCommissionMinPln)} zł, bez VAT, potrącana z wypłaty. Przykład: ${plNumber(ex.amount)} zł → ${plNumber(ex.commission)} zł prowizji, ${plNumber(ex.netPayout)} zł na konto.`,
      `- Inwestor może mieć własną prowizję (rozłożoną w ratach) — jej wysokość klient zna z oferty, zanim cokolwiek podpisze.`,
      `- Zły BIK albo brak zdolności w banku nie zamyka sprawy automatycznie — oceniane jest przede wszystkim zabezpieczenie. Zajęcie komornicze i egzekucja wymagają indywidualnej oceny.`,
      `- Proces: klient składa kompletny wniosek (dane + dokumenty nieruchomości) → wniosek widzą inwestorzy → jeśli sprawa zainteresuje inwestora, inwestor kontaktuje się z ofertą. Złożenie wniosku jest bezpłatne i do niczego nie zobowiązuje.`,
    );
  }
  if (audience !== "klient") {
    lines.push(
      `- Inwestor płaci abonament za narzędzia: ${plnLabel(i.subscriptionMonthlyPln)} miesięcznie albo ${plnLabel(i.subscriptionYearlyPln)} za rok (${i.yearlyDiscountPct}% taniej, oszczędność ${plnLabel(i.yearlySavingsPln)}). ${SUBSCRIPTION_PAYMENT_SENTENCE}`,
      `- Nie ma opłaty sukcesu ani opłaty za Projekt. Prowizję Finance You płaci pożyczkobiorca (potrącana z wypłaty), więc cały zarobek z odsetek i własnej prowizji inwestora zostaje u inwestora.`,
      `- Zarobek inwestora: oprocentowanie (nie wyżej niż odsetki maksymalne, obecnie ${plNumber(i.maxAnnualInterestPct)}% rocznie) + własna prowizja inwestora. Wynik zależy od parametrów konkretnej transakcji — NIE jest gwarantowany; inwestowanie wiąże się z ryzykiem, w tym utraty części kapitału.`,
      `- Zabezpieczenie: hipoteka, LTV maksymalnie ${i.ltvMaxPct}%, analiza księgi wieczystej i ryzyka w skali A–E przed decyzją; w razie braku spłaty — moduł windykacji.`,
    );
  }
  lines.push(
    `- Oficjalny kontakt: ${f.company.phone}, ${f.company.email}, financeyou.pl. ${f.company.name}, KRS ${f.company.krs}, NIP ${f.company.nip}, ${f.company.address}.`,
  );
  return lines.join("\n");
}

export interface CostEstimateInput {
  amount: number;
  months?: number | null;
  propertyValue?: number | null;
  existingDebt?: number | null;
  date?: Date | string;
}

export interface CostEstimate {
  ok: boolean;
  error?: string;
  amount: number;
  fyCommission: number;
  netPayout: number;
  maxAnnualInterestPct: number;
  months: number;
  /** Rata annuitetowa przy oprocentowaniu równym odsetkom maksymalnym — górna granica odsetek (bez prowizji inwestora). */
  maxMonthlyInstallmentAtMaxRate: number;
  ltvPct: number | null;
  ltvOk: boolean | null;
  maxLoanAtLtv: number | null;
  notes: string[];
}

const round = (n: number) => Math.round(n);

/**
 * Orientacyjne wyliczenie dla rozmowy z klientem. Uczciwe ramy:
 *  • prowizja FY — dokładnie wg umowy,
 *  • rata — GÓRNA granica części odsetkowej (stopa = odsetki maksymalne);
 *    realna stopa jest ustalana przez inwestora i może być niższa,
 *  • prowizja inwestora nieznana przed ofertą — mówimy to wprost.
 */
export function estimateBorrowerCost(input: CostEstimateInput): CostEstimate {
  const amount = Number(input.amount);
  const months = Math.round(Number(input.months) || 12);
  const date = input.date ?? new Date();
  const rate = maxCapitalRate(date);
  const base: CostEstimate = {
    ok: false,
    amount: 0,
    fyCommission: 0,
    netPayout: 0,
    maxAnnualInterestPct: rate,
    months,
    maxMonthlyInstallmentAtMaxRate: 0,
    ltvPct: null,
    ltvOk: null,
    maxLoanAtLtv: null,
    notes: [],
  };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ...base, error: "Podaj kwotę pożyczki w złotych (liczba większa od zera)." };
  }
  if (months < 1 || months > 360) {
    return { ...base, error: "Okres spłaty podaj w miesiącach (1–360)." };
  }
  const notes: string[] = [
    `Rata to górna granica części odsetkowej — liczona przy oprocentowaniu równym odsetkom maksymalnym (${plNumber(rate)}% rocznie). Inwestor może zaproponować niższe.`,
    "Do raty może dojść prowizja inwestora rozłożona w ratach — jej wysokość jest w ofercie inwestora.",
  ];
  let ltvPct: number | null = null;
  let ltvOk: boolean | null = null;
  let maxLoan: number | null = null;
  const value = Number(input.propertyValue);
  if (Number.isFinite(value) && value > 0) {
    const debt = Math.max(0, Number(input.existingDebt) || 0);
    ltvPct = Math.round(((amount + debt) / value) * 1000) / 10;
    ltvOk = ltvPct <= LTV_MAX + 1e-9;
    maxLoan = round(maxLoanAtLtv(value, debt));
    if (!ltvOk) {
      notes.push(
        `Przy tej wartości nieruchomości i obciążeniach kwota przekracza limit LTV ${LTV_MAX}% — orientacyjnie możliwe jest do ok. ${plNumber(maxLoan)} zł.`,
      );
    }
  }
  return {
    ok: true,
    amount: round(amount),
    fyCommission: round(fyCommission(amount)),
    netPayout: round(kwotaNaReke(amount)),
    maxAnnualInterestPct: rate,
    months,
    maxMonthlyInstallmentAtMaxRate: round(monthlyPayment(amount, rate, months)),
    ltvPct,
    ltvOk,
    maxLoanAtLtv: maxLoan,
    notes,
  };
}
