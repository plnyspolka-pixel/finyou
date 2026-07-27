import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDate } from "@/lib/labels";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell } from "@/components/marketing/shell";
import { CTASection, Section } from "@/components/marketing/sections";
import { MktBadge, Eyebrow } from "@/components/marketing/primitives";
import { BlogCover } from "@/components/blog/BlogCover";

const BLOG_URL = "https://financeyou.pl/blog";
const BLOG_TITLE = "Blog Finance You — pożyczki pod zastaw nieruchomości i inwestowanie";
const BLOG_DESCRIPTION =
  "Porady, analizy rynkowe i przewodniki o pożyczkach pod zabezpieczenie nieruchomości oraz o inwestowaniu w pożyczki hipoteczne. Aktualizacja codzienna.";

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  reading_minutes: number | null;
  published_at: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  primary_keyword: string | null;
  audience: string | null;
};

export const Route = createFileRoute("/blog/")({
  loader: async () => {
    const { data } = await supabase
      .from("ai_seo_articles")
      .select(
        "id,slug,title,excerpt,reading_minutes,published_at,cover_image_url,cover_image_alt,primary_keyword,audience",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(50);
    return { articles: (data ?? []) as ArticleRow[] };
  },

  head: ({ loaderData }) => {
    const articles = loaderData?.articles ?? [];
    return {
      meta: [
        { title: BLOG_TITLE },
        { name: "description", content: BLOG_DESCRIPTION },
        { name: "robots", content: "index, follow, max-image-preview:large" },
        { property: "og:title", content: BLOG_TITLE },
        { property: "og:description", content: BLOG_DESCRIPTION },
        { property: "og:type", content: "website" },
        { property: "og:url", content: BLOG_URL },
        { property: "og:site_name", content: "Finance You" },
        { property: "og:locale", content: "pl_PL" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: BLOG_TITLE },
        { name: "twitter:description", content: BLOG_DESCRIPTION },
      ],
      links: [{ rel: "canonical", href: BLOG_URL }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "Blog Finance You",
            description: BLOG_DESCRIPTION,
            url: BLOG_URL,
            inLanguage: "pl-PL",
            publisher: {
              "@type": "Organization",
              name: "Finance You",
              url: "https://financeyou.pl",
              logo: { "@type": "ImageObject", url: "https://financeyou.pl/favicon.png" },
            },
            blogPost: articles.slice(0, 20).map((a) => ({
              "@type": "BlogPosting",
              headline: a.title,
              url: `${BLOG_URL}/${a.slug}`,
              datePublished: a.published_at ?? undefined,
              image: a.cover_image_url ?? undefined,
            })),
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Finance You",
                item: "https://financeyou.pl",
              },
              { "@type": "ListItem", position: 2, name: "Blog", item: BLOG_URL },
            ],
          }),
        },
      ],
    };
  },
  component: BlogIndex,
  errorComponent: ({ error }) => (
    <MarketingShell page="blog">
      <Section>
        <p style={{ textAlign: "center", color: "var(--muted-foreground)" }}>{error.message}</p>
      </Section>
    </MarketingShell>
  ),
  notFoundComponent: () => (
    <MarketingShell page="blog">
      <Section>
        <p style={{ textAlign: "center", color: "var(--muted-foreground)" }}>Brak artykułów.</p>
      </Section>
    </MarketingShell>
  ),
});

function audienceBadge(audience: string | null) {
  if (audience === "investor") return <MktBadge variant="gold">Dla inwestora</MktBadge>;
  return <MktBadge variant="accent">Dla klienta</MktBadge>;
}

