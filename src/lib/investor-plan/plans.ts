// Zakres dostępu inwestora — JEDNO źródło prawdy dla panelu, strony
// marketingowej, bramek serwerowych i testów.
//
// Model (od 30 września 2026 r. — cennik abonamentowy):
//  • Inwestor płaci ABONAMENT za dostęp do systemu: 1 500 zł miesięcznie albo
//    7 000 zł za rok (rabat za płatność roczną liczony niżej). Płatność
//    jednorazowa za wybrany okres przez Tpay (przelew, BLIK) — bez podpinania
//    karty kredytowej i bez automatycznego odnawiania. Nie ma Pakietu PRO,
//    Opłaty Sukcesu ani opłaty za pojedynczy Projekt.
//  • Klient nadal płaci Prowizję Klientowską Finance You (7 % Kwoty
//    Udzielonej, min 5 000 zł, bez VAT), potrącaną z wypłaty —
//    patrz src/lib/contract-engine/fees.ts.
//  • Podstawa: Umowa ramowa v7 § 7 (Opłata Abonamentowa — kwoty w
//    src/lib/legal/pakiet-v7.ts, ABONAMENT_UMOWA). Sprzedaż: produkty
//    SUBSCRIPTION_OPTIONS[*].productCode w access_products (migracja
//    20260930140000), createAccessCheckout po akceptacji Umowy ramowej.
//    Dostęp: SQL investor_has_full_access (RLS), requireInvestorPro,
//    submitInvestorOrder i InvestorSubscriptionGate w panelu.

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
  projekty: "Projekty dopasowane do przyjętego Zlecenia — bez opłat za Projekt",
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

/** Jeden poziom: abonament otwiera każdą funkcję (płatność sprawdza investor_has_full_access). */
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

// ── Abonament: cennik (jedno źródło prawdy dla strony, panelu i botów) ──────

/** Okres rozliczenia — przełącznik w cenniku. */
export type BillingPeriod = "miesiecznie" | "rocznie";

export const SUBSCRIPTION_MONTHLY_PLN = 1_500;
export const SUBSCRIPTION_YEARLY_PLN = 7_000;
/** Koszt roku przy płatności co miesiąc (12 × cena miesięczna). */
export const SUBSCRIPTION_YEAR_AT_MONTHLY_PLN = SUBSCRIPTION_MONTHLY_PLN * 12;
/** Oszczędność przy płatności rocznej względem 12 płatności miesięcznych. */
export const SUBSCRIPTION_YEARLY_SAVINGS_PLN =
  SUBSCRIPTION_YEAR_AT_MONTHLY_PLN - SUBSCRIPTION_YEARLY_PLN;
/** Rabat za płatność roczną w %, zaokrąglony W DÓŁ — nigdy nie zawyżamy. */
export const SUBSCRIPTION_YEARLY_DISCOUNT_PCT = Math.floor(
  (SUBSCRIPTION_YEARLY_SAVINGS_PLN / SUBSCRIPTION_YEAR_AT_MONTHLY_PLN) * 100,
);
/** Miesięczna równowartość abonamentu rocznego, do pełnej złotówki (w tekstach „ok."). */
export const SUBSCRIPTION_YEARLY_PER_MONTH_PLN = Math.round(SUBSCRIPTION_YEARLY_PLN / 12);

/** „7000" → „7 000 zł" (spacja nierozdzielająca; pl-PL nie grupuje liczb 4-cyfrowych). */
export function plnLabel(pln: number): string {
  return `${String(Math.round(pln)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")}\u00a0zł`;
}

export interface SubscriptionOption {
  period: BillingPeriod;
  /** Etykieta przełącznika. */
  label: string;
  pricePln: number;
  priceLabel: string;
  periodLabel: string;
  /** Liczba dni dostępu za jedną płatność. */
  days: number;
  /** Kod produktu w katalogu access_products (cena i liczba dni po stronie serwera). */
  productCode: string;
  /** Zdanie pod ceną: rabat albo zachęta do płatności rocznej. */
  hint: string;
}

export const SUBSCRIPTION_OPTIONS: Record<BillingPeriod, SubscriptionOption> = {
  miesiecznie: {
    period: "miesiecznie",
    label: "Miesięcznie",
    pricePln: SUBSCRIPTION_MONTHLY_PLN,
    priceLabel: plnLabel(SUBSCRIPTION_MONTHLY_PLN),
    periodLabel: "/ miesiąc",
    days: 30,
    productCode: "investor_access_30d",
    hint: `Płacisz za kolejny miesiąc, kiedy chcesz — bez zobowiązania na dłużej. Rok w tym trybie to ${plnLabel(SUBSCRIPTION_YEAR_AT_MONTHLY_PLN)}; przy płatności rocznej oszczędzasz ${plnLabel(SUBSCRIPTION_YEARLY_SAVINGS_PLN)} (${SUBSCRIPTION_YEARLY_DISCOUNT_PCT}% rabatu).`,
  },
  rocznie: {
    period: "rocznie",
    label: "Rocznie",
    pricePln: SUBSCRIPTION_YEARLY_PLN,
    priceLabel: plnLabel(SUBSCRIPTION_YEARLY_PLN),
    periodLabel: "/ rok",
    days: 365,
    productCode: "investor_access_365d",
    hint: `To ok. ${plnLabel(SUBSCRIPTION_YEARLY_PER_MONTH_PLN)} miesięcznie. Oszczędzasz ${plnLabel(SUBSCRIPTION_YEARLY_SAVINGS_PLN)} względem płatności co miesiąc (${plnLabel(SUBSCRIPTION_YEAR_AT_MONTHLY_PLN)}) — ${SUBSCRIPTION_YEARLY_DISCOUNT_PCT}% rabatu.`,
  },
};

