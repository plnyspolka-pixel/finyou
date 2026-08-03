// Podstrona lokalizacyjna /pozyczki/[miasto] (programmatic SEO). Renderuje
// snapshot treści z seo_location_pages — publiczny odczyt anon key'em (RLS:
// tylko status=published). Sekcje: intro, dane rynkowe (liczby z naszych
// tabel referencyjnych), jak działa pożyczka, FAQ (+FAQPage JSON-LD),
// „Pożyczki w pobliżu" (linkowanie wewnętrzne) i CTA do wniosku.
import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell } from "@/components/marketing/shell";
import { Section, SectionHead, ComplianceNote, FAQ } from "@/components/marketing/sections";
import { MktButton } from "@/components/marketing/primitives";
import { breadcrumbLd, faqPageLd, financialServiceLd, SITE_URL } from "@/lib/seo/company";
import type { LocationPageContent } from "@/lib/seo-location/core";

type PageRow = {
  slug: string;
  name: string;
  meta_title: string;
  meta_description: string;
  content: LocationPageContent;
  generated_at: string;
  published_at: string | null;
  youtube_video_id?: string | null;
};

const db = supabase as unknown as SupabaseClient;

export const Route = createFileRoute("/pozyczki/$slug")({
  loader: async ({ params }): Promise<{ page: PageRow; publishedNearby: string[] }> => {
    const { data } = await db
      .from("seo_location_pages")
      .select(
        "slug, name, meta_title, meta_description, content, generated_at, published_at, youtube_video_id",
      )
      .eq("slug", params.slug)
      .eq("status", "published")
      .maybeSingle();
    if (!data) throw notFound();
    const page = data as PageRow;

    // Linki „w pobliżu" pokazujemy tylko do stron już opublikowanych.
    const nearbySlugs = (page.content.nearby ?? []).map((n) => n.slug);
    let publishedNearby: string[] = [];
    if (nearbySlugs.length) {
      const { data: nearbyRows } = await db
        .from("seo_location_pages")
        .select("slug")
        .eq("status", "published")
        .in("slug", nearbySlugs);
      publishedNearby = (nearbyRows ?? []).map((r: { slug: string }) => r.slug);
    }
    return { page, publishedNearby };
  },
  head: ({ params, loaderData }) => {
    const page = loaderData?.page;
    if (!page) return { meta: [], links: [], scripts: [] };
    const url = `${SITE_URL}/pozyczki/${params.slug}`;
    return {
      meta: [
        { title: page.meta_title },
        { name: "description", content: page.meta_description },
        {
          name: "robots",
          content: "index, follow, max-image-preview:large, max-snippet:-1",
        },
        { property: "og:title", content: page.meta_title },
        { property: "og:description", content: page.meta_description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Finance You" },
        { property: "og:locale", content: "pl_PL" },
      ],
      links: [
        { rel: "canonical", href: url },
        { rel: "alternate", hrefLang: "pl", href: url },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(financialServiceLd({ areaServedName: page.name, pageUrl: url })),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            faqPageLd(page.content.faq.map((f) => ({ question: f.question, answer: f.answer }))),
          ),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbLd([
              { name: "Finance You", path: "/" },
              { name: "Pożyczki wg miast", path: "/pozyczki" },
              { name: page.name, path: `/pozyczki/${params.slug}` },
            ]),
          ),
        },
      ],
    };
  },
  component: LocationPage,
  notFoundComponent: () => (
    <MarketingShell page="klient">
      <Section>
        <p style={{ textAlign: "center", color: "var(--muted-foreground)" }}>
          Ta podstrona nie istnieje. <Link to="/pozyczki">Zobacz listę miast</Link> albo{" "}
          <Link to="/dla-klienta">złóż wniosek</Link> — finansujemy nieruchomości w całej Polsce.
        </p>
      </Section>
    </MarketingShell>
  ),
});

