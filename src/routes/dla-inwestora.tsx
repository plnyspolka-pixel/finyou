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
} from "@/components/marketing/sections";
import { MktBadge, MktButton, Eyebrow } from "@/components/marketing/primitives";
import { BrandIcon } from "@/components/marketing/brand-icon";
import { Icon3D, type Icon3DName } from "@/components/marketing/icon-3d";
import { TwoColSlider, SmartOfferSlider, type TwoColSlide } from "@/components/marketing/sliders";
import { InvestorPricing } from "@/components/marketing/investor-pricing";
import { ChatWidget } from "@/components/landing/chat-widget";
import { LoanCalculator } from "@/components/loan-calculator";
import { LeadsTable } from "@/routes/embed.leady";
import { listAccessProducts } from "@/lib/access/state.functions";
import type { AccessProduct } from "@/lib/access/core";
import { fetchPublicLeads, type PublicLead } from "@/lib/public-leads.functions";
import { getLandingInvestorVideo } from "@/lib/landing-video.functions";
import {
  LANDING_INVESTOR_VIDEO,
  LANDING_INVESTOR_VIDEO_HEYGEN_EMBED_URL,
  type LandingVideoInfo,
} from "@/lib/landing-video";

const JOIN = "/rejestracja?role=inwestor";

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

// Okazje ładowane bezpośrednio (bez iframe) — odporne na brak bazy podczas SSR.
async function loadPublicLeads(): Promise<PublicLead[]> {
  try {
    return await fetchPublicLeads();
  } catch {
    return [];
  }
}

// Kroki pipeline'u pokazywane na stronie — ta sama kolejność co w panelu
// (src/lib/investor-plan/pipeline.ts).
const PIPELINE_STEPS: { n: number; t: string; d: string; hue: number }[] = [
  {
    n: 1,
    t: "Dane pożyczkodawcy",
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
    t: "Zlecenie poszukiwania okazji",
    d: "Kwota ± 15%, maksymalny okres, minimalny zysk roczny i termin ważności. Od tego momentu szukamy dla Ciebie.",
    hue: 8,
  },
];

