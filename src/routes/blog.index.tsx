import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const Route = createFileRoute("/blog/")({
  loader: async () => {
    const { data } = await supabase
      .from("ai_seo_articles")
      .select("id,slug,title,excerpt,reading_minutes,published_at")
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
        <div className="grid gap-4 md:grid-cols-2">
          {articles.map((a: any) => (
            <Link key={a.id} to="/blog/$slug" params={{ slug: a.slug }} className="block">
              <Card className="h-full hover:border-primary transition-colors">
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
