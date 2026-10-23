import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { buildSitemapXml, type SitemapEntry } from "@/lib/seo/sitemap-core";
import { LOAN_PRODUCTS } from "@/lib/loan-products";
import { INVESTOR_MODULES, investorModulePath } from "@/components/marketing/investor-modules";

const BASE_URL = "https://financeyou.pl";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Strony statyczne bez <lastmod>: data „dziś” przy każdym pobraniu to
        // fałszywy sygnał — Google ignoruje lastmod, gdy nie odpowiada realnym
        // zmianom, i przestaje ufać całej mapie. Lastmod dostają tylko wpisy
        // z bazy (artykuły, podstrony miast), gdzie znamy datę zmiany.
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          // Publiczne strony marketingowe (ścieżki ról). /klient /inwestor
          // /posrednik to panele wymagające logowania — nie trafiają do sitemapy.
          { path: "/dla-klienta", changefreq: "weekly", priority: "0.9" },
          { path: "/dla-inwestora", changefreq: "weekly", priority: "0.9" },
          // Podstrony szkolenia i modułów partnera (/dla-inwestora/<moduł>).
          ...INVESTOR_MODULES.map(
            (m): SitemapEntry => ({
              path: investorModulePath(m.slug),
              changefreq: "monthly",
              priority: "0.8",
            }),
          ),
          // /dla-posrednika jest ukryta (route przekierowuje na stronę główną,
          // patrz dla-posrednika.tsx) — przywrócić wpis razem z usunięciem redirectu.
          { path: "/oferty", changefreq: "daily", priority: "0.9" },
          { path: "/blog", changefreq: "daily", priority: "0.7" },
          { path: "/pozyczki", changefreq: "weekly", priority: "0.8" },
          // Podstrony produktów (menu „Klient”) — lib/loan-products.ts
          ...LOAN_PRODUCTS.map(
            (p): SitemapEntry => ({
              path: `/${p.slug}`,
              changefreq: "monthly",
              priority: "0.9",
            }),
          ),
          { path: "/kalkulator-ltv", changefreq: "monthly", priority: "0.7" },
          { path: "/raport-lokalizacje", changefreq: "monthly", priority: "0.7" },
          { path: "/logowanie", changefreq: "yearly", priority: "0.3" },
          { path: "/rejestracja", changefreq: "yearly", priority: "0.4" },
          { path: "/polityka-prywatnosci", changefreq: "yearly", priority: "0.2" },
          { path: "/polityka-cookies", changefreq: "yearly", priority: "0.2" },
          { path: "/regulamin", changefreq: "yearly", priority: "0.2" },
        ];

        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const s = url && key ? createClient(url, key) : null;

        // Opublikowane artykuły bloga
        if (s) {
          try {
            const { data } = await s
              .from("ai_seo_articles")
              .select("slug, updated_at, published_at")
              .eq("status", "published");
            for (const row of data ?? []) {
              const lastmod = (row.updated_at ?? row.published_at ?? "").slice(0, 10) || undefined;
              entries.push({
                path: `/blog/${row.slug}`,
                lastmod,
                changefreq: "monthly",
                priority: "0.6",
              });
            }
          } catch {
            // baza niedostępna — zwracamy resztę sitemapy
          }

          // Opublikowane podstrony lokalizacyjne (programmatic SEO)
          try {
            const { data } = await s
              .from("seo_location_pages")
              .select("slug, generated_at, published_at")
              .eq("status", "published");
            for (const row of data ?? []) {
              const lastmod =
                ((row.generated_at ?? row.published_at ?? "") as string).slice(0, 10) || undefined;
              entries.push({
                path: `/pozyczki/${row.slug}`,
                lastmod,
                changefreq: "monthly",
                priority: "0.7",
              });
            }
          } catch {
            // tabela może jeszcze nie istnieć (moduł 1 wdrażany po module 2)
          }
        }

        return new Response(buildSitemapXml(BASE_URL, entries), {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
