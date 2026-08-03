// Powiadamianie wyszukiwarek o zmianie sitemapy. Wywoływane po publikacji
// nowych podstron (tick publikacji stron lokalizacyjnych).
//
// Uwaga: klasyczny endpoint ping Google (google.com/ping?sitemap=…) został
// oficjalnie wycofany w 2023 r. — wywołanie jest nieszkodliwe, ale nie ma
// gwarancji skutku. Głównym mechanizmem pozostaje aktualny <lastmod> w samej
// sitemapie + zgłoszenie w Google Search Console. Ping traktujemy jako
// best-effort i nigdy nie przerywamy publikacji, gdy się nie powiedzie.
import { SITE_URL } from "./company";

export async function pingSearchEnginesSitemap(): Promise<{ attempted: string[] }> {
  const sitemapUrl = `${SITE_URL}/sitemap.xml`;
  const targets = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    // Bing/IndexNow akceptuje pingi sitemap bez klucza:
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
  ];
  await Promise.allSettled(
    targets.map(async (url) => {
      try {
        await fetch(url, { method: "GET", signal: AbortSignal.timeout(8000) });
      } catch (e) {
        console.warn(`[seo-ping] ${url} failed`, e);
      }
    }),
  );
  return { attempted: targets };
}
