import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/shell";
import {
  Section,
  SectionHead,
  FeatureGrid,
  FAQ,
  ComplianceNote,
  CTASection,
  type FeatureItemData,
  type FAQItem,
} from "@/components/marketing/sections";
import { MktBadge, MktButton, Eyebrow } from "@/components/marketing/primitives";
import { BrandIcon } from "@/components/marketing/brand-icon";
import { TwoColSlider, SmartOfferSlider, type TwoColSlide } from "@/components/marketing/sliders";
import { InvestorPricing } from "@/components/marketing/investor-pricing";
import {
  SUBSCRIPTION_MONTHLY_PLN,
  SUBSCRIPTION_PAYMENT_SENTENCE,
  SUBSCRIPTION_PRICE_SENTENCE,
  SUBSCRIPTION_YEARLY_DISCOUNT_PCT,
  SUBSCRIPTION_YEARLY_PLN,
  SUBSCRIPTION_INSTALLMENT_NOTE,
  SUBSCRIPTION_MAX_INSTALLMENTS,
  installmentEstimatePln,
  plnLabel,
} from "@/lib/investor-plan/plans";
import { ChatWidget } from "@/components/landing/chat-widget";
import { LoanCalculator } from "@/components/loan-calculator";
import { ExampleProjectsSection } from "@/components/landing/example-projects-section";
import { ModuleCards } from "@/components/marketing/investor-module-ui";
import { INVESTOR_MODULES } from "@/components/marketing/investor-modules";
import { faqPageLd } from "@/lib/seo/company";
import { TERMS } from "@/lib/labels";
import { listAccessProducts } from "@/lib/access/state.functions";
import type { AccessProduct } from "@/lib/access/core";
import { getLandingInvestorVideo } from "@/lib/landing-video.functions";
import { FreeMaterialsSection } from "@/components/marketing/free-materials";
import { EMPTY_FREE_MATERIALS, type FreeMaterials } from "@/lib/lead-magnets/free-materials";
import { getFreeMaterialsFn } from "@/lib/lead-magnets/free-materials.functions";
import {
  LANDING_INVESTOR_VIDEO,
  LANDING_INVESTOR_VIDEO_HEYGEN_EMBED_URL,
  type LandingVideoInfo,
} from "@/lib/landing-video";

const JOIN = "/rejestracja?role=inwestor";
// Kotwica sekcji Cennik (w układzie zakładek — zakładki, patrz INVESTOR_TABS)
// — cel złotego CTA w hero, przycisku w nagłówku i paska przyklejonego.
const PRICING_HASH = "#cennik";

// Układ one-pagera: filmy w hero, siatki z ikonami, cennik, FAQ i CTA — sekcje
// jedna pod drugą, bez paska zakładek. Poniższe elementy są SCHOWANE, nie
// usunięte: kod, dane i importy zostają, a każdą sekcję przywraca jedna flaga.
const SHOW: Record<
  | "zakladki"
  | "kalkulator"
  | "oferty"
  | "pipeline"
  | "system"
  | "akademia"
  | "ochrona"
  | "windykacja"
  | "moduly"
  | "prezentacja",
  boolean
> = {
  zakladki: false, // pasek zakładek zamiast sekcji jedna pod drugą
  kalkulator: true, // podgląd zysku (kalkulator w trybie marketingPreview) pod hero
  oferty: false, // przykładowe projekty
  pipeline: false, // oś dziewięciu kroków onboardingu
  system: false, // pokaz slajdów „Inteligentny system"
  akademia: true, // Szkolenie inwestora — produkt główny, zaraz pod hero
  ochrona: false, // pokaz slajdów „7 warstw ochrony"
  windykacja: false, // pokaz slajdów windykacji AI
  moduly: true, // karty modułów prowadzące do podstron /dla-inwestora/<moduł>
  prezentacja: false, // „Kompleksowa prezentacja” pod modułami — wrócić, gdy film dostanie kadr tytułowy (poster)
};

// Film w hero — prezenter z naszego pliku w Storage (src/lib/landing-video.ts).
// Dopóki kopii nie ma (panel /admin/materialy → „Film na landingu inwestora"),
// zapasowo gra odtwarzacz HeyGen (bez reakcji i komentarzy). Długa
// „Kompleksowa prezentacja” nie ma kadru tytułowego (pokazywała czarne pole
// 0:00), więc jest schowana za SHOW.prezentacja.
const PRESENTATION_VIDEO_URL =
  "https://jqvepxhulxdnbwbogkhe.supabase.co/storage/v1/object/public/studio-media/marketing-materials/Finance You - Kompleksowa Prezentacja (Merged)_1080p_caption (2).mp4";
const PRESENTATION_VIDEO_TITLE = "Finance You — kompleksowa prezentacja";
const HERO_VIDEO_TITLE = LANDING_INVESTOR_VIDEO.title;

// Adres kopii filmu w Storage — null, gdy kopii jeszcze nie ma albo Storage
// nie odpowiada (wtedy odtwarzacz HeyGen). Odporne na brak środowiska w SSR.
async function loadLandingVideo(): Promise<LandingVideoInfo | null> {
  try {
    return await getLandingInvestorVideo();
  } catch {
    return null;
  }
}

// Cennik pobierany z zaufanego katalogu access_products (te same ceny co panel).
// Odporne na brak bazy podczas SSR — wtedy pokazujemy statyczny fallback.
async function loadInvestorProducts(): Promise<AccessProduct[]> {
  try {
    return await listAccessProducts({ data: { audience: "investor" } });
  } catch (e) {
    console.error("[dla-inwestora] listAccessProducts failed", e);
    return [];
  }
}

// Dział „Darmowe materiały” – opublikowane lead magnety inwestora. Bez bazy
// w SSR sekcja się nie renderuje, reszta strony bez zmian.
async function loadFreeMaterials(): Promise<FreeMaterials> {
  try {
    return await getFreeMaterialsFn({ data: { audience: "inwestor" } });
  } catch (e) {
    console.error("[dla-inwestora] getFreeMaterialsFn failed", e);
    return EMPTY_FREE_MATERIALS("inwestor");
  }
}

