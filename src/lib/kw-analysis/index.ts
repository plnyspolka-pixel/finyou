// Publiczne API modułu „Analiza księgi wieczystej".
//
// Architektura (warstwy):
//   normalize.ts          adapter: sekcje kw_documents → NormalizedLandRegister
//   identity.ts           detektor rozbieżności klient↔właściciel (PESEL-first)
//   priority-resolver.ts  MortgagePriorityResolver — docelowe miejsce hipoteki
//   rules.ts              wersjonowany, deterministyczny katalog reguł
//   finding.ts            budowniczy znalezisk + katalog dokumentów
//   engine.ts             orkiestracja: LTV/CLTV + priorytet + reguły → wynik
//
// Katalog reguł: `src/lib/kw-analysis/rules.ts` (dodanie reguły = dopisanie
// obiektu do tablicy `RULES`).

export * from "./types";
export { DEFAULT_RISK_POLICY, RULESET_VERSION, REPORT_DISCLAIMER, type RiskPolicy } from "./policy";
export { normalizeLandRegister, type KwDocumentSections } from "./normalize";
export { resolveMortgagePriority } from "./priority-resolver";
export { matchPartyToOwners, type IdentityMatch, type IdentityMatchKind } from "./identity";
export { runKwAnalysis, computeLtv, type RunKwAnalysisOptions } from "./engine";
export { RULES, type Rule, type RuleContext } from "./rules";
export { DOCS } from "./finding";
