// Polityka ryzyka Finance You dla analizy KW — konfigurowalna, wersjonowana.
// Parametry NIE są rozrzucone po komponentach UI (spec §„Katalog realnych
// ryzyk"): silnik reguł czyta je stąd.

export interface RiskPolicy {
  /** Maksymalne łączne obciążenie (CLTV) względem zaakceptowanej wartości. */
  maxCltv: number;
  /** Najdalsze dopuszczalne miejsce hipoteki inwestora (3. i dalsze = STOP). */
  maxAcceptableRank: number;
  /** Czy drugie miejsce jest w ogóle dopuszczalne (warunkowo). */
  allowSecondRank: boolean;
  /** Dożywocie: „STOP" czy „WSTRZYMANE" (ręczna decyzja prawna). */
  lifeEstateStatus: "STOP" | "WSTRZYMANE";
  /** Służebność osobista mieszkania: „STOP" czy „WSTRZYMANE". */
  personalEasementStatus: "STOP" | "WSTRZYMANE";
}

export const DEFAULT_RISK_POLICY: RiskPolicy = {
  maxCltv: 0.5,
  maxAcceptableRank: 2,
  allowSecondRank: true,
  lifeEstateStatus: "STOP",
  personalEasementStatus: "WSTRZYMANE",
};

/**
 * Wersja zestawu reguł. Zmieniaj przy każdej zmianie logiki/treści reguł —
 * wynik analizy jest deterministyczny w obrębie (snapshot KW × wersja reguł).
 */
export const RULESET_VERSION = "kw-analysis@1.0.0";

export const REPORT_DISCLAIMER =
  "Raport jest automatyczną analizą treści księgi wieczystej według polityki " +
  "ryzyka Finance You. Wskazuje wpisy mogące wpływać na zabezpieczenie i " +
  "dokumenty wymagające weryfikacji. Nie zastępuje decyzji inwestora, analizy " +
  "dokumentów źródłowych, czynności notariusza ani indywidualnej opinii prawnej.";