// Sekcja projektów pokazuje wyłącznie wygenerowane przykłady (ilustracja) — bez danych z bazy.
// Kroki pipeline'u pokazywane na stronie — ta sama kolejność co w panelu
// (src/lib/investor-plan/pipeline.ts).
const PIPELINE_STEPS: { n: number; t: string; d: string; hue: number }[] = [
  {
    n: 1,
    t: "Dane inwestora",
    d: "Osoba fizyczna, JDG albo spółka. Dla firm dane pobieramy z GUS i KRS po NIP, REGON lub numerze KRS.",
    hue: 262,
  },
  {
    n: 2,
    t: "Rachunek do spłaty",
    d: "Obowiązkowy numer NRB/IBAN, na który pożyczkobiorca spłaca pożyczkę. Trafia do umowy i harmonogramu.",
    hue: 217,
  },
  {
    n: 3,
    t: "Weryfikacja tożsamości",
    d: "Zdalne KYC — dokument i selfie, bez wizyty i bez papierów.",
    hue: 190,
  },
  {
    n: 4,
    t: "Screening list sankcyjnych",
    d: "Sankcje, PEP i listy ostrzegawcze sprawdzamy u wyspecjalizowanego dostawcy — to osobne badanie niż KYC.",
    hue: 160,
  },
  {
    n: 5,
    t: "Doręczenie pakietu",
    d: "Komplet dokumentów na trwałym nośniku e-mailem, zanim cokolwiek podpiszesz.",
    hue: 130,
  },
  {
    n: 6,
    t: "Umowy wypełnione przez system",
    d: "Komparycję umowy ramowej, NDA i umowy RODO wypełniamy Twoimi zweryfikowanymi danymi.",
    hue: 86,
  },
  {
    n: 7,
    t: "Podpis i akceptacja",
    d: "Forma dokumentowa z pełnym śladem audytowym: wersja, skrót SHA-256, czas, IP i urządzenie.",
    hue: 48,
  },
  {
    n: 8,
    t: "Dokumenty przypisane do konta",
    d: "Komplet zostaje przy Tobie w panelu i w potwierdzeniach e-mail — zawsze pod ręką.",
    hue: 28,
  },
  {
    n: 9,
    t: "Zlecenie poszukiwania Projektów",
    d: "Podajesz tylko maksymalną kwotę Finansowania. Od tego momentu szukamy dla Ciebie.",
    hue: 8,
  },
];

export const Route = createFileRoute("/dla-inwestora")({
  loader: async () => {
    const [products, video, materials] = await Promise.all([
      loadInvestorProducts(),
      loadLandingVideo(),
      loadFreeMaterials(),
    ]);
    return { products, video, materials };
  },
  head: () => ({
    meta: [
      {
        title: "Zostań partnerem Finance You — szkolenie i narzędzia inwestora",
      },
      {
        name: "description",
        content: `Zostań partnerem Finance You: szkolenie inwestora i narzędzia w abonamencie ${plnLabel(SUBSCRIPTION_MONTHLY_PLN)}/mies. albo ${plnLabel(SUBSCRIPTION_YEARLY_PLN)}/rok (rocznie ${SUBSCRIPTION_YEARLY_DISCOUNT_PCT}% taniej), także w ratach. Pożyczki dla firm zabezpieczone hipoteką (LTV do 60%).`,
      },
      { property: "og:title", content: "Zostań partnerem Finance You" },
      {
        property: "og:description",
        content:
          "Szkolenie inwestora i narzędzia w jednym abonamencie: ocena ryzyka A–E w ok. 15 minut, umowy, AML i windykacja. BONUS: raty i Projekty z ogólnopolskiej sieci sprzedaży.",
      },
      { property: "og:url", content: "https://financeyou.pl/dla-inwestora" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/dla-inwestora" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(faqPageLd(FAQ_ALL.map((f) => ({ question: f.q, answer: f.a })))),
      },
    ],
  }),
  component: InvestorLanding,
});

// Korzyści modelu współpracy — tylko to, czego nie opisują karty modułów ani
// cennik: dopływ Projektów, rezerwacja, kontakt z klientem, harmonogram,
// formalności i model kosztów. Bez cen (są w cenniku) i bez list funkcji
// modułów. Fakty (rezerwacja, Karta Leada) muszą zgadzać się z FAQ_ALL niżej.
const BENEFITS: FeatureItemData[] = [
  {
    icon: "access",
    t: "Projekty trafiają do Ciebie",
    d: "W Zleceniu podajesz tylko maksymalną kwotę, a my przedstawiamy Ci Projekty firm z całej Polski, które się w niej mieszczą. Nie szukasz klientów sam.",
  },
  {
    icon: "procedures",
    t: "Decydujesz bez pośpiechu",
    d: "Projekt rezerwujesz na 24 h i raz możesz przedłużyć rezerwację o 12 h. W tym czasie nie trafia do innych inwestorów.",
  },
  {
    icon: "chat",
    t: "Rozmawiasz z klientem bezpośrednio",
    d: "Po akceptacji Karty Leada dostajesz dane kontaktowe klienta. Warunki negocjujesz sam, bez pośrednika w rozmowie.",
  },
  {
    icon: "status",
    t: "Spłaty znasz z góry",
    d: "Harmonogram zaakceptowany przez klienta widzisz, zanim wyłożysz kapitał. Klient spłaca bezpośrednio na Twój rachunek.",
  },
  {
    icon: "shieldcheck",
    t: "Formalności raz i zdalnie",
    d: "Weryfikację tożsamości przechodzisz online, a umowy z Finance You system wypełnia Twoimi danymi. Bez wizyt i papierów.",
  },
  {
    icon: "loan",
    t: "Odsetki i prowizja w całości dla Ciebie",
    d: "Płacisz stały abonament, bez opłat za Projekt i bez opłaty sukcesu. Prowizję Finance You płaci klient z wypłacanej kwoty, więc odsetki i Twoja prowizja w całości trafiają do Ciebie.",
  },
];

