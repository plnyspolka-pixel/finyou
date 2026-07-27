// One-off seeder: generates N evergreen SEO articles for the blog.
// GET/POST /api/public/hooks/seed-blog?count=10
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronSecret } from "@/lib/cron-auth.server";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const IMAGE_URL = "https://ai.gateway.lovable.dev/v1/images/generations";
const CTA_URL = "https://financeyou.pl/dla-klienta";

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}

async function uniqueSlug(base: string): Promise<string> {
  let i = 0;
  while (true) {
    const c = i === 0 ? base : `${base}-${i}`;
    const { data } = await supabaseAdmin.from("ai_seo_articles").select("id").eq("slug", c).maybeSingle();
    if (!data) return c;
    i++; if (i > 50) throw new Error("slug");
  }
}

async function aiJSON(key: string, sys: string, user: string, tool: any) {
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      tools: [tool],
      tool_choice: { type: "function", function: { name: tool.function.name } },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text().catch(() => "")}`);
  const j: any = await res.json();
  return JSON.parse(j.choices[0].message.tool_calls[0].function.arguments);
}

async function genCover(key: string, prompt: string): Promise<string | null> {
  try {
    const res = await fetch(IMAGE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        prompt: `Editorial finance magazine cover photo, photorealistic, soft natural light, Polish/European context, no text, no logos. Scene: ${prompt}. 16:9, cinematic.`,
        n: 1, size: "1536x1024", response_format: "url",
      }),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    return j.data?.[0]?.url ?? (j.data?.[0]?.b64_json ? `data:image/png;base64,${j.data[0].b64_json}` : null);
  } catch { return null; }
}

async function seed(count: number) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");

  // Idempotency guard: don't re-seed if we already have enough autopilot articles.
  const { count: existing } = await supabaseAdmin
    .from("ai_seo_articles")
    .select("id", { count: "exact", head: true })
    .eq("source", "ai_autopilot")
    .eq("status", "published");
  if ((existing ?? 0) >= count) {
    return { ok: true, skipped: true, existing };
  }

  // 1) plan topics
  const planTool = {
    type: "function",
    function: {
      name: "plan_topics",
      parameters: {
        type: "object",
        properties: {
          topics: {
            type: "array", minItems: count, maxItems: count,
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                primary_keyword: { type: "string" },
                secondary_keywords: { type: "array", items: { type: "string" } },
                search_intent: { type: "string", enum: ["informational", "commercial", "transactional"] },
                notes: { type: "string" },
              },
              required: ["title", "primary_keyword", "search_intent"],
              additionalProperties: false,
            },
          },
        },
        required: ["topics"], additionalProperties: false,
      },
    },
  };
  const plan: any = await aiJSON(key,
    "Jesteś strategiem SEO dla Finance You (pożyczki pod zastaw nieruchomości w PL). Tematy realistyczne, polski long-tail, mieszanka intencji info+commercial. Tytuły konkretne, bez clickbaitu.",
    `Zaplanuj ${count} ZRÓŻNICOWANYCH tematów blogowych evergreen wokół: pożyczka pod zastaw mieszkania/domu/działki, pożyczka pozabankowa pod hipotekę, refinansowanie, oddłużenie, zakup nieruchomości pod inwestycję, koszty pożyczki, jak banki/firmy pożyczkowe oceniają zdolność, ryzyka, alternatywy. Różne intencje i różne keywordy.`,
    planTool,
  );

  const results: any[] = [];
  for (const t of plan.topics as any[]) {
    try {
      const articleTool = {
        type: "function",
        function: {
          name: "write_article",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              meta_title: { type: "string" },
              meta_description: { type: "string" },
              excerpt: { type: "string" },
              content_md: { type: "string", description: "Markdown 900-1400 słów. H2/H3, listy, krótkie akapity. FAQ 4-5 Q&A na końcu. CTA z linkiem markdown do złożenia wniosku 1-2 razy." },
              keywords: { type: "array", items: { type: "string" } },
              cover_prompt: { type: "string", description: "Krótki opis okładki po angielsku" },
              cover_alt: { type: "string" },
            },
            required: ["title", "meta_title", "meta_description", "excerpt", "content_md", "cover_prompt", "cover_alt"],
            additionalProperties: false,
          },
        },
      };
      const a: any = await aiJSON(key,
        `Jesteś senior copywriterem SEO dla Finance You. Po polsku, konkretnie, bez "AI-słów". H2/H3, listy, krótkie akapity. Naturalnie umieść słowo kluczowe (3-6 razy). NIE wymyślaj liczb. Wpleć 1-2 razy CTA "[złóż bezpłatny wniosek](${CTA_URL})". ZGODNOŚĆ Z SERWISEM: Finance You nie gwarantuje finansowania ani zysku — zaznacz, że kalkulacje są orientacyjne, a decyzja należy do finansujących. ZAKAZANE frazy: "gwarantowany zysk/zwrot", "pewny zysk", "bez ryzyka". Linki do serwisu wyłącznie: https://financeyou.pl/dla-klienta, https://financeyou.pl/dla-inwestora, https://financeyou.pl/oferty (nigdy /klient ani /inwestor).`,
        `Napisz artykuł SEO.
Tytuł (H1 punkt wyjścia): ${t.title}
Słowo kluczowe główne: ${t.primary_keyword}
Drugorzędne: ${(t.secondary_keywords ?? []).join(", ") || "(brak)"}
Intencja: ${t.search_intent}
Notatki: ${t.notes ?? "brak"}`,
        articleTool,
      );

      const cover = await genCover(key, a.cover_prompt);
      const slug = await uniqueSlug(slugify(a.title));
      const words = (a.content_md.match(/\S+/g) ?? []).length;

      const { data: ins, error } = await supabaseAdmin.from("ai_seo_articles").insert({
        slug, title: a.title,
        meta_title: a.meta_title, meta_description: a.meta_description, excerpt: a.excerpt,
        content_md: a.content_md, primary_keyword: t.primary_keyword,
        keywords: a.keywords ?? [],
        word_count: words, reading_minutes: Math.max(1, Math.round(words / 200)),
        status: "published",
        cta_url: CTA_URL, cta_label: "Sprawdź możliwości bezpłatnie",
        source: "ai_autopilot", raw_ai_output: a,
        published_at: new Date().toISOString(),
        content_refreshed_at: new Date().toISOString(),
        cover_image_url: cover, cover_image_alt: a.cover_alt,
      }).select("id,slug,title").single();
      if (error) throw new Error(error.message);
      results.push({ ok: true, ...ins });
    } catch (e: any) {
      results.push({ ok: false, topic: t.title, error: e.message });
    }
  }

  await supabaseAdmin.from("ai_growth_action_log").insert({
    module: "seo_content_engine", action: "seed_batch", status: "ok",
    summary: `Seed: ${results.filter(r => r.ok).length}/${count}`,
    payload: { results },
  });

  return { ok: true, generated: results.filter(r => r.ok).length, total: count, results };
}

export const Route = createFileRoute("/api/public/hooks/seed-blog")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const count = Math.min(20, Math.max(1, Number(url.searchParams.get("count") ?? 10)));
        try {
          const r = await seed(count);
          return new Response(JSON.stringify(r), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const count = Math.min(20, Math.max(1, Number(url.searchParams.get("count") ?? 10)));
        try {
          const r = await seed(count);
          return new Response(JSON.stringify(r), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});
