// Zakres dostępu inwestora — JEDNO źródło prawdy dla panelu, strony
// marketingowej, bramek serwerowych i testów.
//
// Model (od 30 września 2026 r. — cennik abonamentowy):
//  • Inwestor płaci ABONAMENT za dostęp do systemu: 1 500 zł miesięcznie albo
//    7 000 zł za rok (rabat za płatność roczną liczony niżej). Płatność
//    jednorazowa za wybrany okres przez Tpay (przelew, BLIK) — bez podpinania
//    karty kredytowej i bez automatycznego odnawiania. Nie ma Pakietu PRO,
//    Opłaty Sukcesu ani opłaty za pojedynczy Projekt.
//  • Klient nadal płaci Prowizję od Pożyczkobiorcy (7% Kwoty
//    Udzielonej, min 5 000 zł, bez VAT), potrącaną z wypłaty —
//    patrz src/lib/contract-engine/fees.ts.
//  • Podstawa płatności: Regulamin Abonamentu Inwestora
//    (lib/legal/regulamin-abonamentu.ts; sprzedawca: Fundacja Krzewienia
//    Edukacji Finansowej im. Pieczaka, bez VAT). Umowa ramowa § 7 odsyła
//    do niego i nie przewiduje wynagrodzenia Finance You (kwoty w
//    src/lib/legal/dokumenty-1-0.ts, ABONAMENT_UMOWA). Sprzedaż: produkty
//    SUBSCRIPTION_OPTIONS[*].productCode w access_products (migracja
//    20260930140000), createAccessCheckout — abonament jest pierwszą bramką panelu, a akceptacja
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

/** Okres rozliczenia — przełącznik w cenniku. */
export type BillingPeriod = "rocznie";

export const SUBSCRIPTION_YEARLY_PLN = 7_000;
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
  rocznie: {
    period: "rocznie",
    label: "Rocznie",
    pricePln: SUBSCRIPTION_YEARLY_PLN,
    priceLabel: plnLabel(SUBSCRIPTION_YEARLY_PLN),
    periodLabel: "/ 12 miesięcy",
    days: 365,
    productCode: "investor_access_365d",
    hint: `Ok. ${plnLabel(SUBSCRIPTION_YEARLY_PER_MONTH_PLN)} miesięcznie w 12 ratach.`,
  },
};

/** Jedno zdanie o cenie — do opisów, FAQ, meta i promptów botów. */
export const SUBSCRIPTION_PRICE_SENTENCE = `Abonament inwestora — 12 miesięcy, ${plnLabel(SUBSCRIPTION_YEARLY_PLN)}`;

/** Jak się płaci — to samo zdanie wszędzie. */
export const SUBSCRIPTION_PAYMENT_SENTENCE =
  "Płacisz za wybrany okres przez Tpay — przelewem, BLIK-iem albo w ratach (także jako firma), bez konieczności podpinania karty kredytowej i bez automatycznego odnawiania.";

// ── Raty przy zakupie abonamentu ────────────────────────────────────────────
// Kanały ratalne są w bramce Tpay (włączone w Panelu Akceptanta): PragmaPay
// dla firm (3, 6, 9 albo 12 rat lub odroczenie o 14/30/60 dni), Raty Pekao,
// PayPo i Twisto dla osób prywatnych (TubaPay ukryty w formularzu od 28.10.2026).
// Kod nie wybiera kanału — klient wybiera go w bramce. Ratę na stronie
// liczymy orientacyjnie: cena / liczba rat, bez kosztów finansowania, które
// ustala dostawca.

/** Najdłuższy wariant rat dla firm w PragmaPay (Tpay). */
export const SUBSCRIPTION_MAX_INSTALLMENTS = 12;
/** Warianty rat PragmaPay dla firm. */
export const SUBSCRIPTION_INSTALLMENT_OPTIONS = [3, 6, 9, 12] as const;

/**
 * Orientacyjna rata: cena / liczba rat, do pełnej złotówki — tak samo jak
 * SUBSCRIPTION_YEARLY_PER_MONTH_PLN, żeby strona nie pokazywała dwóch kwot
 * (w tekstach zawsze z „ok.").
 */
export function installmentEstimatePln(pricePln: number, installments: number): number {
  if (!Number.isFinite(installments) || installments < 1) return pricePln;
  return Math.round(pricePln / installments);
}

/** Zastrzeżenie przy każdej orientacyjnej racie. */
export const SUBSCRIPTION_INSTALLMENT_NOTE =
  "Rata orientacyjna: cena podzielona przez liczbę rat. Dostępność rat, ostateczny harmonogram i ewentualny koszt finansowania określa dostawca (PragmaPay, Raty Pekao) po decyzji, przed zawarciem umowy.";

export interface TierPresentation {
  tier: InvestorTier;
  name: string;
  priceLabel: string;
  periodLabel: string;
  tagline: string;
  bullets: BenefitBullet[];
  note: string;
}

