// Digital PR — monitoring RSS/newsów (cron co 6h). Pobiera Google News RSS
// dla monitorowanych fraz + opcjonalne dodatkowe feedy z env PR_MONITOR_FEEDS
// (rozdzielone przecinkami — np. feedy zapytań dziennikarzy). Nowe okazje
// trafiają do pr_opportunities ze statusem 'new'; deduplikacja po
// znormalizowanym URL (dedupe_hash).
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dedupeKey, matchedPhrases, parseRssItems, PR_MONITOR_PHRASES } from "./core";

const db = supabaseAdmin as unknown as SupabaseClient;

const MAX_ITEMS_PER_FEED = 30;
const MAX_NEW_PER_RUN = 40;

function googleNewsFeed(phrase: string): { url: string; source: string } {
  const q = encodeURIComponent(`"${phrase}"`);
  return {
    url: `https://news.google.com/rss/search?q=${q}&hl=pl&gl=PL&ceid=PL:pl`,
    source: `Google News: ${phrase}`,
  };
}

function extraFeeds(): Array<{ url: string; source: string }> {
  const raw = process.env.PR_MONITOR_FEEDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s))
    .map((url) => ({ url, source: new URL(url).hostname }));
}

export async function runPrMonitorTick(): Promise<{
  ok: boolean;
  feedsChecked: number;
  found: number;
  inserted: number;
  errors: string[];
}> {
  const feeds = [...PR_MONITOR_PHRASES.map(googleNewsFeed), ...extraFeeds()];
  const errors: string[] = [];
  const candidates = new Map<
    string,
    {
      source: string;
      url: string;
      topic: string;
      snippet: string;
      matched: string[];
      publishedAt: string | null;
    }
  >();

  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "FinanceYou-PR-Monitor/1.0 (+https://financeyou.pl)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        errors.push(`${feed.source}: HTTP ${res.status}`);
        continue;
      }
      const xml = await res.text();
      for (const item of parseRssItems(xml, feed.source).slice(0, MAX_ITEMS_PER_FEED)) {
        const matched = matchedPhrases(item);
        // Feedy Google News są już zapytaniami o frazę — jeśli fraza nie
        // występuje w tytule/snippecie, i tak zostawiamy wpis z frazą feedu.
        const phrases = matched.length
          ? matched
          : feed.source.startsWith("Google News: ")
            ? [feed.source.replace("Google News: ", "")]
            : [];
        if (!phrases.length) continue; // dodatkowy feed bez dopasowania frazy
        const key = dedupeKey(item.url);
        if (!candidates.has(key)) {
          candidates.set(key, {
            source: item.source,
            url: item.url,
            topic: item.title,
            snippet: item.snippet,
            matched: phrases,
            publishedAt: item.publishedAt,
          });
        }
      }
    } catch (e) {
      errors.push(`${feed.source}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!candidates.size) {
    return { ok: true, feedsChecked: feeds.length, found: 0, inserted: 0, errors };
  }

  // Odfiltruj już znane okazje.
  const keys = [...candidates.keys()];
  const { data: existing } = await db
    .from("pr_opportunities")
    .select("dedupe_hash")
    .in("dedupe_hash", keys);
  const known = new Set((existing ?? []).map((r: { dedupe_hash: string }) => r.dedupe_hash));

  const rows = keys
    .filter((k) => !known.has(k))
    .slice(0, MAX_NEW_PER_RUN)
    .map((k) => {
      const c = candidates.get(k)!;
      return {
        source: c.source,
        url: c.url,
        dedupe_hash: k,
        topic: c.topic,
        snippet: c.snippet || null,
        matched_phrases: c.matched,
        article_published_at: c.publishedAt,
        status: "new",
      };
    });

  let inserted = 0;
  if (rows.length) {
    const { error } = await db
      .from("pr_opportunities")
      .upsert(rows, { onConflict: "dedupe_hash", ignoreDuplicates: true });
    if (error) {
      errors.push(`insert: ${error.message}`);
    } else {
      inserted = rows.length;
    }
  }

  return { ok: true, feedsChecked: feeds.length, found: candidates.size, inserted, errors };
}
