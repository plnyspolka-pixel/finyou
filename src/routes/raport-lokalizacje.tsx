// Linkowalny asset (moduł 3b promptu SEO): interaktywny ranking lokalizacji
// wg naszego scoringu lokalizacyjnego. Wyłącznie dane zagregowane z tabel
// referencyjnych (snapshot w seo_location_report_entries, public read).
// Wersja do druku (print CSS) + przycisk „Cytuj ten raport" z gotowym
// snippetem HTML zawierającym link — mechanizm zbierania linków zwrotnych.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell } from "@/components/marketing/shell";
import { Section, ComplianceNote } from "@/components/marketing/sections";
import { MktButton } from "@/components/marketing/primitives";
import { breadcrumbLd, SITE_URL } from "@/lib/seo/company";
import { formatPl, slugifyCity, VOIVODESHIP_NAMES } from "@/lib/seo-location/core";
import { Check, Copy, Printer } from "lucide-react";

const PAGE_URL = `${SITE_URL}/raport-lokalizacje`;

type ReportRow = {
  teryt: string;
  name: string;
  voivodeship: string;
  rank: number;
  population: number | null;
  density_per_km2: number | null;
  population_within_25km: number;
  population_within_45km: number;
  attractiveness: number | null;
  fua_role: string;
  data_version: string;
  updated_at: string;
};

const db = supabase as unknown as SupabaseClient;

const CITE_SNIPPET = `<p>Źródło: <a href="${PAGE_URL}">Ranking lokalizacji pod pożyczki zabezpieczone nieruchomością — Finance You</a> (dane GUS/TERYT).</p>`;

export const Route = createFileRoute("/raport-lokalizacje")({
  loader: async (): Promise<{ rows: ReportRow[]; publishedSlugs: string[] }> => {
    const { data } = await db
      .from("seo_location_report_entries")
      .select("*")
      .order("rank", { ascending: true });
    // Linkujemy z rankingu tylko do już opublikowanych podstron miast.
    const { data: pages } = await db
      .from("seo_location_pages")
      .select("slug")
      .eq("status", "published");
    return {
      rows: (data ?? []) as ReportRow[],
      publishedSlugs: ((pages ?? []) as Array<{ slug: string }>).map((p) => p.slug),
    };
  },
  head: ({ loaderData }) => {
    const rows = loaderData?.rows ?? [];
    const modified = rows[0]?.updated_at?.slice(0, 10);
    return {
      meta: [
        { title: "Ranking lokalizacji — raport Finance You" },
        {
          name: "description",
          content:
            "Ranking polskich miast wg atrakcyjności lokalizacji dla finansowania pod zastaw nieruchomości. Dane GUS/TERYT: ludność, gęstość zaludnienia, zasięgi 25/45 km. Raport do cytowania i druku.",
        },
        { property: "og:title", content: "Ranking lokalizacji — raport Finance You" },
        {
          property: "og:description",
          content:
            "Które polskie miasta mają najlepsze lokalizacje pod finansowanie zabezpieczone nieruchomością? Interaktywny ranking na danych GUS.",
        },
        { property: "og:url", content: PAGE_URL },
        { property: "og:type", content: "website" },
        { property: "og:locale", content: "pl_PL" },
      ],
      links: [{ rel: "canonical", href: PAGE_URL }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: "Ranking lokalizacji pod pożyczki zabezpieczone nieruchomością",
            description:
              "Zagregowane wskaźniki lokalizacyjne polskich miast (ludność, gęstość zaludnienia, zasięgi 25/45 km, scoring atrakcyjności) na podstawie danych GUS/TERYT/NSP 2021.",
            url: PAGE_URL,
            inLanguage: "pl-PL",
            isAccessibleForFree: true,
            dateModified: modified,
            creator: { "@type": "Organization", name: "Finance You", url: SITE_URL },
            license: `${SITE_URL}/raport-lokalizacje#licencja`,
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbLd([
              { name: "Finance You", path: "/" },
              { name: "Raport lokalizacji", path: "/raport-lokalizacje" },
            ]),
          ),
        },
      ],
    };
  },
  component: LocationReportPage,
});

