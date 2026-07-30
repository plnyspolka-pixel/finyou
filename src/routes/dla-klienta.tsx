import { createFileRoute } from "@tanstack/react-router";
import { LandingWizardForm } from "@/components/landing/landing-wizard-form";
import { MarketingShell } from "@/components/marketing/shell";
import {
  Section,
  SectionHead,
  FeatureGrid,
  ProcessSteps,
  FAQ,
  ComplianceNote,
  CTASection,
  type FeatureItemData,
} from "@/components/marketing/sections";
import { MktBadge } from "@/components/marketing/primitives";
import { Icon3D, type Icon3DName } from "@/components/marketing/icon-3d";

const APPLY = "/rejestracja?role=klient";

export const Route = createFileRoute("/dla-klienta")({
  head: () => ({
    meta: [
      { title: "Pożyczka pod zabezpieczenie nieruchomości — sprawdź bezpłatnie | Finance You" },
      {
        name: "description",
        content:
          "Złóż bezpłatny wniosek o pożyczkę pod zabezpieczenie nieruchomości. Jeden wniosek trafia do wielu prywatnych inwestorów i partnerów finansowych. Bez zobowiązań.",
      },
      { property: "og:title", content: "Dla klientów — Finance You" },
      {
        property: "og:description",
        content: "Sprawdź bezpłatnie możliwości finansowania pod zabezpieczenie nieruchomości.",
      },
      { property: "og:url", content: "https://financeyou.pl/dla-klienta" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/dla-klienta" }],
  }),
  component: ClientLanding,
});

const FORWHOM: FeatureItemData[] = [
  {
    icon: "house",
    t: "Masz nieruchomość",
    d: "Mieszkanie, dom, lokal lub działkę, która może być zabezpieczeniem.",
  },
  {
    icon: "kalkulator",
    t: "Potrzebujesz finansowania",
    d: "Chcesz sprawdzić, jakie masz realne możliwości.",
  },
  {
    icon: "shield",
    t: "Bank odmówił",
    d: "Liczy się wartość zabezpieczenia, nie sam scoring bankowy.",
  },
  {
    icon: "automation",
    t: "Masz pilny temat",
    d: "Zależy Ci na sprawnym, uporządkowanym procesie.",
  },
  {
    icon: "growth",
    t: "Chcesz sprawdzić opcje",
    d: "Bez zobowiązań — zgłoszenie sprawy jest bezpłatne.",
  },
  {
    icon: "loan",
    t: "Finansowanie pomostowe",
    d: "Potrzebujesz środków na czas, zanim domkniesz inną transakcję.",
  },
];

const HOW = [
  { t: "Wypełniasz formularz", d: "Krótki wniosek online — kilka minut." },
  { t: "Dodajesz numer KW", d: "Numer księgi wieczystej i podstawowe informacje o nieruchomości." },
  { t: "System porządkuje sprawę", d: "Twoje dane zostają ustrukturyzowane i opisane." },
  {
    t: "Sprawa trafia do finansujących",
    d: "Może zostać pokazana inwestorom i partnerom finansowym.",
  },
  { t: "Otrzymujesz informację", d: "Dostajesz informację o możliwych opcjach." },
];

const PROPS: { icon: Icon3DName; t: string }[] = [
  { icon: "propApartment", t: "Mieszkanie" },
  { icon: "propHouse", t: "Dom" },
  { icon: "propStore", t: "Lokal użytkowy/usługowy" },
  { icon: "propPlot", t: "Działka budowlana" },
  { icon: "propField", t: "Grunt rolny" },
];

const WHY: FeatureItemData[] = [
  {
    icon: "application",
    t: "Jeden wniosek",
    d: "Wypełniasz raz — trafia do wielu potencjalnych finansujących.",
  },
  {
    icon: "investors",
    t: "Wielu finansujących",
    d: "Prywatni inwestorzy i partnerzy finansowi w jednym miejscu.",
  },
  { icon: "automation", t: "Prosty proces", d: "Przejrzyste kroki, bez bankowej biurokracji." },
  {
    icon: "status",
    t: "Jasne dane",
    d: "Widzisz, co jest potrzebne i na jakim etapie jest sprawa.",
  },
  {
    icon: "shieldcheck",
    t: "Bezpłatne zgłoszenie",
    d: "Złożenie wniosku nic nie kosztuje i jest bez zobowiązań.",
  },
  {
    icon: "updates",
    t: "Szybsza weryfikacja",
    d: "Uporządkowane dokumenty przyspieszają analizę.",
  },
];

const FAQS = [
  {
    q: "Czy złożenie wniosku jest płatne?",
    a: "Nie. Złożenie wniosku jest całkowicie bezpłatne i nie zobowiązuje Cię do niczego.",
  },
  {
    q: "Czy Finance You gwarantuje pożyczkę?",
    a: "Nie. Finance You nie gwarantuje finansowania. Platforma porządkuje sprawę i może pokazać ją inwestorom oraz partnerom finansowym — decyzja należy do finansujących.",
  },
  {
    q: "Do kogo trafia mój wniosek?",
    a: "Do prywatnych inwestorów i partnerów finansowych współpracujących z Finance You, którzy analizują możliwość finansowania.",
  },
  {
    q: "Czy muszę mieć numer KW?",
    a: "Numer księgi wieczystej znacząco przyspiesza analizę. Jeśli go nie masz, opisz nieruchomość — pomożemy ustalić dalsze kroki.",
  },
  {
    q: "Jakie nieruchomości można zgłosić?",
    a: "Mieszkanie, dom, lokal użytkowy, działkę budowlaną lub grunt rolny na terenie Polski.",
  },
  {
    q: "Czy kalkulator pokazuje ostateczne koszty?",
    a: "Nie. Kalkulacja ma charakter wyłącznie orientacyjny i nie stanowi oferty finansowania.",
  },
  {
    q: "Ile trwa analiza?",
    a: "Zależy od kompletności danych i decyzji finansujących. Uporządkowane dokumenty przyspieszają proces.",
  },
  {
    q: "Czy mogę złożyć wniosek po odmowie banku?",
    a: "Tak. W finansowaniu zabezpieczonym nieruchomością kluczowa jest sama nieruchomość, a nie wyłącznie scoring bankowy.",
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
          alignItems: "start",
        }}
      >
        <div>
          <MktBadge variant="accent">Dla klienta</MktBadge>
          <h1
            style={{
              marginTop: "1rem",
              fontSize: "clamp(2.1rem, 4vw, 3.1rem)",
              fontWeight: 900,
              lineHeight: 1.06,
              letterSpacing: "-0.025em",
            }}
          >
            Pożyczka pod zabezpieczenie nieruchomości?{" "}
            <span
              style={{
                background: "linear-gradient(95deg,#f0c667,#f6dc9c 34%,#5fa2f6 82%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Sprawdź możliwości bezpłatnie.
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
            Wypełnij prosty wniosek, dodaj informacje o nieruchomości i pokaż swoją sprawę
            inwestorom oraz partnerom finansowym współpracującym z Finance You.
          </p>
        </div>
        <div style={{ position: "relative" }}>
          <LandingWizardForm />
        </div>
      </div>
    </section>
  );
}

function ClientLanding() {
  return (
    <MarketingShell page="klient" sticky={{ label: "Złóż bezpłatny wniosek", href: APPLY }}>
      <Hero />

      <Section>
        <SectionHead eyebrow="Dla kogo" title="Sprawdź, czy to rozwiązanie dla Ciebie" />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={FORWHOM} icon3d />
        </div>
        <ComplianceNote style={{ marginTop: "2rem" }}>
          Zgłoszenie sprawy nie jest równoznaczne z przyznaniem finansowania. Finance You nie
          gwarantuje pożyczki.
        </ComplianceNote>
      </Section>

      <Section tint>
        <SectionHead eyebrow="Jak to działa" title="Pięć prostych kroków" />
        <div style={{ marginTop: "2.5rem" }}>
          <ProcessSteps steps={HOW} cols={5} />
        </div>
      </Section>

      <Section tint>
        <SectionHead
          eyebrow="Zabezpieczenie"
          title="Jakie nieruchomości można zgłosić?"
          sub="Nieruchomości na terenie Polski. Każdą sprawę analizujemy indywidualnie."
        />
        <div
          className="fy-modules"
          style={{
            marginTop: "2.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(5,1fr)",
            gap: "0.9rem",
          }}
        >
          {PROPS.map((p) => (
            <div
              key={p.t}
              style={{
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                boxShadow: "var(--shadow-xs)",
                padding: "1.2rem 1rem",
                textAlign: "center",
              }}
            >
              <Icon3D name={p.icon} size={64} />
              <div style={{ marginTop: 8, fontSize: "0.85rem", fontWeight: 700 }}>{p.t}</div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: "0.7rem",
                  color: "var(--muted-foreground)",
                  lineHeight: 1.4,
                }}
              >
                Potrzebny będzie numer KW oraz podstawowe informacje o nieruchomości.
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHead
          eyebrow="Dlaczego Finance You"
          title="Jeden wniosek, wielu potencjalnych finansujących"
        />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={WHY} icon3d />
        </div>
      </Section>

      <Section tint id="faq">
        <SectionHead center eyebrow="FAQ" title="Najczęstsze pytania klientów" />
        <FAQ items={FAQS} />
      </Section>

      <CTASection
        single
        title="Sprawdź, jakie masz możliwości."
        sub="Wniosek jest bezpłatny. Kalkulacja jest orientacyjna i nie stanowi oferty."
        buttons={[{ label: "Złóż bezpłatny wniosek", href: APPLY }]}
      />
    </MarketingShell>
  );
}
