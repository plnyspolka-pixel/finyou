import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { formatDate } from "@/lib/labels";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Facebook, Linkedin, Twitter, Link2, Mail, MessageCircle, Check } from "lucide-react";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { BlogCover } from "@/components/blog/BlogCover";
import { MarketingShell } from "@/components/marketing/shell";
import { ComplianceNote, Section } from "@/components/marketing/sections";
import { MktBadge, Eyebrow } from "@/components/marketing/primitives";

type RelatedRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  reading_minutes: number | null;
  published_at: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  audience: string | null;
};

/**
 * Normalizuje linki w treści markdown artykułów:
 * - absolutne linki do financeyou.pl stają się względne (SPA-friendly),
 * - historyczne CTA `/inwestor` i `/klient` (panele wymagające logowania)
 *   są mapowane na publiczne strony marketingowe `/dla-inwestora` i `/dla-klienta`,
 * - CTA do formularza embed prowadzi na stronę dla klienta.
 */
function normalizeHref(raw?: string): { href: string; external: boolean } {
  if (!raw) return { href: "#", external: false };
  let href = raw.trim();
  if (href.startsWith("https://app.financeyou.pl/embed/wniosek")) href = "/dla-klienta";
  href = href.replace(/^https?:\/\/(www\.)?financeyou\.pl/, "") || "/";
  if (/^\/inwestor(?:[/?#]|$)/.test(href)) href = "/dla-inwestora";
  if (/^\/klient(?:[/?#]|$)/.test(href)) href = "/dla-klienta";
  return { href, external: /^https?:\/\//.test(href) };
}

function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const { href: normalized, external } = normalizeHref(href);
  if (external) {
    return (
      <a href={normalized} target="_blank" rel="nofollow noopener noreferrer">
        {children}
      </a>
    );
  }
  return <a href={normalized}>{children}</a>;
}

function ShareBar({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent;
  const links = [
    {
      label: "Facebook",
      icon: Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    },
    {
      label: "X / Twitter",
      icon: Twitter,
      href: `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`,
    },
    {
      label: "LinkedIn",
      icon: Linkedin,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
    },
    {
      label: "WhatsApp",
      icon: MessageCircle,
      href: `https://wa.me/?text=${enc(title + " " + url)}`,
    },
    { label: "E-mail", icon: Mail, href: `mailto:?subject=${enc(title)}&body=${enc(url)}` },
  ];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };
  const itemStyle: CSSProperties = {
    display: "inline-flex",
    height: "2.4rem",
    width: "2.4rem",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--muted-foreground)",
    cursor: "pointer",
    transition:
      "background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
      <span
        style={{
          fontSize: "0.68rem",
          textTransform: "uppercase",
          letterSpacing: "var(--tracking-widest)",
          color: "var(--muted-foreground)",
          marginRight: 4,
        }}
      >
        Udostępnij:
      </span>
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Udostępnij na ${l.label}`}
          style={itemStyle}
        >
          <l.icon size={16} />
        </a>
      ))}
      <button type="button" onClick={copy} aria-label="Skopiuj link" style={itemStyle}>
        {copied ? <Check size={16} color="var(--gold-600)" /> : <Link2 size={16} />}
      </button>
    </div>
  );
}

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("ai_seo_articles")
      .select("*")
      .eq("slug", params.slug)
      .eq("status", "published")
      .maybeSingle();
    if (!data) throw notFound();

    // Powiązane artykuły do linkowania wewnętrznego: najpierw te, do których
    // artykuł linkuje w treści, potem najnowsze dla tej samej grupy odbiorców.
    const { data: relRaw } = await supabase
      .from("ai_seo_articles")
      .select(
        "slug,title,excerpt,reading_minutes,published_at,cover_image_url,cover_image_alt,audience",
      )
      .eq("status", "published")
      .neq("slug", params.slug)
      .order("published_at", { ascending: false })
      .limit(12);
    const pool = (relRaw ?? []) as RelatedRow[];
    const linked: string[] = Array.isArray((data as any).internal_link_slugs)
      ? (data as any).internal_link_slugs
      : [];
    const score = (r: RelatedRow) =>
      linked.includes(r.slug) ? 0 : r.audience === (data as any).audience ? 1 : 2;
    const related = [...pool].sort((a, b) => score(a) - score(b)).slice(0, 3);

    return { article: data, related };
  },
  head: ({ params, loaderData }) => {
    const a: any = loaderData?.article;
    if (!a) return { meta: [], links: [], scripts: [] };
    const url = `https://financeyou.pl/blog/${params.slug}`;
    const isInvestor = a.audience === "investor";
    const ctaUrl = isInvestor
      ? "https://financeyou.pl/dla-inwestora"
      : "https://financeyou.pl/dla-klienta";
    const audienceType = isInvestor ? "Investor" : "Borrower";
    const section = isInvestor ? "Inwestowanie" : "Pożyczki pod zastaw";
    const title = a.meta_title || a.title;
    const description = a.meta_description || a.excerpt || "";
    const keywords: string[] = Array.isArray(a.keywords) ? a.keywords : [];

    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(keywords.length ? [{ name: "keywords", content: keywords.join(", ") }] : []),
        ...(a.primary_keyword ? [{ name: "news_keywords", content: a.primary_keyword }] : []),
        { name: "author", content: "Finance You" },
        {
          name: "robots",
          content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
        },
        { name: "article:section", content: section },
        { name: "article:published_time", content: a.published_at ?? "" },
        { name: "article:modified_time", content: a.updated_at ?? a.published_at ?? "" },
        { name: "article:author", content: "Finance You" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Finance You" },
        { property: "og:locale", content: "pl_PL" },
        { property: "article:publisher", content: "https://financeyou.pl" },
        { property: "article:section", content: section },
        ...(a.published_at
          ? [{ property: "article:published_time", content: a.published_at }]
          : []),
        ...(a.updated_at || a.published_at
          ? [{ property: "article:modified_time", content: a.updated_at ?? a.published_at }]
          : []),
        ...keywords.map((k) => ({ property: "article:tag", content: k })),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:site", content: "@financeyou_pl" },
        ...(a.cover_image_url
          ? [
              { property: "og:image", content: a.cover_image_url },
              { property: "og:image:alt", content: a.cover_image_alt || title },
              { name: "twitter:image", content: a.cover_image_url },
              { name: "twitter:image:alt", content: a.cover_image_alt || title },
            ]
          : []),
        { name: "audience", content: audienceType },
      ],
      links: [
        { rel: "canonical", href: url },
        { rel: "alternate", hrefLang: "pl", href: url },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: a.title,
            alternativeHeadline: a.meta_title || undefined,
            description,
            image: a.cover_image_url ? [a.cover_image_url] : undefined,
            datePublished: a.published_at ?? undefined,
            dateModified: a.updated_at ?? a.published_at ?? undefined,
            inLanguage: "pl-PL",
            articleSection: section,
            keywords: keywords.length ? keywords.join(", ") : (a.primary_keyword ?? undefined),
            wordCount: a.word_count ?? undefined,
            timeRequired: a.reading_minutes ? `PT${a.reading_minutes}M` : undefined,
            author: {
              "@type": "Organization",
              name: "Finance You",
              url: "https://financeyou.pl",
            },
            publisher: {
              "@type": "Organization",
              name: "Finance You",
              url: "https://financeyou.pl",
              logo: {
                "@type": "ImageObject",
                url: "https://financeyou.pl/favicon.png",
              },
            },
            mainEntityOfPage: { "@type": "WebPage", "@id": url },
            audience: {
              "@type": "Audience",
              audienceType,
            },
            about: {
              "@type": "FinancialProduct",
              name: isInvestor
                ? "Inwestowanie w pożyczki pod zastaw nieruchomości"
                : "Pożyczka pod zastaw nieruchomości",
              url: ctaUrl,
              provider: {
                "@type": "Organization",
                name: "Finance You",
                url: "https://financeyou.pl",
              },
            },
            isAccessibleForFree: true,
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
              {
                "@type": "ListItem",
                position: 2,
                name: "Blog",
                item: "https://financeyou.pl/blog",
              },
              { "@type": "ListItem", position: 3, name: a.title, item: url },
            ],
          }),
        },
      ],
    };
  },
  component: ArticlePage,
  notFoundComponent: () => (
    <MarketingShell page="blog">
      <Section>
        <p style={{ textAlign: "center", color: "var(--muted-foreground)" }}>
          Artykuł nie istnieje. <Link to="/blog">Wróć do bloga</Link>.
        </p>
      </Section>
    </MarketingShell>
  ),
  errorComponent: ({ error }) => (
    <MarketingShell page="blog">
      <Section>
        <p style={{ textAlign: "center", color: "var(--muted-foreground)" }}>{error.message}</p>
      </Section>
    </MarketingShell>
  ),
});

