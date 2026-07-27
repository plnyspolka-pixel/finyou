import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { formatDate } from "@/lib/labels";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Facebook, Linkedin, Twitter, Link2, Mail, MessageCircle, Check } from "lucide-react";
import { useState } from "react";
import { BlogCover } from "@/components/blog/BlogCover";

const FAVICON_URL =
  "https://financeyou.pl/__l5e/assets-v1/73e2df85-6890-4ae6-a18a-debbc0970e07/favicon-mark.png";
const WORDMARK_URL =
  "https://financeyou.pl/__l5e/assets-v1/f4352ffd-618d-446b-a632-fc3a5abb0bdd/financeyou-wordmark.png";

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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">
        Udostępnij:
      </span>
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Udostępnij na ${l.label}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background hover:bg-muted transition-colors"
        >
          <l.icon className="h-4 w-4" />
        </a>
      ))}
      <button
        type="button"
        onClick={copy}
        aria-label="Skopiuj link"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background hover:bg-muted transition-colors"
      >
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Link2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

function BrandHeader() {
  return (
    <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
        <a href="https://financeyou.pl" className="flex items-center gap-2">
          <img src={FAVICON_URL} alt="Finance You" className="h-7 w-7" />
          <img src={WORDMARK_URL} alt="Finance You" className="h-5 hidden sm:block" />
        </a>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/blog" className="text-muted-foreground hover:text-foreground">
            Blog
          </Link>
          <a href="https://financeyou.pl" className="text-muted-foreground hover:text-foreground">
            financeyou.pl
          </a>
          <Button asChild size="sm">
            <a href="https://financeyou.pl" target="_blank" rel="noopener">
              Finance You
            </a>
          </Button>
        </nav>
      </div>
    </header>
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
    return { article: data };
  },
  head: ({ params, loaderData }) => {
    const a: any = loaderData?.article;
    if (!a) return { meta: [], links: [], scripts: [] };
    const url = `https://financeyou.pl/blog/${params.slug}`;
    const isInvestor = a.audience === "investor";
    const ctaUrl = isInvestor ? "https://financeyou.pl/inwestor" : "https://financeyou.pl/klient";
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
            "@type": "NewsArticle",
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
    <div className="grid min-h-screen place-items-center text-muted-foreground">
      Artykuł nie istnieje.
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="grid min-h-screen place-items-center text-destructive">{error.message}</div>
  ),
});

function ArticlePage() {
  const { article } = Route.useLoaderData();
  const shareUrl = `https://financeyou.pl/blog/${article.slug}`;
  const isInvestor = article.audience === "investor";
  const ctaHref = isInvestor ? "/inwestor" : "/klient";
  const ctaHeading = isInvestor
    ? "Zainwestuj w pożyczki pod zastaw nieruchomości"
    : "Potrzebujesz pożyczki pod zastaw?";
  const ctaSub = isInvestor
    ? "Zabezpieczenie hipoteczne, prognozowana stopa zwrotu, pełna transparentność ofert."
    : "Sprawdź warunki w 2 minuty — bez BIK, decyzja w 24h.";
  const ctaLabel =
    article.cta_label || (isInvestor ? "Zostań inwestorem" : "Złóż wniosek o pożyczkę");
  const ctaMicro = isInvestor
    ? "Dostęp do panelu inwestora • realne oferty • wypłata w 24h"
    : "Bez BIK • decyzja w 24h • wypłata tego samego dnia";

  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground">
          ← Wróć do bloga
        </Link>
        <header className="mt-6 mb-8 space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold leading-tight">{article.title}</h1>
          <div className="text-xs text-muted-foreground">
            {article.reading_minutes ? `${article.reading_minutes} min czytania` : null}
            {article.published_at ? ` • ${formatDate(article.published_at)}` : null}
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
        <article className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content_md}</ReactMarkdown>
        </article>
        <div
          className="relative mt-14 overflow-hidden rounded-2xl border border-white/10 p-8 md:p-10 text-center text-white shadow-[0_30px_80px_-30px_rgba(9,14,40,0.65)]"
          style={{
            background:
              "radial-gradient(120% 140% at 0% 0%, rgba(56,120,255,0.35) 0%, transparent 55%), radial-gradient(120% 140% at 100% 100%, rgba(201,168,76,0.28) 0%, transparent 60%), linear-gradient(135deg, #0b1330 0%, #101a4a 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "conic-gradient(from 220deg at 50% 50%, rgba(255,255,255,0.06), rgba(255,255,255,0.0) 30%, rgba(201,168,76,0.10) 60%, rgba(255,255,255,0.0) 100%)",
            }}
          />
          <div className="relative space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/80">
              {isInvestor ? "Dla inwestora" : "Dla pożyczkobiorcy"}
            </div>
            <h3 className="text-2xl md:text-3xl font-bold leading-tight">{ctaHeading}</h3>
            <p className="text-sm md:text-base text-white/75 max-w-xl mx-auto">{ctaSub}</p>
            <div className="pt-2">
              <Link
                to={ctaHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#c9a84c] to-[#f0d78c] px-8 py-3.5 text-sm font-semibold text-[#0b1330] shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 hover:shadow-xl"
              >
                {ctaLabel}
                <span aria-hidden>→</span>
              </Link>
            </div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/55">{ctaMicro}</div>
          </div>
        </div>
        <div className="mt-8 flex justify-center">
          <ShareBar url={shareUrl} title={article.title} />
        </div>
        <footer className="mt-12 pt-6 border-t flex items-center justify-between text-xs text-muted-foreground">
          <a href="https://financeyou.pl" className="flex items-center gap-2 hover:text-foreground">
            <img src={FAVICON_URL} alt="" className="h-5 w-5" />
            <span>© Finance You</span>
          </a>
          <div className="flex gap-3">
            <Link to="/blog" className="hover:text-foreground">
              Blog
            </Link>
            <a href="mailto:kontakt@app.financeyou.pl" className="hover:text-foreground">
              Kontakt
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
