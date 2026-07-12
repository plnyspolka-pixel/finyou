// Czyste funkcje: harmonogram spłat (odsetki od malejącego salda), kompletność
// profilu, rekomendacje zabezpieczeń. Wszystkie wyliczenia są deterministyczne.

import type {
  BorrowerType,
  ClientProfile,
  OfferData,
  ScheduleData,
  ScheduleRow,
  SecurityData,
} from "./client-profile-types";

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
// HARMONOGRAM SPŁAT — odsetki liczone od MALEJĄCEGO salda kapitału
// (dawny model „Dyrektor Finansowy" liczył odsetki płasko od pełnego
// nominału przez cały okres — zawyżał odsetki i dawał inne liczby niż
// kalkulator anuitetowy; został usunięty).
// ────────────────────────────────────────────────────────────────────

export interface ScheduleInput extends OfferData {}

/**
 * Wynik harmonogramu z jawnym ostrzeżeniem, gdy maksymalna rata klienta nie
 * pokrywa nawet miesięcznych odsetek (należności narastają do raty balonowej).
 */
export type RepaymentScheduleData = ScheduleData & {
  /** Ustawione, gdy maxPayment < miesięczne odsetki — rata nie pokrywa odsetek. */
  warning?: string;
};

export function buildRepaymentSchedule(
  offer: ScheduleInput,
): RepaymentScheduleData | null {
  const net = Number(offer.netAmountToClient ?? 0);
  const commission = Number(offer.creditedCommission ?? 0);
  const maxPayment = Number(offer.maxMonthlyPaymentByClient ?? 0);
  const months = Number(offer.loanTermMonths ?? 0);
  const payoutDate = offer.payoutDate;
  const annualInterest = Number(offer.annualInterestPercent ?? 0);

  // walidacja — odrzucamy brakujące ORAZ ujemne wartości wejściowe
  if (!net || !maxPayment || !months || !payoutDate) return null;
  if (net < 0 || commission < 0 || maxPayment < 0 || months < 0 || annualInterest < 0) return null;

  const nominalLoanAmount = net + commission;
  const monthlyRate = annualInterest / 100 / 12;

  // Oczekiwane wynagrodzenie inwestora — wyłącznie INFORMACYJNE (benchmark
  // negocjacyjny). Umowa nie przewiduje opłaty za ryzyko, więc realne
  // wynagrodzenie inwestora to odsetki + prowizja.
  let expectedMonthly = 0;
  if (offer.investorMonthlyReturnType === "percent") {
    expectedMonthly = (net * Number(offer.investorMonthlyReturnPercent ?? 0)) / 100;
  } else {
    expectedMonthly = Number(offer.investorMonthlyReturnAmount ?? 0);
  }

  // Wartość „nagłówkowa" (pierwszy miesiąc, pełne saldo) — do podsumowań
  // i dokumentów. W kolejnych miesiącach odsetki maleją wraz z saldem.
  const monthlyInterestAmount = nominalLoanAmount * monthlyRate;
  const warnings: string[] = [];
  const infos: string[] = [];

  if (expectedMonthly > 0 && expectedMonthly > monthlyInterestAmount) {
    infos.push(
      "Oczekiwane wynagrodzenie inwestora przewyższa miesięczne odsetki — umowa nie przewiduje opłaty za ryzyko, więc wynagrodzenie inwestora stanowią wyłącznie odsetki i prowizja.",
    );
  }

  // JAWNE ostrzeżenie zamiast cichego balonowania: rata klienta nie pokrywa
  // nawet miesięcznych odsetek — niedopłata narasta co miesiąc do balonu.
  let warning: string | undefined;
  if (maxPayment < monthlyInterestAmount) {
    warning =
      "Rata nie pokrywa odsetek — saldo rośnie. Maksymalna rata klienta jest niższa niż miesięczne odsetki; niedopłata narasta co miesiąc i zostanie rozliczona w racie balonowej.";
    warnings.push(warning);
  }

  // info techniczne
  if (maxPayment > monthlyInterestAmount) {
    infos.push("Nadwyżka ponad odsetki pomniejsza kapitał bieżąco.");
  } else {
    infos.push("Kapitał będzie spłacany w racie balonowej.");
  }

  const rows: ScheduleRow[] = [];
  let remainingCapital = nominalLoanAmount;
  // skumulowane braki rozliczone w balonie
  let unpaidInterest = 0;

  for (let i = 1; i <= months; i++) {
    const rowDate = addMonths(payoutDate, i);

    // Odsetki za bieżący miesiąc — od AKTUALNEGO salda kapitału.
    const interestDue = remainingCapital * monthlyRate;

    // rozliczenie raty w kolejności: odsetki, kapitał
    let payment = maxPayment;
    const interestPaid = Math.min(payment, interestDue);
    payment -= interestPaid;
    const capitalPaid = Math.min(payment, remainingCapital);

    // niedopłacone odsetki trafiają do balonu
    unpaidInterest += interestDue - interestPaid;

    remainingCapital = Math.max(0, remainingCapital - capitalPaid);

    rows.push({
      index: i,
      date: rowDate,
      paymentAmount: round2(interestPaid + capitalPaid),
      capital: round2(capitalPaid),
      interest: round2(interestPaid),
      remainingCapital: round2(remainingCapital),
    });
  }

  // rata balonowa
  const balloonDate = addMonths(payoutDate, months);
  const balloonCapital = remainingCapital;
  const balloonInterest = Math.max(0, unpaidInterest);
  const balloonPayment = balloonCapital + balloonInterest;

  rows.push({
    index: "Balon",
    date: balloonDate,
    paymentAmount: round2(balloonPayment),
    capital: round2(balloonCapital),
    interest: round2(balloonInterest),
    remainingCapital: 0,
  });

  const sumOfRegularPayments = rows
    .slice(0, months)
    .reduce((a, r) => a + r.paymentAmount, 0);
  const totalClientObligation = round2(sumOfRegularPayments + balloonPayment);

  const totalInterest = rows.reduce((a, r) => a + r.interest, 0);
  const totalInvestorProfit = round2(totalInterest + commission);
  const annualizedInvestorProfitAmount = round2((totalInvestorProfit / months) * 12);
  const annualizedInvestorProfitPercent =
    net > 0 ? round2((annualizedInvestorProfitAmount / net) * 100) : 0;

  return {
    rows,
    nominalLoanAmount: round2(nominalLoanAmount),
    expectedMonthlyInvestorReturn: round2(expectedMonthly),
    monthlyInterestAmount: round2(monthlyInterestAmount),
    balloonPayment: round2(balloonPayment),
    totalClientObligation,
    totalInvestorProfit,
    annualizedInvestorProfitAmount,
    annualizedInvestorProfitPercent,
    warnings,
    infos,
    warning,
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

const COMMON_REQUIRED: Array<{ label: string; check: (p: ClientProfile) => boolean; critical?: boolean }> = [
  { label: "Cel pożyczki", check: (p) => !!p.borrowerData.loanPurpose },
  { label: "Telefon klienta", check: (p) => !!p.borrowerData.phone },
  { label: "E-mail klienta", check: (p) => !!p.borrowerData.email },
  { label: "Typ nieruchomości", check: (p) => !!p.propertyData.type, critical: true },
  { label: "Numer KW", check: (p) => !!p.propertyData.landRegisterNumber, critical: true },
  { label: "Wartość nieruchomości", check: (p) => !!p.propertyData.estimatedValue, critical: true },
  { label: "Zdjęcia / dokumenty nieruchomości", check: (p) => p.uploadedPhotos.length + p.uploadedDocuments.length > 0 },
  { label: "Dane inwestora", check: (p) => !!(p.investorData.fullName || p.investorData.companyName) },
  { label: "Rachunek inwestora", check: (p) => !!p.investorData.bankAccount },
  { label: "Kwota dla klienta", check: (p) => !!p.offerData.netAmountToClient, critical: true },
  { label: "Maksymalna miesięczna rata klienta", check: (p) => !!p.offerData.maxMonthlyPaymentByClient, critical: true },
  { label: "Okres pożyczki", check: (p) => !!p.offerData.loanTermMonths, critical: true },
  { label: "Data wypłaty", check: (p) => !!p.offerData.payoutDate, critical: true },
  { label: "Oczekiwane wynagrodzenie inwestora", check: (p) =>
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
  { label: "Rodzaj dokumentu tożsamości", check: (p: ClientProfile) => !!p.borrowerData.idDocument?.type },
  { label: "Numer dokumentu tożsamości", check: (p: ClientProfile) => !!p.borrowerData.idDocument?.number },
];

const COMPANY_REQUIRED = [
  { label: "Pełna nazwa spółki", check: (p: ClientProfile) => !!p.borrowerData.companyName, critical: true },
  { label: "NIP spółki", check: (p: ClientProfile) => !!p.borrowerData.nip, critical: true },
  { label: "REGON spółki", check: (p: ClientProfile) => !!p.borrowerData.regon },
  { label: "Adres siedziby", check: (p: ClientProfile) => !!p.borrowerData.registeredAddress },
  { label: "Sposób reprezentacji", check: (p: ClientProfile) => !!p.borrowerData.representationDescription },
  { label: "Imię osoby podpisującej", check: (p: ClientProfile) => !!p.representativeData?.firstName, critical: true },
  { label: "Nazwisko osoby podpisującej", check: (p: ClientProfile) => !!p.representativeData?.lastName, critical: true },
  { label: "Funkcja osoby podpisującej", check: (p: ClientProfile) => !!p.representativeData?.role },
  { label: "Dokument tożsamości reprezentanta", check: (p: ClientProfile) => !!p.representativeData?.idDocument?.number },
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