function RelatedCard({ r }: { r: RelatedRow }) {
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: r.slug }}
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
          "border-color var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-out)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.transform = "none";
      }}
    >
      {r.cover_image_url && (
        <BlogCover src={r.cover_image_url} alt={r.cover_image_alt || r.title} />
      )}
      <div style={{ padding: "1rem 1.1rem 1.1rem" }}>
        <h3
          style={{
            margin: 0,
            fontSize: "0.95rem",
            fontWeight: 700,
            lineHeight: 1.4,
            color: "var(--foreground)",
          }}
        >
          {r.title}
        </h3>
        <div style={{ marginTop: "0.5rem", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
          {r.reading_minutes ? `${r.reading_minutes} min czytania` : null}
          {r.reading_minutes && r.published_at ? " • " : null}
          {r.published_at ? formatDate(r.published_at) : null}
        </div>
      </div>
    </Link>
  );
}

function ArticlePage() {
  const { article, related } = Route.useLoaderData();
  const shareUrl = `https://financeyou.pl/blog/${article.slug}`;
  const isInvestor = article.audience === "investor";
  const ctaHref = isInvestor ? "/dla-inwestora" : "/dla-klienta";
  const ctaHeading = isInvestor
    ? "Inwestuj w pożyczki zabezpieczone nieruchomościami"
    : "Szukasz finansowania pod zabezpieczenie nieruchomości?";
  const ctaSub = isInvestor
    ? "Inwestorzy na rynku pożyczek zabezpieczonych nieruchomościami realnie osiągają od kilkunastu do nawet kilkudziesięciu procent rocznie. W Klubie Inwestorów Hipotecznych: dostęp do spraw klientów, Akademia inwestora, wzory dokumentów, narzędzia AI i wsparcie compliance."
    : "Złóż bezpłatny wniosek — jedno zgłoszenie trafia do wielu prywatnych inwestorów i partnerów finansowych. Bez zobowiązań.";
  const ctaLabel = isInvestor ? "Poznaj Klub Inwestorów" : "Sprawdź możliwości bezpłatnie";
  const ctaMicro = isInvestor
    ? "Realne stopy zwrotu: kilkanaście–kilkadziesiąt % rocznie • dostęp do zgłoszeń klientów • decyzja należy do Ciebie"
    : "Bezpłatne zgłoszenie • bez zobowiązań • liczy się nieruchomość, nie sam scoring";
  const disclaimer = isInvestor
    ? "Przywoływane stopy zwrotu odzwierciedlają wyniki osiągane na rynku pożyczek zabezpieczonych nieruchomościami i mają charakter informacyjny — nie stanowią gwarancji przyszłych wyników, oferty ani doradztwa inwestycyjnego. Wynik zależy od parametrów konkretnej transakcji, a inwestowanie wiąże się z ryzykiem, w tym utraty części lub całości kapitału."
    : "Materiał ma charakter informacyjny i nie stanowi oferty. Finance You nie gwarantuje finansowania — decyzja należy do finansujących. Kwoty, koszty i kalkulacje przywoływane w artykule mają charakter orientacyjny.";

  return (
    <MarketingShell page="blog">
      <div style={{ maxWidth: "48rem", margin: "0 auto", padding: "3rem 1.5rem 0" }}>
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
          <Link to="/blog" style={{ color: "inherit", textDecoration: "none" }}>
            Blog
          </Link>
          <span aria-hidden>/</span>
          <span style={{ color: "var(--foreground)" }}>{article.title}</span>
        </nav>

        <header style={{ margin: "1.6rem 0 2rem", display: "grid", gap: "1rem" }}>
          <div>
            {isInvestor ? (
              <MktBadge variant="gold">Dla inwestora</MktBadge>
            ) : (
              <MktBadge variant="accent">Dla klienta</MktBadge>
            )}
          </div>
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
            {article.title}
          </h1>
          <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
            {article.reading_minutes ? `${article.reading_minutes} min czytania` : null}
            {article.reading_minutes && article.published_at ? " • " : null}
            {article.published_at ? formatDate(article.published_at) : null}
          </div>
          {article.cover_image_url && (
            <BlogCover
              src={article.cover_image_url}
              alt={article.cover_image_alt || article.title}
              rounded
            />
          )}
          <ShareBar url={shareUrl} title={article.title} />
        </header>

        {(article as { youtube_video_id?: string | null }).youtube_video_id && (
          <div
            style={{
              margin: "0 0 1.5rem",
              position: "relative",
              paddingBottom: "56.25%",
              borderRadius: "var(--radius-2xl)",
              overflow: "hidden",
              border: "1px solid var(--border)",
            }}
          >
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${(article as { youtube_video_id?: string | null }).youtube_video_id}`}
              title={`Wideo: ${article.title}`}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          </div>
        )}

        <article className="fy-article">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
            {article.content_md}
          </ReactMarkdown>
        </article>

        <div
          style={{
            position: "relative",
            marginTop: "3.5rem",
            overflow: "hidden",
            borderRadius: "var(--radius-3xl)",
            border: "1px solid rgba(255,255,255,0.1)",
            padding: "2.5rem 2rem",
            textAlign: "center",
            color: "#fff",
            boxShadow: "var(--shadow-xl)",
            background:
              "radial-gradient(120% 140% at 0% 0%, rgba(56,120,255,0.35) 0%, transparent 55%), radial-gradient(120% 140% at 100% 100%, rgba(201,168,76,0.28) 0%, transparent 60%), linear-gradient(135deg, #0b1330 0%, #101a4a 100%)",
          }}
        >
          <div
            aria-hidden
            style={{
              pointerEvents: "none",
              position: "absolute",
              inset: 0,
              opacity: 0.4,
              background:
                "conic-gradient(from 220deg at 50% 50%, rgba(255,255,255,0.06), rgba(255,255,255,0.0) 30%, rgba(201,168,76,0.10) 60%, rgba(255,255,255,0.0) 100%)",
            }}
          />
          <div
            style={{ position: "relative", display: "grid", gap: "1rem", justifyItems: "center" }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                padding: "0.25rem 0.8rem",
                fontSize: "0.68rem",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "rgba(255,255,255,0.8)",
              }}
            >
              {isInvestor ? "Dla inwestora" : "Dla klienta"}
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: "clamp(1.5rem, 2.8vw, 2rem)",
                fontWeight: 800,
                lineHeight: 1.15,
              }}
            >
              {ctaHeading}
            </h2>
            <p
              style={{
                margin: 0,
                maxWidth: "36rem",
                fontSize: "0.95rem",
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.75)",
              }}
            >
              {ctaSub}
            </p>
            <a
              href={ctaHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                borderRadius: "var(--radius-xl)",
                background: "linear-gradient(90deg, #c9a84c, #f0d78c)",
                padding: "0.9rem 2rem",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: "#0b1330",
                textDecoration: "none",
                boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
                transition: "transform var(--duration-base) var(--ease-out)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none";
              }}
            >
              {ctaLabel}
              <span aria-hidden>→</span>
            </a>
            <div
              style={{
                fontSize: "0.66rem",
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              {ctaMicro}
            </div>
          </div>
        </div>

        <ComplianceNote style={{ marginTop: "1.5rem" }}>{disclaimer}</ComplianceNote>

        <div style={{ marginTop: "2rem", display: "flex", justifyContent: "center" }}>
          <ShareBar url={shareUrl} title={article.title} />
        </div>
      </div>

      {related.length > 0 && (
        <Section tint style={{ marginTop: "3.5rem" }}>
          <div style={{ textAlign: "center" }}>
            <Eyebrow tone="gold" style={{ letterSpacing: "0.24em" }}>
              Czytaj dalej
            </Eyebrow>
            <h2
              style={{
                marginTop: "0.5rem",
                fontSize: "clamp(1.5rem, 2.6vw, 2rem)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              Powiązane artykuły
            </h2>
          </div>
          <div
            className="fy-grid"
            style={{
              marginTop: "2rem",
              display: "grid",
              gap: "1.2rem",
              gridTemplateColumns: "repeat(3, 1fr)",
            }}
          >
            {related.map((r: RelatedRow) => (
              <RelatedCard key={r.slug} r={r} />
            ))}
          </div>
          <div style={{ marginTop: "1.8rem", textAlign: "center" }}>
            <Link to="/blog" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              ← Wszystkie artykuły na blogu
            </Link>
          </div>
        </Section>
      )}
    </MarketingShell>
  );
}
