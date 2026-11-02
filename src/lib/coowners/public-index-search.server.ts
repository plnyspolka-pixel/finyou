/**
 * Wyszukiwanie jawnie zaindeksowanych ogłoszeń, NIE odpytanie rejestru KRZ.
 * Kolejność: Serper (wyniki Google) -> publiczna strona wyników Google
 * -> oznaczony fallback DuckDuckGo.
 *
 * Bez PESEL, bez cookies i bez obchodzenia CAPTCHA/WAF.
 */
import {
  BROWSER_HEADERS,
  decodeEntities,
  htmlToText,
  webSearch,
  type WebSearchResult,
} from "@/lib/web-fetch.server";

export interface IndexedSearchResult extends WebSearchResult {
  engine: "google_serper" | "google_html" | "duckduckgo";
}

export interface IndexedSearchResponse {
  engine: IndexedSearchResult["engine"];
  results: IndexedSearchResult[];
  note: string;
}

const LIMIT = 8;
const TIMEOUT_MS = 9_000;
const HTML_LIMIT = 1_000_000;
const cap = (s: unknown, len: number) => String(s ?? "").trim().slice(0, len);

function resultUrl(raw: unknown): string | null {
  try {
    const v = String(raw ?? "");
    if (v.startsWith("/url?")) {
      const p = new URL(v, "https://www.google.com").searchParams;
      return resultUrl(p.get("q") ?? p.get("url"));
    }
    const url = new URL(decodeEntities(v));
    if (!["https:", "http:"].includes(url.protocol)) return null;
    // Zero Google redirectów i linków do profilowania użytkownika.
    if (/^(?:www\.)?google\./i.test(url.hostname)) return null;
    if (/\b\d{11}\b/.test(url.href)) return null;
    return url.href;
  } catch { return null; }
}

/** Tolerancyjny parser publicznego HTML Google; nie jest oficjalnym API. */
export function parseGoogleResultsHtml(html: string, max = LIMIT): IndexedSearchResult[] {
  const results: IndexedSearchResult[] = [];
  const seen = new Set<string>();
  if (/unusual traffic|our systems have detected|captcha|nietypowy ruch/i.test(html)) return [];
  const re = /<h3\b[^>]*>([\s\S]{1,600}?)<\/h3>/gi;
  for (const match of html.matchAll(re)) {
    if (results.length >= max) break;
    const title = htmlToText(match[1]).slice(0, 180);
    if (!title) continue;
    const prefix = html.slice(Math.max(0, (match.index ?? 0) - 1600), match.index);
    const anchors = [...prefix.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)];
    const raw = anchors.at(-1)?.[1];
    const url = resultUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const tail = html.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 1100);
    results.push({
      url,
      title,
      snippet: htmlToText(tail.split(/<h3\b/i)[0]).slice(0, 420),
      engine: "google_html",
    });
  }
  return results;
}

async function serper(query: string, limit: number): Promise<IndexedSearchResult[]> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return [];
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "pl", hl: "pl", num: limit }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Serper HTTP " + response.status);
  const data = await response.json() as { organic?: Array<{ link?: string; title?: string; snippet?: string }> };
  return (data.organic ?? []).flatMap((r): IndexedSearchResult[] => {
    const url = resultUrl(r.link);
    return url ? [{
      url,
      title: cap(r.title, 180),
      snippet: cap(r.snippet, 420),
      engine: "google_serper",
    }] : [];
  }).slice(0, limit);
}

async function googleHtml(query: string, limit: number): Promise<IndexedSearchResult[]> {
  const url = "https://www.google.com/search?" + new URLSearchParams({
    q: query, hl: "pl", gl: "pl", num: String(limit),
  });
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, "Accept-Encoding": "identity" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error("Google HTML HTTP " + res.status);
  const html = (await res.text()).slice(0, HTML_LIMIT);
  return parseGoogleResultsHtml(html, limit);
}

export async function searchPublicIndex(query: string, limit = LIMIT): Promise<IndexedSearchResponse> {
  const n = Math.max(1, Math.min(limit, LIMIT));
  if (process.env.SERPER_API_KEY?.trim()) {
    try {
      const results = await serper(query, n);
      // Pusta odpowiedź z aktywnego Google nie uruchamia innego silnika.
      return {
        engine: "google_serper", results,
        note: "Google przez Serper; indeks może być niepełny lub opóźniony.",
      };
    } catch {
      // Dostawca Google niedostępny — kolejna jawna ścieżka.
    }
  }
  try {
    const results = await googleHtml(query, n);
    if (results.length) {
      return {
        engine: "google_html", results,
        note: "Publiczny HTML Google; wyniki mogą się zmieniać, parser jest eksperymentalny.",
      };
    }
    // Brak pewności, czy pusta strona to zero wyników, czy zmiana formatu.
  } catch {
    // Google stosuje ograniczenia automatyzacji, których nie obchodzimy.
  }
  try {
    return {
      engine: "duckduckgo",
      results: (await webSearch(query, { limit: n, region: "pl-pl" })).map((r) => ({ ...r, engine: "duckduckgo" })),
      note: "Nie udało się wiarygodnie odczytać Google; wyniki z DuckDuckGo (fallback).",
    };
  } catch {
    return { engine: "duckduckgo", results: [], note: "Indeks wyszukiwarki niedostępny; nie interpretować jako braku postępowań." };
  }
}
