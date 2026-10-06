// Szablon podstrony produktu pożyczkowego (/pozyczka-*): hero z okrojonym
// wnioskiem (zabezpieczenie wybrane z góry), opis, procedura od wniosku przez
// notariusza do wypłaty, FAQ (+FAQPage JSON-LD) i linki do pozostałych produktów.
import { LandingWizardForm } from "@/components/landing/landing-wizard-form";
import { PROPERTY_DOCS_BY_SECURITY } from "@/components/landing/property-types-showcase";
import { MarketingShell } from "@/components/marketing/shell";
import {
  Section,
  SectionHead,
  FAQ,
  ComplianceNote,
  CTASection,
} from "@/components/marketing/sections";
import { MktBadge } from "@/components/marketing/primitives";
import {
  getLoanProduct,
  LOAN_PRODUCTS,
  procedureSteps,
  type LoanProduct,
} from "@/lib/loan-products";

const FORM_ANCHOR = "#wniosek";

function docsHintFor(p: LoanProduct): string {
  const docs = PROPERTY_DOCS_BY_SECURITY[p.securityType]?.docs;
  return docs?.length ? `Dla tej nieruchomości przygotuj: ${docs.join(", ").toLowerCase()}.` : "";
}

export function LoanProductPage({ slug }: { slug: string }) {
  const p = getLoanProduct(slug);
  const steps = procedureSteps(docsHintFor(p));
  const others = LOAN_PRODUCTS.filter((x) => x.slug !== p.slug);

  return (
    <MarketingShell page="klient" sticky={{ label: "Złóż bezpłatny wniosek", href: FORM_ANCHOR }}>
      <section
        className="fy-hero"
        style={{ color: "#fff", borderBottom: "1px solid var(--border)" }}
      >
        <div aria-hidden className="fy-hero-fx" />
        <div
          className="fy-hero-grid"
          style={{
            position: "relative",
            maxWidth: "80rem",
            margin: "0 auto",
            padding: "3rem 1.5rem 4.5rem",
            alignItems: "start",
          }}
        >
          <div>
            <nav
              aria-label="Okruszki"
              style={{
                fontSize: "0.78rem",
                color: "rgba(255,255,255,.65)",
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginBottom: "1.2rem",
              }}
            >
              <a href="/" style={{ color: "inherit", textDecoration: "none" }}>
                Finance You
              </a>
              <span aria-hidden>/</span>
              <a href="/dla-klienta" style={{ color: "inherit", textDecoration: "none" }}>
                Dla klienta
              </a>
              <span aria-hidden>/</span>
              <span style={{ color: "#fff" }}>{p.menuLabel}</span>
            </nav>
            <MktBadge variant="accent">
              {p.group === "segment" ? "Oferta specjalna" : "Pożyczka pod zastaw"}
            </MktBadge>
            <h1
              style={{
                marginTop: "1rem",
                fontSize: "clamp(2rem, 4vw, 3rem)",
                fontWeight: 900,
                lineHeight: 1.08,
                letterSpacing: "-0.025em",
              }}
            >
              {p.h1}{" "}
              <span
                style={{
                  background: "linear-gradient(95deg,#f0c667,#f6dc9c 34%,#5fa2f6 82%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {p.h1Accent}
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
              {p.lead}
            </p>
            <ul
              style={{
                marginTop: "1.4rem",
                padding: 0,
                listStyle: "none",
                display: "grid",
                gap: "0.45rem",
                fontSize: "0.92rem",
                color: "rgba(255,255,255,.88)",
              }}
            >
              {[
                "Do 1 000 000 zł na rozwój Twojej firmy",
                "Decyzja zwykle w 24 godziny — bez bankowej biurokracji",
                "Liczy się nieruchomość, nie scoring BIK",
                "Wypłata nawet w kilka dni od podpisu u notariusza",
              ].map((t) => (
                <li key={t} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span aria-hidden style={{ color: "#6ee7b7", fontWeight: 800 }}>
                    ✓
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div id="wniosek" style={{ position: "relative", scrollMarginTop: "5rem" }}>
            <LandingWizardForm
              preset={{
                securityType: p.securityType,
                alternatives: p.altSecurityTypes,
                purposeLabel: p.purposeLabel,
                source: `produkt:${p.slug}`,
              }}
            />
          </div>
        </div>
      </section>

      <Section>
        <div style={{ maxWidth: "52rem", margin: "0 auto" }}>
          <SectionHead eyebrow="Na czym to polega" title={`${p.h1} — jak to działa?`} />
          {p.intro.map((t, i) => (
            <p
              key={i}
              style={{
                marginTop: "1rem",
                fontSize: "1rem",
                lineHeight: 1.7,
                color: "var(--foreground)",
              }}
            >
              {t}
            </p>
          ))}
          <div
            style={{
              marginTop: "2rem",
              display: "grid",
              gap: "0.9rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
            }}
          >
            {p.forWhom.map((f) => (
              <div
                key={f.t}
                style={{
                  padding: "1.1rem 1.2rem",
                  borderRadius: "var(--radius-xl)",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 700 }}>{f.t}</h3>
                <p
                  style={{
                    marginTop: "0.35rem",
                    fontSize: "0.86rem",
                    lineHeight: 1.5,
                    color: "var(--muted-foreground)",
                  }}
                >
                  {f.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section tint id="procedura">
        <div style={{ maxWidth: "52rem", margin: "0 auto" }}>
          <SectionHead
            eyebrow="Procedura"
            title="Od wniosku przez notariusza do wypłaty"
            sub="Pięć kroków — każdy etap widzisz w panelu klienta."
          />
          <ol style={{ margin: "2rem 0 0", padding: 0, listStyle: "none", display: "grid" }}>
            {steps.map((s, i) => (
              <li key={s.t} style={{ display: "flex", gap: "1rem" }}>
                <div
                  style={{
                    flex: "0 0 40px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, var(--navy-800), var(--navy-950))",
                      border: "1px solid var(--border)",
                      color: "#fff",
                      fontWeight: 800,
                    }}
                  >
                    {i + 1}
                  </span>
                  {i < steps.length - 1 && (
                    <span aria-hidden style={{ flex: 1, width: 2, background: "var(--border)" }} />
                  )}
                </div>
                <div style={{ paddingBottom: i < steps.length - 1 ? "1.6rem" : 0 }}>
                  <h3 style={{ margin: "0.45rem 0 0", fontSize: "1.02rem", fontWeight: 700 }}>
                    {s.t}
                  </h3>
                  <p
                    style={{
                      marginTop: "0.35rem",
                      fontSize: "0.9rem",
                      lineHeight: 1.6,
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {s.d}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {p.extraNotes.length > 0 && (
            <div
              style={{
                marginTop: "2rem",
                padding: "1.1rem 1.3rem",
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--border)",
                background: "var(--card)",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>
                Jak przygotować się do wniosku i wizyty u notariusza
              </h3>
              <ul style={{ margin: "0.6rem 0 0", paddingLeft: "1.1rem", display: "grid", gap: 6 }}>
                {[
                  ...p.extraNotes,
                  "Na akt notarialny zabierz dowód osobisty; jeśli jesteś w związku małżeńskim, zwykle potrzebna jest też obecność lub zgoda współmałżonka.",
                ].map((n) => (
                  <li
                    key={n}
                    style={{
                      fontSize: "0.88rem",
                      lineHeight: 1.55,
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      <Section id="faq">
        <SectionHead center eyebrow="FAQ" title={`${p.menuLabel} — najczęstsze pytania`} />
        <FAQ items={p.faq} />
      </Section>

      <Section tint>
        <SectionHead center eyebrow="Inne rozwiązania" title="Zobacz pozostałe pożyczki" />
        <ul
          style={{
            listStyle: "none",
            margin: "2rem auto 0",
            padding: 0,
            maxWidth: "56rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.6rem",
            justifyContent: "center",
          }}
        >
          {others.map((o) => (
            <li key={o.slug}>
              <a
                href={`/${o.slug}`}
                style={{
                  display: "inline-block",
                  padding: "0.6rem 1rem",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--foreground)",
                  textDecoration: "none",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                }}
              >
                {o.menuLabel}
              </a>
            </li>
          ))}
          <li>
            <a
              href="/pozyczki"
              style={{
                display: "inline-block",
                padding: "0.6rem 1rem",
                borderRadius: 999,
                border: "1px solid var(--border)",
                color: "var(--muted-foreground)",
                textDecoration: "none",
                fontSize: "0.88rem",
                fontWeight: 600,
              }}
            >
              Pożyczki wg miast →
            </a>
          </li>
        </ul>
      </Section>

      <CTASection
        single
        title="Sprawdź, ile możesz otrzymać."
        sub="Wniosek jest bezpłatny i niezobowiązujący. Kalkulacja ma charakter orientacyjny."
        buttons={[{ label: "Wypełnij wniosek", href: FORM_ANCHOR }]}
      />

      <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "0 1.5rem 2rem" }}>
        <ComplianceNote style={{ marginTop: "1.5rem" }}>
          Materiał ma charakter informacyjny i nie stanowi oferty w rozumieniu art. 66 Kodeksu
          cywilnego. Finansowanie wyłącznie na cel związany z działalnością gospodarczą lub rolniczą
          (B2B). Finance You nie gwarantuje udzielenia finansowania — decyzja należy do inwestorów.
        </ComplianceNote>
      </div>
    </MarketingShell>
  );
}
