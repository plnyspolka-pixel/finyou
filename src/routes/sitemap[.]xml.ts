import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://financeyou.pl";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/wniosek-start", changefreq: "monthly", priority: "0.8" },
          { path: "/wniosek-warunki", changefreq: "monthly", priority: "0.8" },
          { path: "/wniosek-zabezpieczenie", changefreq: "monthly", priority: "0.7" },
          { path: "/wniosek-formularz", changefreq: "monthly", priority: "0.7" },
          { path: "/blog", changefreq: "weekly", priority: "0.7" },
          { path: "/logowanie", changefreq: "yearly", priority: "0.3" },
          { path: "/rejestracja", changefreq: "yearly", priority: "0.4" },
        ];

        // Dodaj opublikowane artykuły bloga
        try {
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (url && key) {
            const s = createClient(url, key);
            const { data } = await s
              .from("ai_seo_articles")
              .select("slug, updated_at, published_at")
              .eq("status", "published");
            for (const row of data ?? []) {
              entries.push({
                path: `/blog/${row.slug}`,
                lastmod: (row.updated_at ?? row.published_at ?? "").slice(0, 10) || undefined,
                changefreq: "monthly",
                priority: "0.6",
              });
            }
          }
        } catch {
          // jeśli baza niedostępna — zwracamy resztę sitemapy
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
