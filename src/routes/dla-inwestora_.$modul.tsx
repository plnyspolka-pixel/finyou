// Podstrony modułów Klubu Inwestorów: /dla-inwestora/<moduł> (Analityk AI,
// Windykator AI, AML/compliance, Kancelaria AI, sieć sprzedaży). Trasa
// nie jest zagnieżdżona w /dla-inwestora (podkreślnik w nazwie pliku) — landing
// nie renderuje <Outlet />. Treść i kolejność modułów: components/marketing/
// investor-modules.ts (ten sam plik zasila sub-menu "Inwestor" i karty na landingu).
import { createFileRoute, notFound } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/shell";
import {
  Section,
  SectionHead,
  ProcessSteps,
  ComplianceNote,
  CTASection,
} from "@/components/marketing/sections";
import { MktBadge, MktButton } from "@/components/marketing/primitives";
import { BrandIcon } from "@/components/marketing/brand-icon";
import { FabLegend, FabList, ModuleCards } from "@/components/marketing/investor-module-ui";
import {
  INVESTOR_MODULES,
  investorModuleBySlug,
  investorModulePath,
  type InvestorModule,
} from "@/components/marketing/investor-modules";
import { breadcrumbLd, SITE_URL } from "@/lib/seo/company";

const PRICING = "/dla-inwestora#cennik";
const ALL_MODULES = "/dla-inwestora#moduly";

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
          Nie ma takiego modułu. <a href={ALL_MODULES}>Zobacz wszystkie moduły</a> Klubu Inwestorów
          Hipotecznych.
        </p>
      </Section>
    </MarketingShell>
  ),
});

function InvestorModulePage() {
  const { slug } = Route.useLoaderData();
  const m = investorModuleBySlug(slug);
  if (!m) return null;
  const others = INVESTOR_MODULES.filter((o) => o.slug !== m.slug);
  return (
    <MarketingShell page="inwestorModul" sticky={{ label: "Dołącz do klubu", href: PRICING }}>
      <ModuleHero m={m} />

      <Section id="cecha-zaleta-korzysc">
        <SectionHead
          center
          eyebrow="Cecha → zaleta → korzyść"
          title={`Co daje Ci ${m.name}`}
          sub="Każdą funkcję opisujemy w trzech krokach: czym jest, co robi i co z tego masz."
        />
        <FabLegend />
        <FabList rows={m.fab} />
      </Section>

      <Section id="jak-to-dziala" tint>
        <SectionHead center eyebrow="Jak to działa" title="Cztery kroki w panelu inwestora" />
        <div style={{ marginTop: "2.5rem" }}>
          <ProcessSteps steps={m.steps} cols={4} />
        </div>
        <ComplianceNote style={{ marginTop: "2rem" }}>{m.note}</ComplianceNote>
      </Section>

      <Section id="pozostale-moduly">
        <SectionHead
          center
          eyebrow="Moduły klubu"
          title="Zobacz pozostałe moduły"
          sub="Wszystkie działają w jednym panelu inwestora, w ramach jednego abonamentu."
        />
        <div style={{ marginTop: "2.5rem" }}>
          <ModuleCards modules={others} cols={4} />
        </div>
      </Section>

      <CTASection
        single
        title="Wszystkie moduły w jednym abonamencie Klubu Inwestorów Hipotecznych."
        sub="Bez opłat za Projekt i bez opłaty sukcesu. Sprawdź cennik i dołącz do klubu."
        buttons={[{ label: "Dołącz do klubu", href: PRICING }]}
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
          <MktBadge variant="secondary">Moduł Klubu Inwestorów Hipotecznych</MktBadge>
          <h1
            style={{
              marginTop: "1rem",
              fontSize: "clamp(1.9rem, 4.4vw, 3.2rem)",
              fontWeight: 900,
              lineHeight: 1.06,
              letterSpacing: "-0.025em",
              overflowWrap: "break-word",
            }}
          >
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
              <BrandIcon name="handCoins" size={20} /> Dołącz do klubu
            </MktButton>
            <MktButton
              variant="outline"
              size="xl"
              href="#cecha-zaleta-korzysc"
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
