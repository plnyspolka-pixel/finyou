import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/shell";
import {
  Section,
  SectionHead,
  FeatureGrid,
  FAQGroups,
  ComplianceNote,
  CTASection,
  type FeatureItemData,
  type FAQGroup,
} from "@/components/marketing/sections";
import { MktBadge, MktButton, Eyebrow } from "@/components/marketing/primitives";
import { BrandIcon } from "@/components/marketing/brand-icon";
import { Icon3D, type Icon3DName } from "@/components/marketing/icon-3d";
import { TwoColSlider, SmartOfferSlider, type TwoColSlide } from "@/components/marketing/sliders";
import { InvestorPricing } from "@/components/marketing/investor-pricing";
import {
  SUBSCRIPTION_MONTHLY_PLN,
  SUBSCRIPTION_PAYMENT_SENTENCE,
  SUBSCRIPTION_PRICE_SENTENCE,
  SUBSCRIPTION_YEARLY_DISCOUNT_PCT,
  SUBSCRIPTION_YEARLY_PLN,
  SUBSCRIPTION_YEARLY_PER_MONTH_PLN,
  plnLabel,
} from "@/lib/investor-plan/plans";
import { ChatWidget } from "@/components/landing/chat-widget";
import { LoanCalculator } from "@/components/loan-calculator";
import { ExampleProjectsSection } from "@/components/landing/example-projects-section";
import { faqPageLd } from "@/lib/seo/company";
import { listAccessProducts } from "@/lib/access/state.functions";
import type { AccessProduct } from "@/lib/access/core";
import { getLandingInvestorVideo } from "@/lib/landing-video.functions";
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
  | "windykacja",
  boolean
> = {
  zakladki: false, // pasek zakładek zamiast sekcji jedna pod drugą
  kalkulator: true, // pełny kalkulator inwestora pod hero
  oferty: false, // przykładowe projekty
  pipeline: false, // oś dziewięciu kroków onboardingu
  system: false, // pokaz slajdów „Inteligentny system"
  akademia: false, // pokaz slajdów Akademii inwestora
  ochrona: false, // pokaz slajdów „7 warstw ochrony"
  windykacja: false, // pokaz slajdów windykacji AI
};

// Filmy w hero. Pierwszy (Wistia) po prawej w rzędzie 1, drugi piętro niżej po
// lewej — odtwarzany z naszego pliku w Storage (src/lib/landing-video.ts).
// Dopóki kopii nie ma (panel /admin/materialy → „Film na landingu inwestora"),
// zapasowo gra odtwarzacz HeyGen.
const WISTIA_EMBED_URL = "https://fast.wistia.net/embed/iframe/kjp6klcd5u?seo=false";
const VIDEO2_TITLE = LANDING_INVESTOR_VIDEO.title;

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
  } catch {
    return [];
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
    d: "Kwota ± 15%, maksymalny okres (do 120 mies.), minimalny zysk roczny i termin ważności. Od tego momentu szukamy dla Ciebie.",
    hue: 8,
  },
];

