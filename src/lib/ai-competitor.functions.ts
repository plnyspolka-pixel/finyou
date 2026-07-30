import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizeDomain(input: string) {
  try {
    const u = new URL(input.includes("://") ? input : `https://${input}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input
      .trim()
      .replace(/^www\./, "")
      .toLowerCase();
  }
}

async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const addCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        name: z.string().min(1).max(150),
        domain: z.string().min(3).max(200),
        urls: z.array(z.string().url()).min(1).max(20),
        notes: z.string().max(2000).optional().nullable(),
        tags: z.array(z.string().max(40)).max(20).default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ai_competitors")
      .insert({
        user_id: userId,
        name: data.name,
        domain: normalizeDomain(data.domain),
        urls: data.urls,
        notes: data.notes ?? null,
        tags: data.tags,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { competitor: row };
  });

export const updateCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(150).optional(),
        urls: z.array(z.string().url()).max(20).optional(),
        notes: z.string().max(2000).nullable().optional(),
        tags: z.array(z.string().max(40)).max(20).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("ai_competitors").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_competitors").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function scrapeUrl(url: string) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("Brak FIRECRAWL_API_KEY.");
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Firecrawl ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  return {
    title: (json?.data?.metadata?.title as string) ?? null,
    description: (json?.data?.metadata?.description as string) ?? null,
    markdown: (json?.data?.markdown as string) ?? "",
  };
}

async function aiAnalyzeChange(before: string, after: string, url: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { summary: "Wykryto zmiany (brak AI key).", analysis: {} };
  const prompt = `Jesteś analitykiem konkurencji. Porównaj dwie wersje strony konkurenta i wskaż KLUCZOWE zmiany istotne biznesowo.

URL: ${url}

POPRZEDNIA WERSJA (skrót):
${before.slice(0, 3500)}

NOWA WERSJA (skrót):
${after.slice(0, 3500)}

Zwróć JSON:
{
  "summary": "1-2 zdania o zmianie",
  "category": "pricing|offer|copy|design|seo|new_feature|other",
  "importance": "low|medium|high",
  "key_changes": ["...", "..."],
  "competitive_threat": "..."
}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Zwracasz wyłącznie poprawny JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) return { summary: "Wykryto zmiany (AI niedostępne).", analysis: {} };
  const json = await res.json();
  try {
    const parsed = JSON.parse(json?.choices?.[0]?.message?.content ?? "{}");
    return {
      summary: String(parsed.summary ?? "Zmiana wykryta.").slice(0, 1000),
      analysis: parsed,
    };
  } catch {
    return { summary: "Zmiana wykryta.", analysis: {} };
  }
}

export const scanCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ competitor_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: comp, error: cErr } = await supabase
      .from("ai_competitors")
      .select("*")
      .eq("id", data.competitor_id)
      .single();
    if (cErr || !comp) throw new Error("Nie znaleziono konkurenta.");

    let changedCount = 0;
    let scanned = 0;
    const results: any[] = [];

    for (const url of comp.urls as string[]) {
      try {
        const scraped = await scrapeUrl(url);
        const contentHash = await sha256Hex(scraped.markdown);

        const { data: prev } = await supabase
          .from("ai_competitor_snapshots")
          .select("*")
          .eq("url", url)
          .eq("competitor_id", comp.id)
          .order("checked_at", { ascending: false })
          .limit(1);
        const prevSnap = prev?.[0];
        const changed = !!prevSnap && prevSnap.content_hash !== contentHash;

        let change_summary: string | null = null;
        let ai_analysis: any = {};
        if (changed && prevSnap?.content) {
          const ai = await aiAnalyzeChange(prevSnap.content, scraped.markdown, url);
          change_summary = ai.summary;
          ai_analysis = ai.analysis;
        } else if (!prevSnap) {
          change_summary = "Pierwszy snapshot.";
        }

        const { data: snap } = await supabase
          .from("ai_competitor_snapshots")
          .insert({
            competitor_id: comp.id,
            user_id: userId,
            url,
            title: scraped.title,
            description: scraped.description,
            content_hash: contentHash,
            content: scraped.markdown.slice(0, 50000),
            changed,
            change_summary,
            ai_analysis,
          })
          .select()
          .single();

        scanned++;
        if (changed) changedCount++;
        results.push({ url, changed, snapshot: snap });
        await new Promise((r) => setTimeout(r, 800));
      } catch (e: any) {
        results.push({ url, error: e.message });
      }
    }

    await supabase
      .from("ai_competitors")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", comp.id);
    return { scanned, changed: changedCount, results };
  });
