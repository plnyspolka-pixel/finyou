import { describe, it, expect } from "vitest";
import { buildSitemapXml, type SitemapEntry } from "./sitemap-core";

const BASE = "https://financeyou.pl";

describe("buildSitemapXml", () => {
  it("buduje poprawny XML z pełnymi polami", () => {
    const xml = buildSitemapXml(BASE, [
      { path: "/", lastmod: "2026-08-03", changefreq: "weekly", priority: "1.0" },
    ]);
    expect(xml).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(xml).toContain(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);
    expect(xml).toContain("<loc>https://financeyou.pl/</loc>");
    expect(xml).toContain("<lastmod>2026-08-03</lastmod>");
    expect(xml).toContain("<changefreq>weekly</changefreq>");
    expect(xml).toContain("<priority>1.0</priority>");
    expect(xml).toContain("</urlset>");
  });

  it("pomija pola opcjonalne, gdy ich brak", () => {
    const xml = buildSitemapXml(BASE, [{ path: "/logowanie" }]);
    expect(xml).toContain("<loc>https://financeyou.pl/logowanie</loc>");
    expect(xml).not.toContain("<lastmod>");
    expect(xml).not.toContain("<changefreq>");
    expect(xml).not.toContain("<priority>");
  });

  it("deduplikuje wpisy po ścieżce (pierwszy wygrywa)", () => {
    const entries: SitemapEntry[] = [
      { path: "/blog", priority: "0.7" },
      { path: "/blog", priority: "0.2" },
    ];
    const xml = buildSitemapXml(BASE, entries);
    expect(xml.match(/<loc>https:\/\/financeyou\.pl\/blog<\/loc>/g)).toHaveLength(1);
    expect(xml).toContain("<priority>0.7</priority>");
    expect(xml).not.toContain("<priority>0.2</priority>");
  });

  it("escapuje znaki specjalne XML w ścieżkach", () => {
    const xml = buildSitemapXml(BASE, [{ path: "/pozyczki/a&b" }]);
    expect(xml).toContain("<loc>https://financeyou.pl/pozyczki/a&amp;b</loc>");
    expect(xml).not.toContain("a&b<");
  });
});