export const Route = createFileRoute("/dla-inwestora")({
  loader: async () => {
    const [products, leads, video] = await Promise.all([
      loadInvestorProducts(),
      loadPublicLeads(),
      loadLandingVideo(),
    ]);
    return { products, leads, video };
  },
  head: () => ({
    meta: [
      {
        title: "Klub Inwestorów Hipotecznych — inwestuj w pożyczki pod nieruchomości | Finance You",
      },
      {
        name: "description",
        content:
          "Klub Inwestorów Hipotecznych Finance You: konto Podstawowe bez opłat stałych (płacisz za okazję) i pakiet PRO — 3 000 zł / 6 miesięcy + 5% od udzielonej pożyczki.",
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
  }),
  component: InvestorLanding,
});

// Zakres pakietu Podstawowego (0 zł) — to dostaje każde konto po przejściu
// pipeline'u; dopłata dotyczy wyłącznie odblokowania konkretnej okazji.
const GET: FeatureItemData[] = [
  {
    icon: "access",
    t: "Zlecenie okazji",
    d: "Składasz Zlecenie, my szukamy pasujących projektów.",
  },
  {
    icon: "shieldcheck",
    t: "KYC i listy sankcyjne",
    d: "Weryfikacja tożsamości i screening sankcji/PEP w jednym procesie.",
  },
  { icon: "dossier", t: "Umowy wypełnione przez system", d: "Komparycja, podpis i ślad audytowy." },
  {
    icon: "procedures",
    t: "Wyłączność na okazję",
    d: "Zdecydowany klient zarezerwowany tylko dla Ciebie.",
  },
  { icon: "knowledge", t: "Raport o inwestycji", d: "Nieruchomość, zabezpieczenie, LTV i ryzyko." },
  {
    icon: "status",
    t: "Zaakceptowany harmonogram",
    d: "Plan spłat potwierdzony przez pożyczkobiorcę.",
  },
  { icon: "chat", t: "Dane kontaktowe", d: "Bezpośredni kontakt po odblokowaniu okazji." },
  {
    icon: "documents",
    t: "Generator umowy pożyczki",
    d: "Gotowy dokument na podstawie Twoich danych.",
  },
];

// Zakres wyłącznie pakietu PRO.
const PRO_ONLY: FeatureItemData[] = [
  { icon: "training", t: "Akademia inwestora", d: "Siedem modułów — od strategii po windykację." },
  { icon: "shieldcheck", t: "Kalkulator compliance", d: "Limity kosztów i zgodność warunków." },
  { icon: "complianceAml", t: "Moduł AML", d: "Klienci, transakcje, ryzyko, zgłoszenia i UPO." },
  { icon: "aibrain", t: "Windykacja AI", d: "Sześć etapów od pierwszego kontaktu po egzekucję." },
  { icon: "knowledge", t: "Raporty bez limitu", d: "Nielimitowana liczba pełnych raportów." },
  { icon: "updates", t: "Pierwszeństwo ofert", d: "Wybierasz z puli przed pozostałymi." },
];

const AKADEMIA: TwoColSlide[] = [
  {
    src: "/marketing/akademia/modul-1.png",
    etap: "Moduł 1",
    short: "Wprowadzenie",
    title: "Wprowadzenie i strategia",
    desc: "Poznaj zasady działania rynku prywatnych pożyczek zabezpieczonych na nieruchomościach. Dowiedz się, jak inwestorzy wyszukują okazje, budują własną strategię oraz wybierają model działania dopasowany do posiadanego kapitału i doświadczenia.",
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

const FAQS = [
  {
    q: "Czy Finance You gwarantuje zysk?",
    a: "Nie. Finance You nie gwarantuje zysku ani braku ryzyka. Inwestowanie w pożyczki zabezpieczone nieruchomościami wiąże się z ryzykiem.",
  },
  {
    q: "Czy Finance You doradza inwestycyjnie?",
    a: "Nie. Materiały mają charakter edukacyjny i informacyjny. Decyzje inwestycyjne podejmujesz samodzielnie.",
  },
  {
    q: "Ile to kosztuje?",
    a: "Konto w pakiecie Podstawowym jest bez opłat stałych — płacisz wyłącznie za odblokowanie konkretnej okazji (wyłączność, raport o inwestycji, zaakceptowany harmonogram i dane kontaktowe). Pakiet PRO kosztuje 3 000 zł brutto za 6 miesięcy plus 5% kwoty udzielonej pożyczki i nie ma opłat za pojedyncze okazje.",
  },
  {
    q: "Co dokładnie dostaję w pakiecie Podstawowym?",
    a: "Pełny pipeline (dane pożyczkodawcy, rachunek do spłaty, weryfikacja tożsamości, screening list sankcyjnych, komplet umów wypełnionych przez system), składanie Zleceń, możliwość zakupu okazji na wyłączność wraz z raportem, harmonogramem zaakceptowanym przez pożyczkobiorcę i danymi kontaktowymi, a także generator umowy pożyczki.",
  },
  {
    q: "Czym różni się pakiet PRO?",
    a: "PRO zawiera wszystko z pakietu Podstawowego bez opłat za pojedyncze okazje, a dodatkowo Akademię inwestora, kalkulator compliance, moduł AML, moduł windykacji AI, nielimitowaną liczbę pełnych raportów oraz pierwszeństwo wyboru ofert.",
  },
  {
    q: "Jak wygląda proces zanim zobaczę pierwszą okazję?",
    a: "To jeden pipeline w panelu: podajesz dane pożyczkodawcy (dla firm pobieramy je z GUS/KRS po NIP lub KRS), wskazujesz obowiązkowy rachunek do spłaty pożyczki, przechodzisz zdalną weryfikację tożsamości, my uruchamiamy screening list sankcyjnych i PEP, następnie system wypełnia dokumenty Twoimi danymi, a Ty je podpisujesz i akceptujesz. Na końcu składasz Zlecenie.",
  },
  {
    q: "Czy mogę finansować sprawy klientów?",
    a: "Tak. Zyskujesz możliwość składania Zleceń — na ich podstawie przedstawiamy Ci dopasowane projekty klientów szukających finansowania pod zabezpieczenie nieruchomości.",
  },
  {
    q: "Jak działa AI?",
    a: "AI automatyzuje powtarzalne czynności operacyjne i komunikacyjne — przypomnienia, komunikaty, rejestr kontaktu i monitoring. W przypadku sporu sądowego sprawa może wymagać profesjonalnej obsługi prawnej.",
  },
  {
    q: "Jakie dokumenty otrzymuję?",
    a: "Gotowe wzory umów, oświadczeń i dokumentów operacyjnych wykorzystywanych w procesie.",
  },
  {
    q: "Czy muszę mieć doświadczenie?",
    a: "Nie. Akademia prowadzi od podstaw. Materiały są dostosowane do różnych poziomów zaawansowania.",
  },
  {
    q: "Czy inwestowanie wiąże się z ryzykiem?",
    a: "Tak. Każda inwestycja wiąże się z ryzykiem, w tym z ryzykiem utraty części lub całości kapitału.",
  },
];

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
            <MktButton variant="cta" href={JOIN}>
              <BrandIcon name="handCoins" size={18} /> Dołącz do Klubu
            </MktButton>
          </div>
        </div>
        <HeroFrame glow="linear-gradient(135deg, oklch(0.65 0.13 235 / .3), oklch(0.40 0.25 268 / .25))">
          <HeroIframe src={WISTIA_EMBED_URL} title="Klub Inwestorów Hipotecznych" />
        </HeroFrame>

        {/* Rząd 2 siatki hero: drugi film piętro niżej niż pierwszy, po lewej stronie
            (z naszego pliku; zapasowo HeyGen), po prawej krótki opis z przejściem
            do kalkulatora inwestora pod hero. */}
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
            Obejrzyj, jak wygląda prywatne finansowanie nieruchomości w Finance You. Bezpośrednio
            poniżej masz pełną wersję kalkulatora inwestora — policz zysk, raty, limity ustawowe i
            harmonogram spłat na własnych parametrach.
          </p>
          <div style={{ marginTop: "1.4rem", display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
            <MktButton variant="outline" href="#kalkulator">
              <BrandIcon name="ltv" size={16} /> Policz w kalkulatorze
            </MktButton>
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

// Panel z okazjami renderowany bezpośrednio (bez iframe), na całą szerokość
// strony — tylko lekki padding boczny, bez ograniczenia max-width.
function LeadsSection({ leads }: { leads: PublicLead[] }) {
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
        Ostatnie okazje inwestycyjne
      </Eyebrow>
      <div style={{ marginTop: "1.1rem" }}>
        {leads.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-sm text-slate-300">
            Brak okazji do wyświetlenia.
          </div>
        ) : (
          <LeadsTable leads={leads} />
        )}
      </div>
      <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "center" }}>
        <MktButton variant="outline" href={JOIN}>
          <BrandIcon name="handCoins" size={16} /> Zobacz wszystkie okazje w aplikacji
        </MktButton>
      </div>
      <ComplianceNote style={{ marginTop: "1.5rem" }}>
        Przykładowe okazje o charakterze poglądowym. Dane nie stanowią oferty ani rekomendacji
        inwestycyjnej. Inwestowanie wiąże się z ryzykiem utraty kapitału.
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
  { key: "cennik", hash: "#cennik", label: "Cennik" },
];

// Jeden pipeline — kolorowa oś kroków, te same etapy co w panelu inwestora.
function PipelineSection() {
  return (
    <Section>
      <SectionHead
        center
        eyebrow="Jeden pipeline"
        title="Od rejestracji do Zlecenia — dziewięć kroków"
        sub="Dane pożyczkodawcy, rachunek do spłaty, weryfikacja tożsamości, screening list sankcyjnych, komplet umów wypełnionych przez system i Zlecenie poszukiwania okazji. Wszystko w jednym miejscu, bez papierów."
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

function InvestorTabs({ leads, products }: { leads: PublicLead[]; products: AccessProduct[] }) {
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
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
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

      {active === "oferty" && <LeadsSection leads={leads} />}

      {active === "pipeline" && <PipelineSection />}

      {active === "system" && (
        <Section>
          <SmartOfferSlider />
        </Section>
      )}

      {active === "akademia" && (
        <Section>
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
      )}

      {active === "ochrona" && (
        <Section tint>
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
      )}

      {active === "windykacja" && (
        <Section>
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
      )}

      {active === "cennik" && (
        <Section tint>
          <SectionHead
            center
            eyebrow="Cennik"
            title="Dwa pakiety — Podstawowy i PRO"
            sub="W Podstawowym zakładasz konto bez opłat stałych, składasz Zlecenie i płacisz tylko za okazję, którą bierzesz. PRO to ten sam zakres bez opłat jednostkowych plus pełny warsztat inwestora."
          />
          <div style={{ marginTop: "2.5rem" }}>
            <InvestorPricing products={products} />
          </div>
          <ComplianceNote style={{ marginTop: "2rem" }}>
            Ceny brutto (PLN). Pakiet PRO: 3 000 zł za 180 dni dostępu oraz 5% kwoty udzielonej
            pożyczki, płatne po jej uruchomieniu. Zakup wymaga konta inwestora — po wybraniu pakietu
            przejdziesz do bezpiecznej płatności Tpay, a faktura zostanie wystawiona automatycznie.
            Materiały mają charakter edukacyjny i informacyjny, a Finance You nie gwarantuje zysku.
          </ComplianceNote>
        </Section>
      )}
    </div>
  );
}

function InvestorLanding() {
  const { products, leads, video } = Route.useLoaderData();
  return (
    <MarketingShell page="inwestor" sticky={{ label: "Dołącz do Klubu", href: JOIN }}>
      <Hero video={video} />

      <CalculatorSection />

      <InvestorTabs leads={leads} products={products} />

      <Section>
        <SectionHead
          eyebrow="Pakiet Podstawowy"
          title="Konto bez opłat stałych — płacisz za okazję, którą bierzesz"
          sub="Po przejściu pipeline'u składasz Zlecenie. Gdy znajdziemy projekt, kupujesz go na wyłączność razem z raportem, harmonogramem i kontaktem."
        />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={GET} icon3d />
        </div>
      </Section>

      <Section tint>
        <SectionHead
          eyebrow="Pakiet PRO"
          title="To samo bez opłat za okazje — plus pełny warsztat"
          sub="3 000 zł za 6 miesięcy i 5% od udzielonej pożyczki. Akademia, compliance, AML, windykacja AI, raporty bez limitu i pierwszeństwo wyboru ofert."
        />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={PRO_ONLY} cols={3} icon3d />
        </div>
      </Section>

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

      <Section id="faq">
        <SectionHead center eyebrow="FAQ" title="Najczęstsze pytania inwestorów" />
        <FAQ items={FAQS} />
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
