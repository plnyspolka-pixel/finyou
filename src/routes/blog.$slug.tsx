import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Facebook, Linkedin, Twitter, Link2, Mail, MessageCircle, Check } from "lucide-react";
import { useState } from "react";

const FAVICON_URL = "https://financeyou.pl/__l5e/assets-v1/73e2df85-6890-4ae6-a18a-debbc0970e07/favicon-mark.png";
const WORDMARK_URL = "https://financeyou.pl/__l5e/assets-v1/78c589be-8669-4bdf-a471-ff97875e8d7a/financeyou-wordmark.png";

function ShareBar({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent;
  const links = [
    { label: "Facebook", icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { label: "X / Twitter", icon: Twitter, href: `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}` },
    { label: "LinkedIn", icon: Linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
    { label: "WhatsApp", icon: MessageCircle, href: `https://wa.me/?text=${enc(title + " " + url)}` },
    { label: "E-mail", icon: Mail, href: `mailto:?subject=${enc(title)}&body=${enc(url)}` },
  ];
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Udostępnij:</span>
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={`Udostępnij na ${l.label}`}
           className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background hover:bg-muted transition-colors">
          <l.icon className="h-4 w-4" />
        </a>
      ))}
      <button type="button" onClick={copy} aria-label="Skopiuj link"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background hover:bg-muted transition-colors">
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
          <Link to="/blog" className="text-muted-foreground hover:text-foreground">Blog</Link>
          <a href="https://financeyou.pl" className="text-muted-foreground hover:text-foreground">financeyou.pl</a>
          <Button asChild size="sm"><a href="https://app.financeyou.pl/embed/wniosek" target="_blank" rel="noopener">Złóż wniosek</a></Button>
        </nav>
      </div>
    </header>
  );
}

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const { data } = await supabase.from("ai_seo_articles").select("*").eq("slug", params.slug).eq("status", "published").maybeSingle();
    if (!data) throw notFound();
    return { article: data };
  },
  head: ({ params, loaderData }) => ({
    meta: loaderData?.article ? [
      { title: loaderData.article.meta_title || loaderData.article.title },
      { name: "description", content: loaderData.article.meta_description || loaderData.article.excerpt || "" },
      { property: "og:title", content: loaderData.article.meta_title || loaderData.article.title },
      { property: "og:description", content: loaderData.article.meta_description || loaderData.article.excerpt || "" },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `https://financeyou.pl/blog/${params.slug}` },
      ...(loaderData.article.cover_image_url ? [
        { property: "og:image", content: loaderData.article.cover_image_url },
        { name: "twitter:image", content: loaderData.article.cover_image_url },
        { name: "twitter:card", content: "summary_large_image" },
      ] : []),
    ] : [],

    links: loaderData?.article ? [
      { rel: "canonical", href: `https://financeyou.pl/blog/${params.slug}` },
    ] : [],
    scripts: loaderData?.article ? [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: loaderData.article.title,
          description: loaderData.article.excerpt || loaderData.article.meta_description || "",
          datePublished: loaderData.article.published_at ?? undefined,
          dateModified: loaderData.article.updated_at ?? loaderData.article.published_at ?? undefined,
          author: { "@type": "Organization", name: "Finance You" },
          publisher: {
            "@type": "Organization",
            name: "Finance You",
            logo: { "@type": "ImageObject", url: "https://financeyou.pl/favicon.png" },
          },
          mainEntityOfPage: `https://financeyou.pl/blog/${params.slug}`,
        }),
      },
    ] : [],
  }),
  component: ArticlePage,
  notFoundComponent: () => <div className="grid min-h-screen place-items-center text-muted-foreground">Artykuł nie istnieje.</div>,
  errorComponent: ({ error }) => <div className="grid min-h-screen place-items-center text-destructive">{error.message}</div>,
});

function ArticlePage() {
  const { article } = Route.useLoaderData();
  const cta = article.cta_url || "https://app.financeyou.pl/embed/wniosek";
  const shareUrl = `https://financeyou.pl/blog/${article.slug}`;
  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground">← Wróć do bloga</Link>
        <header className="mt-6 mb-8 space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold leading-tight">{article.title}</h1>
          <div className="text-xs text-muted-foreground">
            {article.reading_minutes ? `${article.reading_minutes} min czytania` : null}
            {article.published_at ? ` • ${new Date(article.published_at).toLocaleDateString("pl-PL")}` : null}
          </div>
          {article.cover_image_url && (
            <div className="aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted">
              <img
                src={article.cover_image_url}
                alt={article.cover_image_alt || article.title}
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <ShareBar url={shareUrl} title={article.title} />
        </header>
        <article className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content_md}</ReactMarkdown>
        </article>
        <div className="mt-12 rounded-xl border bg-card p-6 text-center space-y-3">
          <h3 className="text-xl font-semibold">Potrzebujesz pożyczki pod zastaw?</h3>
          <p className="text-sm text-muted-foreground">Sprawdź warunki w 2 minuty — bez BIK, decyzja w 24h.</p>
          <Button asChild size="lg"><a href={cta} target="_blank" rel="noopener">{article.cta_label || "Złóż wniosek"}</a></Button>
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
            <Link to="/blog" className="hover:text-foreground">Blog</Link>
            <a href="mailto:kontakt@app.financeyou.pl" className="hover:text-foreground">Kontakt</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
