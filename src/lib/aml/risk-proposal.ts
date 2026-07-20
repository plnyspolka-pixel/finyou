// Propozycja oceny ryzyka AML — czysta funkcja (używana w UI i na serwerze).
// System proponuje poziom, ale ostateczną decyzję podejmuje inwestor;
// każda ręczna zmiana wymaga uzasadnienia (constraint w bazie).
import type { AmlRiskLevel } from "@/lib/aml/aml-types";

export interface RiskFactorInput {
  pepStatus?: boolean | null;
  sanctionHit?: boolean | null;
  unresolvedScreeningHits?: number;
  countryResidence?: string | null;
  countryActivity?: string | null;
  crbrDiscrepancies?: number;
  cashTransactions?: boolean;
  missingBeneficialOwners?: boolean;
  financingPurposeProvided?: boolean;
  repaymentSourceProvided?: boolean;
}

export interface RiskFactor {
  factor: string;
  weight: number; // punkty ryzyka
  note?: string;
}

// Kraje podwyższonego ryzyka (lista FATF/UE — do okresowej aktualizacji).
const HIGH_RISK_COUNTRIES = new Set(["IR", "KP", "MM", "AF", "SY", "YE", "SS", "BY", "RU"]);

export interface RiskProposal {
  level: AmlRiskLevel;
  score: number;
  factors: RiskFactor[];
}

export function proposeRiskLevel(input: RiskFactorInput): RiskProposal {
  const factors: RiskFactor[] = [];
  const add = (factor: string, weight: number, note?: string) =>
    factors.push({ factor, weight, note });

  if (input.sanctionHit) add("Potwierdzone trafienie sankcyjne", 100, "Ryzyko nieakceptowalne");
  if ((input.unresolvedScreeningHits ?? 0) > 0)
    add(
      "Nierozstrzygnięte trafienia screeningu",
      40,
      `${input.unresolvedScreeningHits} trafień bez oceny`,
    );
  if (input.pepStatus) add("Status PEP", 30);
  const cr = (input.countryResidence ?? "PL").toUpperCase();
  const ca = (input.countryActivity ?? "PL").toUpperCase();
  if (HIGH_RISK_COUNTRIES.has(cr)) add("Kraj rezydencji podwyższonego ryzyka", 35, cr);
  else if (cr !== "PL") add("Rezydencja poza Polską", 10, cr);
  if (HIGH_RISK_COUNTRIES.has(ca)) add("Kraj działalności podwyższonego ryzyka", 35, ca);
  else if (ca !== "PL") add("Działalność poza Polską", 10, ca);
  if ((input.crbrDiscrepancies ?? 0) > 0)
    add("Rozbieżności CRBR", 20, `${input.crbrDiscrepancies} rozbieżności`);
  if (input.cashTransactions) add("Transakcje gotówkowe", 15);
  if (input.missingBeneficialOwners) add("Brak ustalonych beneficjentów rzeczywistych", 25);
  if (input.financingPurposeProvided === false) add("Brak celu finansowania", 10);
  if (input.repaymentSourceProvided === false) add("Brak źródła spłaty", 10);

  const score = factors.reduce((s, f) => s + f.weight, 0);
  let level: AmlRiskLevel = "low";
  if (input.sanctionHit || score >= 100) level = "unacceptable";
  else if (score >= 50) level = "high";
  else if (score >= 20) level = "standard";

  return { level, score, factors };
}