/**
 * Punkt oferty abonamentu. Formuła cecha → zaleta → korzyść to wyłącznie
 * rusztowanie do pisania tekstu — etykiet „Cecha", „Zaleta", „Korzyść" nigdy
 * nie pokazujemy na stronie. UI renderuje nazwę (cecha) jako nagłówek, a pod
 * nią jeden akapit: zaleta (wyciszona) + korzyść (wyróżniona).
 */
export interface BenefitBullet {
  /** Nazwa funkcji — nagłówek punktu (zgodna z nazwą modułu, jeśli ma stronę). */
  cecha: string;
  /** Co ta funkcja robi — pierwsza część akapitu. */
  zaleta: string;
  /** Co z tego masz ty — język korzyści, domyka akapit. */
  korzysc: string;
}

/** Jeden abonament inwestora — pełny dostęp. Do UI (panel + strona marketingowa). */
export const ACCESS_PRESENTATION: TierPresentation = {
  tier: "podstawowy",
  name: "Abonament inwestora",
  priceLabel: `${plnLabel(SUBSCRIPTION_YEARLY_PLN)} / 12 miesięcy`,
  periodLabel: "12 miesięcy · bez karty kredytowej",
  tagline:
    "Jeden abonament otwiera szkolenie i wszystkie narzędzia, a po bezpłatnej umowie ramowej — sprawy z ogólnopolskiej sieci sprzedaży. Prowizję Finance You płaci klient z wypłacanej kwoty, więc odsetki i Twoja prowizja w całości zostają u Ciebie.",
  // Kolejność (decyzja właściciela 28.10.2026): sieć sprzedaży, mentoring,
  // szkolenie, potem narzędzia w cyklu pożyczki.
  bullets: [
    {
      cecha: "Ogólnopolska sieć sprzedaży",
      zaleta:
        "Na zlecenie naszych klientów świadczymy usługi pośrednictwa finansowego, dostarczając rozwiązań dopasowanych do potrzeb i możliwości. Ty dostajesz sprawy z całej Polski, które mieszczą się w kwocie z Twojego Zlecenia kwoty.",
      korzysc: "Nie szukasz klientów i nie płacisz za reklamę.",
    },
    {
      cecha: "Indywidualny mentoring inwestora",
      zaleta:
        "Wspiera Cię inwestor z 15-letnim stażem w pożyczkach pod zastaw nieruchomości — przy pierwszych sprawach i decyzjach.",
      korzysc: "Nie jesteś sam — wspieramy Cię od początku do końca.",
    },
    {
      cecha: "Szkolenie inwestora",
      zaleta:
        "Serce abonamentu: 7 modułów — strategia, prawo, operacje, analiza nieruchomości i klienta, case study i windykacja — oparte na 15 latach doświadczenia.",
      korzysc: "Uczysz się na cudzym doświadczeniu, a nie na własnych błędach.",
    },
    {
      cecha: "Analityk AI",
      zaleta: "Ocena ryzyka A–E i wycena w ok. 15 minut — ponad 400 punktów danych i raport PDF.",
      korzysc: "Wiesz, co zabezpiecza Twój kapitał, zanim go wyłożysz.",
    },
    {
      cecha: "Kalkulator compliance",
      zaleta:
        "Od razu pokazuje zysk, ratę i harmonogram oraz ostrzega, gdy oprocentowanie przekracza odsetki maksymalne.",
      korzysc: "Łatwo pilnujesz limitu kosztów pożyczki.",
    },
    {
      cecha: "Kancelaria AI",
      zaleta:
        "Umowa pożyczki ze sprawdzonych klauzul i 30 wzorów — od aneksu po wniosek do komornika — z podpisem elektronicznym.",
      korzysc: "Oszczędzasz czas i koszt przygotowania dokumentów.",
    },
    {
      cecha: "Moduł AML/compliance",
      zaleta:
        "Screening list sankcyjnych i PEP, rejestr transakcji powyżej 15 000 EUR i wsparcie raportowania do GIIF.",
      korzysc: "Obowiązki sprawozdawcze wypełniasz w jednym miejscu, bez osobnego systemu.",
    },
    {
      cecha: "Windykator AI",
      zaleta:
        "Wszystkie procedury uruchamiasz jednym kliknięciem — od pierwszego upomnienia aż na biurko komornika, z pismami w Twoim imieniu.",
      korzysc: "Gotowy zestaw procedur i dokumentów na każdą okazję.",
    },
  ],
  note: SUBSCRIPTION_PAYMENT_SENTENCE,
};

/** Zgodność wsteczna dla miejsc iterujących po pakietach. */
export const TIER_PRESENTATION: Record<InvestorTier, TierPresentation> = {
  podstawowy: ACCESS_PRESENTATION,
};

export const FOUNDATION_SALES_EXPLANATION =
  "Dlaczego płacę Fundacji? Szkolenie i licencję na nasze systemy sprzedaje Fundacja Krzewienia Edukacji Finansowej im. Pieczaka — to jej działalność statutowa. Dochód z tej sprzedaży przeznaczamy na cele charytatywne (zbiórki na Siepomaga.pl).";
