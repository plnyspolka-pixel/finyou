import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/shell";
import {
  Section,
  SectionHead,
  FeatureGrid,
  PricingCard,
  FAQ,
  ComplianceNote,
  CTASection,
  type FeatureItemData,
} from "@/components/marketing/sections";
import { MktBadge, MktButton, Eyebrow } from "@/components/marketing/primitives";
import { BrandIcon } from "@/components/marketing/brand-icon";
import { Icon3D, type Icon3DName } from "@/components/marketing/icon-3d";
import {
  TwoColSlider,
  SmartOfferSlider,
  SmartOfferPanel,
  type TwoColSlide,
} from "@/components/marketing/sliders";
import { MarketingPricing } from "@/components/marketing/pricing";
import { listAccessProducts } from "@/lib/access/state.functions";
import type { AccessProduct } from "@/lib/access/core";

const JOIN = "/rejestracja?role=inwestor";

// Cennik pobierany z zaufanego katalogu access_products (te same ceny co panel).
// Odporne na brak bazy podczas SSR — wtedy pokazujemy statyczny fallback.
async function loadInvestorProducts(): Promise<AccessProduct[]> {
  try {
    return await listAccessProducts({ data: { audience: "investor" } });
  } catch {
    return [];
  }
}

const PRICING_FEATURES: Record<number, string[]> = {
  30: [
    "Dostęp do spraw klientów",
    "Akademia inwestora",
    "Wzory dokumentów i procedury",
    "Narzędzia AI + CRM",
    "Wsparcie compliance",
  ],
  365: [
    "Wszystko z pakietu 30-dniowego",
    "Pełny rok bez przerw w dostępie",
    "Priorytetowe wsparcie",
  ],
};

