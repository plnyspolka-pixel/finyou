// Link-hub w bio (brief 5.3): stały adres /start z wyborem toru i aktualnymi
// lead magnetami (lista z bazy — agent zmienia ją, publikując lead magnety).
import { createFileRoute } from "@tanstack/react-router";
import { FinanceYouLogo } from "@/components/finance-you-logo";
import { MktButton, Eyebrow } from "@/components/marketing/primitives";
import { CALCULATOR_CONFIGS } from "@/lib/lead-magnet-tools/calculator-configs";
import { listHubLeadMagnetsFn } from "@/lib/lead-magnet-tools/link-hub.functions";
import { SITE_URL } from "@/lib/seo/company";

export const Route = createFileRoute("/start")({
  loader: async () => listHubLeadMagnetsFn().catch(() => ({ magnets: [] })),
  head: () => ({
    meta: [
      { title: "Finance You — finansowanie dla firm i inwestowanie pod zastaw nieruchomości" },
      {
        name: "description",
        content:
          "Potrzebujesz finansowania dla firmy albo chcesz inwestować? Bezpłatne materiały i narzędzia Finance You.",
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/start` }],
  }),
  component: LinkHub,
});

type Track = {
  key: "pozyczkobiorca" | "inwestor";
  audience: string;
  title: string;
  cta: string;
  href: string;
};
const TRACKS: Track[] = [
  {
    key: "pozyczkobiorca",
    audience: "klient",
    title: "Potrzebuję finansowania",
    cta: "Złóż bezpłatny wniosek",
    href: "https://app.financeyou.pl/embed/wniosek",
  },
  {
    key: "inwestor",
    audience: "inwestor",
    title: "Chcę inwestować",
    cta: "Dla inwestora",
    href: "/dla-inwestora",
  },
];

function LinkHub() {
  const { magnets } = Route.useLoaderData();
  return (
    <div className="fy-marketing" style={{ minHeight: "100vh" }}>
      <main
        style={{
          maxWidth: "34rem",
          margin: "0 auto",
          padding: "2rem 1.25rem 3rem",
          display: "grid",
          gap: "1.6rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <FinanceYouLogo variant="dark" size="sm" />
        </div>
        {TRACKS.map((t) => {
          const tools = CALCULATOR_CONFIGS.filter((c) => c.track === t.key);
          const list = magnets.filter((m) => m.audience === t.audience);
          return (
            <section key={t.key} style={{ display: "grid", gap: "0.6rem" }}>
              <Eyebrow>{t.key === "inwestor" ? "Inwestorzy" : "Firmy"}</Eyebrow>
              <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800 }}>{t.title}</h2>
              <MktButton href={t.href} variant="gold">
                {t.cta}
              </MktButton>
              {tools.map((c) => (
                <MktButton
                  key={c.slug}
                  href={`/narzedzie/${c.slug}?utm_source=instagram&utm_medium=bio`}
                  variant="outline"
                >
                  {c.title}
                </MktButton>
              ))}
              {list.map((m) => (
                <MktButton
                  key={m.slug}
                  href={`/pobierz/${m.slug}?utm_source=instagram&utm_medium=bio`}
                  variant="outline"
                >
                  {m.title}
                </MktButton>
              ))}
            </section>
          );
        })}
        <p
          style={{
            fontSize: "0.72rem",
            color: "var(--muted-foreground)",
            textAlign: "center",
            margin: 0,
          }}
        >
          Finance You sp. z o.o., KRS 0000635207. Finansowanie wyłącznie dla przedsiębiorców, na cel
          gospodarczy. Inwestowanie wiąże się z ryzykiem, w tym utraty kapitału. Treści przygotowane
          z użyciem AI.
        </p>
      </main>
    </div>
  );
}