const AKADEMIA: TwoColSlide[] = [
  {
    src: "/marketing/akademia/modul-1.png",
    etap: "Moduł 1",
    short: "Wprowadzenie",
    title: "Wprowadzenie i strategia",
    desc: "Poznaj zasady działania rynku prywatnych pożyczek zabezpieczonych na nieruchomościach. Dowiedz się, jak inwestorzy wyszukują projekty, budują własną strategię oraz wybierają model działania dopasowany do posiadanego kapitału i doświadczenia.",
  },
  {
    src: "/marketing/akademia/modul-2.png",
    etap: "Moduł 2",
    short: "Prawo",
    title: "Prawo",
    desc: "Zrozum regulacje, które mają bezpośredni wpływ na bezpieczeństwo i legalność prywatnych pożyczek. Naucz się prawidłowo interpretować przepisy, konstruować relacje pomiędzy stronami i rozpoznawać rozwiązania, które mogą rodzić ryzyko prawne lub odpowiedzialność karną.",
  },
  {
    src: "/marketing/akademia/modul-3.png",
    etap: "Moduł 3",
    short: "Operacje",
    title: "Operacje",
    desc: "Zobacz, jak sprawnie przeprowadzić cały proces — od pierwszego kontaktu z klientem aż po obsługę aktywnej umowy. Poznaj zasady organizacji dokumentów, komunikacji, pilnowania terminów oraz zarządzania relacją z klientem przez cały okres trwania pożyczki.",
  },
  {
    src: "/marketing/akademia/modul-4.png",
    etap: "Moduł 4",
    short: "Nieruchomość",
    title: "Analiza nieruchomości",
    desc: "Naucz się oceniać nieruchomość nie jak kupujący, lecz jak inwestor zabezpieczający swój kapitał. Sprawdzisz jej stan prawny, realną wartość, lokalizację, płynność sprzedaży oraz potencjalne problemy, które mogą utrudnić odzyskanie pieniędzy.",
  },
  {
    src: "/marketing/akademia/modul-5.png",
    etap: "Moduł 5",
    short: "Klient",
    title: "Analiza klienta",
    desc: "Dobre zabezpieczenie nie zastępuje prawidłowej oceny klienta. Dowiedz się, jak analizować jego sytuację finansową, historię zobowiązań, źródło spłaty i rzeczywistą motywację, aby podejmować decyzje oparte na faktach, a nie wyłącznie na deklaracjach.",
  },
  {
    src: "/marketing/akademia/modul-6.png",
    etap: "Moduł 6",
    short: "Case study",
    title: "Case study",
    desc: "Prześledź rzeczywiste przypadki pożyczek zabezpieczonych na różnych typach nieruchomości. Każdy przykład pokazuje sposób analizy dokumentów, wyceny ryzyka, identyfikacji problemów oraz podejmowania ostatecznej decyzji inwestycyjnej.",
  },
  {
    src: "/marketing/akademia/modul-7.png",
    etap: "Moduł 7",
    short: "Windykacja",
    title: "Windykacja: miękka i twarda",
    desc: "Poznaj uporządkowany sposób działania w sytuacji, gdy klient przestaje terminowo regulować zobowiązania. Od skutecznego kontaktu i negocjacji, przez ugodę i formalne wezwania, aż po działania prawne i egzekucję z ustanowionych zabezpieczeń.",
  },
];

const OCHRONA: TwoColSlide[] = [
  {
    src: "/marketing/ochrona/warstwa-1.png",
    etap: "Warstwa 1",
    short: "Zgodność",
    title: "Zgodność z przepisami",
    desc: "Inwestujesz w oparciu o proces uporządkowany według właściwych regulacji. System wspiera kontrolę dokumentów, obowiązków informacyjnych, limitów kosztów, AML, RODO i zabezpieczeń, ograniczając ryzyko pominięcia ważnego obowiązku.",
  },
  {
    src: "/marketing/ochrona/warstwa-2.png",
    etap: "Warstwa 2",
    short: "Księga wieczysta",
    title: "Księga wieczysta",
    desc: "Zanim podejmiesz decyzję, poznajesz rzeczywisty stan prawny nieruchomości. System porządkuje wpisy księgi wieczystej, wskazuje właścicieli, hipoteki, roszczenia i ograniczenia, aby ułatwić Ci ocenę jakości zabezpieczenia.",
  },
  {
    src: "/marketing/ochrona/warstwa-3.png",
    etap: "Warstwa 3",
    short: "Wycena i LTV",
    title: "Wycena, LTV i płynność",
    desc: "Widzisz nie tylko deklarowaną wartość nieruchomości, ale również jej relację do kwoty finansowania i realne możliwości sprzedaży. System porównuje dane rynkowe, lokalizację, standard oraz płynność, dając Ci większą kontrolę nad poziomem zabezpieczenia kapitału.",
  },
  {
    src: "/marketing/ochrona/warstwa-4.png",
    etap: "Warstwa 4",
    short: "Kalkulator",
    title: "Kalkulator i zgodność finansowa",
    desc: "Jeszcze przed złożeniem propozycji poznajesz pełny wynik planowanej transakcji. Kalkulator pokazuje odsetki, prowizję, harmonogram spłaty, całkowity zysk oraz konsekwencje różnych scenariuszy — dzięki temu możesz świadomie dopasować warunki do swojej strategii.",
  },
  {
    src: "/marketing/ochrona/warstwa-5.png",
    etap: "Warstwa 5",
    short: "Dokumenty",
    title: "Dokumenty, zabezpieczenia i RODO",
    desc: "Cały proces — od wniosku aż do spłaty — opiera się na uporządkowanej dokumentacji. System pomaga przygotować umowę, hipotekę, poręczenie, oświadczenie z art. 777 i wymagane zgody, zapewniając mniej formalności, większą kontrolę i czytelny ślad procesu.",
  },
  {
    src: "/marketing/ochrona/warstwa-6.png",
    etap: "Warstwa 6",
    short: "Ocena ryzyka",
    title: "Ocena ryzyka i ślad decyzji",
    desc: "AI analizuje dane klienta, nieruchomość, LTV, płynność, dokumenty i możliwe scenariusze. Otrzymujesz przejrzystą ocenę wraz z uzasadnieniem, źródłami i historią zmian — system pokazuje możliwości i ryzyko, a ostateczna decyzja zawsze należy do Ciebie.",
  },
  {
    src: "/marketing/ochrona/warstwa-7.png",
    etap: "Warstwa 7",
    short: "Monitoring",
    title: "Monitoring spłaty i windykacja AI",
    desc: "Po uruchomieniu finansowania system nadal pracuje dla Ciebie. Kontroluje terminy, saldo, odsetki i opóźnienia, a następnie wspiera prowadzenie komunikacji oraz kolejnych działań windykacyjnych — od SMS-a i telefonu po przygotowanie wymaganych dokumentów. Ty zachowujesz kontrolę, a AI wykonuje znaczną część codziennej pracy.",
  },
];

