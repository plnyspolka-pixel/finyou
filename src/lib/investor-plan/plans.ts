// Cennik i zakres pakietów inwestora — JEDNO źródło prawdy dla panelu,
// strony marketingowej, bramek serwerowych i testów.
//
// Model (wrzesień 2026):
//  • PODSTAWOWY — 0 zł. Inwestor przechodzi pipeline (dane pożyczkodawcy →
//    rachunek spłaty → KYC Didit → screening sankcyjny → pakiet umów) i składa
//    Zlecenie poszukiwania okazji. Znalezioną okazję kupuje pojedynczo:
//    wyłączność na zdecydowanego klienta + raport o inwestycji + zaakceptowany
//    przez pożyczkobiorcę harmonogram + dane kontaktowe + generator umowy.
//  • PRO — 3 000 zł / 6 miesięcy + 5% od kwoty udzielonej pożyczki. To samo co
//    w Podstawowym, bez opłat za pojedyncze okazje, plus Akademia inwestora,
//    kalkulator compliance, moduł AML, windykacja AI, nielimitowane pełne
//    raporty i pierwszeństwo wyboru ofert.
//
// UWAGA PRAWNA: opłata sukcesu 5% wymaga Umowy ramowej w wersji v6 (§ 7
// dopuszcza odpłatność Pakietu PRO). Dla v5 usługa jest dla Inwestora
// nieodpłatna — patrz docs/cennik-inwestora.md.

export type InvestorTier = "podstawowy" | "pro";

/** Kody produktów w katalogu `access_products`. */
export const PRODUCT_PRO_180D = "investor_pro_180d";
export const PRODUCT_OKAZJA_UNLOCK = "investor_okazja_unlock";

/** Pakiet PRO: 3 000 zł brutto za 180 dni (6 miesięcy). */
export const PRO_PRICE_GROSZ = 300_000;
export const PRO_DURATION_DAYS = 180;

/** Opłata sukcesu PRO: 5% kwoty udzielonej pożyczki (punkty bazowe). */
export const SUCCESS_FEE_BPS = 500;

/** Pakiet Podstawowy: cena odblokowania jednej okazji (brutto). */
export const UNLOCK_PRICE_GROSZ = 150_000;

/** 5% od kwoty udzielonej pożyczki, zaokrąglone do pełnych groszy. */
export function successFeeGrosz(loanAmountPln: number, bps: number = SUCCESS_FEE_BPS): number {
  if (!Number.isFinite(loanAmountPln) || loanAmountPln <= 0) return 0;
  if (!Number.isFinite(bps) || bps <= 0) return 0;
  return Math.round((loanAmountPln * 100 * bps) / 10_000);
}

/** 5% od kwoty udzielonej pożyczki w złotych (2 miejsca po przecinku). */
export function successFeePln(loanAmountPln: number, bps: number = SUCCESS_FEE_BPS): number {
  return successFeeGrosz(loanAmountPln, bps) / 100;
}

// ── Zakres funkcji ──────────────────────────────────────────────────────────

export type InvestorFeature =
  | "zlecenia"
  | "kyc_screening"
  | "okazja_platna"
  | "generator_umowy"
  | "raport_inwestycyjny"
  | "harmonogram_zaakceptowany"
  | "dane_kontaktowe"
  | "akademia"
  | "kalkulator_compliance"
  | "aml"
  | "windykacja_ai"
  | "raporty_bez_limitu"
  | "pierwszenstwo_ofert";

