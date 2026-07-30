// ════════════════════════════════════════════════════════════════════
// DETERMINISTYCZNE mapowanie danych kalkulacji pożyczki na pola wzoru.
//
// Jedno źródło prawdy używane i po stronie klienta (Kreator dokumentów),
// i po stronie serwera (operatorski Kreator pożyczki). Bez AI — kwoty, okres,
// oprocentowanie, daty, hipoteka i art. 777 trafiają wprost z kalkulacji.
// ════════════════════════════════════════════════════════════════════

import {
  calculatorValueForField,
  type CalculatorOutputs,
  type DocField,
} from "@/lib/document-fields";
import { amountToWordsPLN } from "@/lib/amount-to-words-pl";
import type { LoanCalcPayload } from "@/lib/loan-calc-pdf";

const plNum = (n: number) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Math.round((Number(n) || 0) * 100) / 100,
  );

/**
 * Zwraca mapę wartości pól (indeks wystąpienia → wartość) z kalkulacji.
 * Hipoteka i art. 777 mają WŁASNE kwoty (nie są dobierane z kwot pożyczki).
 */
export function buildCalcFieldValues(
  fields: DocField[],
  p: LoanCalcPayload,
): Record<string, string> {
  const outputs: CalculatorOutputs = {
    nominal: p.nominal,
    net: p.onHand,
    commission: p.commissionPln,
    total: p.totalToRepay,
    annualInterestPercent: p.annualRate,
    months: p.months,
    payoutDateDDMM: p.agreementDate ?? "",
  };
  const out: Record<string, string> = {};
  for (const f of fields) {
    const k = f.key.toLowerCase();
    let val: string | null = null;
    if (f.semantic === "amount" || f.semantic === "amountWords") {
      if (/hipotek/.test(k)) {
        val =
          f.semantic === "amountWords"
            ? amountToWordsPLN(p.mortgageAmount)
            : plNum(p.mortgageAmount);
      } else if (/777/.test(k)) {
        val =
          f.semantic === "amountWords" ? amountToWordsPLN(p.art777Amount) : plNum(p.art777Amount);
      } else {
        val = calculatorValueForField(f, outputs);
      }
    } else if (f.semantic === "date") {
      if (p.agreementDate && /umow|zawar|wypłat|wyplat/.test(k)) val = p.agreementDate;
    } else {
      val = calculatorValueForField(f, outputs);
    }
    if (val != null && val !== "") out[f.id] = val;
  }
  return out;
}
