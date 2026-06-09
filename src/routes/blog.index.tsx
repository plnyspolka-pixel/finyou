import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const FAVICON_URL = "https://financeyou.pl/__l5e/assets-v1/73e2df85-6890-4ae6-a18a-debbc0970e07/favicon-mark.png";
const WORDMARK_URL = "https://financeyou.pl/__l5e/assets-v1/78c589be-8669-4bdf-a471-ff97875e8d7a/financeyou-wordmark.png";

export const Route = createFileRoute("/blog/")({
  loader: async () => {
    const { data } = await supabase
      .from("ai_seo_articles")
      .select("id,slug,title,excerpt,reading_minutes,published_at,cover_image_url,cover_image_alt,primary_keyword")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(50);
    return { articles: data ?? [] };
  },

  head: () => ({
    meta: [
      { title: "Blog Finance You — pożyczki pod zastaw nieruchomości" },
      { name: "description", content: "Porady, analizy i przewodniki o pożyczkach pod zastaw nieruchomości." },
      { property: "og:title", content: "Blog Finance You" },
      { property: "og:description", content: "Porady i analizy o pożyczkach pod zastaw nieruchomości." },
    ],
  }),
  component: BlogIndex,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Brak.</div>,
});

function BlogIndex() {
  const { articles } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <header className="mb-10 text-center space-y-2">
          <h1 className="text-4xl font-bold">Blog Finance You</h1>
          <p className="text-muted-foreground">Pożyczki pod zastaw nieruchomości — wiedza, porady, analizy.</p>
        </header>
        <div className="grid gap-6 md:grid-cols-2">
          {articles.map((a: any) => (
            <Link key={a.id} to="/blog/$slug" params={{ slug: a.slug }} className="block group">
              <Card className="h-full overflow-hidden hover:border-primary transition-colors">
                {a.cover_image_url && (
                  <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
                    <img
                      src={a.cover_image_url}
                      alt={a.cover_image_alt || a.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-lg leading-snug">{a.title}</CardTitle>
                  {a.excerpt && <CardDescription className="line-clamp-3">{a.excerpt}</CardDescription>}
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {a.reading_minutes ? `${a.reading_minutes} min czytania` : null}
                  {a.published_at ? ` • ${new Date(a.published_at).toLocaleDateString("pl-PL")}` : null}
                </CardContent>
              </Card>
            </Link>
          ))}
          {articles.length === 0 && <div className="col-span-full text-center text-muted-foreground py-12">Brak artykułów.</div>}
        </div>

      </div>
    </div>
  );
}
