// Publiczna strona narzędzia-lead-magnetu: /narzedzie/<slug> (kalkulator
// z konfiguracji, src/lib/lead-magnet-tools/calculator-configs.ts). Część wyniku
// widać od razu, pełny wynik po zapisie na listę (lead magnet o tym samym slugu).
import { createFileRoute, notFound } from "@tanstack/react-router";
import { FinanceYouLogo } from "@/components/finance-you-logo";
import { Eyebrow } from "@/components/marketing/primitives";
import { CalculatorTool } from "@/components/marketing/calculator-tool";
import { CALCULATOR_CONFIGS } from "@/lib/lead-magnet-tools/calculator-configs";
import { getPublicLeadMagnetFn } from "@/lib/lead-magnets/lead-magnets.functions";
import { SITE_URL } from "@/lib/seo/company";

type SearchParams = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
};
const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined;

export const Route = createFileRoute("/narzedzie/$slug")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    utm_source: str(s.utm_source),
    utm_medium: str(s.utm_medium),
    utm_campaign: str(s.utm_campaign),
    utm_content: str(s.utm_content),
  }),
  loader: async ({ params }) => {
    const config = CALCULATOR_CONFIGS.find((c) => c.slug === params.slug);
    if (!config) throw notFound();
    const res = await getPublicLeadMagnetFn({ data: { slug: config.slug } }).catch(() => ({
      magnet: null,
    }));
    return {
      slug: config.slug,
      gate: res.magnet ? { slug: res.magnet.slug, consentText: res.magnet.consent_text } : null,
    };
  },
  head: ({ loaderData }) => {
    const c = CALCULATOR_CONFIGS.find((x) => x.slug === loaderData?.slug);
    if (!c) return { meta: [{ title: "Nie znaleziono" }] };
    const url = `${SITE_URL}/narzedzie/${c.slug}`;
    return {
      meta: [
        { title: `${c.title} | Finance You` },
        { name: "description", content: c.promise },
        { property: "og:title", content: c.title },
        { property: "og:description", content: c.promise },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: ToolPage,
});

function ToolPage() {
  const { slug, gate } = Route.useLoaderData();
  const search = Route.useSearch();
  const config = CALCULATOR_CONFIGS.find((c) => c.slug === slug)!;
  const ctaHref = config.track === "inwestor" ? "/dla-inwestora" : "/dla-klienta";
  return (
    <div className="fy-marketing" style={{ minHeight: "100vh" }}>
      <header
        style={{ padding: "0.9rem 1.25rem", borderBottom: "1px solid rgba(84,124,214,0.25)" }}
      >
        <a href="/start" style={{ display: "inline-flex" }}>
          <FinanceYouLogo variant="dark" size="sm" />
        </a>
      </header>
      <main
        style={{
          maxWidth: "40rem",
          margin: "0 auto",
          padding: "2rem 1.25rem 3rem",
          display: "grid",
          gap: "1.2rem",
        }}
      >
        <Eyebrow>Bezpłatne narzędzie</Eyebrow>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 800, margin: 0 }}>{config.title}</h1>
        <p style={{ margin: 0, color: "var(--muted-foreground)" }}>{config.promise}</p>
        <CalculatorTool
          config={config}
          gate={gate}
          utm={{
            source: search.utm_source,
            medium: search.utm_medium,
            campaign: search.utm_campaign,
            content: search.utm_content,
          }}
        />
        <a href={ctaHref} style={{ fontSize: "0.9rem", color: "var(--gold)" }}>
          {config.track === "inwestor"
            ? "Zobacz, jak działa współpraca z inwestorami →"
            : "Sprawdź możliwości finansowania dla firmy →"}
        </a>
      </main>
    </div>
  );
}
