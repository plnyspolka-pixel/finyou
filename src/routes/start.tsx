// Link-hub z bio (brief 5.3): /start – jeden stały adres dla obu torów.
// Link w bio IG/TikTok/YT wskazuje tutaj; treść (CTA, lead magnety, narzędzia)
// aktualizuje system z profili torów i opublikowanych lead magnetów.
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Calculator, Download, LineChart } from "lucide-react";
import { getLinkHubFn } from "@/lib/autopilot/link-hub.functions";
import { FinanceYouLogo } from "@/components/finance-you-logo";
import { COMPANY_DATA } from "@/lib/company";
import { SITE_URL } from "@/lib/seo/company";

const hubQuery = queryOptions({
  queryKey: ["link-hub"],
  queryFn: () => getLinkHubFn(),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/start")({
  loader: ({ context }) => context.queryClient.ensureQueryData(hubQuery),
  head: () => ({
    meta: [
      { title: "Finance You – finansowanie dla firm i inwestowanie pod zastaw nieruchomości" },
      {
        name: "description",
        content:
          "Wybierz swoją ścieżkę: finansowanie dla firm pod zastaw nieruchomości albo inwestowanie w pożyczki zabezpieczone hipoteką.",
      },
      { property: "og:url", content: `${SITE_URL}/start` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/start` }],
  }),
  component: LinkHubPage,
});

function LinkHubPage() {
  const { data } = useSuspenseQuery(hubQuery);
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <FinanceYouLogo size="md" />
          <p className="text-sm text-muted-foreground">
            Ok. 15 lat na rynku finansowania pozabankowego · ponad 100 wypłaconych pożyczek
          </p>
        </header>

        {data.tracks.map((t) => {
          const Icon = t.track === "inwestor" ? LineChart : Building2;
          return (
            <section
              key={t.track}
              className="rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-1 h-7 w-7 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0">
                  <h2 className="text-xl font-extrabold">{t.heading}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t.sub}</p>
                </div>
              </div>
              <a
                href={withSource(t.ctaUrl, t.track)}
                className="mt-4 flex items-center justify-between rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:opacity-90"
              >
                {t.ctaLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              {(t.magnets.length > 0 || t.tools.length > 0) && (
                <ul className="mt-3 flex flex-col gap-2">
                  {t.magnets.map((m) => (
                    <li key={m.slug}>
                      <Link
                        to="/pobierz/$slug"
                        params={{ slug: m.slug }}
                        search={{
                          utm_source: "bio",
                          utm_medium: "link_hub",
                          utm_campaign: t.track,
                        }}
                        className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:border-accent"
                      >
                        <Download className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                        <span className="truncate">{m.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {t.tools.length > 0 && (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Calculator className="h-3.5 w-3.5" aria-hidden />
                  Narzędzia: {t.tools.map((x) => x.title).join(" · ")} – skomentuj hasło pod rolką (
                  {t.tools.map((x) => x.keyword).join(", ")}).
                </p>
              )}
            </section>
          );
        })}

        <footer className="text-center text-xs leading-relaxed text-muted-foreground">
          <p>
            Materiały edukacyjne. Finansowanie wyłącznie na cel gospodarczy; decyzję podejmują
            finansujący. Inwestowanie wiąże się z ryzykiem, w tym utraty kapitału. Treści w
            serwisach społecznościowych przygotowujemy z użyciem AI.
          </p>
          <p className="mt-2">
            {COMPANY_DATA.legalName} · KRS {COMPANY_DATA.krs} · {COMPANY_DATA.email}
          </p>
        </footer>
      </div>
    </main>
  );
}

function withSource(url: string, track: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "bio");
    u.searchParams.set("utm_medium", "link_hub");
    u.searchParams.set("utm_campaign", track);
    return u.toString();
  } catch {
    return url;
  }
}
