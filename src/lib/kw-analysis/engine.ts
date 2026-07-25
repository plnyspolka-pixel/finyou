// Silnik analizy KW — deterministyczna orkiestracja.
//
// Kontrakt determinizmu: dla tego samego znormalizowanego snapshotu KW oraz tej
// samej wersji reguł i polityki wynik jest identyczny (bez Date.now/Math.random).
// Wejściowe `input.fetchedAt` przenosimy do wyniku; identyfikatory znalezisk
// pochodzą z licznika resetowanego na starcie analizy.

import { DEFAULT_RISK_POLICY, REPORT_DISCLAIMER, RULESET_VERSION, type RiskPolicy } from "./policy";
import { normalizeLandRegister, type KwDocumentSections } from "./normalize";
import { resolveMortgagePriority } from "./priority-resolver";
import { matchPartyToOwners, type IdentityMatch } from "./identity";
import { resetFindingSeq } from "./finding";
import { RULES, type RuleContext } from "./rules";
import {
  STATUS_SEVERITY,
  type FindingStatus,
  type KwAnalysisInput,
  type KwAnalysisResult,
  type LtvResult,
  type NormalizedLandRegister,
  type Party,
} from "./types";

// ── LTV / CLTV (spec §4). ────────────────────────────────────────────────────
export function computeLtv(
  input: KwAnalysisInput,
  nlr: NormalizedLandRegister,
  priority: ReturnType<typeof resolveMortgagePriority>,
  policy: RiskPolicy,
): LtvResult {
  const mortgageSumFromKw = nlr.mortgages
    .filter((m) => m.isActive && m.sum != null)
    .reduce<number | null>((acc, m) => (acc ?? 0) + (m.sum ?? 0), null);

  const cert = input.seniorCreditorCertificate ?? null;
  // Ekspozycja poprzedzająca: preferuj maks. ekspozycję (rewolwing), potem saldo.
  const seniorBalanceFromCertificate = cert
    ? cert.isRevolving
      ? (cert.maxPossibleExposure ?? null)
      : (cert.totalPayoffAmount ?? cert.outstandingPrincipal ?? null)
    : null;

  const value = input.acceptedPropertyValue ?? null;
  const rank = priority.expectedInvestorRank;

  // Dla pierwszego miejsca ekspozycja poprzedzająca = 0.
  let priorExposureForCltv: number | null = null;
  if (rank === 1 && priority.determinable) {
    priorExposureForCltv = 0;
  } else if (rank === 2) {
    // NIE używamy samej sumy hipoteki jako salda — potrzebne zaświadczenie.
    priorExposureForCltv = seniorBalanceFromCertificate;
  } else if (priority.effectivePriorEncumbrances.length > 0) {
    priorExposureForCltv = seniorBalanceFromCertificate;
  } else {
    priorExposureForCltv = 0;
  }

  if (value == null || value <= 0 || priorExposureForCltv == null) {
    return {
      determinable: false,
      mortgageSumFromKw,
      seniorBalanceFromCertificate,
      priorExposureForCltv,
      newLoanExposure: input.newLoanExposure,
      acceptedPropertyValue: value,
      cltv: null,
      maxCltv: policy.maxCltv,
      withinPolicy: null,
      note:
        value == null || value <= 0
          ? "Brak zaakceptowanej wartości nieruchomości — LTV/CLTV nieobliczalne (BRAK DANYCH)."
          : "Brak wiarygodnego salda długu poprzedzającego (zaświadczenie) — CLTV nieobliczalne.",
    };
  }

  const cltv = (priorExposureForCltv + input.newLoanExposure) / value;
  const withinPolicy = cltv <= policy.maxCltv;
  return {
    determinable: true,
    mortgageSumFromKw,
    seniorBalanceFromCertificate,
    priorExposureForCltv,
    newLoanExposure: input.newLoanExposure,
    acceptedPropertyValue: value,
    cltv,
    maxCltv: policy.maxCltv,
    withinPolicy,
    note:
      `Suma hipotek z KW: ${mortgageSumFromKw != null ? mortgageSumFromKw.toLocaleString("pl-PL") + " PLN" : "—"}; ` +
      `ekspozycja poprzedzająca do CLTV: ${priorExposureForCltv.toLocaleString("pl-PL")} PLN; ` +
      `nowa ekspozycja: ${input.newLoanExposure.toLocaleString("pl-PL")} PLN; ` +
      `wartość: ${value.toLocaleString("pl-PL")} PLN; CLTV = ${(cltv * 100).toFixed(1)}%.`,
  };
}

