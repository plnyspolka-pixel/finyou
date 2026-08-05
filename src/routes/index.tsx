import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, defaultPathForRoles, postLoginPathForRoles } from "@/hooks/use-auth";
import { LandingWizardForm } from "@/components/landing/landing-wizard-form";
import { ChatWidget } from "@/components/landing/chat-widget";
import { MarketingShell } from "@/components/marketing/shell";
import {
  Section,
  SectionHead,
  RoleCard,
  ModuleGrid,
  ProcessSteps,
  CTASection,
  type RoleCardProps,
} from "@/components/marketing/sections";
import { BrandIcon } from "@/components/marketing/brand-icon";
import { MktButton } from "@/components/marketing/primitives";
import type { Icon3DName } from "@/components/marketing/icon-3d";
import { financialServiceLd } from "@/lib/seo/company";

export const PHONE_DISPLAY = "+48 732 059 898";
export const PHONE_HREF = "+48732059898";
export const EMAIL = "kontakt@financeyou.pl";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pożyczka pod zastaw nieruchomości — do 1 mln zł, decyzja w 24 h | Finance You" },
      {
        name: "description",
        content:
          "Pożyczka pod zastaw nieruchomości w Polsce do 1 000 000 zł. Decyzja w 24 godziny. Wypełnij wniosek online — wybierz typ nieruchomości, kwotę, okres i dołącz dokumenty.",
      },
      {
        name: "keywords",
        content:
          "pożyczka pod zastaw nieruchomości, pożyczka pod hipotekę, pożyczka prywatna, pożyczka pozabankowa, zastaw nieruchomości, pożyczka pod mieszkanie, pożyczka pod dom, pożyczka pod działkę",
      },
      { property: "og:title", content: "Pożyczka pod zastaw nieruchomości — Finance You" },
      { property: "og:description", content: "Do 1 mln zł. Decyzja w 24 h. Złóż wniosek online." },
      { property: "og:url", content: "https://financeyou.pl/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(financialServiceLd()),
      },
    ],
  }),
  component: Landing,
});

const ROLES: RoleCardProps[] = [
  {
    icon3d: "calculator",
    accent: "var(--accent)",
    badge: { v: "accent", t: "Klient" },
    title: "Dla klientów",
    desc: "Sprawdź bezpłatnie możliwości finansowania pod zabezpieczenie nieruchomości.",
    cta: "Złóż wniosek",
    href: "/dla-klienta",
  },
  {
    icon3d: "growth",
    accent: "var(--cyan-500)",
    badge: { v: "secondary", t: "Inwestor" },
    title: "Dla inwestorów",
    desc: "Uzyskaj dostęp do spraw klientów szukających finansowania i ucz się inwestowania w pożyczki zabezpieczone nieruchomościami.",
    cta: "Dołącz do klubu",
    href: "/dla-inwestora",
  },
];

const MODULES: { icon: Icon3DName; t: string }[] = [
  { icon: "crm", t: "CRM" },
  { icon: "kalkulator", t: "Kalkulator" },
  { icon: "application", t: "Wnioski" },
  { icon: "investors", t: "Baza inwestorów" },
  { icon: "documents", t: "Dokumenty" },
  { icon: "academy", t: "Akademia" },
  { icon: "ai", t: "AI" },
  { icon: "automation", t: "Automatyzacja" },
  { icon: "status", t: "Statusy spraw" },
  { icon: "compliance", t: "Compliance" },
];

