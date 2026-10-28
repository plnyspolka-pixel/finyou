// Podstrony szkolenia i modułów partnera: /dla-inwestora/<moduł> (szkolenie,
// Analityk AI, Kancelaria AI, AML/compliance, Windykator AI, sieć sprzedaży). Trasa nie jest
// zagnieżdżona w /dla-inwestora (podkreślnik w nazwie pliku) — landing nie
// renderuje <Outlet />. Treść i kolejność modułów: components/marketing/
// investor-modules.ts (ten sam plik zasila sub-menu "Inwestor" i karty na landingu).
// Układ: hero → „Co zyskujesz” (karty funkcji) → [skala A–E] → kroki z notą
// prawną → pozostałe moduły (kompaktowo) → CTA do cennika.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/shell";
import {
  Section,
  SectionHead,
  ProcessSteps,
  ComplianceNote,
  CTASection,
} from "@/components/marketing/sections";
import { MktButton } from "@/components/marketing/primitives";
import { BrandIcon } from "@/components/marketing/brand-icon";
import { FeatureCards, GradeScale } from "@/components/marketing/investor-module-ui";
import { RoadCards } from "@/components/marketing/road-cards";
import { TrainingProgram } from "@/components/marketing/training-program";
import {
  investorModuleBySlug,
  investorModulePath,
  type InvestorModule,
} from "@/components/marketing/investor-modules";
import { plnLabel, SUBSCRIPTION_YEARLY_PLN } from "@/lib/investor-plan/plans";
import { breadcrumbLd, SITE_URL } from "@/lib/seo/company";

const PRICING = "/#cennik";
const ALL_MODULES = "/#moduly";

export const Route = createFileRoute("/dla-inwestora_/$modul")({
  loader: ({ params }) => {
    if (!investorModuleBySlug(params.modul)) throw notFound();
    return { slug: params.modul };
  },
  head: ({ params }) => {
    const m = investorModuleBySlug(params.modul);
    if (!m) return { meta: [], links: [], scripts: [] };
    const url = SITE_URL + investorModulePath(m.slug);
    return {
      meta: [
        { title: m.metaTitle },
        { name: "description", content: m.metaDescription },
        { property: "og:title", content: m.metaTitle },
        { property: "og:description", content: m.metaDescription },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:locale", content: "pl_PL" },
        { property: "og:image", content: SITE_URL + m.image },
        { property: "og:image:alt", content: m.imageAlt },
        { name: "twitter:image", content: SITE_URL + m.image },
        { name: "twitter:description", content: m.metaDescription },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbLd([
              { name: "Finance You", path: "/" },
              { name: "Dla inwestora", path: "/dla-inwestora" },
              { name: m.name, path: investorModulePath(m.slug) },
            ]),
          ),
        },
      ],
    };
  },
  component: InvestorModulePage,
  notFoundComponent: () => (
    <MarketingShell page="inwestorModul">
      <Section>
        <p style={{ textAlign: "center", color: "var(--muted-foreground)" }}>
          Nie ma takiego modułu. <a href={ALL_MODULES}>Zobacz wszystkie moduły</a> partnera Finance
          You.
        </p>
      </Section>
    </MarketingShell>
  ),
});

function InvestorModulePage() {
  const { slug } = Route.useLoaderData();
  const m = investorModuleBySlug(slug);
  if (!m) return null;
  return (
    <MarketingShell page="inwestorModul" sticky={{ label: "Zostań partnerem", href: PRICING }}>
      <ModuleHero m={m} />

      {m.slug === "szkolenie" && (
        <Section id="program" tint>
          <SectionHead title="Szkolenie, po którym sam ocenisz zabezpieczenie, umowę i ryzyko" />
          <TrainingProgram />
        </Section>
      )}

      <Section id="co-zyskujesz">
        <SectionHead center eyebrow="Co zyskujesz" title={m.featuresTitle} />
        <FeatureCards rows={m.fab} />
      </Section>

      {m.gradeScale && (
        <Section id="skala-a-e" tint>
          <SectionHead
            center
            eyebrow="Skala A–E"
            title="Jak czytać klasę ryzyka"
            sub="Każda analiza kończy się wynikiem od 0 do 100 punktów i klasą od A do E. Im wyższy wynik, tym niższe ryzyko."
          />
          <GradeScale components={m.gradeScale.components} caps={m.gradeScale.caps} />
        </Section>
      )}

      <Section id="jak-to-dziala" tint={!m.gradeScale}>
        <SectionHead center eyebrow="Jak to działa" title="Cztery kroki w panelu inwestora" />
        <div style={{ marginTop: "2.5rem" }}>
          <ProcessSteps steps={m.steps} cols={4} />
        </div>
        <ComplianceNote style={{ marginTop: "2rem" }}>{m.note}</ComplianceNote>
      </Section>

      <Section id="pozostale-moduly">
        <SectionHead center title="Pozostałe elementy abonamentu" />
        <div style={{ marginTop: "2rem" }}>
          <RoadCards exclude={m.slug} />
        </div>
      </Section>

      <CTASection
        single
        title="Szkolenie i wszystkie narzędzia w jednym abonamencie"
        sub={`${plnLabel(SUBSCRIPTION_YEARLY_PLN)} za 12 miesięcy — bez prowizji od Twojego zysku. abonament kupisz w ratach, także jako firma.`}
        buttons={[{ label: "Zostań partnerem", href: PRICING }]}
      />
    </MarketingShell>
  );
}

