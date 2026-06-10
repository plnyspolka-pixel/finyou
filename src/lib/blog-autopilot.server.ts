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

type Audience = "borrower" | "investor";

async function pickNextAudience(): Promise<Audience> {
  // Alternate: look at last autopilot article; pick the opposite.
  const { data } = await supabaseAdmin
    .from("ai_seo_articles")
    .select("audience")
    .eq("source", "ai_autopilot")
    .order("published_at", { ascending: false })
    .limit(1);
  const last = data?.[0]?.audience as Audience | undefined;
  if (last === "investor") return "borrower";
  if (last === "borrower") return "investor";
  return "investor"; // first run → start with investor (mamy już duży stack borrower)
}

const BRIEFS: Record<Audience, { sys: string; user: string }> = {
  borrower: {
    sys: "Jesteś analitykiem rynku finansowego w Polsce. Po polsku. Zwięźle.",
    user: "Wypisz 5 najważniejszych wiadomości z ostatnich 24h istotnych dla OSOBY POŻYCZAJĄCEJ pod zastaw nieruchomości w PL: stopy procentowe (RPP), WIBOR/inflacja, ceny mieszkań i nieruchomości w PL, sytuacja na rynku kredytów hipotecznych, regulacje konsumenckie (UOKiK, KNF), wyroki istotne dla kredytobiorców. Dla każdej wiadomości: 2-3 zdania z konkretem (liczby/data). Po liście dodaj 'KONTEKST_POŻYCZKOBIORCY:' i jeden akapit (4-6 zdań) co to oznacza dla osoby rozważającej pożyczkę pozabankową pod zastaw mieszkania/domu/działki.",
  },
  investor: {
    sys: "Jesteś analitykiem rynku finansowego w Polsce. Po polsku. Zwięźle.",
    user: "Wypisz 5 najważniejszych wiadomości z ostatnich 24h istotnych dla INWESTORA prywatnego w PL: stopy procentowe (RPP, FED, EBC), kurs PLN/EUR/USD, WIG20, S&P 500, ropa, złoto, BTC/ETH, ceny nieruchomości komercyjnych i mieszkaniowych w PL, alternatywne klasy aktywów (pożyczki prywatne, crowdfunding nieruchomościowy), regulacje wpływające na inwestowanie. Dla każdej wiadomości: 2-3 zdania z konkretem (liczby/data). Po liście dodaj 'KONTEKST_INWESTORSKI:' i jeden akapit (4-6 zdań) co to oznacza dla inwestora prywatnego, w szczególności rozważającego inwestowanie w pożyczki pod zastaw nieruchomości w PL (oczekiwana stopa zwrotu, ryzyko, dywersyfikacja).",
  },
};

async function fetchFreshNewsBrief(pplxKey: string, audience: Audience): Promise<NewsBrief> {
  const b = BRIEFS[audience];
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
        { role: "system", content: b.sys },
        { role: "user", content: b.user },
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
  audience: Audience,
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

  const audienceBrief = audience === "investor"
    ? `GRUPA DOCELOWA: INWESTOR PRYWATNY rozważający lokowanie kapitału w pożyczki pod zastaw nieruchomości (pasywny dochód, oczekiwana stopa zwrotu, zabezpieczenie hipoteczne, ryzyko, dywersyfikacja). Pisz językiem inwestycyjnym, bez infantylizowania. CTA do "[poznaj ofertę dla inwestorów](https://financeyou.pl)" wpleć 1 raz.`
    : `GRUPA DOCELOWA: OSOBA POSZUKUJĄCA POŻYCZKI pod zastaw mieszkania/domu/działki (zła historia w BIK, brak zdolności w banku, II hipoteka, szybka gotówka). Pisz językiem korzyści i jasnych procedur. CTA do "[sprawdź warunki na financeyou.pl](https://financeyou.pl)" wpleć 1-2 razy.`;

  const sys = `Jesteś senior copywriterem finansowym dla Finance You (pożyczki pod zastaw nieruchomości w PL). Piszesz po polsku, konkretnie, bez clickbaitu i bez "AI-słów" (rewolucyjny, niesamowity, w erze AI itp.). Konkrety, liczby z briefingu, akapity 2-3 zdania, H2/H3, listy. NIE wymyślaj liczb spoza briefingu.\n${audienceBrief}`;

  const userMsg = `BRIEFING (świeże wiadomości z ostatnich 24h):
${brief.summary}

ŹRÓDŁA do podlinkowania w sekcji "Linki i źródła":
${externalList || "(brak)"}

LINKI WEWNĘTRZNE do wplecenia w treść (2-3 z poniższych, naturalnie w kontekście):
${internalList || "(brak — pomiń linki wewnętrzne)"}

Napisz codzienny post blogowy dla ${audience === "investor" ? "INWESTORA" : "POŻYCZKOBIORCY"}. Tytuł musi sugerować aktualność i wyraźnie celować w tę grupę odbiorców.`;


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

async function tryGenerate(lovableKey: string, model: string, prompt: string): Promise<string | null> {
  try {
    const res = await fetch(IMAGE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: "1536x1024",
        response_format: "url",
      }),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const item = j.data?.[0];
    if (!item) return null;
    if (item.url) return item.url as string;
    if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
    return null;
  } catch {
    return null;
  }
}

async function generateCover(lovableKey: string, prompt: string): Promise<string> {
  // Każdy artykuł MUSI mieć okładkę. Sygnujemy "Finance You" w narożniku
  // (wordmark prompt-based; zarówno Gemini jak i fallback openai/gpt-image-2
  // potrafią narysować małą czystą typografię).
  const fullPrompt = `Editorial finance magazine cover, photorealistic, soft natural light, Polish/European context. Scene: ${prompt}. 16:9 cinematic.
In the bottom-right corner render a small clean white sans-serif wordmark text exactly: "Finance You" — subtle soft drop shadow, no other text, no logos, no UI elements anywhere else in the image.`;

  for (const model of [
    "google/gemini-2.5-flash-image-preview",
    "openai/gpt-image-2",
    "google/gemini-2.5-flash-image-preview",
  ]) {
    const url = await tryGenerate(lovableKey, model, fullPrompt);
    if (url) return url;
  }
  throw new Error("Cover generation failed for all models — refusing to publish without an image.");
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

  const audience = await pickNextAudience();
  const brief = await fetchFreshNewsBrief(pplxKey, audience);
  const internal = await pickInternalLinks();
  const draft = await writeArticleFromNews(lovableKey, brief, internal, audience);
  const cover = await generateCover(lovableKey, draft.cover_prompt);

  const slug = await ensureUniqueSlug(slugify(draft.title));
  const wordCount = (draft.content_md.match(/\S+/g) ?? []).length;

  const ctaUrl = "https://financeyou.pl";
  const ctaLabel = audience === "investor" ? "Zostań inwestorem" : "Sprawdź na financeyou.pl";

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
      audience,
      cta_url: ctaUrl,
      cta_label: ctaLabel,

      source: "ai_autopilot",
      raw_ai_output: draft as any,
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