type SortKey = "rank" | "population" | "population_within_25km" | "density_per_km2";

function LocationReportPage() {
  const { rows, publishedSlugs } = Route.useLoaderData() as {
    rows: ReportRow[];
    publishedSlugs: string[];
  };
  const [voivodeship, setVoivodeship] = useState<string>("");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    let out = rows;
    if (voivodeship) out = out.filter((r) => r.voivodeship === voivodeship);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(q));
    }
    const dir = sortKey === "rank" ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = Number(a[sortKey] ?? 0);
      const bv = Number(b[sortKey] ?? 0);
      return (av - bv) * dir;
    });
  }, [rows, voivodeship, query, sortKey]);

  const copyCite = async () => {
    try {
      await navigator.clipboard.writeText(CITE_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* schowek niedostępny */
    }
  };

  const dataVersion = rows[0]?.data_version ?? "gus-2021-1";

  return (
    <MarketingShell page="klient">
      <style>{`
        @media print {
          .no-print, header, footer, nav { display: none !important; }
          .fy-report-table { font-size: 10px !important; }
          body { background: #fff !important; }
        }
      `}</style>
      <Section>
        <div style={{ maxWidth: "56rem", margin: "0 auto" }}>
          <h1
            style={{
              fontSize: "clamp(1.9rem, 3.6vw, 2.6rem)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              color: "var(--foreground)",
            }}
          >
            Ranking lokalizacji — gdzie nieruchomość najlepiej zabezpiecza pożyczkę?
          </h1>
          <p
            style={{
              marginTop: "0.9rem",
              fontSize: "1rem",
              lineHeight: 1.65,
              color: "var(--muted-foreground)",
            }}
          >
            Ranking {rows.length ? `${rows.length} polskich miast` : "polskich miast"} według
            scoringu lokalizacyjnego Finance You: ludność w zasięgu 25 i 45 km, gęstość zaludnienia
            i rola w funkcjonalnym obszarze miejskim. Wyłącznie zagregowane dane GUS/TERYT (wersja:{" "}
            {dataVersion}) — bez danych klientów.
          </p>

          <div
            className="no-print"
            style={{
              marginTop: "1.5rem",
              display: "flex",
              gap: "0.6rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              type="search"
              placeholder="Szukaj miasta…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Szukaj miasta"
              style={{
                padding: "0.55rem 0.9rem",
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--foreground)",
                fontSize: "0.9rem",
                minWidth: "12rem",
              }}
            />
            <select
              value={voivodeship}
              onChange={(e) => setVoivodeship(e.target.value)}
              aria-label="Filtruj po województwie"
              style={{
                padding: "0.55rem 0.9rem",
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--foreground)",
                fontSize: "0.9rem",
              }}
            >
              <option value="">Wszystkie województwa</option>
              {Object.values(VOIVODESHIP_NAMES).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="Sortowanie"
              style={{
                padding: "0.55rem 0.9rem",
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--foreground)",
                fontSize: "0.9rem",
              }}
            >
              <option value="rank">Sortuj: ranking</option>
              <option value="population">Sortuj: ludność miasta</option>
              <option value="population_within_25km">Sortuj: ludność 25 km</option>
              <option value="density_per_km2">Sortuj: gęstość</option>
            </select>
            <span style={{ flex: 1 }} />
            <MktButton variant="outline" onClick={copyCite} aria-label="Skopiuj snippet cytowania">
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? " Skopiowano" : " Cytuj ten raport"}
            </MktButton>
            <MktButton
              variant="outline"
              onClick={() => window.print()}
              aria-label="Drukuj lub zapisz PDF"
            >
              <Printer size={15} /> Drukuj / PDF
            </MktButton>
          </div>

          {rows.length === 0 ? (
            <p style={{ marginTop: "2rem", color: "var(--muted-foreground)" }}>
              Raport jest w przygotowaniu — dane pojawią się po najbliższej aktualizacji.
            </p>
          ) : (
            <div style={{ marginTop: "1.5rem", overflowX: "auto" }}>
              <table
                className="fy-report-table"
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.88rem",
                  color: "var(--foreground)",
                }}
              >
                <thead>
                  <tr
                    style={{
                      textAlign: "right",
                      borderBottom: "2px solid var(--border)",
                      color: "var(--muted-foreground)",
                      fontSize: "0.72rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    <th style={{ padding: "0.5rem", textAlign: "left" }}>#</th>
                    <th style={{ padding: "0.5rem", textAlign: "left" }}>Miasto</th>
                    <th style={{ padding: "0.5rem", textAlign: "left" }}>Województwo</th>
                    <th style={{ padding: "0.5rem" }}>Scoring</th>
                    <th style={{ padding: "0.5rem" }}>Ludność</th>
                    <th style={{ padding: "0.5rem" }}>Ludność 25 km</th>
                    <th style={{ padding: "0.5rem" }}>Ludność 45 km</th>
                    <th style={{ padding: "0.5rem" }}>Gęstość (os./km²)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.teryt} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.5rem", fontWeight: 700 }}>{r.rank}</td>
                      <td style={{ padding: "0.5rem", fontWeight: 700, textAlign: "left" }}>
                        {publishedSlugs.includes(slugifyCity(r.name)) ? (
                          <Link
                            to="/pozyczki/$slug"
                            params={{ slug: slugifyCity(r.name) }}
                            style={{ color: "inherit" }}
                          >
                            {r.name}
                          </Link>
                        ) : (
                          r.name
                        )}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "left" }}>{r.voivodeship}</td>
                      <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 700 }}>
                        {r.attractiveness ?? "—"}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {r.population ? formatPl(r.population) : "—"}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {formatPl(r.population_within_25km)}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {formatPl(r.population_within_45km)}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {r.density_per_km2 ? formatPl(Number(r.density_per_km2)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div
            id="licencja"
            style={{
              marginTop: "2rem",
              borderRadius: "var(--radius-2xl)",
              border: "1px solid var(--border)",
              background: "var(--card)",
              padding: "1.2rem 1.4rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>
              Chcesz zacytować ten raport?
            </h2>
            <p
              style={{
                margin: "0.5rem 0 0.8rem",
                fontSize: "0.88rem",
                color: "var(--muted-foreground)",
              }}
            >
              Możesz bezpłatnie wykorzystać dane i wykresy z tego raportu w artykułach i
              opracowaniach — wystarczy podać źródło z linkiem. Skopiuj gotowy fragment:
            </p>
            <code
              style={{
                display: "block",
                padding: "0.7rem 0.9rem",
                borderRadius: "var(--radius-md)",
                background: "var(--muted, rgba(120,160,255,0.06))",
                fontSize: "0.75rem",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {CITE_SNIPPET}
            </code>
            <div className="no-print" style={{ marginTop: "0.8rem" }}>
              <MktButton variant="outline" onClick={copyCite}>
                {copied ? "Skopiowano ✓" : "Kopiuj snippet HTML"}
              </MktButton>
            </div>
          </div>

          <ComplianceNote style={{ marginTop: "1.5rem" }}>
            Raport opiera się na zagregowanych danych statystycznych GUS/TERYT/NSP 2021 (wersja:{" "}
            {dataVersion}) oraz autorskim scoringu lokalizacyjnym Finance You. Ma charakter
            informacyjny — nie stanowi wyceny nieruchomości, oferty ani rekomendacji inwestycyjnej.
          </ComplianceNote>
        </div>
      </Section>
    </MarketingShell>
  );
}
