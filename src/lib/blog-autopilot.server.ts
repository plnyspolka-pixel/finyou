// Codzienny bot blogowy: zbiera świeże newsy finansowe (Perplexity + Firecrawl),
// pisze artykuł SEO przez Lovable AI, generuje okładkę i publikuje z linkami
// wewnętrznymi (do innych artykułów na blogu) i zewnętrznymi (źródłami).

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const PPLX_URL = "https://api.perplexity.ai/chat/completions";
const IMAGE_URL = "https://ai.gateway.lovable.dev/v1/images/generations";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = base;
  let i = 0;
  while (true) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const { data } = await supabaseAdmin
      .from("ai_seo_articles")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    i++;
    if (i > 100) throw new Error("unique slug failed");
  }
}

interface NewsBrief {
  summary: string;
  citations: { url: string; title?: string }[];
}

async function fetchFreshNewsBrief(pplxKey: string): Promise<NewsBrief> {
  const res = await fetch(PPLX_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pplxKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      search_recency_filter: "day",
      messages: [
        {
          role: "system",
          content:
            "Jesteś analitykiem rynku finansowego w Polsce. Po polsku. Zwięźle.",
        },
        {
          role: "user",
          content:
            "Wypisz 5 najważniejszych wiadomości z ostatnich 24h z rynków finansowych istotnych dla polskiego inwestora: stopy procentowe (RPP, FED, EBC), kurs PLN/EUR/USD, WIG20, S&P 500, ropa, złoto, BTC/ETH, kluczowe wydarzenia geopolityczne wpływające na rynek, regulacje finansowe w PL/UE. Dla każdej wiadomości: 2-3 zdania z konkretem (liczby/data). Po liście dodaj 'KONTEKST_INWESTORSKI:' i jeden akapit (4-6 zdań) co to oznacza dla inwestora w pożyczki pod zastaw nieruchomości w PL.",
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Perplexity ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const json: any = await res.json();
  const summary: string = json.choices?.[0]?.message?.content ?? "";
  const rawCitations: string[] = json.citations ?? json.search_results?.map((r: any) => r.url) ?? [];
  const citations = rawCitations.slice(0, 6).map((url) => ({ url }));
  return { summary, citations };
}

interface RelatedArticle {
  slug: string;
  title: string;
  primary_keyword: string | null;
}

async function pickInternalLinks(): Promise<RelatedArticle[]> {
  const { data } = await supabaseAdmin
    .from("ai_seo_articles")
    .select("slug,title,primary_keyword,published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(40);
  const list = (data ?? []) as RelatedArticle[];
  // pick 3 random
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, 3);
}

interface ArticleDraft {
  title: string;
  meta_title: string;
  meta_description: string;
  excerpt: string;
  content_md: string;
  primary_keyword: string;
  keywords: string[];
  cover_prompt: string;
  cover_alt: string;
}

async function writeArticleFromNews(
  lovableKey: string,
  brief: NewsBrief,
  internal: RelatedArticle[],
): Promise<ArticleDraft> {
  const internalList = internal
    .map((a) => `- [${a.title}](/blog/${a.slug})${a.primary_keyword ? ` — kw: ${a.primary_keyword}` : ""}`)
    .join("\n");
  const externalList = brief.citations.map((c) => `- ${c.url}`).join("\n");

  const tools = [
    {
      type: "function",
      function: {
        name: "write_daily_post",
        description: "Codzienny post blogowy SEO z linkami",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "max 70 znaków, atrakcyjny H1, po polsku" },
            meta_title: { type: "string", description: "max 60 znaków" },
            meta_description: { type: "string", description: "max 160 znaków, z keywordem" },
            excerpt: { type: "string", description: "1-2 zdania zajawki" },
            primary_keyword: { type: "string" },
            keywords: { type: "array", items: { type: "string" } },
            content_md: {
              type: "string",
              description:
                "Markdown, 700-1100 słów. Struktura: krótki lead, H2 'Co się stało', H2 'Co to znaczy dla inwestora', H2 'Co to znaczy dla osób z nieruchomością', H2 'Linki i źródła', FAQ (3 Q&A). WPLEC naturalnie 2-3 linki wewnętrzne z podanej listy (format markdown z pełnymi ścieżkami /blog/...). NA KOŃCU sekcji 'Linki i źródła' wymień zewnętrzne źródła (z podanej listy URL).",
            },
            cover_prompt: {
              type: "string",
              description: "Krótki opis okładki po angielsku, edytorial finansowy, bez tekstu na obrazku",
            },
            cover_alt: { type: "string", description: "Alt po polsku, 5-10 słów" },
          },
          required: [
            "title",
            "meta_title",
            "meta_description",
            "excerpt",
            "primary_keyword",
            "content_md",
            "cover_prompt",
            "cover_alt",
          ],
          additionalProperties: false,
        },
      },
    },
  ];

  const sys = `Jesteś senior copywriterem finansowym dla Finance You (pożyczki pod zastaw nieruchomości w PL). Piszesz po polsku, konkretnie, bez clickbaitu i bez "AI-słów" (rewolucyjny, niesamowity, w erze AI itp.). Konkrety, liczby z briefingu, akapity 2-3 zdania, H2/H3, listy. NIE wymyślaj liczb spoza briefingu. CTA do "[złóż wniosek o pożyczkę pod zastaw](https://app.financeyou.pl/embed/wniosek)" wpleć naturalnie 1-2 razy.`;

  const userMsg = `BRIEFING (świeże wiadomości z ostatnich 24h):
${brief.summary}

ŹRÓDŁA do podlinkowania w sekcji "Linki i źródła":
${externalList || "(brak)"}

LINKI WEWNĘTRZNE do wplecenia w treść (2-3 z poniższych, naturalnie w kontekście):
${internalList || "(brak — pomiń linki wewnętrzne)"}

Napisz codzienny post blogowy w stylu 'finance morning briefing'. Tytuł musi sugerować datę/aktualność (np. "Co dziś warto wiedzieć…").`;

  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userMsg },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "write_daily_post" } },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text().catch(() => "")}`);
  const json: any = await res.json();
  const args = JSON.parse(json.choices[0].message.tool_calls[0].function.arguments);
  return args as ArticleDraft;
}

async function generateCover(lovableKey: string, prompt: string): Promise<string | null> {
  try {
    const res = await fetch(IMAGE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        prompt: `Editorial finance magazine cover photo, photorealistic, soft natural light, Polish/European context, no text, no logos. Scene: ${prompt}. 16:9, cinematic.`,
        n: 1,
        size: "1536x1024",
        response_format: "url",
      }),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const url: string | undefined = j.data?.[0]?.url ?? j.data?.[0]?.b64_json
      ? (j.data?.[0]?.url ?? `data:image/png;base64,${j.data[0].b64_json}`)
      : undefined;
    return url ?? null;
  } catch {
    return null;
  }
}

export async function runDailyBlogTick(opts: { force?: boolean } = {}): Promise<{
  ok: boolean;
  reason?: string;
  slug?: string;
  id?: string;
}> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const pplxKey = process.env.PERPLEXITY_API_KEY;
  if (!lovableKey) return { ok: false, reason: "LOVABLE_API_KEY missing" };
  if (!pplxKey) return { ok: false, reason: "PERPLEXITY_API_KEY missing" };

  // Nie publikuj 2 razy tego samego dnia (chyba że force=1)
  if (!opts.force) {
    const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("ai_seo_articles")
      .select("id")
      .eq("source", "ai_autopilot")
      .gte("published_at", since)
      .limit(1);
    if (recent && recent.length > 0) {
      return { ok: true, reason: "already published today" };
    }
  }

  const brief = await fetchFreshNewsBrief(pplxKey);
  const internal = await pickInternalLinks();
  const draft = await writeArticleFromNews(lovableKey, brief, internal);
  const cover = await generateCover(lovableKey, draft.cover_prompt);

  const slug = await ensureUniqueSlug(slugify(draft.title));
  const wordCount = (draft.content_md.match(/\S+/g) ?? []).length;

  const { data: inserted, error } = await supabaseAdmin
    .from("ai_seo_articles")
    .insert({
      slug,
      title: draft.title,
      meta_title: draft.meta_title,
      meta_description: draft.meta_description,
      excerpt: draft.excerpt,
      content_md: draft.content_md,
      primary_keyword: draft.primary_keyword,
      keywords: draft.keywords ?? [],
      word_count: wordCount,
      reading_minutes: Math.max(1, Math.round(wordCount / 200)),
      status: "published",
      cta_url: "https://app.financeyou.pl/embed/wniosek",
      cta_label: "Złóż wniosek",
      source: "ai_autopilot",
      raw_ai_output: draft as unknown as Record<string, unknown>,
      published_at: new Date().toISOString(),
      content_refreshed_at: new Date().toISOString(),
      cover_image_url: cover,
      cover_image_alt: draft.cover_alt,
      external_links: brief.citations,
      internal_link_slugs: internal.map((i) => i.slug),
    })
    .select("id,slug")
    .single();

  if (error) throw new Error(error.message);

  await supabaseAdmin.from("ai_growth_action_log").insert({
    module: "seo_content_engine",
    action: "daily_autopost",
    status: "ok",
    summary: `Codzienny post: ${draft.title}`,
    payload: { article_id: inserted.id, slug: inserted.slug, sources: brief.citations.length },
  });

  return { ok: true, slug: inserted.slug, id: inserted.id };
}