export const Route = createFileRoute("/dla-inwestora")({
  loader: async () => ({ products: await loadInvestorProducts() }),
  head: () => ({
    meta: [
      {
        title: "Klub Inwestorów Hipotecznych — inwestuj w pożyczki pod nieruchomości | Finance You",
      },
      {
        name: "description",
        content:
          "Dołącz do Klubu Inwestorów Hipotecznych Finance You: dostęp do spraw klientów, Akademia inwestora, wzory dokumentów, narzędzia AI, CRM i wsparcie compliance.",
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

const GET: FeatureItemData[] = [
  { icon: "access", t: "Dostęp do spraw", d: "Zgłoszenia klientów szukających finansowania." },
  {
    icon: "training",
    t: "Szkolenie",
    d: "Akademia inwestora — od podstaw do zaawansowanych zagadnień.",
  },
  { icon: "dossier", t: "Dokumenty", d: "Gotowe wzory i szablony operacyjne." },
  { icon: "procedures", t: "Procedury", d: "Uporządkowany, powtarzalny proces działania." },
  { icon: "knowledge", t: "Baza wiedzy", d: "Materiały o analizie nieruchomości i zabezpieczeń." },
  { icon: "aibrain", t: "AI do obsługi procesu", d: "Automatyzacja komunikacji i przypomnień." },
  { icon: "crmfolder", t: "CRM", d: "Statusy spraw i historia działań w jednym miejscu." },
  { icon: "shieldcheck", t: "Compliance", d: "Wsparcie w zakresie AML, RODO i dokumentacji." },
  { icon: "community", t: "Społeczność", d: "Dostęp do klubu i wymiany doświadczeń." },
  { icon: "updates", t: "Aktualizacje", d: "Nowe materiały i rozwój narzędzi." },
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
    q: "Co dokładnie dostaję w klubie?",
    a: "Dostęp do spraw, szkolenia, wzory dokumentów, procedury, bazę wiedzy, narzędzia AI, CRM oraz wsparcie compliance.",
  },
  {
    q: "Czy mam dostęp do spraw klientów?",
    a: "Tak. Uzyskujesz dostęp do zgłoszeń klientów szukających finansowania pod zabezpieczenie nieruchomości.",
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

function Hero() {
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
        <div style={{ position: "relative" }}>
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "-1.5rem",
              borderRadius: "var(--radius-3xl)",
              background:
                "linear-gradient(135deg, oklch(0.65 0.13 235 / .3), oklch(0.40 0.25 268 / .25))",
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
            <iframe
              src="https://fast.wistia.net/embed/iframe/kjp6klcd5u?seo=false"
              title="Klub Inwestorów Hipotecznych"
              allow="autoplay; fullscreen"
              allowFullScreen
              style={{ width: "100%", aspectRatio: "16 / 9", display: "block", border: 0 }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// Iframe z okazjami dopasowuje wysokość do treści zgłaszanej przez embed
// (postMessage z /embed/leady) — karty nie ucinają się na żadnej szerokości.
function LeadsEmbed() {
  const [height, setHeight] = useState(430);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; height?: number } | null;
      if (d?.type === "fy:leady-embed:height" && typeof d.height === "number" && d.height > 0) {
        setHeight(Math.ceil(d.height));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <div
      style={{
        marginTop: "1.1rem",
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid rgba(84, 124, 214, 0.2)",
      }}
    >
      <iframe
        src="https://app.financeyou.pl/embed/leady"
        style={{ border: 0, width: "100%", minHeight: 340, height, display: "block" }}
        loading="lazy"
        title="Ostatnie okazje inwestycyjne Finance You"
      />
    </div>
  );
}

function InvestorLanding() {
  const { products } = Route.useLoaderData();
  return (
    <MarketingShell page="inwestor" sticky={{ label: "Dołącz do Klubu", href: JOIN }}>
      <Hero />

      <Section>
        <SmartOfferPanel>
          <Eyebrow tone="gold" style={{ letterSpacing: "0.24em" }}>
            Ostatnie okazje inwestycyjne
          </Eyebrow>
          <LeadsEmbed />
        </SmartOfferPanel>
        <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "center" }}>
          <MktButton variant="outline" href={JOIN}>
            <BrandIcon name="handCoins" size={16} /> Zobacz wszystkie okazje w aplikacji
          </MktButton>
        </div>
        <ComplianceNote style={{ marginTop: "1.5rem" }}>
          Przykładowe okazje o charakterze poglądowym. Dane nie stanowią oferty ani rekomendacji
          inwestycyjnej. Inwestowanie wiąże się z ryzykiem utraty kapitału.
        </ComplianceNote>
      </Section>

      <Section>
        <SmartOfferSlider />
      </Section>

      <Section>
        <SectionHead eyebrow="Co otrzymujesz" title="Wszystko, czego potrzebuje inwestor" />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={GET} icon3d />
        </div>
      </Section>

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

      <Section tint id="ochrona">
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

      <Section tint id="cennik">
        <SectionHead
          center
          eyebrow="Cennik"
          title="Klub Inwestorów Hipotecznych"
          sub="Jednorazowa płatność za czasowy dostęp — bez automatycznych odnowień."
        />
        <div style={{ marginTop: "2.5rem" }}>
          <MarketingPricing
            products={products}
            audience="investor"
            ctaLabel="Wykup dostęp"
            featuresByDuration={PRICING_FEATURES}
            fallback={
              <PricingCard
                eyebrow="Klub Inwestorów Hipotecznych"
                title="Pełny dostęp inwestora"
                price="999 zł"
                period="/ 30 dni"
                cta="Dołącz do Klubu"
                href={JOIN}
                features={[
                  "Dostęp do spraw klientów",
                  "Akademia inwestora",
                  "Wzory dokumentów i procedury",
                  "Narzędzia AI + CRM",
                  "Wsparcie compliance",
                  "Dostęp do społeczności",
                ]}
                note="Ceny brutto. Dostęp roczny: 5 999 zł / 365 dni. Materiały mają charakter edukacyjny i informacyjny."
              />
            }
          />
        </div>
        <ComplianceNote style={{ marginTop: "2rem" }}>
          Ceny brutto (PLN). Zakup wymaga konta inwestora — po wybraniu pakietu przejdziesz do
          bezpiecznej płatności Tpay, a faktura zostanie wystawiona automatycznie. Materiały mają
          charakter edukacyjny i informacyjny.
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
    </MarketingShell>
  );
}
