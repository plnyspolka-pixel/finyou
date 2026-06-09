import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground">← Wróć do bloga</Link>
        <header className="mt-6 mb-8 space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold leading-tight">{article.title}</h1>
          <div className="text-xs text-muted-foreground">
            {article.reading_minutes ? `${article.reading_minutes} min czytania` : null}
            {article.published_at ? ` • ${new Date(article.published_at).toLocaleDateString("pl-PL")}` : null}
          </div>
        </header>
        <article className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content_md}</ReactMarkdown>
        </article>
        <div className="mt-12 rounded-xl border bg-card p-6 text-center space-y-3">
          <h3 className="text-xl font-semibold">Potrzebujesz pożyczki pod zastaw?</h3>
          <p className="text-sm text-muted-foreground">Sprawdź warunki w 2 minuty — bez BIK, decyzja w 24h.</p>
          <Button asChild size="lg"><a href={cta} target="_blank" rel="noopener">{article.cta_label || "Złóż wniosek"}</a></Button>
        </div>
      </div>
    </div>
  );
}