export const FEATURE_LABELS: Record<InvestorFeature, string> = {
  zlecenia: "Składanie Zleceń poszukiwania okazji",
  kyc_screening: "KYC (Didit) i screening list sankcyjnych",
  okazja_platna: "Zakup okazji na wyłączność (opłata za okazję)",
  generator_umowy: "Generator umowy pożyczki",
  raport_inwestycyjny: "Raport o inwestycji",
  harmonogram_zaakceptowany: "Harmonogram zaakceptowany przez pożyczkobiorcę",
  dane_kontaktowe: "Dane kontaktowe pożyczkobiorcy",
  akademia: "Akademia inwestora",
  kalkulator_compliance: "Kalkulator compliance",
  aml: "Moduł AML",
  windykacja_ai: "Moduł windykacji AI",
  raporty_bez_limitu: "Nielimitowana liczba pełnych raportów",
  pierwszenstwo_ofert: "Pierwszeństwo wyboru ofert",
};

/** Funkcje bazowe — dostępne w każdym pakiecie (także darmowym). */
const BASE_FEATURES: InvestorFeature[] = [
  "zlecenia",
  "kyc_screening",
  "okazja_platna",
  "generator_umowy",
  "raport_inwestycyjny",
  "harmonogram_zaakceptowany",
  "dane_kontaktowe",
];

/** Funkcje wyłącznie dla PRO. */
export const PRO_ONLY_FEATURES: InvestorFeature[] = [
  "akademia",
  "kalkulator_compliance",
  "aml",
  "windykacja_ai",
  "raporty_bez_limitu",
  "pierwszenstwo_ofert",
];

export const TIER_FEATURES: Record<InvestorTier, InvestorFeature[]> = {
  podstawowy: BASE_FEATURES,
  pro: [...BASE_FEATURES, ...PRO_ONLY_FEATURES],
};

export function tierHasFeature(tier: InvestorTier, feature: InvestorFeature): boolean {
  return TIER_FEATURES[tier].includes(feature);
}

/** Najniższy pakiet, który daje daną funkcję. */
export function requiredTier(feature: InvestorFeature): InvestorTier {
  return PRO_ONLY_FEATURES.includes(feature) ? "pro" : "podstawowy";
}

/** Czy okazję trzeba wykupić osobno (Podstawowy), czy jest w pakiecie (PRO). */
export function needsUnlockPayment(tier: InvestorTier): boolean {
  return tier !== "pro";
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

/** Opis pakietów do UI (panel + strona marketingowa) — bez duplikowania tekstów. */
export const TIER_PRESENTATION: Record<InvestorTier, TierPresentation> = {
  podstawowy: {
    tier: "podstawowy",
    name: "Podstawowy",
    priceLabel: "0 zł",
    periodLabel: "/ konto bez opłat stałych",
    tagline: "Składasz Zlecenie, my szukamy okazji. Płacisz tylko za okazję, którą bierzesz.",
    bullets: [
      "Pełny pipeline: dane pożyczkodawcy, rachunek spłaty, KYC i screening sankcyjny",
      "Automatyczne wypełnienie i podpisanie pakietu umów",
      "Składanie Zleceń poszukiwania okazji",
      "Zakup okazji na wyłączność: zdecydowany klient, raport o inwestycji, harmonogram zaakceptowany przez pożyczkobiorcę i dane kontaktowe",
      "Generator umowy pożyczki",
    ],
    note: "Opłata za odblokowanie pojedynczej okazji zgodnie z aktualnym cennikiem w panelu.",
  },
  pro: {
    tier: "pro",
    name: "PRO",
    priceLabel: "3 000 zł",
    periodLabel: "/ 6 miesięcy + 5% od udzielonej pożyczki",
    tagline: "Wszystko z pakietu Podstawowego bez opłat za okazje, plus pełny warsztat inwestora.",
    bullets: [
      "Wszystko z pakietu Podstawowego — okazje bez opłat jednostkowych",
      "Akademia inwestora",
      "Kalkulator compliance",
      "Moduł AML",
      "Moduł windykacji AI",
      "Nielimitowana liczba pełnych raportów",
      "Pierwszeństwo wyboru ofert",
    ],
    note: "3 000 zł brutto za 180 dni dostępu oraz 5% kwoty udzielonej pożyczki płatne po jej uruchomieniu.",
  },
};