const WINDYKACJA: TwoColSlide[] = [
  {
    src: "/marketing/windykacja/etap-1.png",
    etap: "Etap 1",
    dni: "Dzień 1–7",
    title: "Start działań i pierwszy kontakt",
    desc: "SMS, telefon AI i e-mail przypominający. System rejestruje kontakt i monitoruje deklaracje klienta.",
  },
  {
    src: "/marketing/windykacja/etap-2.png",
    etap: "Etap 2",
    dni: "Dzień 8–14",
    title: "Ponowny kontakt i pierwsze wezwanie",
    desc: "SMS ponaglający, follow-up telefoniczny AI oraz formalne wezwanie do zapłaty z aktualizacją rejestru sprawy.",
  },
  {
    src: "/marketing/windykacja/etap-3.png",
    etap: "Etap 3",
    dni: "Dzień 15–30",
    title: "Monity, negocjacje i przygotowanie wypowiedzenia",
    desc: "Kolejne monity i wezwania, propozycja ugody, porządkowanie dowodów i przygotowanie wypowiedzenia umowy.",
  },
  {
    src: "/marketing/windykacja/etap-4.png",
    etap: "Etap 4",
    dni: "Dzień 31–60",
    title: "Wypowiedzenie umowy i pełna eskalacja",
    desc: "Wypowiedzenie, wezwanie końcowe, odsetki od zaległej raty oraz kontrola przesłanek karnych i eskalacja prawna.",
  },
  {
    src: "/marketing/windykacja/etap-5.png",
    etap: "Etap 5",
    dni: "Dzień 61–90+",
    title: "Wniosek o klauzulę wykonalności",
    desc: "Komplet dokumentów, wyliczenie salda i wniosek o klauzulę — sprawa jest gotowa do egzekucji.",
  },
  {
    src: "/marketing/windykacja/etap-6.png",
    etap: "Etap 6",
    dni: "Dzień 91–180+",
    title: "Egzekucja komornicza",
    desc: "Przekazanie kompletu do komornika, zajęcia i czynności, monitoring wpływów oraz bieżąca aktualizacja salda sprawy.",
  },
];

// FAQ inwestora — 9 podstawowych pytań, krótkie odpowiedzi bez rozwijania.
// Finance You to szkolenie i zestaw narzędzi dla partnera (abonament, model
// SaaS), nie platforma ani klub.
// Fakty (opłaty, prowizja klienta, LTV, odsetki) muszą zgadzać się z Umową
// ramową (docs/legal/pakiet-inwestora/, docs/cennik-inwestora.md).
// Bez stawek, które zmienia RPP (odsetki maksymalne pokazuje kalkulator).
// Treść trafia także do JSON-LD FAQPage.
const FAQ_ALL: FAQItem[] = [
  {
    q: "Co znaczy „zostać partnerem Finance You”?",
    a: "Wykupujesz abonament w modelu SaaS: szkolenie inwestora w 7 modułach i narzędzia do pracy — Analityka, Kancelarię, moduł AML i Windykatora. W bonusie, po akceptacji bezpłatnych umów z Finance You, dostajesz Projekty z ogólnopolskiej sieci sprzedaży dopasowane do Twojego Zlecenia: na zlecenie naszych klientów świadczymy usługi pośrednictwa finansowego, dostarczając rozwiązań dopasowanych do potrzeb i możliwości.",
  },
  {
    q: "Ile to kosztuje?",
    a: `Abonament: ${SUBSCRIPTION_PRICE_SENTENCE}. Bez opłat za Projekt i bez opłaty sukcesu. ${SUBSCRIPTION_PAYMENT_SENTENCE}`,
  },
  {
    q: "Czy mogę zapłacić w ratach?",
    a: `Tak — to nasz BONUS. Abonament roczny rozłożysz nawet na ${SUBSCRIPTION_MAX_INSTALLMENTS} rat, czyli ok. ${plnLabel(installmentEstimatePln(SUBSCRIPTION_YEARLY_PLN, SUBSCRIPTION_MAX_INSTALLMENTS))} miesięcznie. Firma wybiera w bramce Tpay PragmaPay (3–12 rat albo zapłata za 14–60 dni), a osoba prywatna m.in. Raty Pekao albo raty TubaPay. ${SUBSCRIPTION_INSTALLMENT_NOTE}`,
  },
  {
    q: "Na czym zarabiam i kto płaci prowizję Finance You?",
    a: `Na odsetkach — do wysokości odsetek maksymalnych, których aktualną stawkę pokazuje kalkulator — i na swojej prowizji, którą klient spłaca w ratach. Prowizję Finance You płaci klient (${TERMS.fyCommissionRule}), więc nie jest to Twój koszt.`,
  },
  {
    q: "Jak zabezpieczona jest pożyczka?",
    a: "Hipoteką na nieruchomości wpisaną na Twoją rzecz, przy LTV do 60%, a dodatkowo m.in. oświadczeniem o poddaniu się egzekucji (art. 777 k.p.c.).",
  },
  {
    q: "Czy zysk jest gwarantowany?",
    a: "Nie. Hipoteka ogranicza ryzyko, ale go nie eliminuje — dlatego przed decyzją dostajesz analizę zabezpieczenia i klasę ryzyka od A do E. Decyzję o finansowaniu podejmujesz samodzielnie.",
  },
  {
    q: "Kto jest stroną umowy pożyczki?",
    a: "Ty i klient — firma, która pożycza na cel związany z działalnością gospodarczą. Finance You nie udziela pożyczek i nie przechowuje Twoich pieniędzy, a klient spłaca bezpośrednio na Twój rachunek.",
  },
  {
    q: "Czy potrzebuję doświadczenia?",
    a: "Nie musisz go mieć na start. Szkolenie inwestora prowadzi Cię od podstaw: od strategii i prawa, przez analizę nieruchomości i klienta, po case study i windykację. Każda pożyczka wiąże się jednak z ryzykiem, a decyzję podejmujesz samodzielnie.",
  },
  {
    q: "Jak zacząć?",
    a: "Wybierasz abonament i płacisz (także w ratach) — konto, szkolenie i narzędzia otwierają się po płatności. Potem przechodzisz zdalną weryfikację tożsamości (dokument i selfie), akceptujesz bezpłatne umowy z Finance You i składasz Zlecenie z maksymalną kwotą. Od tej chwili szukamy dla Ciebie Projektów.",
  },
  {
    q: "Co jeśli klient nie płaci?",
    a: "Uruchamiasz Windykatora. Każdą procedurę zaczynasz jednym kliknięciem — od pierwszego upomnienia, przez wezwania i ugodę, aż na biurko komornika. Narzędzie przygotowuje pisma w Twoim imieniu, a każdą decyzję podejmujesz Ty. Jak prowadzić windykację, uczysz się w ostatnim module szkolenia.",
  },
];

