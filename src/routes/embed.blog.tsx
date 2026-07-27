import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/labels";

const BLOG_URL = "https://financeyou.pl/blog";

type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  reading_minutes: number | null;
  published_at: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  primary_keyword: string | null;
};

const blogQO = queryOptions({
  queryKey: ["embed", "blog"],
  queryFn: async (): Promise<Article[]> => {
    const { data } = await supabase
      .from("ai_seo_articles")
      .select(
        "id,slug,title,excerpt,reading_minutes,published_at,cover_image_url,cover_image_alt,primary_keyword",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(12);
    return (data ?? []) as Article[];
  },
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/embed/blog")({
  loader: ({ context }) => context.queryClient.ensureQueryData(blogQO),
  head: () => ({
    meta: [
      { title: "Blog Finance You — najnowsze artykuły" },
      {
        name: "description",
        content: "Zanonimizowany embed najnowszych artykułów z bloga Finance You.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbedBlog,
});

function EmbedBlog() {
  const { data } = useSuspenseQuery(blogQO);
  return (
    <div className="min-h-screen bg-[#0a1030] p-4 sm:p-6 text-slate-100">
      <div className="mx-auto max-w-6xl">
        {data.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-sm text-slate-300">
            Brak artykułów do wyświetlenia.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ArticleCard({ article }: { article: Article }) {
  const href = `${BLOG_URL}/${article.slug}`;
  const dateStr = article.published_at ? formatDate(article.published_at) : null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-sky-400/20 bg-gradient-to-br from-[#0f1846] via-[#0c1338] to-[#0a1030] shadow-[0_8px_30px_-12px_rgba(56,189,248,0.35)] transition hover:border-sky-400/40 hover:shadow-[0_12px_40px_-12px_rgba(56,189,248,0.55)]"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#0a1030]">
        {article.cover_image_url ? (
          <img
            src={article.cover_image_url}
            alt={article.cover_image_alt || article.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
            Finance You
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
        {article.primary_keyword && (
          <span className="absolute left-3 top-3 rounded-full border border-sky-400/40 bg-[#0a1030]/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300 backdrop-blur">
            {article.primary_keyword}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-white sm:text-lg">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="line-clamp-3 text-sm text-slate-300">{article.excerpt}</p>
        )}
        <div className="mt-auto flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {dateStr && <span className="tabular-nums">{dateStr}</span>}
          {dateStr && article.reading_minutes ? <span className="opacity-40">•</span> : null}
          {article.reading_minutes && <span>{article.reading_minutes} min</span>}
        </div>
      </div>

      <div className="border-t border-white/5 bg-gradient-to-r from-sky-500/90 via-sky-500/80 to-indigo-500/80 px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between text-sm font-semibold text-white">
          <span>Czytaj artykuł</span>
          <span aria-hidden className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </div>
      </div>
    </a>
  );
}
