// Pozycje w Google (SERP) — logika wyniesiona z ai-serp.functions.ts: wspólna dla
// server functions panelu (cienkie delegaty) i narzędzi MCP. Zachowanie 1:1.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { fetchReadable, webSearch } from "@/lib/web-fetch.server";
import {
  addKeywordSchema,
  updateKeywordSchema,
  deleteKeywordSchema,
  checkKeywordRankingSchema,
  AddKeywordInput,
  UpdateKeywordInput,
  DeleteKeywordInput,
  CheckKeywordRankingInput,
} from "./ai-serp-schema";

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

// SERP Google przez Jina Reader (darmowy, bez klucza) — zastępuje Firecrawl.
// Gdy Google zablokuje odczyt (captcha / brak linków organicznych), pozycje
// liczymy awaryjnie z wyników DuckDuckGo (region PL).
async function fetchSerp(keyword: string, language: string, location: string) {
  const hl = language || "pl";
  const gl = location.toLowerCase().startsWith("pol") ? "pl" : "us";
  const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=${hl}&gl=${gl}&num=30`;

  let links: string[] = [];
  let markdown = "";
  try {
    const page = await fetchReadable(url, { withLinks: true });
    links = page.links;
    markdown = page.markdown;
    // Jina bywa bez podsumowania linków — wyciągnij je z Markdown.
    if (links.length === 0) {
      links = [...markdown.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
    }
  } catch {
    // przejdź do wyszukiwarki awaryjnej
  }

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

  if (organic.length === 0) {
    const fallback = await webSearch(keyword, {
      limit: 30,
      region: gl === "pl" ? "pl-pl" : "us-en",
    });
    return { organic: fallback.map((r) => r.url), features };
  }
  return { organic, features };
}

export async function addKeyword(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: AddKeywordInput,
) {
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
}

export async function updateKeyword(
  supabase: SupabaseClient<Database>,
  _userId: string,
  data: UpdateKeywordInput,
) {
  const { id, ...patch } = data;
  const { error } = await supabase.from("ai_serp_keywords").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteKeyword(
  supabase: SupabaseClient<Database>,
  _userId: string,
  data: DeleteKeywordInput,
) {
  const { error } = await supabase.from("ai_serp_keywords").delete().eq("id", data.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function checkKeywordRanking(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: CheckKeywordRankingInput,
) {
  const { data: kw, error: kErr } = await supabase
    .from("ai_serp_keywords")
    .select("*")
    .eq("id", data.keyword_id)
    .single();
  if (kErr || !kw) throw new Error(kErr?.message ?? "Nie znaleziono słowa kluczowego.");

  const { organic, features } = await fetchSerp(kw.keyword, kw.language, kw.location);

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
}

export async function checkAllRankings(supabase: SupabaseClient<Database>, _userId: string) {
  const { data: kws } = await supabase.from("ai_serp_keywords").select("id").eq("is_active", true);
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
      const { organic, features } = await fetchSerp(kw.keyword, kw.language, kw.location);
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
}