// Duży złoty przycisk „Zostań partnerem” — główny CTA strony, prowadzi do
// cennika (#cennik): inwestor najpierw poznaje warunki (abonament miesięczny
// albo roczny), potem zakłada konto. W one-pagerze to zwykła kotwica
// sekcji; w układzie zakładek przewijanie do zakładki obsługuje InvestorTabs
// (także gdy hash już jest ustawiony na #cennik).
function JoinClubButton() {
  return (
    <MktButton
      variant="gold"
      size="cta"
      href={PRICING_HASH}
      style={{
        height: "4rem",
        padding: "0 clamp(1.6rem, 5vw, 3rem)",
        fontSize: "1.2rem",
        maxWidth: "100%",
      }}
    >
      <BrandIcon name="handCoins" size={22} /> Zostań partnerem
    </MktButton>
  );
}

const YEARLY_INSTALLMENT_PLN = installmentEstimatePln(
  SUBSCRIPTION_YEARLY_PLN,
  SUBSCRIPTION_MAX_INSTALLMENTS,
);

// Punkty hero — `bonus` dostaje złotą plakietkę zamiast ptaszka.
const HERO_POINTS: { t: string; bonus?: boolean }[] = [
  { t: "Szkolenie inwestora w 7 modułach — od strategii i prawa po windykację" },
  { t: "Narzędzia do pracy: ocena ryzyka A–E, umowy, AML i windykacja" },
  { t: "Stały abonament, bez prowizji od Twojego zysku" },
  {
    t: `Abonament w ratach — od ok. ${plnLabel(YEARLY_INSTALLMENT_PLN)} / mies., także dla firm`,
    bonus: true,
  },
  { t: "Projekty z ogólnopolskiej sieci sprzedaży", bonus: true },
];

function BonusTag() {
  return (
    <span
      style={{
        flex: "0 0 auto",
        borderRadius: 999,
        padding: "0.12rem 0.5rem",
        fontSize: "0.68rem",
        fontWeight: 900,
        letterSpacing: "0.08em",
        background: "linear-gradient(95deg,#f0c667,#f6dc9c)",
        color: "#101430",
      }}
    >
      BONUS
    </span>
  );
}

