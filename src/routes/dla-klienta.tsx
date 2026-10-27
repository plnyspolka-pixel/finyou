import { createFileRoute } from "@tanstack/react-router";
import { applicationAmountFromSearch } from "@/lib/application-amount";
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
import { PROPERTY_DOCS_BY_SECURITY } from "@/components/landing/property-types-showcase";
import { FreeMaterialsSection } from "@/components/marketing/free-materials";
import { LOAN_PRODUCTS } from "@/lib/loan-products";
import { EMPTY_FREE_MATERIALS } from "@/lib/lead-magnets/free-materials";
import { getFreeMaterialsFn } from "@/lib/lead-magnets/free-materials.functions";

const APPLY = "#wniosek";

export const Route = createFileRoute("/dla-klienta")({
  validateSearch: (s: Record<string, unknown>) => ({
    kwota: typeof s.kwota === "string" || typeof s.kwota === "number" ? String(s.kwota) : undefined,
  }),
  // Dział „Darmowe materiały” – opublikowane lead magnety klienta. Odporne na
  // brak bazy w SSR: wtedy sekcja się nie renderuje, reszta strony bez zmian.
  loader: async () => ({
    materials: await getFreeMaterialsFn({ data: { audience: "klient" } }).catch((e) => {
      console.error("[dla-klienta] getFreeMaterialsFn failed", e);
      return EMPTY_FREE_MATERIALS("klient");
    }),
  }),
  head: () => ({
    meta: [
      { title: "Pożyczka pod zastaw nieruchomości — do 1 mln zł, decyzja w 24 h | Finance You" },
      {
        name: "description",
        content:
          "Pożyczka pod zastaw nieruchomości dla firmy do 1 000 000 zł. Decyzja zwykle w 24 h, bez scoringu BIK. Jeden bezpłatny wniosek do wielu inwestorów.",
      },
      { property: "og:title", content: "Dla klientów — Finance You" },
      {
        property: "og:description",
        content: "Sprawdź bezpłatnie możliwości finansowania pod zabezpieczenie nieruchomości.",
      },
      { property: "og:url", content: "https://financeyou.pl/dla-klienta" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "twitter:description",
        content:
          "Finansowanie firmy pod zastaw nieruchomości. Bezpłatny wniosek, bez BIK i zobowiązań.",
      },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/dla-klienta" }],
  }),
  component: ClientLanding,
});

const FORWHOM: FeatureItemData[] = [
  { icon: "house", t: "Zaległości w ZUS lub US", d: "Środki na uporządkowanie zobowiązań firmy." },
  { icon: "kalkulator", t: "Kontrakt do sfinansowania", d: "Kapitał na realizację zamówienia." },
  { icon: "shield", t: "Zatowarowanie", d: "Środki na zakup towaru do firmy." },
  {
    icon: "automation",
    t: "Spłata drogich zobowiązań",
    d: "Finansowanie dopasowane do sytuacji firmy.",
  },
  { icon: "growth", t: "Zakup nieruchomości", d: "Nieruchomość na cel gospodarczy." },
  { icon: "loan", t: "Finansowanie pomostowe", d: "Kapitał do czasu domknięcia transakcji." },
];

const HOW: { t: string; d: string; icon: Icon3DName }[] = [
  { icon: "application", t: "Wypełniasz formularz", d: "Krótki wniosek online — kilka minut." },
  {
    icon: "dossier",
    t: "Dodajesz numer KW",
    d: "Numer księgi wieczystej i podstawowe informacje o nieruchomości.",
  },
  {
    icon: "ai",
    t: "System porządkuje sprawę",
    d: "Twoje dane zostają ustrukturyzowane i opisane.",
  },
  {
    icon: "investors",
    t: "Sprawa trafia do finansujących",
    d: "Może zostać pokazana inwestorom i partnerom finansowym.",
  },
  {
    icon: "loan",
    t: "Pieniądze na Twoim koncie",
    d: "Po podpisie u notariusza i ustanowieniu zabezpieczeń inwestor przelewa środki.",
  },
];

const PROPS: { icon: Icon3DName; sec: keyof typeof PROPERTY_DOCS_BY_SECURITY }[] = [
  { icon: "propApartment", sec: "mieszkanie" },
  { icon: "propHouse", sec: "dom" },
  { icon: "propStore", sec: "lokal_uslugowy" },
  { icon: "propPlot", sec: "dzialka_budowlana" },
  { icon: "propField", sec: "grunt_rolny" },
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
    q: "Na jaki cel mogę przeznaczyć finansowanie?",
    a: "Finansowanie wyłącznie na cel związany z działalnością gospodarczą (B2B). We wniosku składasz oświadczenie o celu gospodarczym; nie finansujemy celów konsumpcyjnych ani prywatnych potrzeb mieszkaniowych.",
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
    q: "Gdzie mogę oszacować kwotę finansowania?",
    a: "Sprawdź narzędzie /narzedzie/ile-pod-nieruchomosc. Wynik jest orientacyjny; ostateczne warunki ustalasz z inwestorem.",
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

function Hero({ amount }: { amount?: number }) {
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
            Do 1 000 000 zł pod zastaw nieruchomości dla Twojej firmy. Decyzja zwykle w 24 h, bez
            scoringu BIK.
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
            Jeden bezpłatny wniosek trafia do wielu prywatnych inwestorów. Pieniądze na koncie nawet
            2–3 dni po podpisie u notariusza.
          </p>
        </div>
        <div style={{ position: "relative" }}>
          <div id="wniosek">
            <p className="mb-3 text-sm">Bez sprawdzania BIK · Bez zobowiązań</p>
            <LandingWizardForm initialAmount={amount} />
            <p className="mt-4 text-sm">
              Wolisz zadzwonić? <a href="tel:+48732059898">+48 732 059 898</a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ClientLanding() {
  const { materials } = Route.useLoaderData();
  const { kwota } = Route.useSearch();
  return (
    <MarketingShell page="klient" sticky={{ label: "Złóż bezpłatny wniosek", href: APPLY }}>
      <Hero amount={applicationAmountFromSearch(kwota)} />

      <Section id="rodzaje-pozyczek">
        <SectionHead
          eyebrow="Rodzaje pożyczek"
          title="Wybierz pożyczkę dopasowaną do Twojej nieruchomości"
          sub="Każda podstrona ma gotowy wniosek z wybranym zabezpieczeniem i opis procedury od wniosku przez notariusza do wypłaty."
        />
        <div
          style={{
            marginTop: "2rem",
            display: "grid",
            gap: "0.8rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))",
          }}
        >
          {LOAN_PRODUCTS.map((p) => (
            <a
              key={p.slug}
              href={`/${p.slug}`}
              style={{
                display: "block",
                padding: "1.1rem 1.2rem",
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--foreground)",
                textDecoration: "none",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.98rem" }}>{p.menuLabel} →</div>
              <div
                style={{
                  marginTop: "0.35rem",
                  fontSize: "0.82rem",
                  lineHeight: 1.5,
                  color: "var(--muted-foreground)",
                }}
              >
                {p.h1Accent.charAt(0).toUpperCase() + p.h1Accent.slice(1)}
              </div>
            </a>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Dla kogo" title="Sprawdź, czy to rozwiązanie dla Ciebie" />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={FORWHOM} icon3d />
        </div>
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
          {PROPS.map((p) => {
            const info = PROPERTY_DOCS_BY_SECURITY[p.sec];
            return (
              <div
                key={p.sec}
                style={{
                  borderRadius: "var(--radius-xl)",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  boxShadow: "var(--shadow-xs)",
                  padding: "1.2rem 1rem",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <Icon3D name={p.icon} size={64} />
                  <div style={{ marginTop: 8, fontSize: "0.85rem", fontWeight: 700 }}>
                    {info.title}
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: "1px solid var(--border)",
                    fontSize: "0.62rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--muted-foreground)",
                  }}
                >
                  Co przygotować
                </div>
                <ul
                  style={{
                    marginTop: 6,
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    textAlign: "left",
                  }}
                >
                  {info.docs.map((d) => (
                    <li
                      key={d}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 6,
                        fontSize: "0.7rem",
                        lineHeight: 1.35,
                        color: "var(--muted-foreground)",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          marginTop: 5,
                          width: 5,
                          height: 5,
                          borderRadius: 999,
                          flex: "0 0 auto",
                          background: "var(--primary)",
                        }}
                      />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
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

      <FreeMaterialsSection data={materials} />

      <Section tint id="faq">
        <SectionHead center eyebrow="FAQ" title="Najczęstsze pytania klientów" />
        <FAQ items={FAQS} />
      </Section>

      <CTASection
        single
        title="Sprawdź, jakie masz możliwości."
        sub="Wniosek jest bezpłatny i bez zobowiązań."
        buttons={[{ label: "Złóż bezpłatny wniosek", href: APPLY }]}
      />
      <details className="fy-sales-legal mx-auto mb-12 max-w-5xl px-6">
        <summary>Ważne informacje</summary>
        <p>
          Finance You nie gwarantuje pożyczki. Zgłoszenie sprawy nie jest równoznaczne z przyznaniem
          finansowania. Decyzja, warunki i termin wypłaty zależą od inwestora, dokumentów i
          ustanowienia zabezpieczeń.
        </p>
      </details>
    </MarketingShell>
  );
}