export const Route = createFileRoute("/dla-inwestora")({
  loader: async () => {
    const [products, video] = await Promise.all([loadInvestorProducts(), loadLandingVideo()]);
    return { products, video };
  },
  head: () => ({
    meta: [
      {
        title: "Klub Inwestorów Hipotecznych — inwestuj w pożyczki pod nieruchomości | Finance You",
      },
      {
        name: "description",
        content: `Klub Inwestorów Hipotecznych Finance You: abonament ${plnLabel(SUBSCRIPTION_MONTHLY_PLN)}/mies. albo ${plnLabel(SUBSCRIPTION_YEARLY_PLN)}/rok (rocznie ${SUBSCRIPTION_YEARLY_DISCOUNT_PCT}% taniej), bez karty kredytowej. Finansujesz projekty firm zabezpieczone hipoteką (LTV do 60%), oprocentowanie do wysokości odsetek maksymalnych.`,
      },
      { property: "og:title", content: "Dla inwestorów — Finance You" },
      {
        property: "og:description",
        content: "Klub Inwestorów Hipotecznych — edukacja, dokumenty, AI i sprawy klientów.",
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

// Jeden dział korzyści — bez podziału na pakiety. Tytuł karty = co inwestor
// zyskuje, opis = jak to dostaje. Inwestor płaci abonament (ceny w
// lib/investor-plan/plans.ts); Prowizję od Pożyczkobiorcy płaci klient.
// Fakty (rezerwacja, Karta Leada, raporty) muszą zgadzać się z FAQ_GROUPS niżej.
// Kolejność: od kosztów i Zlecenia, przez weryfikację i umowy, po spłatę,
// windykację i wiedzę.
const BENEFITS: FeatureItemData[] = [
  {
    icon: "loan",
    t: "Stały abonament zamiast prowizji od zysku",
    d: `${plnLabel(SUBSCRIPTION_MONTHLY_PLN)} miesięcznie albo ${plnLabel(SUBSCRIPTION_YEARLY_PLN)} za rok (${SUBSCRIPTION_YEARLY_DISCOUNT_PCT}% taniej) — bez opłat za Projekt, opłaty sukcesu i podpinania karty kredytowej. Prowizję Finance You płaci klient.`,
  },
  {
    icon: "access",
    t: "Projekty trafiają do Ciebie",
    d: "Składasz Zlecenie z kwotą, okresem i minimalnym zyskiem, a my przedstawiamy Projekty dopasowane do Twoich kryteriów.",
  },
  {
    icon: "shieldcheck",
    t: "Weryfikację przechodzisz raz, zdalnie",
    d: "KYC z dokumentem i selfie oraz screening sankcji/PEP w jednym procesie — bez wizyt i papierów.",
  },
  {
    icon: "dossier",
    t: "Umowy gotowe bez przepisywania",
    d: "System wypełnia umowy Twoimi zweryfikowanymi danymi, a generator składa umowę pożyczki z uzgodnionych warunków.",
  },
  {
    icon: "knowledge",
    t: "Decyzja na podstawie faktów",
    d: "Raport o nieruchomości, stanie prawnym, LTV i ryzyku przy każdym Projekcie — bez limitu raportów.",
  },
  {
    icon: "procedures",
    t: "Czas na decyzję tylko dla Ciebie",
    d: "Projekt jest zarezerwowany dla Ciebie przez 24 h, z możliwością przedłużenia o 12 h — w tym czasie nie trafia do innych inwestorów.",
  },
  {
    icon: "chat",
    t: "Rozmawiasz bezpośrednio z klientem",
    d: "Dane kontaktowe dostajesz po akceptacji Karty Leada — bez pośredników w rozmowie.",
  },
  {
    icon: "status",
    t: "Spłaty ustalone z góry",
    d: "Harmonogram zaakceptowany przez klienta znasz, zanim wyłożysz kapitał.",
  },
  {
    icon: "kalkulator",
    t: "Warunki zgodne z prawem",
    d: "Kalkulator compliance pilnuje odsetek maksymalnych i limitów kosztów, zanim złożysz propozycję.",
  },
  {
    icon: "complianceAml",
    t: "Obowiązki AML pod kontrolą",
    d: "Klienci, transakcje, ocena ryzyka, zgłoszenia i UPO w jednym module.",
  },
  {
    icon: "aibrain",
    t: "Odzyskujesz należności krok po kroku",
    d: "Windykacja AI prowadzi sześć etapów — od pierwszego kontaktu po egzekucję. Decyzje zostają po Twojej stronie.",
  },
  {
    icon: "training",
    t: "Wiesz, jak inwestować od A do Z",
    d: "Akademia inwestora — siedem modułów od strategii po windykację.",
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

const AI: FeatureItemData[] = [
  {
    icon: "updates",
    t: "Przypomnienia",
    d: "Automatyczne przypomnienia o terminach i działaniach.",
  },
  { icon: "chat", t: "SMS / e-mail / telefon", d: "Powtarzalna komunikacja w jednym miejscu." },
  {
    icon: "documents",
    t: "Wezwania i rejestr kontaktu",
    d: "Generowanie komunikacji i pełna historia.",
  },
  {
    icon: "status",
    t: "Monitoring spłat",
    d: "Bieżący status i porządkowanie działań przedsądowych.",
  },
];

const COMPLIANCE: { icon: Icon3DName; t: string }[] = [
  { icon: "complianceAml", t: "AML" },
  { icon: "complianceRodo", t: "RODO" },
  { icon: "complianceDocs", t: "Dokumentacja" },
  { icon: "complianceProc", t: "Procedury" },
  { icon: "complianceRegistry", t: "Rejestry" },
  { icon: "complianceProcess", t: "Zgodność procesu" },
];

// FAQ inwestora w kategoriach. Fakty (opłaty, limity Zleceń i rezerwacji,
// Okres Ochronny, Kara Obejściowa) muszą zgadzać się z Umową ramową v7
// (docs/legal/paczka-inwestor-v7/, docs/cennik-inwestora.md) — przy zmianie
// umowy zaktualizuj też te odpowiedzi. Treść trafia także do JSON-LD FAQPage.
const FAQ_GROUPS: FAQGroup[] = [
  {
    key: "podstawy",
    label: "Podstawy",
    items: [
      {
        q: "Czym jest Klub Inwestorów Hipotecznych Finance You?",
        a: "To zamknięta platforma dla osób i firm, które chcą finansować pożyczki dla przedsiębiorców zabezpieczone hipoteką na nieruchomości. Składasz Zlecenie z parametrami inwestycji, a my przedstawiamy Ci dopasowane Projekty klientów szukających finansowania — wraz z raportem, harmonogramem i narzędziami do przeprowadzenia transakcji.",
      },
      {
        q: "Kto może zostać inwestorem?",
        a: "Osoba fizyczna, jednoosobowa działalność gospodarcza albo spółka. Warunkiem jest przejście pipeline'u: podanie danych, wskazanie rachunku do spłaty, zdalna weryfikacja tożsamości (KYC), screening list sankcyjnych i PEP oraz akceptacja umów. Środki przeznaczone na finansowanie muszą pochodzić z legalnego źródła.",
      },
      {
        q: "Czy muszę mieć doświadczenie?",
        a: "Nie. Akademia inwestora w siedmiu modułach prowadzi od podstaw — od strategii, przez prawo, operacje i analizę nieruchomości oraz klienta, po case study i windykację. Materiały są dostosowane do różnych poziomów zaawansowania.",
      },
      {
        q: "Kto jest stroną umowy pożyczki?",
        a: "Umowę pożyczki zawierasz bezpośrednio z klientem — to Ty jesteś pożyczkodawcą i wierzycielem hipotecznym. Finance You przedstawia Projekt, porządkuje dokumenty i wspiera transakcję, ale nie udziela pożyczek, nie przechowuje Twoich środków i nie jest stroną umowy pożyczki.",
      },
      {
        q: "Czy Finance You doradza inwestycyjnie?",
        a: "Nie. Raporty, analizy i materiały mają charakter edukacyjny i informacyjny. System pokazuje dane, możliwości i ryzyko, ale decyzję o sfinansowaniu Projektu podejmujesz samodzielnie — w razie potrzeby po konsultacji z własnym doradcą prawnym lub podatkowym.",
      },
    ],
  },
  {
    key: "koszty",
    label: "Koszty",
    items: [
      {
        q: "Ile kosztuje dostęp dla inwestora?",
        a: `Abonament kosztuje ${SUBSCRIPTION_PRICE_SENTENCE}. W abonamencie masz wszystko: składanie Zleceń, teasery, Karty Leada, ujawnienie danych, rezerwacje, raporty bez limitu, Akademię, kalkulator compliance, moduł AML i windykację AI. Nie ma opłaty za Projekt, za rezerwację ani opłaty sukcesu.`,
      },
      {
        q: "Jaki rabat dostaję przy płatności rocznej?",
        a: `${SUBSCRIPTION_YEARLY_DISCOUNT_PCT}%. Rok płacony co miesiąc kosztuje ${plnLabel(SUBSCRIPTION_MONTHLY_PLN * 12)}, a abonament roczny ${plnLabel(SUBSCRIPTION_YEARLY_PLN)} — oszczędzasz ${plnLabel(SUBSCRIPTION_MONTHLY_PLN * 12 - SUBSCRIPTION_YEARLY_PLN)}, czyli płacisz ok. ${plnLabel(SUBSCRIPTION_YEARLY_PER_MONTH_PLN)} miesięcznie. Okres wybierasz suwakiem w cenniku.`,
      },
      {
        q: "Czy muszę podpinać kartę kredytową?",
        a: `Nie. ${SUBSCRIPTION_PAYMENT_SENTENCE} Po wygaśnięciu okresu sam decydujesz, czy go przedłużyć.`,
      },
      {
        q: "Kiedy opłacam abonament?",
        a: "Po akceptacji umów w pipeline'ie inwestora, a przed złożeniem pierwszego Zlecenia — Opłatę Abonamentową określa § 7 Umowy ramowej. Rejestracja, dane konta, weryfikacja tożsamości i akceptacja umów nie wymagają płatności. Abonament kupujesz w panelu, w zakładce Dostęp i płatności, a fakturę dostajesz automatycznie.",
      },
      {
        q: "Co się dzieje, gdy abonament wygaśnie?",
        a: "Wstrzymujemy przyjmowanie nowych Zleceń i dostęp do modułów panelu do czasu opłacenia kolejnego okresu. Twoje dane, dokumenty i historia zostają zapisane, a obowiązki z umowy — poufność, zabezpieczenie prowizji klienta i okres ochronny — pozostają w mocy. Kilka dni przed końcem okresu przypominamy e-mailem; kolejny okres możesz opłacić wcześniej, wtedy liczy się od końca obecnego.",
      },
      {
        q: "Kto płaci prowizję Finance You od pożyczki?",
        a: "Klient. Prowizja Finance You wynosi 7% Kwoty Udzielonej, nie mniej niż 5 000 zł, bez VAT, i jest potrącana z wypłaty. Przy wypłacie przelewasz ją na rachunek Finance You, a resztę kwoty pożyczki klientowi — np. przy 100 000 zł: 7 000 zł dla Finance You i 93 000 zł dla klienta. Nie jest to koszt inwestora.",
      },
      {
        q: "Na czym zarabiam jako inwestor?",
        a: "Na odsetkach od pożyczki, których wysokość nie może przekroczyć odsetek maksymalnych (obecnie 14,5% rocznie), oraz na prowizji inwestora, która jest osobnym elementem umowy spłacanym w ratach razem z kapitałem. Kalkulator pokazuje odsetki, prowizję, harmonogram i łączny zysk jeszcze przed złożeniem propozycji.",
      },
      {
        q: "Czy cena abonamentu może się zmienić?",
        a: "Cena obowiązuje przez cały opłacony okres. Zmiana wysokości Opłaty Abonamentowej może dotyczyć wyłącznie kolejnych okresów, opłaconych po jej wejściu w życie, i wymaga wcześniejszego powiadomienia Cię na trwałym nośniku (§ 2 Umowy ramowej). Jeśli nowa cena Ci nie odpowiada, nie opłacasz kolejnego okresu albo wypowiadasz umowę.",
      },
      {
        q: "Czy muszę sam rozliczyć podatek od zysku?",
        a: "Tak. Przychody z odsetek i prowizji rozliczasz samodzielnie, zgodnie z formą, w jakiej inwestujesz (osoba fizyczna, JDG, spółka). Finance You nie prowadzi rozliczeń podatkowych inwestorów — w razie wątpliwości skonsultuj się z doradcą podatkowym.",
      },
    ],
  },
  {
    key: "proces",
    label: "Proces i Zlecenia",
    items: [
      {
        q: "Jak wygląda droga do pierwszego Projektu?",
        a: "To jeden pipeline w panelu: podajesz dane inwestora (dla firm pobieramy je z GUS/KRS po NIP, REGON lub numerze KRS), wskazujesz rachunek do spłaty pożyczki, przechodzisz zdalną weryfikację tożsamości, my wykonujemy screening list sankcyjnych i PEP, doręczamy pakiet dokumentów, system wypełnia umowy Twoimi danymi, a Ty je akceptujesz. Na końcu opłacasz abonament i składasz Zlecenie.",
      },
      {
        q: "Jak przebiega weryfikacja tożsamości?",
        a: "Zdalnie — robisz zdjęcie dokumentu i selfie, bez wizyty i bez papierów. Niezależnie od KYC sprawdzamy listy sankcyjne, PEP i listy ostrzegawcze u wyspecjalizowanego dostawcy. Potwierdzone trafienie sankcyjne blokuje dostęp; status PEP kieruje sprawę do dodatkowej analizy.",
      },
      {
        q: "Jakie umowy podpisuję z Finance You?",
        a: "Umowę ramową pośrednictwa zawieraną na odległość, NDA z zakazem obchodzenia oraz umowę o udostępnianiu i powierzeniu danych (RODO). Przed akceptacją otrzymujesz komplet na trwałym nośniku (PDF e-mailem). Akceptacja ma formę dokumentową z pełnym śladem audytowym: wersja, skrót SHA-256, czas, IP i urządzenie.",
      },
      {
        q: "Czym jest Zlecenie i co w nim określam?",
        a: "Zlecenie to Twoje zamówienie na poszukiwanie Projektów: kwota (± 15%), maksymalny okres finansowania (do 120 miesięcy), minimalny zysk roczny i termin ważności. Finance You przyjmuje Zlecenie albo odmawia jego przyjęcia w ciągu 2 dni roboczych. Jedno Zlecenie odpowiada jednemu finansowaniu — zmiana parametrów wymaga nowego Zlecenia.",
      },
      {
        q: "Ile Zleceń mogę mieć jednocześnie?",
        a: "Do pięciu przyjętych Zleceń naraz. Zlecenie wygasa z upływem terminu ważności, po jego cofnięciu, po zawarciu transakcji albo po odrzuceniu pięciu kolejnych Projektów. Zlecenia bezterminowe lub obejmujące „każde finansowanie” nie są przyjmowane.",
      },
      {
        q: "Czy mogę przeglądać wszystkie dostępne Projekty?",
        a: "Nie. Nie ma wspólnego katalogu — widzisz wyłącznie Projekty dopasowane do Twojego przyjętego Zlecenia. To chroni dane klientów i sprawia, że dostajesz oferty spełniające Twoje kryteria, a nie przypadkową listę.",
      },
    ],
  },
  {
    key: "projekty",
    label: "Projekty i rezerwacja",
    items: [
      {
        q: "Jak wygląda przedstawienie Projektu?",
        a: "Etapowo. Najpierw widzisz anonimowy teaser (kwota, rodzaj nieruchomości, lokalizacja). Jeśli jesteś zainteresowany, akceptujesz Kartę Leada dla tego Projektu, a po niej otrzymujesz dane niezbędne do oceny: raport o inwestycji, harmonogram zaakceptowany przez klienta i dane kontaktowe.",
      },
      {
        q: "Czym jest Karta Leada?",
        a: "To załącznik transakcyjny do konkretnego Projektu, akceptowany osobno dla każdego Projektu przed ujawnieniem danych identyfikujących. Wskazuje m.in. moment ujawnienia, okres ochronny, warunki prowizji klienta i mechanizm jej zabezpieczenia.",
      },
      {
        q: "Jak długo Projekt jest zarezerwowany dla mnie?",
        a: "24 godziny od przyjęcia Projektu. Rezerwację można jednokrotnie przedłużyć o 12 godzin, jeśli wykażesz postęp — np. zadasz pytania, potwierdzisz środki lub rozpoczniesz analizę dokumentów. W tym czasie Projekt nie jest przedstawiany innym inwestorom. Możesz mieć do pięciu aktywnych rezerwacji, w tym maksymalnie dwie przedłużone.",
      },
      {
        q: "Co zawiera raport o inwestycji?",
        a: "Analizę nieruchomości i jej stanu prawnego na podstawie księgi wieczystej (właściciele, hipoteki, roszczenia, ograniczenia), wycenę i LTV, ocenę płynności lokalizacji, ocenę ryzyka z uzasadnieniem oraz harmonogram spłat zaakceptowany przez klienta. Raporty są bez limitu.",
      },
      {
        q: "Co jeśli Projekt mi nie odpowiada?",
        a: "Odrzucasz go w systemie — bez konsekwencji finansowych. Po odrzuceniu usuwasz otrzymane pełne dane, a Projekt może zostać przedstawiony innemu inwestorowi. Obowiązki poufności i pięcioletnia ochrona relacji z klientem pozostają jednak w mocy.",
      },
      {
        q: "Czy mogę negocjować warunki z klientem?",
        a: "Tak. Kalkulator propozycji pozwala dopasować oprocentowanie, prowizję i harmonogram do Twojej strategii w granicach zasad finansowania, a generator umowy pożyczki przygotuje dokument na podstawie uzgodnionych warunków i Twoich danych.",
      },
    ],
  },
  {
    key: "zabezpieczenia",
    label: "Zabezpieczenia i ryzyko",
    items: [
      {
        q: "Jakie są zasady finansowania?",
        a: "Finansujesz wyłącznie cel związany z działalnością gospodarczą klienta (B2B) — pożyczki na cele konsumpcyjne są wykluczone. LTV nie przekracza 60%, a oprocentowanie nie może przekroczyć odsetek maksymalnych (obecnie 14,5% rocznie). Prowizja inwestora jest osobnym elementem rozłożonym w ratach.",
      },
      {
        q: "Jak zabezpieczona jest pożyczka?",
        a: "Podstawą jest hipoteka na nieruchomości wpisana na Twoją rzecz, przy LTV do 60%. Dokumentacja może obejmować także poręczenie oraz oświadczenie o poddaniu się egzekucji z art. 777 k.p.c., które pozwala szybciej uzyskać tytuł wykonawczy w razie braku spłaty.",
      },
      {
        q: "Co oznacza LTV do 60%?",
        a: "Kwota finansowania nie przekracza 60% wartości nieruchomości stanowiącej zabezpieczenie. Przykładowo przy nieruchomości wartej 500 000 zł pożyczka może wynieść maksymalnie 300 000 zł. Bufor 40% ma chronić kapitał na wypadek spadku cen lub konieczności sprzedaży nieruchomości w egzekucji.",
      },
      {
        q: "Czy Finance You gwarantuje zysk?",
        a: "Nie. Finance You nie gwarantuje zysku, spłaty pożyczki ani braku ryzyka. Zabezpieczenie hipoteczne ogranicza ryzyko, ale go nie eliminuje — odzyskanie środków może wymagać czasu, kosztów i postępowania egzekucyjnego.",
      },
      {
        q: "Jakie ryzyka wiążą się z inwestycją?",
        a: "Przede wszystkim ryzyko opóźnień lub braku spłaty, spadku wartości nieruchomości, przedłużającej się egzekucji oraz kosztów prawnych. W skrajnym przypadku możliwa jest utrata części lub całości kapitału. Dlatego każdy Projekt warto zbadać samodzielnie i dopasować kwotę do własnej strategii.",
      },
    ],
  },
  {
    key: "windykacja",
    label: "Spłata i windykacja",
    items: [
      {
        q: "Na jaki rachunek klient spłaca pożyczkę?",
        a: "Na rachunek, który wskazujesz w pipeline'ie (NRB/IBAN). Jest obowiązkowy, bo trafia do umowy pożyczki i harmonogramu spłat — pieniądze płyną od klienta bezpośrednio do Ciebie, bez pośrednictwa Finance You.",
      },
      {
        q: "Jak monitoruję spłatę?",
        a: "W panelu widzisz terminy, saldo, naliczone odsetki i ewentualne opóźnienia. System wysyła automatyczne przypomnienia i prowadzi rejestr kontaktu z klientem, więc w każdej chwili wiesz, na jakim etapie jest sprawa.",
      },
      {
        q: "Co się dzieje, gdy klient przestaje płacić?",
        a: "Moduł windykacji AI prowadzi sprawę w sześciu etapach: od SMS-a, telefonu AI i e-maila w pierwszym tygodniu, przez wezwania do zapłaty, negocjacje i ugodę, wypowiedzenie umowy, aż po wniosek o klauzulę wykonalności i przekazanie sprawy komornikowi. Ty zachowujesz kontrolę nad każdą decyzją.",
      },
      {
        q: "Czy AI zastępuje prawnika?",
        a: "Nie. AI automatyzuje powtarzalne czynności operacyjne i komunikacyjne — przypomnienia, komunikaty, wezwania, rejestr kontaktu i monitoring. W przypadku sporu sądowego sprawa może wymagać profesjonalnej obsługi prawnej, której Finance You nie zapewnia.",
      },
    ],
  },
  {
    key: "prawo",
    label: "Prawo i dane",
    items: [
      {
        q: "Czym jest okres ochronny relacji z klientem?",
        a: "Przez pięć lat od ujawnienia danych identyfikujących klienta nie możesz zawrzeć z nim — bezpośrednio ani przez powiązane osoby — finansowania zabezpieczonego hipoteką z pominięciem Finance You. Okres biegnie niezależnie od odrzucenia Projektu, wygaśnięcia rezerwacji czy wypowiedzenia umowy.",
      },
      {
        q: "Co grozi za obejście Finance You?",
        a: "Kara Obejściowa w wysokości 5% Sumy Hipotecznej. Nie jest to cena usługi ani opłata — to kara umowna zabezpieczająca zakaz obchodzenia. Jeśli transakcję z klientem zawierasz prawidłowo, przez platformę i z przekazaniem prowizji klienta, kara nie powstaje.",
      },
      {
        q: "Jak chronione są dane klientów i moje?",
        a: "Dane Projektów są udostępniane tylko inwestorowi, któremu Projekt przypisano, w zakresie niezbędnym do oceny. Dokumenty otwierasz przez krótkotrwałe, podpisane linki, podgląd ma znak wodny z Twoimi danymi, a każde otwarcie jest logowane. Zasady przetwarzania określa umowa RODO, którą akceptujesz w pipeline'ie.",
      },
      {
        q: "Czy mogę odstąpić od umowy lub ją wypowiedzieć?",
        a: "Umowa ramowa jest zawierana na czas nieoznaczony i każda strona może ją wypowiedzieć z 30-dniowym okresem wypowiedzenia. Jeśli działasz jako konsument, możesz odstąpić od umowy zawartej na odległość w ciągu 14 dni bez podania przyczyny — zwracamy wtedy Opłatę Abonamentową, a jeśli na Twoje żądanie zaczęliśmy świadczyć usługę przed upływem tego terminu, pomniejszoną o część za wykorzystany okres. Okres ochronny już ujawnionych Projektów pozostaje w mocy.",
      },
      {
        q: "Jak mogę się skontaktować z Finance You?",
        a: "Napisz na kontakt@financeyou.pl albo skorzystaj z asystenta czatu na tej stronie — działa całą dobę i w sprawach współpracy przekaże kontakt opiekunowi.",
      },
    ],
  },
];

const FAQ_ALL = FAQ_GROUPS.flatMap((g) => g.items);

// Duży złoty przycisk „Dołącz do klubu” — jedyny CTA w hero, prowadzi do
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
      <BrandIcon name="handCoins" size={22} /> Dołącz do klubu
    </MktButton>
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
          <MktBadge variant="secondary">Klub Inwestorów Hipotecznych</MktBadge>
          <h1
            style={{
              marginTop: "1rem",
              fontSize: "clamp(2.1rem, 4vw, 3.1rem)",
              fontWeight: 900,
              lineHeight: 1.06,
              letterSpacing: "-0.025em",
            }}
          >
            Dołącz do{" "}
            <span
              style={{
                background: "linear-gradient(95deg,#f0c667,#f6dc9c 34%,#5fa2f6 82%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Klubu Inwestorów Hipotecznych.
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
            Uzyskaj dostęp do edukacji, dokumentów, procedur, narzędzi AI i spraw klientów
            szukających finansowania pod zabezpieczenie nieruchomości.
          </p>
          <div style={{ marginTop: "1.8rem", display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
            <JoinClubButton />
          </div>
        </div>
        <HeroFrame glow="linear-gradient(135deg, oklch(0.65 0.13 235 / .3), oklch(0.40 0.25 268 / .25))">
          <HeroIframe src={WISTIA_EMBED_URL} title="Klub Inwestorów Hipotecznych" />
        </HeroFrame>

        {/* Rząd 2 siatki hero: drugi film piętro niżej niż pierwszy, po lewej stronie
            (z naszego pliku; zapasowo HeyGen), po prawej krótki opis i ten sam złoty
            przycisk „Dołącz do klubu” prowadzący do cennika. */}
        <HeroFrame glow="linear-gradient(135deg, oklch(0.83 0.14 88 / .28), oklch(0.65 0.13 235 / .25))">
          {video ? (
            <video
              src={video.videoUrl}
              poster={video.posterUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              aria-label={VIDEO2_TITLE}
              style={{
                width: "100%",
                aspectRatio: "16 / 9",
                display: "block",
                background: "#05081c",
              }}
            />
          ) : (
            <HeroIframe src={LANDING_INVESTOR_VIDEO_HEYGEN_EMBED_URL} title={VIDEO2_TITLE} />
          )}
        </HeroFrame>
        <div>
          <Eyebrow tone="gold">Film 2</Eyebrow>
          <h2
            style={{
              marginTop: "0.6rem",
              fontSize: "clamp(1.45rem, 2.6vw, 2rem)",
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: "-0.02em",
            }}
          >
            Twoja droga do prywatnego finansowania nieruchomości.
          </h2>
          <p
            style={{
              marginTop: "0.9rem",
              maxWidth: "32rem",
              fontSize: "1rem",
              lineHeight: 1.6,
              color: "rgba(255,255,255,.8)",
            }}
          >
            {SHOW.kalkulator
              ? "Obejrzyj, jak wygląda prywatne finansowanie nieruchomości w Finance You. Bezpośrednio poniżej masz pełną wersję kalkulatora inwestora — policz zysk, raty, limity ustawowe i harmonogram spłat na własnych parametrach."
              : "Obejrzyj, jak wygląda prywatne finansowanie nieruchomości w Finance You, a poniżej sprawdź, co zyskujesz jako inwestor i ile kosztuje abonament."}
          </p>
          <div style={{ marginTop: "1.4rem", display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
            <JoinClubButton />
          </div>
        </div>
      </div>
    </section>
  );
}

// Ramka wideo w hero: poświata za kartą + zaokrąglona ramka. W środku <video>
// z naszego pliku albo iframe (Wistia / zapasowy HeyGen).
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

// Pełna wersja kalkulatora inwestora — ten sam komponent i ten sam tryb
// (investorGuidance), co w panelu /inwestor/kalkulator: stopy NBP, limity
// odsetek i MPKK, zysk ponad inflację, analiza zabezpieczenia, próg AML,
// harmonogram, PDF i CSV. Bez dwóch przycisków wymagających konta („Wyślij do
// kreatora", „Wyślij do klienta"). Sekcja stoi pod filmami, przed zakładkami.
function CalculatorSection() {
  return (
    <Section id="kalkulator">
      <SectionHead
        center
        eyebrow="Kalkulator inwestora"
        title="Pełny kalkulator pożyczki hipotecznej"
        sub="Ta sama, najbardziej rozbudowana wersja co w panelu inwestora: stopy NBP na żywo, limit odsetek maksymalnych i MPKK, prowizje, realna stopa zwrotu po inflacji, analiza zabezpieczenia, próg AML oraz harmonogram spłat z eksportem do PDF i CSV."
      />
      <div style={{ marginTop: "2.5rem" }}>
        <LoanCalculator investorGuidance hideAccountActions />
      </div>
      <ComplianceNote style={{ marginTop: "2rem" }}>
        Wyliczenia mają charakter poglądowy i nie stanowią oferty ani rekomendacji inwestycyjnej.
        Ostateczne warunki wynikają z umowy pożyczki. Inwestowanie wiąże się z ryzykiem utraty
        części lub całości kapitału.
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
        eyebrow="Akademia inwestora"
        title="Program szkolenia w 7 modułach"
        sub="Od wprowadzenia i strategii, przez marketing, prawo i operacje, po analizę nieruchomości, analizę klienta i praktyczne case studies."
      />
      <div style={{ marginTop: "2.5rem" }}>
        <TwoColSlider slides={AKADEMIA} />
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

function CennikSection({ products }: { products: AccessProduct[] }) {
  return (
    <Section id="cennik" tint>
      <SectionHead
        center
        eyebrow="Cennik"
        title="Jeden abonament, pełny dostęp"
        sub={`${plnLabel(SUBSCRIPTION_MONTHLY_PLN)} miesięcznie albo ${plnLabel(SUBSCRIPTION_YEARLY_PLN)} za rok — przesuń suwak i zobacz, ile oszczędzasz przy płatności rocznej (${SUBSCRIPTION_YEARLY_DISCOUNT_PCT}% rabatu). Bez konieczności podpinania karty kredytowej.`}
      />
      <div style={{ marginTop: "2.5rem" }}>
        <InvestorPricing products={products} />
      </div>
      <ComplianceNote style={{ marginTop: "2rem" }}>
        Ceny brutto (PLN). {SUBSCRIPTION_PAYMENT_SENTENCE} Prowizję Finance You płaci klient: 7%
        Kwoty Udzielonej, nie mniej niż 5 000 zł, bez VAT, potrącaną z wypłaty (100 000 zł → 7 000
        zł dla Finance You, 93 000 zł dla klienta). Materiały mają charakter edukacyjny i
        informacyjny, a Finance You nie gwarantuje zysku.
      </ComplianceNote>
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
  const { products, video } = Route.useLoaderData();
  return (
    <MarketingShell page="inwestor" sticky={{ label: "Dołącz do klubu", href: PRICING_HASH }}>
      <Hero video={video} />

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
          title="Mniej ryzyka i formalności, więcej dobrych Projektów"
          sub="Jeden abonament, bez prowizji od Twojego zysku. Dostajesz gotowy proces od Zlecenia po spłatę: sprawdzony klient, pełny raport, harmonogram, umowy, compliance i windykacja w jednym koncie."
        />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={BENEFITS} icon3d />
        </div>
      </Section>

      {!SHOW.zakladki && (
        <>
          {SHOW.system && <SmartOfferSection />}
          {SHOW.akademia && <AkademiaSection />}
          {SHOW.ochrona && <OchronaSection />}
          {SHOW.windykacja && <WindykacjaSection />}
        </>
      )}

      <Section tint>
        <SectionHead eyebrow="AI dla inwestora" title="Automatyzacja powtarzalnych czynności" />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={AI} cols={4} icon3d />
        </div>
        <ComplianceNote style={{ marginTop: "2rem" }}>
          AI automatyzuje powtarzalne czynności operacyjne i komunikacyjne. W przypadku sporu
          sądowego sprawa może wymagać profesjonalnej obsługi prawnej.
        </ComplianceNote>
      </Section>

      <Section>
        <SectionHead
          eyebrow="Compliance"
          title="Proces zgodny z procedurami"
          sub="Wsparcie w obszarze AML, RODO, dokumentacji, rejestrów i zgodności procesu — plus edukacja prawno-operacyjna."
        />
        <div
          className="fy-modules"
          style={{
            marginTop: "2.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(6,1fr)",
            gap: "0.7rem",
          }}
        >
          {COMPLIANCE.map((c) => (
            <div
              key={c.t}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: "1.1rem 0.5rem",
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                boxShadow: "var(--shadow-xs)",
                textAlign: "center",
              }}
            >
              <Icon3D name={c.icon} size={56} />
              <span style={{ fontSize: "0.74rem", fontWeight: 600 }}>{c.t}</span>
            </div>
          ))}
        </div>
        <ComplianceNote style={{ marginTop: "2rem" }}>
          Finance You wspiera zgodność procesu i edukację prawno-operacyjną. Nie zapewnia obsługi
          prawnej.
        </ComplianceNote>
      </Section>

      {!SHOW.zakladki && <CennikSection products={products} />}

      <Section id="faq">
        <SectionHead
          center
          eyebrow="FAQ"
          title="Najczęstsze pytania inwestorów"
          sub={`${FAQ_ALL.length} odpowiedzi w ${FAQ_GROUPS.length} kategoriach — od pierwszych kroków i kosztów, przez Zlecenia i rezerwację Projektu, po zabezpieczenia, windykację i kwestie prawne.`}
        />
        <FAQGroups groups={FAQ_GROUPS} />
        <ComplianceNote style={{ marginTop: "2rem" }}>
          Nie znalazłeś odpowiedzi? Napisz na kontakt@financeyou.pl albo zapytaj asystenta czatu.
          Odpowiedzi mają charakter informacyjny — wiążące są postanowienia Umowy ramowej, NDA i
          umowy RODO.
        </ComplianceNote>
      </Section>

      <CTASection
        single
        title="Zbuduj proces inwestowania w pożyczki hipoteczne z narzędziami, dokumentami i AI."
        buttons={[{ label: "Załóż konto inwestora", href: JOIN }]}
      />

      <ChatWidget
        source="dla-inwestora"
        endpoint="/api/public/investor-chat-widget"
        storageKey="fy_invest_chat_session_id"
        greeting="Dzień dobry. Jestem asystentem Finance You dla inwestorów instytucjonalnych. Odpowiem na pytania o model inwestycji w pożyczki zabezpieczone hipoteką, przyjmę też prośbę o fakturę. W sprawach współpracy przekażę kontakt opiekunowi. W czym mogę pomóc?"
        title="Asystent dla inwestorów"
        subtitle="Inwestycje instytucjonalne, 24/7"
      />
    </MarketingShell>
  );
}