function Hero({ video }: { video: LandingVideoInfo | null }) {
  return (
    <section className="fy-hero" style={{ color: "#fff", borderBottom: "1px solid var(--border)" }}>
      <div aria-hidden className="fy-hero-fx" />
      <div
        className="fy-hero-grid"
        style={{
          position: "relative",
          maxWidth: "80rem",
          margin: "0 auto",
          padding: "4rem 1.5rem 4.5rem",
        }}
      >
        <div>
          <MktBadge variant="secondary">Program partnerski Finance You</MktBadge>
          <h1
            style={{
              marginTop: "1rem",
              fontSize: "clamp(2.1rem, 4vw, 3.1rem)",
              fontWeight: 900,
              lineHeight: 1.06,
              letterSpacing: "-0.025em",
            }}
          >
            Zostań partnerem Finance You. Inwestuj w pożyczki dla firm{" "}
            <span
              style={{
                background: "linear-gradient(95deg,#f0c667,#f6dc9c 40%,#d4a03a)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              zabezpieczone hipoteką.
            </span>
          </h1>
          <p
            style={{
              marginTop: "1.1rem",
              maxWidth: "34rem",
              fontSize: "1.05rem",
              lineHeight: 1.6,
              color: "rgba(255,255,255,.82)",
            }}
          >
            Jeden abonament w modelu SaaS: szkolenie, które uczy inwestować od podstaw, i narzędzia
            do codziennej pracy — od oceny ryzyka i wyceny nieruchomości w ok. 15 minut, przez umowy
            i AML, po windykację. Ty decydujesz, my dajemy wiedzę i warsztat.
          </p>
          <ul
            style={{
              marginTop: "1.2rem",
              padding: 0,
              listStyle: "none",
              display: "grid",
              gap: "0.5rem",
            }}
          >
            {HERO_POINTS.map((h) => (
              <li
                key={h.t}
                style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.95rem" }}
              >
                {h.bonus ? <BonusTag /> : <BrandIcon name="check" size={18} />}
                <span style={h.bonus ? { fontWeight: 700, color: "#f6dc9c" } : undefined}>
                  {h.t}
                </span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: "1.8rem", display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
            <JoinClubButton />
            {SHOW.kalkulator && (
              <MktButton
                variant="outline"
                size="cta"
                href="#kalkulator"
                style={{
                  height: "4rem",
                  maxWidth: "100%",
                  background: "rgba(255,255,255,.06)",
                  borderColor: "rgba(255,255,255,.28)",
                  color: "#fff",
                }}
              >
                Policz swój zysk
              </MktButton>
            )}
          </div>
        </div>
        <HeroFrame glow="linear-gradient(135deg, oklch(0.83 0.14 88 / .28), oklch(0.65 0.13 235 / .25))">
          {video ? (
            <video
              src={video.videoUrl}
              poster={video.posterUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              aria-label={HERO_VIDEO_TITLE}
              style={{
                width: "100%",
                aspectRatio: "16 / 9",
                display: "block",
                background: "#05081c",
              }}
            />
          ) : (
            <HeroIframe src={LANDING_INVESTOR_VIDEO_HEYGEN_EMBED_URL} title={HERO_VIDEO_TITLE} />
          )}
        </HeroFrame>
      </div>
    </section>
  );
}

// Długa prezentacja (SHOW.prezentacja) — osobny rząd pod modułami.
function PresentationSection() {
  return (
    <Section id="prezentacja">
      <SectionHead center eyebrow="Prezentacja" title="Finance You w pigułce" />
      <div style={{ maxWidth: "56rem", margin: "2.5rem auto 0" }}>
        <HeroFrame glow="linear-gradient(135deg, oklch(0.65 0.13 235 / .3), oklch(0.40 0.25 268 / .25))">
          <video
            src={encodeURI(PRESENTATION_VIDEO_URL)}
            controls
            playsInline
            preload="metadata"
            aria-label={PRESENTATION_VIDEO_TITLE}
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              display: "block",
              background: "#05081c",
            }}
          />
        </HeroFrame>
      </div>
    </Section>
  );
}

// Ramka wideo w hero: poświata za kartą + zaokrąglona ramka. W środku <video>
// z naszego pliku albo iframe (zapasowy HeyGen).
function HeroFrame({ glow, children }: { glow: string; children: ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "-1.5rem",
          borderRadius: "var(--radius-3xl)",
          background: glow,
          filter: "blur(34px)",
        }}
      />
      <div
        style={{
          position: "relative",
          borderRadius: "var(--radius-2xl)",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.15)",
          boxShadow: "var(--shadow-2xl)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function HeroIframe({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      src={src}
      title={title}
      allow="autoplay; fullscreen; encrypted-media"
      allowFullScreen
      style={{ width: "100%", aspectRatio: "16 / 9", display: "block", border: 0 }}
    />
  );
}

// Publiczny podgląd zysku — ten sam komponent co w panelu, w trybie
// marketingPreview: cztery suwaki i trzy wyniki (wykładasz / klient spłaca /
// Twój zysk), bez stóp NBP, alertów prawnych, harmonogramu i eksportu.
// initialMaxPayment={0} = zwykła rata annuitetowa (bez ukrytej raty balonowej).
// Pełny kalkulator (harmonogram, limity, PDF) jest powodem, żeby dołączyć.
function CalculatorSection() {
  return (
    <Section id="kalkulator">
      <SectionHead
        center
        title={
          <span
            style={{
              background: "linear-gradient(95deg,#f0c667,#f6dc9c 34%,#5fa2f6 82%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Policz, ile możesz zarobić na jednej pożyczce
          </span>
        }
        sub="Ustaw kwotę, okres, oprocentowanie i swoją prowizję — wynik przeliczy się od razu."
      />
      <div style={{ marginTop: "2.5rem" }}>
        <LoanCalculator marketingPreview initialMaxPayment={0} />
      </div>
      <div
        style={{
          marginTop: "2rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.1rem",
          textAlign: "center",
        }}
      >
        <p
          style={{
            maxWidth: "40rem",
            fontSize: "1rem",
            lineHeight: 1.6,
            color: "var(--muted-foreground)",
          }}
        >
          W abonamencie ten sam kalkulator pokaże pełny harmonogram rat, ostrzeże przed
          przekroczeniem odsetek maksymalnych i podpowie kwotę hipoteki. Wynik pobierzesz w PDF.
        </p>
        <JoinClubButton />
      </div>
      <ComplianceNote style={{ marginTop: "2rem" }}>
        Wyliczenie jest przykładem poglądowym i nie uwzględnia podatku dochodowego. Nie jest ofertą
        ani poradą inwestycyjną lub prawną — warunki określa umowa pożyczki między Tobą a klientem.
        Inwestowanie wiąże się z ryzykiem utraty części lub całości kapitału.
      </ComplianceNote>
    </Section>
  );
}

// Przykładowe projekty (ilustracja) — bez logowania nie pokazujemy żadnych
// prawdziwych wniosków (decyzja nadrzędna nr 7). Dane syntetyczne, seed dzienny.
function LeadsSection() {
  return (
    <section
      style={{
        background: "#0a1030",
        borderBottom: "1px solid rgba(84,124,214,0.2)",
        padding: "3rem clamp(1rem, 3vw, 2.5rem) 4rem",
        color: "#fff",
      }}
    >
      <Eyebrow tone="gold" style={{ letterSpacing: "0.24em" }}>
        Przykładowe projekty
      </Eyebrow>
      <div style={{ marginTop: "1.1rem" }}>
        <ExampleProjectsSection />
      </div>
      <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "center" }}>
        <MktButton variant="outline" href={JOIN}>
          <BrandIcon name="handCoins" size={16} /> Złóż Zlecenie i zobacz dopasowane Projekty
        </MktButton>
      </div>
      <ComplianceNote style={{ marginTop: "1.5rem" }}>
        Przykładowe projekty mają charakter wyłącznie ilustracyjny — nie są prawdziwymi wnioskami,
        nie stanowią oferty ani rekomendacji inwestycyjnej. Prawdziwe Projekty przedstawiamy
        wyłącznie inwestorowi z przyjętym Zleceniem. Inwestowanie wiąże się z ryzykiem utraty
        kapitału.
      </ComplianceNote>
    </section>
  );
}

// ── Zakładki pod filmami i kalkulatorem ──────────────────────────────────────
// Kotwice z nagłówka (#akademia, #ochrona, #windykacja-ai, #cennik) wybierają
// odpowiednią zakładkę i przewijają do pasa zakładek — sekcje nie mają już
// własnych id na stronie.
type InvestorTabKey =
  | "oferty"
  | "pipeline"
  | "system"
  | "akademia"
  | "ochrona"
  | "windykacja"
  | "cennik";

const INVESTOR_TABS: { key: InvestorTabKey; hash: string; label: string }[] = [
  { key: "oferty", hash: "#oferty", label: "Oferty" },
  { key: "pipeline", hash: "#pipeline", label: "Jak to działa" },
  { key: "system", hash: "#system-inwestora", label: "Inteligentny system" },
  { key: "akademia", hash: "#akademia", label: "Akademia inwestora" },
  { key: "ochrona", hash: "#ochrona", label: "7 warstw ochrony" },
  { key: "windykacja", hash: "#windykacja-ai", label: "Windykacja AI" },
  { key: "cennik", hash: PRICING_HASH, label: "Cennik" },
];

// Jeden pipeline — kolorowa oś kroków, te same etapy co w panelu inwestora.
function PipelineSection() {
  return (
    <Section>
      <SectionHead
        center
        eyebrow="Jeden pipeline"
        title="Od rejestracji do Zlecenia — dziewięć kroków"
        sub="Dane inwestora, rachunek do spłaty, weryfikacja tożsamości, screening list sankcyjnych, komplet umów wypełnionych przez system i Zlecenie poszukiwania Projektów. Wszystko w jednym miejscu, bez papierów."
      />
      <div
        className="fy-pipeline"
        style={{
          marginTop: "2.5rem",
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0,1fr))",
          gap: "0.9rem",
        }}
      >
        {PIPELINE_STEPS.map((s) => (
          <div
            key={s.n}
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: "var(--radius-2xl)",
              border: `1px solid oklch(0.62 0.16 ${s.hue} / 0.3)`,
              background: "var(--card)",
              boxShadow: "var(--shadow-sm)",
              padding: "1.1rem 1.1rem 1.1rem 1.4rem",
            }}
          >
            <span
              aria-hidden
              style={{
                position: "absolute",
                insetBlock: 0,
                left: 0,
                width: 6,
                background: `linear-gradient(180deg, oklch(0.70 0.17 ${s.hue}), oklch(0.54 0.19 ${s.hue + 18}))`,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  fontSize: "0.82rem",
                  fontWeight: 900,
                  color: "#fff",
                  background: `linear-gradient(135deg, oklch(0.68 0.17 ${s.hue}), oklch(0.50 0.19 ${s.hue + 20}))`,
                }}
              >
                {s.n}
              </span>
              <span style={{ fontWeight: 800, fontSize: "0.96rem" }}>{s.t}</span>
            </div>
            <p
              style={{
                marginTop: "0.6rem",
                fontSize: "0.85rem",
                lineHeight: 1.55,
                color: "var(--muted-foreground)",
              }}
            >
              {s.d}
            </p>
          </div>
        ))}
      </div>
      <ComplianceNote style={{ marginTop: "2rem" }}>
        Zakres i kolejność kroków wynikają z pakietu umownego Finance You oraz obowiązków w zakresie
        przeciwdziałania praniu pieniędzy. Weryfikacja tożsamości i screening list sankcyjnych
        realizowane są przez wyspecjalizowanych dostawców.
      </ComplianceNote>
    </Section>
  );
}

