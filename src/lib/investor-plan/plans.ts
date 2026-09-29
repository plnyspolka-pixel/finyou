// Zakres dostępu inwestora — JEDNO źródło prawdy dla panelu, strony
// marketingowej, bramek serwerowych i testów.
//
// Model (wrzesień 2026, Umowa ramowa v7):
//  • Usługa Finance You dla Inwestora jest NIEODPŁATNA. Nie ma Pakietu PRO,
//    Opłaty Sukcesu ani opłaty za pojedynczą okazję. Inwestor przechodzi
//    pipeline (dane pożyczkodawcy → rachunek spłaty → KYC Didit → screening
//    sankcyjny → pakiet umów) i składa Zlecenie; Projekty dopasowane do
//    przyjętego Zlecenia widzi bez opłat, razem z raportem, harmonogramem
//    zaakceptowanym przez Klienta, danymi kontaktowymi i generatorem umowy.
//  • Jedyną opłatą w systemie jest Prowizja Klientowska Finance You
//    (7 % Kwoty Udzielonej, min 5 000 zł, bez VAT) obciążająca KLIENTA —
//    patrz src/lib/contract-engine/fees.ts.
//  • Abonament za dostęp do systemu — W PRZYSZŁOŚCI. Infrastruktura
//    access_products / access_entitlements zostaje; produkty inwestora są
//    nieaktywne, a `investor_tier()` zwraca zawsze 'podstawowy'.

/** Jedyny poziom dostępu inwestora. Typ zostaje dla zgodności sygnatur. */
export type InvestorTier = "podstawowy";

/** Kody produktów historycznych w katalogu `access_products` (nieaktywne). */
export const PRODUCT_PRO_180D = "investor_pro_180d";
export const PRODUCT_OKAZJA_UNLOCK = "investor_okazja_unlock";

/** Opłata sukcesu: ZNIESIONA (0 punktów bazowych). */
export const SUCCESS_FEE_BPS = 0;

/** Kwota opłaty sukcesu — zawsze 0 (funkcja zostaje dla rozliczeń historycznych). */
export function successFeeGrosz(_loanAmountPln: number, bps: number = SUCCESS_FEE_BPS): number {
  if (!Number.isFinite(bps) || bps <= 0) return 0;
  return 0;
}

export function successFeePln(loanAmountPln: number, bps: number = SUCCESS_FEE_BPS): number {
  return successFeeGrosz(loanAmountPln, bps) / 100;
}

// ── Zakres funkcji ──────────────────────────────────────────────────────────

export type InvestorFeature =
  | "zlecenia"
  | "kyc_screening"
  | "projekty"
  | "generator_umowy"
  | "raport_inwestycyjny"
  | "harmonogram_zaakceptowany"
  | "dane_kontaktowe"
  | "analityka"
  | "akademia"
  | "kalkulator_compliance"
  | "aml"
  | "windykacja_ai"
  | "raporty_bez_limitu";

export const FEATURE_LABELS: Record<InvestorFeature, string> = {
  zlecenia: "Składanie Zleceń poszukiwania Projektów",
  kyc_screening: "KYC (Didit) i screening list sankcyjnych",
  projekty: "Projekty dopasowane do przyjętego Zlecenia — bez opłat",
  generator_umowy: "Generator umowy pożyczki",
  raport_inwestycyjny: "Raport o inwestycji",
  harmonogram_zaakceptowany: "Harmonogram zaakceptowany przez Klienta",
  dane_kontaktowe: "Dane kontaktowe Klienta po akceptacji Karty Leada",
  analityka: "Analityka: KW, właściciele, analiza KW, ocena ryzyka",
  akademia: "Akademia inwestora",
  kalkulator_compliance: "Kalkulator compliance",
  aml: "Moduł AML",
  windykacja_ai: "Moduł windykacji AI",
  raporty_bez_limitu: "Nielimitowana liczba pełnych raportów",
};

/** Wszystkie funkcje — dostępne dla każdego zweryfikowanego inwestora. */
export const ALL_FEATURES: InvestorFeature[] = Object.keys(FEATURE_LABELS) as InvestorFeature[];

export const TIER_FEATURES: Record<InvestorTier, InvestorFeature[]> = {
  podstawowy: ALL_FEATURES,
};

/** Bez paywalli: każdy inwestor ma każdą funkcję. */
export function tierHasFeature(_tier: InvestorTier, feature: InvestorFeature): boolean {
  return ALL_FEATURES.includes(feature);
}

/** Najniższy (i jedyny) poziom dający daną funkcję. */
export function requiredTier(_feature: InvestorFeature): InvestorTier {
  return "podstawowy";
}

/** Okazji nie trzeba wykupywać — nigdy. */
export function needsUnlockPayment(_tier: InvestorTier): boolean {
  return false;
}

export interface TierPresentation {
  tier: InvestorTier;
  name: string;
  priceLabel: string;
  periodLabel: string;
  tagline: string;
  bullets: string[];
  note: string;
}

/** Jeden pakiet „Dostęp inwestora" — 0 zł. Do UI (panel + strona marketingowa). */
export const ACCESS_PRESENTATION: TierPresentation = {
  tier: "podstawowy",
  name: "Dostęp inwestora",
  priceLabel: "0 zł",
  periodLabel: "/ usługa nieodpłatna dla Inwestora",
  tagline:
    "Składasz Zlecenie, my szukamy Projektów. Nie płacisz nic — Prowizja Klientowska obciąża Klienta i jest potrącana z wypłaty.",
  bullets: [
    "Pełny pipeline: dane pożyczkodawcy, rachunek spłaty, KYC i screening sankcyjny",
    "Akceptacja pakietu umów online",
    "Składanie Zleceń poszukiwania Projektów",
    "Projekty dopasowane do Zlecenia: raport o inwestycji, harmonogram zaakceptowany przez Klienta i dane kontaktowe",
    "Generator umowy pożyczki",
    "Analityka: KW, właściciele, analiza KW, ocena ryzyka",
    "Akademia inwestora i kalkulator compliance",
    "Moduł AML i moduł windykacji AI",
    "Nielimitowana liczba pełnych raportów",
  ],
  note: "Usługa Finance You dla Inwestora jest nieodpłatna (Umowa ramowa § 2 i § 7). Abonament za dostęp do systemu jest planowany — wymagać będzie nowej wersji umowy.",
};

/** Zgodność wsteczna dla miejsc iterujących po pakietach. */
export const TIER_PRESENTATION: Record<InvestorTier, TierPresentation> = {
  podstawowy: ACCESS_PRESENTATION,
};
