// Czyste funkcje: harmonogram „Dyrektor Finansowy", kompletność profilu,
// rekomendacje zabezpieczeń. Wszystkie wyliczenia są deterministyczne.

import type {
  BorrowerType,
  ClientProfile,
  OfferData,
  ScheduleData,
  ScheduleRow,
  SecurityData,
} from "./client-profile-types";
import { buildEngineSchedule } from "./contract-engine/loan-schedule";

export function formatPLN(n: number | undefined | null): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 2,
  }).format(Math.round((n ?? 0) * 100) / 100);
}

export function formatDate(d: string | undefined | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pl-PL");
  } catch {
    return d;
  }
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // safeguard for end-of-month
  if (d.getDate() < day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

export function maskPesel(p?: string): string {
  if (!p) return "—";
  if (p.length < 6) return p;
  return p.slice(0, 6) + "*****";
}

// ────────────────────────────────────────────────────────────────────
// HARMONOGRAM — model „Dyrektor Finansowy"
// ────────────────────────────────────────────────────────────────────

export type ScheduleInput = OfferData;

/**
 * Harmonogram „Dyrektor Finansowy" — w modelu silnika (jedno źródło prawdy,
 * `buildEngineSchedule`). Mapowanie pól oferty na model umowy:
 *  - `netAmountToClient` = **Kwota Pożyczki** (pełna wypłata dla klienta;
 *    prowizja NIE jest potrącana z wypłaty),
 *  - `creditedCommission` = **prowizja**, rozłożona równo na raty jako
 *    ułatwienie płatnicze (klauzula KWO_02),
 *  - odsetki liczone od kapitału pozostającego do spłaty,
 *  - pułap „maks. rata" steruje kapitałem; nadwyżka trafia do raty balonowej
 *    będącej ostatnią z N rat.
 * Wynagrodzenie inwestora jest teraz **wyprowadzane** (odsetki + prowizja),
 * a nie zadawane osobnym parametrem.
 */
export function buildDirectorSchedule(offer: ScheduleInput): ScheduleData | null {
  const kwotaPozyczki = Number(offer.netAmountToClient ?? 0);
  const prowizja = Number(offer.creditedCommission ?? 0);
  const maxPayment = Number(offer.maxMonthlyPaymentByClient ?? 0);
  const months = Number(offer.loanTermMonths ?? 0);
  const payoutDate = offer.payoutDate;
  const annualInterest = Number(offer.annualInterestPercent ?? 0);

  if (!kwotaPozyczki || !maxPayment || !months || !payoutDate) return null;

  const eng = buildEngineSchedule({
    kwotaPozyczki,
    prowizja,
    annualRatePercent: annualInterest,
    months,
    maxMonthlyPayment: maxPayment,
    firstPaymentDate: addMonths(payoutDate, 1),
  });

  const rows: ScheduleRow[] = eng.rows.map((r) => ({
    index: r.nr,
    date: addMonths(payoutDate, r.nr),
    paymentAmount: r.rata_razem,
    capital: r.kapital,
    interest: r.odsetki,
    commission: r.prowizja,
    remainingCapital: r.saldo,
    isBalloon: r.isBalloon,
  }));

  const monthlyCommissionAmount = eng.monthlyCommission;
  const monthlyCommissionPercent =
    kwotaPozyczki > 0 ? round2((monthlyCommissionAmount / kwotaPozyczki) * 100) : 0;
  const monthlyInterestAmount = months > 0 ? round2(eng.totalInterest / months) : 0;
  const totalInvestorProfit = round2(eng.totalInterest + prowizja);
  const expectedMonthlyInvestorReturn = months > 0 ? round2(totalInvestorProfit / months) : 0;
  const annualizedInvestorProfitAmount =
    months > 0 ? round2((totalInvestorProfit / months) * 12) : 0;
  const annualizedInvestorProfitPercent =
    kwotaPozyczki > 0 ? round2((annualizedInvestorProfitAmount / kwotaPozyczki) * 100) : 0;

  const infos: string[] = [
    "Pożyczkobiorca otrzymuje pełną Kwotę Pożyczki; prowizja nie jest potrącana z wypłaty, lecz rozłożona na raty (KWO_02).",
  ];
  if (eng.balloon > 0)
    infos.push(
      "Nadwyżka kapitału ponad pułap raty rozliczana jest w racie balonowej (ostatnia z rat).",
    );
  const warnings = [...eng.warnings];
  if (prowizja <= 0)
    warnings.push("Brak prowizji — sprawdź pole „Prowizja”, jeśli miała zostać naliczona.");

  return {
    rows,
    nominalLoanAmount: eng.kwotaPozyczki,
    expectedMonthlyInvestorReturn,
    monthlyInterestAmount,
    monthlyCommissionAmount: round2(monthlyCommissionAmount),
    monthlyCommissionPercent,
    balloonPayment: eng.balloon,
    totalClientObligation: eng.totalToRepay,
    totalInvestorProfit,
    annualizedInvestorProfitAmount,
    annualizedInvestorProfitPercent,
    warnings,
    infos,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ────────────────────────────────────────────────────────────────────
// BENCHMARK PRAWNY NBP
// ────────────────────────────────────────────────────────────────────

export function calcStatutoryInterest(referenceRatePercent?: number): {
  annual: number;
  monthly: number;
} {
  const ref = Number(referenceRatePercent ?? 0);
  const annual = (ref + 3.5) * 2;
  return { annual: round2(annual), monthly: round2(annual / 12) };
}

// ────────────────────────────────────────────────────────────────────
// REKOMENDACJE ZABEZPIECZEŃ
// ────────────────────────────────────────────────────────────────────

export interface SecurityRecommendation {
  totalClientObligation: number;
  minimumMortgageAmount: number;
  recommended777Amount: number;
  recommended777PeriodMonths: number;
  recommended777Deadline?: string;
}

export function recommendSecurity(
  schedule: ScheduleData | null | undefined,
  offer: OfferData,
): SecurityRecommendation | null {
  if (!schedule) return null;
  const months = Number(offer.loanTermMonths ?? 0);
  const total = schedule.totalClientObligation;
  const rec: SecurityRecommendation = {
    totalClientObligation: total,
    minimumMortgageAmount: round2(total * 1.5),
    recommended777Amount: round2(total * 1.5),
    recommended777PeriodMonths: months + 36,
  };
  if (offer.agreementDate) {
    rec.recommended777Deadline = addMonths(offer.agreementDate, rec.recommended777PeriodMonths);
  }
  return rec;
}

// ────────────────────────────────────────────────────────────────────
// KOMPLETNOŚĆ PROFILU
// ────────────────────────────────────────────────────────────────────

export interface CompletionResult {
  percent: number;
  missing: string[];
  criticalMissing: string[];
}

const COMMON_REQUIRED: Array<{
  label: string;
  check: (p: ClientProfile) => boolean;
  critical?: boolean;
}> = [
  { label: "Cel pożyczki", check: (p) => !!p.borrowerData.loanPurpose },
  { label: "Telefon klienta", check: (p) => !!p.borrowerData.phone },
  { label: "E-mail klienta", check: (p) => !!p.borrowerData.email },
  { label: "Typ nieruchomości", check: (p) => !!p.propertyData.type, critical: true },
  { label: "Numer KW", check: (p) => !!p.propertyData.landRegisterNumber, critical: true },
  { label: "Wartość nieruchomości", check: (p) => !!p.propertyData.estimatedValue, critical: true },
  {
    label: "Zdjęcia / dokumenty nieruchomości",
    check: (p) => p.uploadedPhotos.length + p.uploadedDocuments.length > 0,
  },
  {
    label: "Dane inwestora",
    check: (p) => !!(p.investorData.fullName || p.investorData.companyName),
  },
  { label: "Rachunek inwestora", check: (p) => !!p.investorData.bankAccount },
  { label: "Kwota dla klienta", check: (p) => !!p.offerData.netAmountToClient, critical: true },
  {
    label: "Maksymalna miesięczna rata klienta",
    check: (p) => !!p.offerData.maxMonthlyPaymentByClient,
    critical: true,
  },
  { label: "Okres pożyczki", check: (p) => !!p.offerData.loanTermMonths, critical: true },
  { label: "Data wypłaty", check: (p) => !!p.offerData.payoutDate, critical: true },
  {
    label: "Oczekiwane wynagrodzenie inwestora",
    check: (p) =>
      p.offerData.investorMonthlyReturnType === "percent"
        ? !!p.offerData.investorMonthlyReturnPercent
        : !!p.offerData.investorMonthlyReturnAmount,
    critical: true,
  },
  { label: "Kwota hipoteki", check: (p) => !!p.securityData.mortgageAmount, critical: true },
  { label: "Kwota art. 777 k.p.c.", check: (p) => !!p.securityData.art777Amount, critical: true },
];

const JDG_REQUIRED = [
  { label: "Imię (JDG)", check: (p: ClientProfile) => !!p.borrowerData.firstName },
  { label: "Nazwisko (JDG)", check: (p: ClientProfile) => !!p.borrowerData.lastName },
  { label: "Nazwa firmy", check: (p: ClientProfile) => !!p.borrowerData.companyName },
  { label: "NIP", check: (p: ClientProfile) => !!p.borrowerData.nip, critical: true },
  { label: "REGON", check: (p: ClientProfile) => !!p.borrowerData.regon },
  { label: "PESEL", check: (p: ClientProfile) => !!p.borrowerData.pesel },
  { label: "Adres działalności", check: (p: ClientProfile) => !!p.borrowerData.businessAddress },
  {
    label: "Rodzaj dokumentu tożsamości",
    check: (p: ClientProfile) => !!p.borrowerData.idDocument?.type,
  },
  {
    label: "Numer dokumentu tożsamości",
    check: (p: ClientProfile) => !!p.borrowerData.idDocument?.number,
  },
];

const COMPANY_REQUIRED = [
  {
    label: "Pełna nazwa spółki",
    check: (p: ClientProfile) => !!p.borrowerData.companyName,
    critical: true,
  },
  { label: "NIP spółki", check: (p: ClientProfile) => !!p.borrowerData.nip, critical: true },
  { label: "REGON spółki", check: (p: ClientProfile) => !!p.borrowerData.regon },
  { label: "Adres siedziby", check: (p: ClientProfile) => !!p.borrowerData.registeredAddress },
  {
    label: "Sposób reprezentacji",
    check: (p: ClientProfile) => !!p.borrowerData.representationDescription,
  },
  {
    label: "Imię osoby podpisującej",
    check: (p: ClientProfile) => !!p.representativeData?.firstName,
    critical: true,
  },
  {
    label: "Nazwisko osoby podpisującej",
    check: (p: ClientProfile) => !!p.representativeData?.lastName,
    critical: true,
  },
  {
    label: "Funkcja osoby podpisującej",
    check: (p: ClientProfile) => !!p.representativeData?.role,
  },
  {
    label: "Dokument tożsamości reprezentanta",
    check: (p: ClientProfile) => !!p.representativeData?.idDocument?.number,
  },
];

export function calculateProfileCompletion(profile: ClientProfile): CompletionResult {
  const checks = [
    ...(profile.borrowerType === "JDG" ? JDG_REQUIRED : COMPANY_REQUIRED),
    ...COMMON_REQUIRED,
  ];
  let done = 0;
  const missing: string[] = [];
  const criticalMissing: string[] = [];
  for (const c of checks) {
    const ok = c.check(profile);
    if (ok) done++;
    else {
      missing.push(c.label);
      if ((c as any).critical) criticalMissing.push(c.label);
    }
  }
  const percent = Math.round((done / checks.length) * 100);
  return { percent, missing, criticalMissing };
}

export function borrowerDisplayName(p: ClientProfile): string {
  const b = p.borrowerData;
  if (p.borrowerType === "JDG") {
    const parts = [b.firstName, b.lastName].filter(Boolean).join(" ");
    return [parts, b.companyName].filter(Boolean).join(" — ") || "Pożyczkobiorca";
  }
  return b.companyName || "Pożyczkobiorca";
}
