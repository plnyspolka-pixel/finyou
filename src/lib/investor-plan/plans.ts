// Zakres dostępu inwestora — JEDNO źródło prawdy dla panelu, strony
// marketingowej, bramek serwerowych i testów.
//
// Model (od 30 września 2026 r. — cennik abonamentowy):
//  • Inwestor płaci ABONAMENT za dostęp do systemu: 7 000 zł za rok (365 dni).
//    Abonament miesięczny wycofany ze sprzedaży (decyzja właściciela
//    2026-10-06). Płatność jednorazowa przez Tpay (przelew, BLIK) — bez
//    podpinania karty kredytowej i bez automatycznego odnawiania. Nie ma Pakietu PRO,
//    Opłaty Sukcesu ani opłaty za pojedynczy Projekt.
//  • Klient nadal płaci Prowizję od Pożyczkobiorcy (5% Kwoty
//    Udzielonej, min 5 000 zł, bez VAT), potrącaną z wypłaty —
//    patrz src/lib/contract-engine/fees.ts.
//  • Podstawa płatności: Regulamin Abonamentu Inwestora
//    (lib/legal/regulamin-abonamentu.ts; sprzedawca: Fundacja Krzewienia
//    Edukacji Finansowej im. Pieczaka, bez VAT). Umowa ramowa v7 § 7 odsyła
//    do niego i nie przewiduje wynagrodzenia Finance You. Sprzedaż: produkt
//    SUBSCRIPTION_OPTIONS[*].productCode w access_products (migracje
//    20260930140000 i 20261006190000), createAccessCheckout — abonament jest pierwszą bramką panelu, a akceptacja
//    pakietu umów otwiera moduł ofert (decyzja właściciela 2026-09-30).
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

/** Okres rozliczenia — jedyny sprzedawany wariant to rok. */
export type BillingPeriod = "rocznie";

export const SUBSCRIPTION_YEARLY_PLN = 7_000;

/** „7000" → „7 000 zł" (spacja nierozdzielająca; pl-PL nie grupuje liczb 4-cyfrowych). */
export function plnLabel(pln: number): string {
  return `${String(Math.round(pln)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")}\u00a0zł`;
}

export interface SubscriptionOption {
  period: BillingPeriod;
  label: string;
  pricePln: number;
  priceLabel: string;
  periodLabel: string;
  /** Liczba dni dostępu za jedną płatność. */
  days: number;
  /** Kod produktu w katalogu access_products (cena i liczba dni po stronie serwera). */
  productCode: string;
  /** Zdanie pod ceną. */
  hint: string;
}

export const SUBSCRIPTION_OPTIONS: Record<BillingPeriod, SubscriptionOption> = {
  rocznie: {
    period: "rocznie",
    label: "Rocznie",
    pricePln: SUBSCRIPTION_YEARLY_PLN,
    priceLabel: plnLabel(SUBSCRIPTION_YEARLY_PLN),
    periodLabel: "/ rok",
    days: 365,
    productCode: "investor_access_365d",
    hint: "Rok pełnego dostępu (365 dni) za jedną płatność — bez automatycznego przedłużenia na kolejny okres.",
  },
};

/** Jedyny sprzedawany wariant abonamentu. */
export const SUBSCRIPTION_OPTION = SUBSCRIPTION_OPTIONS.rocznie;

/** Jedno zdanie o cenie — do opisów, FAQ, meta i promptów botów. */
export const SUBSCRIPTION_PRICE_SENTENCE = `${plnLabel(SUBSCRIPTION_YEARLY_PLN)} za rok (365 dni dostępu)`;

/** Jak się płaci — to samo zdanie wszędzie. */
export const SUBSCRIPTION_PAYMENT_SENTENCE =
  "Płacisz jednorazowo za rok z góry przez Tpay — przelewem albo BLIK-iem, bez konieczności podpinania karty kredytowej i bez automatycznego odnawiania.";

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
  priceLabel: `${plnLabel(SUBSCRIPTION_YEARLY_PLN)} / rok`,
  periodLabel: "365 dni dostępu · bez karty kredytowej",
  tagline:
    "Jeden abonament otwiera wszystkie narzędzia: składasz Zlecenie, a my szukamy dla Ciebie Projektów. Cały zarobek z odsetek i Twojej prowizji zostaje u Ciebie — nie oddajesz części zysku i nie płacisz za Projekty, bo Prowizję od Pożyczkobiorcy płaci Klient, potrącaną z wypłaty.",
  bullets: [
    {
      cecha: "Akademia inwestora",
      zaleta:
        "15 lat doświadczenia w jednym miejscu: strategia, prawo, analiza nieruchomości i klienta, transakcja, windykacja.",
      korzysc: "Nie uczysz się na własnych błędach.",
    },
    {
      cecha: "Wewnętrzna sieć sprzedaży",
      zaleta: "Korzystasz z naszej sieci sprzedaży i działasz pod sprawdzoną marką Finance You.",
      korzysc: "Nie szukasz klientów — to oni szukają Ciebie!",
    },
    {
      cecha: "Zaawansowany moduł analizy nieruchomości",
      zaleta:
        "Księga wieczysta, właściciele, obciążenia, wycena, LTV i ocena ryzyka — pełne raporty bez limitu.",
      korzysc: "Masz własnego, profesjonalnego analityka AI, zanim wyłożysz pieniądze.",
    },
    {
      cecha: "Kancelaria AI",
      zaleta:
        "30 wzorów dokumentów sprawdzonych w praktyce — od umowy pożyczki i hipoteki, przez wezwania i ugody, po wnioski do sądu i komornika — przygotowywanych jednym kliknięciem.",
      korzysc: "Oszczędzasz czas i koszty przygotowania dokumentów.",
    },
    {
      cecha: "Kalkulator compliance",
      zaleta:
        "Ustawiasz kwotę, oprocentowanie i prowizję, a kalkulator od razu pokazuje harmonogram i ostrzega o limitach odsetek maksymalnych.",
      korzysc: "Łatwo sprawdzisz, na ile możesz sobie pozwolić.",
    },
    {
      cecha: "Moduł AML",
      zaleta: "Procedury, dokumentacja i zgłoszenia AML w jednym miejscu.",
      korzysc: "Obowiązki AML wypełniasz sprawnie, bez osobnego systemu.",
    },
    {
      cecha: "Windykator AI",
      zaleta:
        "Dzwoni, pisze i przygotowuje wezwania. Prowadzi sprawę od pierwszego dnia opóźnienia — przypomnienia, ugoda, klauzula wykonalności — aż na biurko komornika.",
      korzysc: "Nie zostajesz sam z niespłaconą pożyczką.",
    },
  ],
  note: SUBSCRIPTION_PAYMENT_SENTENCE,
};

/** Zgodność wsteczna dla miejsc iterujących po pakietach. */
export const TIER_PRESENTATION: Record<InvestorTier, TierPresentation> = {
  podstawowy: ACCESS_PRESENTATION,
};
