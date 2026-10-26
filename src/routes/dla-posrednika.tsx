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
import { MktBadge, MktButton } from "@/components/marketing/primitives";
import { BrandIcon } from "@/components/marketing/brand-icon";
import { Icon3D, type Icon3DName } from "@/components/marketing/icon-3d";
import { formatPLN } from "@/lib/labels";
import { INVESTOR_COMMISSION_PLN } from "@/lib/affiliate/engine-pure";

// Bez bramki płatności: rejestracja, akceptacja umowy i konto do wypłaty prowizji.
const JOIN = "/posrednicy/rejestracja";
const COMMISSION = formatPLN(INVESTOR_COMMISSION_PLN);

export const Route = createFileRoute("/dla-posrednika")({
  head: () => ({
    meta: [
      { title: "Dla pośrednika — bezpłatny CRM i dostęp do inwestorów | Finance You" },
      {
        name: "description",
        content:
          "Zostań pośrednikiem Finance You za darmo: wprowadzaj wnioski klientów, przedstawiaj je prywatnym inwestorom i śledź w CRM, jak reagują. 1000 zł za każdego poleconego inwestora.",
      },
      { property: "og:title", content: "Dla pośredników — Finance You" },
      {
        property: "og:description",
        content:
          "Bezpłatne konto pośrednika: wnioski klientów, inwestorzy i CRM reakcji inwestorów.",
      },
      { property: "og:url", content: "https://financeyou.pl/dla-posrednika" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/dla-posrednika" }],
  }),
  component: BrokerLanding,
});

const GET: FeatureItemData[] = [
  {
    icon: "application",
    t: "Prosty kreator wniosku",
    d: "Prowadzi Cię krok po kroku przez cały proces i podpowiada, jakie dane, dokumenty oraz informacje należy zebrać od klienta.",
  },
  {
    icon: "investors",
    t: "Dostęp do prywatnych inwestorów",
    d: "Gotową sprawę możesz szybko przekazać inwestorom zainteresowanym finansowaniem zabezpieczonym nieruchomością.",
  },
  {
    icon: "documents",
    t: "Pełna obsługa formalna transakcji",
    d: "Przygotowujemy umowę, organizujemy notariusza, koordynujemy dokumenty i pomagamy doprowadzić sprawę do wypłaty środków.",
  },
  {
    icon: "crm",
    t: "CRM z reakcjami inwestorów",
    d: "Widzisz, którzy inwestorzy otworzyli ofertę, odpowiedzieli, są zainteresowani albo złożyli propozycję finansowania.",
  },
  {
    icon: "access",
    t: "Możliwość pracy z dowolnego miejsca",
    d: "Do prowadzenia biznesu potrzebujesz przede wszystkim telefonu, komputera i dostępu do internetu.",
  },
  {
    icon: "community",
    t: "Możliwość rozpoczęcia bez własnego biura i zespołu",
    d: "Nie musisz od początku budować zaplecza marketingowego, technologicznego, prawnego ani administracyjnego.",
  },
  {
    icon: "compliance",
    t: "Możliwość rozpoczęcia bez zakładania działalności gospodarczej",
    d: "W określonych przypadkach współpraca może być prowadzona w dopuszczalnej prawnie formie bez natychmiastowego zakładania firmy.",
  },
];

const EARN = [
  { t: "Zakładasz bezpłatne konto", d: "Dane, akceptacja umowy i konto do wypłaty prowizji." },
  {
    t: "Wprowadzasz wniosek klienta",
    d: "Kreator prowadzi Cię przez dane, nieruchomość i dokumenty.",
  },
  {
    t: "Oferta trafia do inwestorów",
    d: "Przedstawiamy ją prywatnym i instytucjonalnym inwestorom.",
  },
  {
    t: "Śledzisz reakcje w CRM",
    d: "Otwarcia, odpowiedzi, zainteresowanie i propozycje finansowania.",
  },
  {
    t: "Finance You prowadzi formalności",
    d: "Umowa, notariusz i koordynacja aż do wypłaty środków.",
  },
  {
    t: "Polecasz inwestorów",
    d: `Za każdego nowego inwestora, który kupi abonament — ${COMMISSION}.`,
  },
];

const CRM: { icon: Icon3DName; t: string }[] = [
  { icon: "status", t: "Status oferty" },
  { icon: "investors", t: "Reakcje inwestorów" },
  { icon: "chat", t: "Odpowiedzi i pytania" },
  { icon: "growth", t: "Propozycje finansowania" },
  { icon: "documents", t: "Dokumenty" },
  { icon: "house", t: "Nieruchomość i KW" },
];

const FAQS = [
  {
    q: "Ile kosztuje konto pośrednika?",
    a: "Nic. Rejestrujesz się, akceptujesz umowę i podajesz konto do wypłaty prowizji — bez opłat i bez limitu ofert.",
  },
  {
    q: "Czy muszę przejść szkolenie?",
    a: "Nie. Kreator wniosku prowadzi Cię krok po kroku, a formalności transakcji prowadzi Finance You.",
  },
  {
    q: "Skąd wiem, jak inwestorzy reagują na moją ofertę?",
    a: "W zakładce „Reakcje inwestorów” widzisz dla każdej oferty: wysyłki, otwarcia, odpowiedzi, zainteresowanie i propozycje finansowania. Dane inwestorów są anonimowe.",
  },
  {
    q: "Ile zarabiam za poleconego inwestora?",
    a: `${COMMISSION} za każdego nowego inwestora, który założy konto z Twojego linku i kupi abonament. Prowizję zatwierdza Finance You po zaksięgowaniu płatności.`,
  },
  {
    q: "Czy dostaję prowizję za zrealizowany temat klienta?",
    a: "Nie. Prowizja jest naliczana wyłącznie od abonamentu kupionego przez poleconego nowego inwestora.",
  },
  {
    q: "Jak dostaję wypłatę?",
    a: "Na konto podane przy rejestracji, po osiągnięciu progu 500 zł i zatwierdzeniu prowizji. Rozliczasz się jako B2B albo w ramach działalności nierejestrowanej.",
  },
  {
    q: "Czy mogę obsługiwać własnych klientów?",
    a: "Tak. Wprowadzasz własnych klientów i prowadzisz ich sprawy w swoim panelu.",
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
          <MktBadge variant="gold">Konto pośrednika — bezpłatne</MktBadge>
          <h1
            style={{
              marginTop: "1rem",
              fontSize: "clamp(2.1rem, 4vw, 3.1rem)",
              fontWeight: 900,
              lineHeight: 1.06,
              letterSpacing: "-0.025em",
            }}
          >
            Przedstaw klientów jako{" "}
            <span
              style={{
                background: "linear-gradient(95deg,#f0c667,#f6dc9c 34%,#5fa2f6 82%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              pośrednik Finance You.
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
            Wprowadzaj wnioski klientów, przedstawiaj je inwestorom i śledź w CRM, jak reagują. Bez
            opłat. Zarabiasz {COMMISSION} za każdego nowego inwestora, który kupi abonament.
          </p>
          <div style={{ marginTop: "1.8rem", display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
            <MktButton variant="cta" href={JOIN}>
              <BrandIcon name="ltv" size={18} /> Załóż bezpłatne konto
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
                "linear-gradient(135deg, oklch(0.78 0.18 85 / .28), oklch(0.40 0.25 268 / .25))",
              filter: "blur(34px)",
            }}
          />
          <div
            style={{
              position: "relative",
              borderRadius: "var(--radius-2xl)",
              border: "1px solid rgba(255,255,255,.15)",
              background: "rgba(255,255,255,.06)",
              boxShadow: "var(--shadow-2xl)",
              padding: "1.6rem",
              display: "grid",
              gap: "1rem",
            }}
          >
            {[
              ["Zarejestruj się", "Załóż konto i zaakceptuj umowę."],
              ["Podaj konto do wypłaty", "Tam trafiają prowizje za inwestorów."],
              ["Wprowadzaj klientów", "I patrz, jak reagują inwestorzy."],
            ].map(([t, d], i) => (
              <div key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 32,
                    height: 32,
                    flexShrink: 0,
                    borderRadius: "50%",
                    background: "var(--gradient-brand)",
                    fontWeight: 800,
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontWeight: 700 }}>{t}</div>
                  <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,.75)" }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BrokerLanding() {
  return (
    <MarketingShell page="posrednik" sticky={{ label: "Załóż konto pośrednika", href: JOIN }}>
      <Hero />

      <Section>
        <SectionHead eyebrow="Co dostajesz" title="Bezpłatne narzędzia do prowadzenia klientów" />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={GET} icon3d />
        </div>
      </Section>

      <Section tint>
        <SectionHead eyebrow="Jak to działa" title="Od rejestracji do finansowania klienta" />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={EARN.map((e) => ({ icon: "check", t: e.t, d: e.d }))} />
        </div>
        <ComplianceNote style={{ marginTop: "2rem" }}>
          Warunki współpracy i rozliczeń prowizyjnych określa umowa akceptowana przy rejestracji.
          Nie gwarantujemy finansowania ani konkretnych kwot.
        </ComplianceNote>
      </Section>

      <Section>
        <SectionHead
          eyebrow="CRM pośrednika"
          title="Widzisz, jak inwestorzy reagują na Twoje oferty"
        />
        <div
          className="fy-modules"
          style={{
            marginTop: "2.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: "0.8rem",
          }}
        >
          {CRM.map((c) => (
            <div
              key={c.t}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "0.9rem 1.1rem",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                boxShadow: "var(--shadow-xs)",
              }}
            >
              <Icon3D name={c.icon} size={40} />
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{c.t}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section tint>
        <SectionHead
          center
          eyebrow="Program partnerski"
          title={`${COMMISSION} za każdego nowego inwestora`}
          sub="Zarabiasz wyłącznie na abonamentach inwestorów: w panelu dostajesz link polecający, a gdy nowy inwestor założy konto z Twojego linku i kupi abonament, naliczamy Ci prowizję. Za zrealizowane tematy klientów prowizji nie ma."
        />
        <div style={{ marginTop: "2rem", display: "flex", justifyContent: "center" }}>
          <MktButton variant="cta" href="/posrednicy">
            Zasady programu partnerskiego
          </MktButton>
        </div>
      </Section>

      <Section id="faq">
        <SectionHead center eyebrow="FAQ" title="Najczęstsze pytania pośredników" />
        <FAQ items={FAQS} />
      </Section>

      <CTASection
        single
        title="Załóż bezpłatne konto pośrednika i przedstaw swoich klientów inwestorom."
        buttons={[{ label: "Załóż konto pośrednika", href: JOIN }]}
      />
    </MarketingShell>
  );
}