function ArticleCard({ a }: { a: ArticleRow }) {
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: a.slug }}
      className="fy-blog-card"
      style={{
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        color: "inherit",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-2xl)",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
        transition:
          "border-color var(--duration-base) var(--ease-out), box-shadow var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-out)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.boxShadow = "var(--shadow-lg)";
        e.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
        e.currentTarget.style.transform = "none";
      }}
    >
      {a.cover_image_url && (
        <BlogCover src={a.cover_image_url} alt={a.cover_image_alt || a.title} />
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "1.25rem 1.3rem 1.2rem",
          gap: "0.6rem",
        }}
      >
        <div>{audienceBadge(a.audience)}</div>
        <h2
          style={{
            margin: 0,
            fontSize: "1.08rem",
            fontWeight: 700,
            lineHeight: 1.35,
            color: "var(--foreground)",
          }}
        >
          {a.title}
        </h2>
        {a.excerpt && (
          <p
            style={{
              margin: 0,
              flex: 1,
              fontSize: "0.88rem",
              lineHeight: 1.55,
              color: "var(--muted-foreground)",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {a.excerpt}
          </p>
        )}
        <div
          style={{
            marginTop: "auto",
            paddingTop: "0.4rem",
            fontSize: "0.74rem",
            color: "var(--muted-foreground)",
          }}
        >
          {a.reading_minutes ? `${a.reading_minutes} min czytania` : null}
          {a.reading_minutes && a.published_at ? " • " : null}
          {a.published_at ? formatDate(a.published_at) : null}
        </div>
      </div>
    </Link>
  );
}

function BlogIndex() {
  const { articles } = Route.useLoaderData();
  return (
    <MarketingShell page="blog">
      <section
        className="fy-hero"
        style={{ color: "#fff", borderBottom: "1px solid var(--border)" }}
      >
        <div aria-hidden className="fy-hero-fx" />
        <div
          style={{
            position: "relative",
            maxWidth: "80rem",
            margin: "0 auto",
            padding: "3.5rem 1.5rem 3.8rem",
            textAlign: "center",
          }}
        >
          <Eyebrow tone="gold" style={{ letterSpacing: "0.24em" }}>
            Blog Finance You
          </Eyebrow>
          <h1
            style={{
              marginTop: "0.8rem",
              fontSize: "clamp(2rem, 3.6vw, 2.9rem)",
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: "-0.025em",
            }}
          >
            Wiedza o pożyczkach pod zastaw nieruchomości{" "}
            <span
              style={{
                background: "linear-gradient(95deg,#f0c667,#f6dc9c 34%,#5fa2f6 82%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              i inwestowaniu.
            </span>
          </h1>
          <p
            style={{
              margin: "1.1rem auto 0",
              maxWidth: "44rem",
              fontSize: "1.02rem",
              lineHeight: 1.65,
              color: "rgba(255,255,255,.82)",
            }}
          >
            Porady i analizy dla właścicieli nieruchomości szukających{" "}
            <a href="/dla-klienta" style={{ color: "#a9cffb" }}>
              finansowania pod zabezpieczenie nieruchomości
            </a>{" "}
            oraz dla{" "}
            <a href="/dla-inwestora" style={{ color: "#a9cffb" }}>
              inwestorów w pożyczki hipoteczne
            </a>
            . Sprawdź też{" "}
            <a href="/oferty" style={{ color: "#a9cffb" }}>
              aktualne oferty pożyczek
            </a>
            .
          </p>
        </div>
      </section>

      <Section>
        <div
          className="fy-grid"
          style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "repeat(3, 1fr)" }}
        >
          {articles.map((a: ArticleRow) => (
            <ArticleCard key={a.id} a={a} />
          ))}
        </div>
        {articles.length === 0 && (
          <p style={{ textAlign: "center", color: "var(--muted-foreground)", padding: "3rem 0" }}>
            Brak artykułów.
          </p>
        )}
      </Section>

      <CTASection
        title="Sprawdź, co Finance You może zrobić dla Ciebie."
        sub="Bezpłatny wniosek o finansowanie pod zabezpieczenie nieruchomości albo dostęp do Klubu Inwestorów Hipotecznych — edukacja, dokumenty i narzędzia AI."
        buttons={[
          { label: "Dla klienta — złóż wniosek", href: "/dla-klienta" },
          { label: "Dla inwestora — poznaj Klub", href: "/dla-inwestora" },
        ]}
      />
    </MarketingShell>
  );
}