const FLOW = [
  {
    t: "Klient dodaje sprawę",
    d: "Numer KW i podstawowe informacje o nieruchomości.",
  },
  { t: "System porządkuje dane", d: "Sprawa zostaje ustrukturyzowana i opisana." },
  { t: "Trafia do finansujących", d: "Inwestorzy i partnerzy finansowi widzą okazję." },
  { t: "Zespół prowadzi proces", d: "Obsługa w CRM z pełną historią kontaktu." },
  { t: "Inwestor analizuje", d: "LTV, typ nieruchomości, dokumenty w jednym miejscu." },
  { t: "Platforma wspiera obsługę", d: "Dokumentacja, komunikacja i monitoring." },
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
          padding: "4.5rem 1.5rem 5rem",
          alignItems: "start",
        }}
      >
        <div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.2)",
              background: "rgba(255,255,255,.1)",
              backdropFilter: "blur(6px)",
              padding: "0.35rem 0.9rem",
              fontSize: "0.7rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            <BrandIcon name="shield" size={16} /> Platforma prywatnego finansowania
          </span>
          <h1
            style={{
              marginTop: "1.3rem",
              fontSize: "clamp(2.2rem, 4.4vw, 3.4rem)",
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
            }}
          >
            Jedna platforma dla klientów i inwestorów na rynku pożyczek pod{" "}
            <span
              style={{
                background: "linear-gradient(95deg,#f0c667,#f6dc9c 34%,#5fa2f6 82%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              nieruchomości
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
            Finance You łączy klientów szukających finansowania i prywatnych inwestorów w jednym
            systemie: z CRM-em, AI, dokumentacją, szkoleniami i automatyzacją procesu.
          </p>
          <div
            style={{
              marginTop: "1.8rem",
              display: "flex",
              gap: "0.7rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <MktButton variant="cta" size="lg" href="/dla-klienta">
              Pożyczam
            </MktButton>
            <MktButton
              variant="outline"
              size="lg"
              href="/dla-inwestora"
              style={{
                background: "rgba(255,255,255,.08)",
                borderColor: "rgba(255,255,255,.3)",
                color: "#fff",
              }}
            >
              Inwestuję
            </MktButton>
          </div>
          <div
            style={{
              marginTop: "2rem",
              display: "flex",
              gap: "1.6rem",
              flexWrap: "wrap",
              fontSize: "0.8rem",
              color: "rgba(255,255,255,.7)",
            }}
          >
            {["CRM + AI", "Baza inwestorów", "Dokumenty i compliance", "Akademia"].map((t) => (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <BrandIcon name="check" size={16} /> {t}
              </span>
            ))}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <LandingWizardForm />
        </div>
      </div>
    </section>
  );
}

function Landing() {
  const { user, roles, loading } = useAuth();
  const panelHref = user ? defaultPathForRoles(roles) : null;
  const navigate = useNavigate();

  const isAdmin =
    roles.includes("administrator") || roles.includes("operator") || roles.includes("ksiegowosc");
  useEffect(() => {
    if (!loading && user && !isAdmin) {
      // Jedna rola → od razu jej panel; kilka ról → ekran wyboru panelu.
      navigate({ to: postLoginPathForRoles(roles), replace: true });
    }
  }, [loading, user, roles, navigate, isAdmin]);

  return (
    <MarketingShell page="home">
      <Hero />

      <Section id="sciezki">
        <SectionHead
          eyebrow="Wybierz ścieżkę"
          title="Dwie role, jeden system"
          sub="Każda ścieżka prowadzi do osobnego, dopasowanego procesu w platformie Finance You."
        />
        <div
          className="fy-steps"
          style={{
            margin: "2.5rem auto 0",
            maxWidth: "56rem",
            display: "grid",
            gridTemplateColumns: "repeat(2,1fr)",
            gap: "1.1rem",
          }}
        >
          {ROLES.map((r) => (
            <RoleCard key={r.title} {...r} />
          ))}
        </div>
      </Section>

      <Section tint>
        <SectionHead
          eyebrow="Platforma, nie pośrednik"
          title="Nie kolejny pośrednik. Cały system do obsługi rynku prywatnego finansowania."
          sub="Wszystko, czego potrzebuje rynek prywatnych pożyczek hipotecznych — w jednym, uporządkowanym miejscu."
        />
        <div style={{ marginTop: "2.5rem" }}>
          <ModuleGrid items={MODULES} />
        </div>
      </Section>

      <Section id="jak-dziala">
        <SectionHead eyebrow="Jak to działa" title="Od zgłoszenia sprawy do finansowania" />
        <div style={{ marginTop: "2.5rem" }}>
          <ProcessSteps steps={FLOW} cols={3} />
        </div>
      </Section>

      <Section id="blog" tint>
        <SectionHead
          eyebrow="Blog"
          title="Wiedza o prywatnym finansowaniu"
          sub="Praktyczne artykuły o pożyczkach pod nieruchomości i inwestowaniu."
        />
        <div
          style={{
            marginTop: "2.5rem",
            borderRadius: "var(--radius-2xl)",
            overflow: "hidden",
            border: "1px solid var(--border)",
          }}
        >
          <iframe
            src="https://app.financeyou.pl/embed/blog"
            style={{ border: 0, width: "100%", minHeight: 700, height: 900, display: "block" }}
            loading="lazy"
            title="Blog Finance You"
          />
        </div>
      </Section>

      <CTASection
        title="Wybierz swoją ścieżkę w Finance You."
        sub="Dwie role, jeden system operacyjny. Zacznij tam, gdzie jesteś."
        buttons={[
          { label: "Pożyczam", href: "/dla-klienta" },
          { label: "Inwestuję", href: "/dla-inwestora" },
        ]}
      />

      {/* Czat z asystentem — kanał komunikacji przychodzącej "chat" */}
      <ChatWidget source="landing" />
    </MarketingShell>
  );
}