// Sekcje dawnych zakładek. Te same komponenty renderuje pasek zakładek
// (SHOW.zakladki) i układ one-pagera — kotwice (id) odpowiadają hashom
// z INVESTOR_TABS i pod-menu „Inwestor" w nawigacji.
function SmartOfferSection() {
  return (
    <Section id="system-inwestora">
      <SmartOfferSlider />
    </Section>
  );
}

function AkademiaSection() {
  return (
    <Section id="akademia">
      <SectionHead
        center
        eyebrow="Szkolenie inwestora"
        title="Najpierw wiedza. Szkolenie w 7 modułach"
        sub="Od wprowadzenia i strategii, przez prawo i operacje, po analizę nieruchomości, analizę klienta, case study i windykację. Każdy temat przećwiczysz na narzędziach z abonamentu."
      />
      <div style={{ marginTop: "2.5rem" }}>
        <TwoColSlider slides={AKADEMIA} />
      </div>
      <div
        style={{
          marginTop: "2rem",
          display: "flex",
          justifyContent: "center",
          gap: "0.7rem",
          flexWrap: "wrap",
        }}
      >
        <JoinClubButton />
        <MktButton
          variant="outline"
          size="cta"
          href="/dla-inwestora/szkolenie"
          style={{ height: "4rem", maxWidth: "100%" }}
        >
          Zobacz program szkolenia
        </MktButton>
      </div>
    </Section>
  );
}

function OchronaSection() {
  return (
    <Section id="ochrona" tint>
      <SectionHead
        center
        eyebrow="Bezpieczeństwo"
        title="7 warstw ochrony inwestora"
        sub="Od zgodności z przepisami i stanu prawnego nieruchomości, przez wycenę, kalkulację i dokumenty, po ocenę ryzyka oraz monitoring spłaty."
      />
      <div style={{ marginTop: "2.5rem" }}>
        <TwoColSlider slides={OCHRONA} />
      </div>
      <ComplianceNote style={{ marginTop: "2rem" }}>
        System wspiera analizę i porządkuje dane — decyzja należy do inwestora. Zakres zależy od
        modelu i stron transakcji.
      </ComplianceNote>
    </Section>
  );
}

function WindykacjaSection() {
  return (
    <Section id="windykacja-ai">
      <SectionHead
        center
        eyebrow="Moduł AI"
        title="Automatyczna windykacja krok po kroku"
        sub="Sześć etapów procesu — od pierwszego kontaktu po egzekucję komorniczą. Każdy etap pokazuje działania systemu oraz prognozowany czas."
      />
      <div style={{ marginTop: "2.5rem" }}>
        <TwoColSlider slides={WINDYKACJA} />
      </div>
      <ComplianceNote style={{ marginTop: "2rem" }}>
        Prognoza poglądowa — wartości zaokrąglone, zależne od umowy, harmonogramu i kosztów
        czynności.
      </ComplianceNote>
    </Section>
  );
}

// Karty modułów w kolejności cyklu pożyczki — każda prowadzi do podstrony
// /dla-inwestora/<moduł> (te same pozycje są w sub-menu "Inwestor").
function ModulesSection() {
  return (
    <Section id="moduly" tint>
      <SectionHead
        center
        eyebrow="Abonament partnera"
        title="Szkolenie i narzędzia w jednym abonamencie"
        sub="Uczysz się w szkoleniu, a na każdym etapie pożyczki masz pod ręką właściwe narzędzie. Na koniec bonus: Projekty z ogólnopolskiej sieci sprzedaży."
      />
      <div style={{ marginTop: "2.5rem" }}>
        <ModuleCards modules={INVESTOR_MODULES} cols={3} />
      </div>
    </Section>
  );
}

function CennikSection({ products }: { products: AccessProduct[] }) {
  return (
    <Section id="cennik" tint>
      <SectionHead
        center
        eyebrow="Cennik"
        title="Jeden abonament: szkolenie i wszystkie narzędzia"
        sub={`BONUS: zapłać w ratach — od ok. ${plnLabel(YEARLY_INSTALLMENT_PLN)} miesięcznie, także jako firma.`}
      />
      <div style={{ marginTop: "2.5rem" }}>
        <InvestorPricing products={products} />
      </div>
    </Section>
  );
}