function collectParties(input: KwAnalysisInput): Party[] {
  const out: Party[] = [input.borrower, ...input.declaredCollateralProviders];
  if (input.futureBuyer) out.push(input.futureBuyer);
  return out;
}

function aggregateStatus(statuses: FindingStatus[]): FindingStatus {
  // Najpoważniejszy status wygrywa — pozytywne wpisy nie „przykrywają" blokera.
  let worst: FindingStatus = "BRAK_PROBLEMU";
  for (const s of statuses) {
    if (STATUS_SEVERITY[s] > STATUS_SEVERITY[worst]) worst = s;
  }
  return worst;
}

export interface RunKwAnalysisOptions {
  policy?: RiskPolicy;
  /** Nadpisanie znormalizowanego modelu (np. w testach). */
  normalized?: NormalizedLandRegister;
}

/**
 * Uruchamia pełną analizę KW z sekcji dostawcy (kw_documents) i danych wejścia.
 * Zwraca deterministyczny `KwAnalysisResult`.
 */
export function runKwAnalysis(
  input: KwAnalysisInput,
  sections: KwDocumentSections,
  opts: RunKwAnalysisOptions = {},
): KwAnalysisResult {
  resetFindingSeq();
  const policy = opts.policy ?? DEFAULT_RISK_POLICY;
  const nlr =
    opts.normalized ??
    normalizeLandRegister({
      ...sections,
      kwNumber: sections.kwNumber ?? input.kwNumber,
      fetchedAt: sections.fetchedAt ?? input.fetchedAt,
    });

  const priority = resolveMortgagePriority(nlr);
  const ltv = computeLtv(input, nlr, priority, policy);

  const identity: IdentityMatch[] = collectParties(input)
    .filter(
      (p) =>
        p.role === "BORROWER" ||
        p.role === "COLLATERAL_PROVIDER" ||
        p.role === "CURRENT_OWNER" ||
        p.role === "CO_OWNER",
    )
    .map((p) => matchPartyToOwners(p, nlr.owners));

  const ctx: RuleContext = { input, nlr, policy, priority, ltv, identity };

  const findings = RULES.flatMap((r) => {
    try {
      return r.run(ctx);
    } catch {
      // Reguła nie może wywrócić całej analizy — traktuj błąd jako brak znalezisk.
      return [];
    }
  });

  // Do wyniku globalnego liczą się tylko nierozwiązane znaleziska.
  const unresolved = findings.filter((f) => f.resolutionState === "UNRESOLVED");
  const overallStatus = aggregateStatus(unresolved.map((f) => f.status));

  return {
    kwNumber: nlr.meta.kwNumber || input.kwNumber,
    fetchedAt: input.fetchedAt,
    rulesetVersion: RULESET_VERSION,
    overallStatus,
    findings,
    priority,
    ltv,
    activeMentionCount: nlr.mentions.filter((m) => m.isActive).length,
    unresolvedFindingCount: unresolved.filter((f) =>
      ["STOP", "WSTRZYMANE", "WARUNKOWO_DOPUSZCZALNE"].includes(f.status),
    ).length,
    disclaimer: REPORT_DISCLAIMER,
    computedFrom: {
      ownersCount: nlr.owners.length,
      mortgagesCount: nlr.mortgages.length,
      sectionThreeCount: nlr.sectionThreeEntries.length,
    },
  };
}