function ModuleHero({ m }: { m: InvestorModule }) {
  return (
    <section className="fy-hero" style={{ color: "#fff", borderBottom: "1px solid var(--border)" }}>
      <div aria-hidden className="fy-hero-fx" />
      <div
        className="fy-hero-grid"
        style={{
          position: "relative",
          maxWidth: "80rem",
          margin: "0 auto",
          padding: "2.5rem 1.5rem 4.5rem",
        }}
      >
        <div>
          <nav
            aria-label="Ścieżka nawigacji"
            style={{ fontSize: "0.8rem", marginBottom: "1.1rem" }}
          >
            <a href="/dla-inwestora" style={{ color: "rgba(255,255,255,.7)" }}>
              Dla inwestora
            </a>
            <span aria-hidden style={{ margin: "0 0.45rem", color: "rgba(255,255,255,.4)" }}>
              /
            </span>
            <a href={ALL_MODULES} style={{ color: "rgba(255,255,255,.7)" }}>
              Moduły
            </a>
            <span aria-hidden style={{ margin: "0 0.45rem", color: "rgba(255,255,255,.4)" }}>
              /
            </span>
            <span aria-current="page" style={{ color: "rgba(255,255,255,.92)" }}>
              {m.name}
            </span>
          </nav>
          <h1
            style={{
              fontSize: "clamp(1.9rem, 4.4vw, 3.2rem)",
              fontWeight: 900,
              lineHeight: 1.06,
              letterSpacing: "-0.025em",
              overflowWrap: "break-word",
            }}
          >
            {m.bonus && (
              <span
                style={{
                  display: "inline-block",
                  verticalAlign: "middle",
                  marginRight: "0.6rem",
                  borderRadius: 999,
                  padding: "0.3rem 0.8rem",
                  fontSize: "0.9rem",
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  background: "linear-gradient(95deg,#f0c667,#f6dc9c)",
                  color: "#101430",
                }}
              >
                BONUS
              </span>
            )}
            {m.nameLead}{" "}
            <span
              style={{
                background: "linear-gradient(95deg,#f0c667,#f6dc9c 40%,#d4a03a)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {m.nameAccent}
            </span>
          </h1>
          <p
            style={{
              marginTop: "0.9rem",
              fontSize: "clamp(1.1rem, 2vw, 1.3rem)",
              fontWeight: 600,
              lineHeight: 1.35,
              color: "rgba(255,255,255,.92)",
            }}
          >
            {m.tagline}
          </p>
          <p
            style={{
              marginTop: "0.9rem",
              maxWidth: "36rem",
              fontSize: "1rem",
              lineHeight: 1.6,
              color: "rgba(255,255,255,.8)",
            }}
          >
            {m.lead}
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
            {m.highlights.map((h) => (
              <li
                key={h}
                style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.95rem" }}
              >
                <BrandIcon name="check" size={18} />
                <span>{h}</span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: "1.8rem", display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
            <MktButton variant="gold" size="xl" href={PRICING} style={{ maxWidth: "100%" }}>
              <BrandIcon name="handCoins" size={20} /> Zostań partnerem
            </MktButton>
            <MktButton
              variant="outline"
              size="xl"
              href="#co-zyskujesz"
              style={{
                maxWidth: "100%",
                background: "rgba(255,255,255,.06)",
                borderColor: "rgba(255,255,255,.28)",
                color: "#fff",
              }}
            >
              Co zyskujesz
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
                "linear-gradient(135deg, oklch(0.83 0.14 88 / .26), oklch(0.65 0.13 235 / .28))",
              filter: "blur(34px)",
            }}
          />
          <img
            src={m.image}
            alt={m.imageAlt}
            width={1536}
            height={1024}
            fetchPriority="high"
            style={{
              position: "relative",
              display: "block",
              width: "100%",
              height: "auto",
              borderRadius: "var(--radius-2xl)",
              border: "1px solid rgba(255,255,255,.15)",
              boxShadow: "var(--shadow-2xl)",
            }}
          />
        </div>
      </div>
    </section>
  );
}