function LocationPage() {
  const { page, publishedNearby } = Route.useLoaderData() as {
    page: PageRow;
    publishedNearby: string[];
  };
  const c = page.content;
  const nearby = (c.nearby ?? []).filter((n) => publishedNearby.includes(n.slug));

  return (
    <MarketingShell page="klient">
      <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "3rem 1.5rem 0" }}>
        <nav
          aria-label="Okruszki"
          style={{
            fontSize: "0.78rem",
            color: "var(--muted-foreground)",
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <a href="/" style={{ color: "inherit", textDecoration: "none" }}>
            Finance You
          </a>
          <span aria-hidden>/</span>
          <Link to="/pozyczki" style={{ color: "inherit", textDecoration: "none" }}>
            Pożyczki wg miast
          </Link>
          <span aria-hidden>/</span>
          <span style={{ color: "var(--foreground)" }}>{page.name}</span>
        </nav>

        <header style={{ margin: "1.6rem 0 1.5rem" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(1.8rem, 3.4vw, 2.6rem)",
              fontWeight: 900,
              lineHeight: 1.12,
              letterSpacing: "-0.02em",
              color: "var(--foreground)",
            }}
          >
            Pożyczka pod zastaw nieruchomości — {page.name}
          </h1>
        </header>

        {c.intro.map((p, i) => (
          <p key={i} style={{ fontSize: "1rem", lineHeight: 1.7, color: "var(--foreground)" }}>
            {p}
          </p>
        ))}

        {page.youtube_video_id && (
          <div
            style={{
              margin: "1.5rem 0 0",
              position: "relative",
              paddingBottom: "56.25%",
              borderRadius: "var(--radius-2xl)",
              overflow: "hidden",
              border: "1px solid var(--border)",
            }}
          >
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${page.youtube_video_id}`}
              title={`Wideo: pożyczka pod zastaw — ${page.name}`}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          </div>
        )}

        <h2 style={{ marginTop: "2.5rem", fontSize: "1.4rem", fontWeight: 800 }}>
          {c.market.heading}
        </h2>
        <div
          style={{
            marginTop: "1rem",
            display: "grid",
            gap: "0.7rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(13rem, 1fr))",
          }}
        >
          {c.market.stats.map((s) => (
            <div
              key={s.label}
              style={{
                padding: "0.9rem 1rem",
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--border)",
                background: "var(--card)",
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>{s.label}</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--foreground)" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
        {c.market.paragraphs.map((p, i) => (
          <p
            key={i}
            style={{
              marginTop: "1rem",
              fontSize: i === c.market.paragraphs.length - 1 ? "0.8rem" : "1rem",
              lineHeight: 1.7,
              color:
                i === c.market.paragraphs.length - 1
                  ? "var(--muted-foreground)"
                  : "var(--foreground)",
            }}
          >
            {p}
          </p>
        ))}

        <h2 style={{ marginTop: "2.5rem", fontSize: "1.4rem", fontWeight: 800 }}>
          {c.how.heading}
        </h2>
        <ol
          style={{
            margin: "1rem 0 0",
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: "1rem",
          }}
        >
          {c.how.steps.map((s, i) => (
            <li
              key={s.title}
              style={{
                display: "flex",
                gap: "1rem",
                padding: "1rem 1.1rem",
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--border)",
                background: "var(--card)",
              }}
            >
              <span
                aria-hidden
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "2rem",
                  height: "2rem",
                  borderRadius: "50%",
                  background: "var(--accent)",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                }}
              >
                {i + 1}
              </span>
              <div>
                <div style={{ fontWeight: 700, color: "var(--foreground)" }}>{s.title}</div>
                <div
                  style={{
                    marginTop: "0.25rem",
                    fontSize: "0.9rem",
                    lineHeight: 1.6,
                    color: "var(--muted-foreground)",
                  }}
                >
                  {s.text}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div style={{ marginTop: "2.5rem", textAlign: "center" }}>
          <MktButton href="/dla-klienta" size="lg">
            Złóż bezpłatny wniosek
          </MktButton>
          <div
            style={{ marginTop: "0.6rem", fontSize: "0.72rem", color: "var(--muted-foreground)" }}
          >
            Bezpłatne zgłoszenie • bez zobowiązań • decyzja zwykle w 24 h
          </div>
        </div>
      </div>

      <Section tint style={{ marginTop: "3rem" }}>
        <SectionHead center eyebrow="FAQ" title={`Najczęstsze pytania — ${page.name}`} />
        <FAQ items={c.faq.map((f) => ({ q: f.question, a: f.answer }))} />
      </Section>

      {nearby.length > 0 && (
        <Section>
          <SectionHead
            center
            eyebrow="W pobliżu"
            title="Pożyczki pod zastaw w sąsiednich miastach"
          />
          <ul
            style={{
              listStyle: "none",
              margin: "2rem auto 0",
              padding: 0,
              maxWidth: "52rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.6rem",
              justifyContent: "center",
            }}
          >
            {nearby.map((n) => (
              <li key={n.slug}>
                <Link
                  to="/pozyczki/$slug"
                  params={{ slug: n.slug }}
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
                  {n.name}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "0 1.5rem" }}>
        <ComplianceNote style={{ marginTop: "1.5rem" }}>
          Materiał ma charakter informacyjny i nie stanowi oferty w rozumieniu art. 66 Kodeksu
          cywilnego. Finance You nie gwarantuje udzielenia finansowania — decyzja należy do
          finansujących. Dane statystyczne pochodzą z opracowań GUS/TERYT (wersja: {c.dataVersion})
          i mają charakter poglądowy.
        </ComplianceNote>
      </div>
    </MarketingShell>
  );
}
