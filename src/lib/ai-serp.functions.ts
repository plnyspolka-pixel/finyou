import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizeHost(input: string) {
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

export const addKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        keyword: z.string().min(1).max(200),
        target_url: z.string().url().optional().nullable(),
        location: z.string().max(80).default("Poland"),
        language: z.string().max(10).default("pl"),
        search_volume: z.number().int().min(0).optional().nullable(),
        difficulty: z.number().int().min(0).max(100).optional().nullable(),
        intent: z
          .enum(["informational", "navigational", "commercial", "transactional"])
          .optional()
          .nullable(),
        tags: z.array(z.string().max(40)).max(20).default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ai_serp_keywords")
      .insert({
        user_id: userId,
        keyword: data.keyword.trim(),
        target_url: data.target_url ?? null,
        location: data.location,
        language: data.language,
        search_volume: data.search_volume ?? null,
        difficulty: data.difficulty ?? null,
        intent: data.intent ?? null,
        tags: data.tags,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { keyword: row };
  });

export const updateKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        keyword: z.string().min(1).max(200).optional(),
        target_url: z.string().url().nullable().optional(),
        is_active: z.boolean().optional(),
        tags: z.array(z.string().max(40)).max(20).optional(),
        search_volume: z.number().int().min(0).nullable().optional(),
        difficulty: z.number().int().min(0).max(100).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("ai_serp_keywords").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_serp_keywords").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function fetchSerpViaFirecrawl(keyword: string, language: string, location: string) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("Brak FIRECRAWL_API_KEY — wymagany do scrapowania SERP.");

  const hl = language || "pl";
  const gl = location.toLowerCase().startsWith("pol") ? "pl" : "us";
  const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=${hl}&gl=${gl}&num=30`;

  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      url,
      formats: ["links", "markdown"],
      onlyMainContent: false,
      waitFor: 1500,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Firecrawl error ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const links: string[] = json?.data?.links ?? [];
  const markdown: string = json?.data?.markdown ?? "";

  // Filter to organic-looking external links, preserve order, dedupe by hostname+path
  const seen = new Set<string>();
  const organic: string[] = [];
  for (const link of links) {
    if (!link || typeof link !== "string") continue;
    if (!/^https?:\/\//i.test(link)) continue;
    const host = (() => {
      try {
        return new URL(link).hostname.toLowerCase();
      } catch {
        return "";
      }
    })();
    if (!host) continue;
    if (/(^|\.)google\./.test(host)) continue;
    if (
      /(^|\.)gstatic\./.test(host) ||
      /(^|\.)googleusercontent\./.test(host) ||
      (/(^|\.)youtube\.com$/.test(host) === false && /(^|\.)ytimg\./.test(host))
    )
      continue;
    if (host.includes("webcache.googleusercontent")) continue;
    const key = host + (new URL(link).pathname || "/");
    if (seen.has(key)) continue;
    seen.add(key);
    organic.push(link);
    if (organic.length >= 50) break;
  }

  // Detect SERP features by scanning markdown
  const features: string[] = [];
  const m = markdown.toLowerCase();
  if (m.includes("people also ask") || m.includes("podobne pytania"))
    features.push("people_also_ask");
  if (m.includes("featured snippet") || m.includes("polecany fragment"))
    features.push("featured_snippet");
  if (m.includes("knowledge panel") || m.includes("panel wiedzy")) features.push("knowledge_panel");
  if (markdown.match(/!\[[^\]]*\]\([^)]+\)/g)?.length ?? 0 > 5) features.push("image_pack");

  return { organic, features };
}

export const checkKeywordRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ keyword_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: kw, error: kErr } = await supabase
      .from("ai_serp_keywords")
      .select("*")
      .eq("id", data.keyword_id)
      .single();
    if (kErr || !kw) throw new Error(kErr?.message ?? "Nie znaleziono słowa kluczowego.");

    const { organic, features } = await fetchSerpViaFirecrawl(kw.keyword, kw.language, kw.location);

    let position: number | null = null;
    let foundUrl: string | null = null;
    if (kw.target_url) {
      const targetHost = normalizeHost(kw.target_url);
      for (let i = 0; i < organic.length; i++) {
        const host = normalizeHost(organic[i]);
        if (host === targetHost || host.endsWith("." + targetHost)) {
          position = i + 1;
          foundUrl = organic[i];
          break;
        }
      }
    }

    // previous position
    const { data: prev } = await supabase
      .from("ai_serp_rankings")
      .select("position")
      .eq("keyword_id", kw.id)
      .order("checked_at", { ascending: false })
      .limit(1);
    const previous_position = prev?.[0]?.position ?? null;

    const { data: row, error: rErr } = await supabase
      .from("ai_serp_rankings")
      .insert({
        keyword_id: kw.id,
        user_id: userId,
        position,
        previous_position,
        url: foundUrl,
        serp_features: features,
      })
      .select()
      .single();
    if (rErr) throw new Error(rErr.message);

    return { ranking: row, top_results: organic.slice(0, 10) };
  });

export const checkAllRankings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: kws } = await supabase
      .from("ai_serp_keywords")
      .select("id")
      .eq("is_active", true);
    if (!kws?.length) return { checked: 0, errors: 0 };

    let checked = 0;
    let errors = 0;
    for (const k of kws) {
      try {
        // inline-call to avoid HTTP roundtrip
        const { data: kw } = await supabase
          .from("ai_serp_keywords")
          .select("*")
          .eq("id", k.id)
          .single();
        if (!kw) continue;
        const { organic, features } = await fetchSerpViaFirecrawl(
          kw.keyword,
          kw.language,
          kw.location,
        );
        let position: number | null = null;
        let foundUrl: string | null = null;
        if (kw.target_url) {
          const t = normalizeHost(kw.target_url);
          for (let i = 0; i < organic.length; i++) {
            const h = normalizeHost(organic[i]);
            if (h === t || h.endsWith("." + t)) {
              position = i + 1;
              foundUrl = organic[i];
              break;
            }
          }
        }
        const { data: prev } = await supabase
          .from("ai_serp_rankings")
          .select("position")
          .eq("keyword_id", kw.id)
          .order("checked_at", { ascending: false })
          .limit(1);
        await supabase.from("ai_serp_rankings").insert({
          keyword_id: kw.id,
          user_id: kw.user_id,
          position,
          previous_position: prev?.[0]?.position ?? null,
          url: foundUrl,
          serp_features: features,
        });
        checked++;
        // gentle delay
        await new Promise((r) => setTimeout(r, 800));
      } catch {
        errors++;
      }
    }
    return { checked, errors };
  });
