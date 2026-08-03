// Indeks podstron lokalizacyjnych (programmatic SEO): lista opublikowanych
// stron /pozyczki/[miasto]. Publiczny odczyt przez anon key — RLS zwraca
// wyłącznie status=published.
import { createFileRoute, Link } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell } from "@/components/marketing/shell";
import { Section, SectionHead, ComplianceNote } from "@/components/marketing/sections";
import { breadcrumbLd, financialServiceLd, SITE_URL } from "@/lib/seo/company";

type PageRow = { slug: string; name: string; meta_description: string };

const db = supabase as unknown as SupabaseClient;

export const Route = createFileRoute("/pozyczki/")({
  loader: async (): Promise<{ pages: PageRow[] }> => {
    const { data } = await db
      .from("seo_location_pages")
      .select("slug, name, meta_description")
      .eq("status", "published")
      .order("name", { ascending: true });
    return { pages: (data ?? []) as PageRow[] };
  },
  head: () => {
    const url = `${SITE_URL}/pozyczki`;
    return {
      meta: [
        { title: "Pożyczki pod zastaw nieruchomości — miasta | Finance You" },
        {
          name: "description",
          content:
            "Pożyczki pod zastaw nieruchomości w największych polskich miastach. Sprawdź dane o lokalnym rynku i złóż bezpłatny wniosek online.",
        },
        { property: "og:title", content: "Pożyczki pod zastaw nieruchomości — miasta" },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:locale", content: "pl_PL" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(financialServiceLd()) },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbLd([
              { name: "Finance You", path: "/" },
              { name: "Pożyczki wg miast", path: "/pozyczki" },
            ]),
          ),
        },
      ],
    };
  },
  component: LocationIndexPage,
});

function LocationIndexPage() {
  const { pages } = Route.useLoaderData() as { pages: PageRow[] };
  return (
    <MarketingShell page="klient">
      <Section>
        <SectionHead
          eyebrow="Pożyczki lokalnie"
          title="Pożyczka pod zastaw nieruchomości w Twoim mieście"
          sub="Wybierz miasto, aby zobaczyć dane o lokalnym rynku nieruchomości i możliwościach finansowania."
        />
        {pages.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--muted-foreground)", marginTop: "2rem" }}>
            Podstrony miast są w przygotowaniu. W międzyczasie{" "}
            <Link to="/dla-klienta">złóż bezpłatny wniosek</Link> — finansujemy nieruchomości w
            całej Polsce.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: "2rem 0 0",
              padding: 0,
              display: "grid",
              gap: "0.6rem",
              gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))",
            }}
          >
            {pages.map((p) => (
              <li key={p.slug}>
                <Link
                  to="/pozyczki/$slug"
                  params={{ slug: p.slug }}
                  style={{
                    display: "block",
                    padding: "0.85rem 1.1rem",
                    borderRadius: "var(--radius-xl)",
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--foreground)",
                    textDecoration: "none",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                  }}
                >
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <ComplianceNote style={{ marginTop: "2.5rem" }}>
          Materiał ma charakter informacyjny i nie stanowi oferty w rozumieniu art. 66 Kodeksu
          cywilnego. Finance You nie gwarantuje udzielenia finansowania — decyzja należy do
          finansujących.
        </ComplianceNote>
      </Section>
    </MarketingShell>
  );
}