function InvestorTabs({ products }: { products: AccessProduct[] }) {
  const [active, setActive] = useState<InvestorTabKey>("oferty");
  const barRef = useRef<HTMLDivElement>(null);

  // Hash w URL (wejście z linku lub klik w menu) wybiera zakładkę.
  useEffect(() => {
    const applyHash = (scroll: boolean) => {
      const tab = INVESTOR_TABS.find((t) => t.hash === window.location.hash);
      if (!tab) return;
      setActive(tab.key);
      if (scroll) barRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    applyHash(window.location.hash !== "" && window.location.hash !== "#oferty");
    const onHash = () => applyHash(true);
    // Klik w link do zakładki (złoty CTA w hero, nagłówek, pasek przyklejony),
    // gdy hash już wskazuje tę zakładkę (np. po kliknięciu w nią): przeglądarka
    // nie wyśle `hashchange`, więc sami przewijamy do paska zakładek.
    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      const href = e.target.closest("a[href]")?.getAttribute("href");
      if (href != null && href === window.location.hash) applyHash(true);
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const select = (tab: (typeof INVESTOR_TABS)[number]) => {
    setActive(tab.key);
    // replaceState zamiast location.hash — bez skoku strony, ale link można udostępnić.
    window.history.replaceState(null, "", tab.hash);
  };

  return (
    <div>
      <div
        ref={barRef}
        style={{
          background: "#0a1030",
          borderTop: "1px solid rgba(84,124,214,0.2)",
          scrollMarginTop: "5rem",
        }}
      >
        <div
          role="tablist"
          aria-label="Sekcje dla inwestora"
          style={{
            display: "flex",
            gap: "0.55rem",
            overflowX: "auto",
            padding: "1.1rem clamp(1rem, 3vw, 2.5rem)",
            scrollbarWidth: "thin",
          }}
        >
          {INVESTOR_TABS.map((t) => {
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => select(t)}
                style={{
                  // flex 0 0 auto — bez tego pigułki ściskają się w pasie
                  // przewijanym poziomo i tekst wylewa się poza obrys.
                  flex: "0 0 auto",
                  whiteSpace: "nowrap",
                  padding: "0.55rem clamp(0.8rem, 2.4vw, 1.15rem)",
                  borderRadius: 999,
                  fontSize: "clamp(0.8rem, 2.6vw, 0.9rem)",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all .18s ease",
                  border: isActive ? "1px solid transparent" : "1px solid rgba(84,124,214,0.35)",
                  background: isActive
                    ? "linear-gradient(95deg,#f0c667,#f6dc9c)"
                    : "rgba(255,255,255,0.04)",
                  color: isActive ? "#101430" : "rgba(255,255,255,.85)",
                  boxShadow: isActive ? "0 8px 24px -10px rgba(240,198,103,0.6)" : "none",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {active === "oferty" && <LeadsSection />}

      {active === "pipeline" && <PipelineSection />}

      {active === "system" && <SmartOfferSection />}

      {active === "akademia" && <AkademiaSection />}

      {active === "ochrona" && <OchronaSection />}

      {active === "windykacja" && <WindykacjaSection />}

      {active === "cennik" && <CennikSection products={products} />}
    </div>
  );
}

function InvestorLanding() {
  const { products, video, materials } = Route.useLoaderData();
  return (
    <MarketingShell page="inwestor" sticky={{ label: "Zostań partnerem", href: PRICING_HASH }}>
      <Hero video={video} />

      {/* Szkolenie — produkt główny, zaraz pod hero, potem narzędzia. */}
      {!SHOW.zakladki && SHOW.akademia && <AkademiaSection />}
      {SHOW.moduly && <ModulesSection />}

      {SHOW.kalkulator && <CalculatorSection />}

      {SHOW.zakladki ? (
        <InvestorTabs products={products} />
      ) : (
        <>
          {SHOW.oferty && <LeadsSection />}
          {SHOW.pipeline && <PipelineSection />}
        </>
      )}

      <Section id="korzysci">
        <SectionHead
          eyebrow="Co zyskujesz"
          title="My szukamy Projektów. Ty decydujesz, na czym zarabiasz."
          sub="Od Zlecenia po spłatę — wiedza ze szkolenia i narzędzia w jednym miejscu."
        />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={BENEFITS} cols={3} icon3d />
        </div>
      </Section>

      {SHOW.prezentacja && <PresentationSection />}

      {!SHOW.zakladki && (
        <>
          {SHOW.system && <SmartOfferSection />}
          {SHOW.ochrona && <OchronaSection />}
          {SHOW.windykacja && <WindykacjaSection />}
        </>
      )}

      {!SHOW.zakladki && <CennikSection products={products} />}

      <FreeMaterialsSection data={materials} />

      <Section id="faq">
        <SectionHead center eyebrow="FAQ" title="Najczęstsze pytania inwestorów" />
        <FAQ items={FAQ_ALL} />
        <p
          style={{
            marginTop: "1.5rem",
            textAlign: "center",
            fontSize: "0.95rem",
            color: "var(--muted-foreground)",
          }}
        >
          Masz inne pytanie? Napisz na{" "}
          <a href="mailto:kontakt@financeyou.pl">kontakt@financeyou.pl</a> albo zapytaj asystenta na
          czacie.
        </p>
        {/* Jedyna pełna nota prawna landingu — zastępuje noty sekcji AI, Compliance,
            Cennik i FAQ. Usuwając coś stąd, sprawdź Regulamin Abonamentu (§ 3)
            i Umowę ramową. */}
        <ComplianceNote style={{ marginTop: "2.5rem" }}>
          <strong>Ważne informacje.</strong> Abonament to szkolenie, a moduły są jego narzędziami,
          nie odrębnymi usługami. Nie stanowią porady inwestycyjnej ani prawnej, a wycena nie jest
          operatem szacunkowym. Finance You nie jest stroną umowy pożyczki — zawierasz ją
          bezpośrednio z firmą, na jej cel gospodarczy. Abonament nie gwarantuje przedstawienia
          Projektu ani zysku, a dostęp do Projektów wymaga akceptacji bezpłatnych umów z Finance
          You. Zgłoszenia do GIIF wysyłasz samodzielnie, własnym podpisem kwalifikowanym.
          Inwestowanie wiąże się z ryzykiem utraty części lub całości kapitału. Wiążące są
          postanowienia Regulaminu Abonamentu, Umowy ramowej, NDA i umowy RODO.
        </ComplianceNote>
      </Section>

      <CTASection
        single
        title="Twój kapitał, Twoje decyzje. Zostań partnerem Finance You."
        sub={`Szkolenie i narzędzia w jednym abonamencie, bez prowizji od Twojego zysku. BONUS: raty od ok. ${plnLabel(YEARLY_INSTALLMENT_PLN)} / mies. i Projekty z ogólnopolskiej sieci sprzedaży.`}
        buttons={[{ label: "Zostań partnerem", href: PRICING_HASH }]}
      />

      <ChatWidget
        source="dla-inwestora"
        endpoint="/api/public/investor-chat-widget"
        storageKey="fy_invest_chat_session_id"
        greeting="Dzień dobry! Jestem wirtualnym asystentem Finance You. Odpowiem na pytania o program partnerski, szkolenie, narzędzia, raty i pożyczki dla firm zabezpieczone hipoteką. W sprawach współpracy przekażę kontakt opiekunowi. W czym mogę pomóc?"
        title="Asystent inwestora"
        subtitle="Program partnerski Finance You · 24/7"
      />
    </MarketingShell>
  );
}
