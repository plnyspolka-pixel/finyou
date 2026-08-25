// ════════════════════════════════════════════════════════════════════
// PDF OFERTY INWESTORA z pełnym harmonogramem spłat — do pobrania.
//
// Jedno źródło prawdy dla matematyki: silnik umów (`buildEngineSchedule`,
// model Finance You — pełna wypłata, prowizja rozłożona na raty, odsetki od
// salda, balon = ostatnia rata). Harmonogram zapisany w ofercie pochodzi
// z tego samego silnika; gdy w starszej ofercie brakuje wierszy albo
// składnika prowizji, harmonogram jest odtwarzany silnikiem z parametrów
// oferty — nigdy inną ścieżką liczenia.
// ════════════════════════════════════════════════════════════════════

import { buildEngineSchedule } from "@/lib/contract-engine/loan-schedule";
import {
  buildLoanCalcPdfBlob,
  type LoanCalcPayload,
  type LoanCalcScheduleRow,
} from "@/lib/loan-calc-pdf";

/** Wiersz harmonogramu zapisany w `investor_offers.schedule` (jsonb). */
interface OfferScheduleRow {
  idx?: number;
  date?: string;
  rata?: number;
  kapital?: number;
  kap?: number;
  odsetki?: number;
  ods?: number;
  prowizja?: number;
  prow?: number;
  saldo?: number;
}

/** Pola oferty inwestora potrzebne do PDF (wiersz z `investor_offers`). */
export interface OfferForPdf {
  proposed_amount?: number | string | null;
  period_months?: number | string | null;
  expected_yearly_yield?: number | string | null;
  commission?: number | string | null;
  estimated_monthly_payment?: number | string | null;
  estimated_total_cost?: number | string | null;
  balloon_amount?: number | string | null;
  schedule?: OfferScheduleRow[] | null;
  created_at?: string | null;
  submitted_at?: string | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Buduje payload PDF oferty. Zwraca `null`, gdy w ofercie brakuje danych
 * krytycznych (kwota/okres) — wtedy nie ma czego drukować.
 */
export function buildOfferPdfPayload(offer: OfferForPdf): LoanCalcPayload | null {
  const amount = num(offer.proposed_amount);
  const months = Math.floor(num(offer.period_months));
  if (amount <= 0 || months <= 0) return null;

  const annualRate = num(offer.expected_yearly_yield);
  const commissionPln = num(offer.commission);

  // Harmonogram zapisany przy składaniu oferty (policzony silnikiem umów).
  const stored = Array.isArray(offer.schedule) ? offer.schedule : [];
  const storedComplete =
    stored.length > 0 &&
    stored.every(
      (r) =>
        (r.kapital ?? r.kap) != null &&
        (r.odsetki ?? r.ods) != null &&
        (commissionPln <= 0 || (r.prowizja ?? r.prow) != null),
    );

  let rows: LoanCalcScheduleRow[];
  if (storedComplete) {
    rows = stored.map((r, i) => ({
      idx: r.idx ?? i + 1,
      date: r.date ?? "",
      rata: r2(num(r.rata)),
      kap: r2(num(r.kapital ?? r.kap)),
      ods: r2(num(r.odsetki ?? r.ods)),
      prow: r2(num(r.prowizja ?? r.prow)),
      saldo: r2(num(r.saldo)),
    }));
  } else {
    // Starsza oferta bez pełnego harmonogramu — odtwarzamy go tym samym
    // silnikiem umów z parametrów oferty.
    const cap = num(offer.estimated_monthly_payment);
    const eng = buildEngineSchedule({
      kwotaPozyczki: amount,
      prowizja: commissionPln,
      annualRatePercent: annualRate,
      months,
      maxMonthlyPayment: cap > 0 ? cap : amount, // bez pułapu → pełna amortyzacja
      firstPaymentDate: (offer.submitted_at ?? offer.created_at ?? "").slice(0, 10) || null,
    });
    rows = eng.rows.map((r) => ({
      idx: r.nr,
      date: r.termin,
      rata: r.rata_razem,
      kap: r.kapital,
      ods: r.odsetki,
      prow: r.prowizja,
      saldo: r.saldo,
    }));
  }

  const totalToRepay = r2(rows.reduce((a, r) => a + r.rata, 0));
  const totalInterest = r2(rows.reduce((a, r) => a + r.ods, 0));
  const last = rows[rows.length - 1];
  const regular = rows.length > 1 ? rows[0].rata : (last?.rata ?? 0);
  const balloon =
    num(offer.balloon_amount) > 0
      ? num(offer.balloon_amount)
      : last && last.rata > regular + 2
        ? last.rata
        : 0;
  const security = Math.round(totalToRepay * 2);

  return {
    v: 1,
    generatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    onHand: Math.round(amount),
    nominal: Math.round(amount),
    months,
    annualRate,
    commissionPct: amount > 0 ? r2((commissionPln / amount) * 100) : 0,
    commissionPln: Math.round(commissionPln),
    financeYouFeePct: 0,
    financeYouFeePln: 0,
    monthlyPayment: r2(num(offer.estimated_monthly_payment) || regular),
    balloon: r2(balloon),
    totalInterest,
    totalCost: r2(num(offer.estimated_total_cost) || totalInterest + commissionPln),
    totalToRepay,
    mortgageAmount: security,
    art777Amount: security,
    title: "FINANCE YOU - OFERTA POZYCZKI (PELNY HARMONOGRAM SPLAT)",
    schedule: rows,
  };
}

/** Pobiera PDF oferty (pełny harmonogram spłat) w przeglądarce. */
export function downloadOfferPdf(offer: OfferForPdf): boolean {
  const payload = buildOfferPdfPayload(offer);
  if (!payload) return false;
  const blob = buildLoanCalcPdfBlob(payload);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `oferta-pozyczki-${payload.onHand}-${payload.months}m.pdf`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