/** Jedno zdanie o cenie — do opisów, FAQ, meta i promptów botów. */
export const SUBSCRIPTION_PRICE_SENTENCE = `${plnLabel(SUBSCRIPTION_MONTHLY_PLN)} miesięcznie albo ${plnLabel(SUBSCRIPTION_YEARLY_PLN)} za rok — przy płatności rocznej ${SUBSCRIPTION_YEARLY_DISCOUNT_PCT}% taniej (oszczędzasz ${plnLabel(SUBSCRIPTION_YEARLY_SAVINGS_PLN)})`;

/** Jak się płaci — to samo zdanie wszędzie. */
export const SUBSCRIPTION_PAYMENT_SENTENCE =
  "Płacisz jednorazowo za wybrany okres przez Tpay — przelewem albo BLIK-iem, bez konieczności podpinania karty kredytowej i bez automatycznego odnawiania.";

export interface TierPresentation {
  tier: InvestorTier;
  name: string;
  priceLabel: string;
  periodLabel: string;
  tagline: string;
  bullets: BenefitBullet[];
  note: string;
}

/** Punkt oferty w układzie Cecha → Zaleta → Korzyść. */
export interface BenefitBullet {
  /** Co dostajesz (nazwa funkcji). */
  cecha: string;
  /** Co ta funkcja robi. */
  zaleta: string;
  /** Co z tego masz ty — język korzyści. */
  korzysc: string;
}

/** Jeden abonament inwestora — pełny dostęp. Do UI (panel + strona marketingowa). */
export const ACCESS_PRESENTATION: TierPresentation = {
  tier: "podstawowy",
  name: "Abonament inwestora",
  priceLabel: `${plnLabel(SUBSCRIPTION_MONTHLY_PLN)} / mies. albo ${plnLabel(SUBSCRIPTION_YEARLY_PLN)} / rok`,
  periodLabel: `rocznie ${SUBSCRIPTION_YEARLY_DISCOUNT_PCT}% taniej · bez karty kredytowej`,
  tagline:
    "Jeden abonament otwiera wszystkie narzędzia: składasz Zlecenie, a my szukamy dla Ciebie Projektów. Cały zarobek z odsetek i Twojej prowizji zostaje u Ciebie — nie oddajesz części zysku i nie płacisz za Projekty, bo Prowizję Klientowską Finance You płaci Klient, potrącaną z wypłaty.",
  bullets: [
    {
      cecha: "Weryfikacja online",
      zaleta:
        "Dane, rachunek spłaty, KYC i screening sankcyjny załatwiasz zdalnie, w jednym procesie.",
      korzysc: "Zaczynasz inwestować bez wizyt i papierów.",
    },
    {
      cecha: "Akceptacja pakietu umów online",
      zaleta: "Komplet umów dostajesz na trwałym nośniku, a każda akceptacja ma ślad audytowy.",
      korzysc: "Formalności zamykasz bez spotkań i kuriera, z dowodem na wszystko.",
    },
    {
      cecha: "Zlecenia poszukiwania Projektów",
      zaleta: "Określasz kwotę, okres i minimalny zysk roczny.",
      korzysc: "Nie przeszukujesz ofert — to my szukamy Projektów dla Ciebie.",
    },
    {
      cecha: "Projekty dopasowane do Zlecenia",
      zaleta:
        "Każdy z raportem o inwestycji, harmonogramem zaakceptowanym przez Klienta i danymi kontaktowymi.",
      korzysc: "Dostajesz tylko oferty spełniające Twoje kryteria i szybko oceniasz, czy warto.",
    },
    {
      cecha: "Generator umowy pożyczki",
      zaleta: "Umowa wypełnia się uzgodnionymi warunkami i Twoimi danymi.",
      korzysc: "Oszczędzasz czas i koszty przygotowania dokumentów.",
    },
    {
      cecha: "Analityka nieruchomości",
      zaleta: "Księga wieczysta, właściciele, analiza KW i ocena ryzyka w jednym miejscu.",
      korzysc: "Decydujesz na podstawie danych, zanim wyłożysz pieniądze.",
    },
    {
      cecha: "Akademia inwestora i kalkulator compliance",
      zaleta: "Szkolenie od podstaw i sprawdzenie zgodności transakcji.",
      korzysc: "Inwestujesz pewnie, nawet jeśli zaczynasz bez doświadczenia.",
    },
    {
      cecha: "Moduł AML",
      zaleta: "Procedury, dokumentacja i zgłoszenia AML w jednym miejscu.",
      korzysc: "Obowiązki AML wypełniasz sprawnie, bez osobnego systemu.",
    },
    {
      cecha: "Moduł windykacji AI",
      zaleta: "Przypomnienia, wezwania i rejestr kontaktu z Klientem idą automatycznie.",
      korzysc: "Reagujesz na opóźnienie od pierwszego dnia, bez ręcznego monitowania.",
    },
    {
      cecha: "Pełne raporty bez limitu",
      zaleta: "Analizujesz każdy Projekt tak dokładnie, jak potrzebujesz.",
      korzysc: "Nie dopłacasz za kolejne raporty.",
    },
  ],
  note: SUBSCRIPTION_PAYMENT_SENTENCE,
};

/** Zgodność wsteczna dla miejsc iterujących po pakietach. */
export const TIER_PRESENTATION: Record<InvestorTier, TierPresentation> = {
  podstawowy: ACCESS_PRESENTATION,
};
