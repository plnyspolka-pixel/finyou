import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";
import { FinanceYouLogo } from "@/components/finance-you-logo";
import { useAuth, defaultPathForRoles } from "@/hooks/use-auth";
import { SinglePageApplicationForm } from "@/components/landing/single-page-application-form";
import { RecentApplicationsList } from "@/components/landing/recent-applications-list";
import { HeroVideo } from "@/components/landing/hero-video";

const PHONE_DISPLAY = "+48 732 059 898";
const PHONE_HREF = "+48732059898";
const EMAIL = "kontakt@financeyou.pl";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pożyczka pod zastaw nieruchomości — do 1 mln zł, decyzja w 24 h | Finance You" },
      {
        name: "description",
        content:
          "Pożyczka pod zastaw nieruchomości w Polsce do 1 000 000 zł. Decyzja w 24 godziny. Wypełnij wniosek online — wybierz typ nieruchomości, kwotę, okres i dołącz dokumenty.",
      },
      { name: "keywords", content: "pożyczka pod zastaw nieruchomości, pożyczka pod hipotekę, pożyczka prywatna, pożyczka pozabankowa, zastaw nieruchomości, pożyczka pod mieszkanie, pożyczka pod dom, pożyczka pod działkę" },
      { property: "og:title", content: "Pożyczka pod zastaw nieruchomości — Finance You" },
      { property: "og:description", content: "Do 1 mln zł. Decyzja w 24 h. Złóż wniosek online." },
      { property: "og:url", content: "https://financeyou.pl/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FinancialService",
          name: "Finance You — pożyczki pod zastaw nieruchomości",
          url: "https://financeyou.pl",
          email: EMAIL,
          telephone: PHONE_HREF,
          areaServed: "PL",
          description:
            "Prywatne pożyczki pod zastaw nieruchomości w Polsce — decyzja w 24 godziny, do 1 000 000 zł.",
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, roles } = useAuth();
  const panelHref = user ? defaultPathForRoles(roles) : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 md:px-6">
          <Link to="/" className="shrink-0">
            <FinanceYouLogo variant="light" size="lg" />
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] text-accent-foreground shadow-lg shadow-accent/30 hover:brightness-110 transition">
              <a href={`tel:${PHONE_HREF}`} aria-label={`Zadzwoń ${PHONE_DISPLAY}`}>
                <Phone className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">{PHONE_DISPLAY}</span>
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={panelHref ?? "/auth"}>{panelHref ? "Panel" : "Zaloguj"}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero + wniosek */}
      <section className="border-b border-border bg-gradient-to-b from-[oklch(0.98_0.01_265)] to-background dark:from-[oklch(0.18_0.04_265)]">
        <div className="mx-auto max-w-3xl px-4 pt-8 pb-10 md:px-6 md:pt-12 md:pb-14">
          <HeroVideo />

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("financeyou:open-offer"));
                document.getElementById("wniosek-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="group relative inline-flex w-full max-w-md items-center justify-center overflow-hidden rounded-2xl p-[2px] shadow-[0_10px_40px_-12px_oklch(0.65_0.18_45/0.6)] transition-transform duration-300 hover:scale-[1.02] active:scale-[0.99]"
              aria-label="Zobacz swoją wstępną ofertę"
            >
              <span
                aria-hidden
                className="absolute inset-0 rounded-2xl bg-[conic-gradient(from_var(--angle),oklch(0.72_0.18_45),oklch(0.78_0.16_85),oklch(0.65_0.20_25),oklch(0.72_0.18_45))] opacity-90"
                style={{
                  animation: "fy-spin 4s linear infinite",
                  // @ts-expect-error CSS custom property
                  "--angle": "0deg",
                }}
              />
              <span className="relative flex w-full items-center justify-center gap-3 rounded-[14px] bg-[oklch(0.16_0.03_265)] px-6 py-4 text-white">
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  style={{ animation: "fy-shimmer 2.8s linear infinite" }}
                />
                <span className="relative text-xs font-bold uppercase tracking-[0.22em] text-white/70">
                  Krok 3
                </span>
                <span className="relative text-base font-bold tracking-wide sm:text-lg">
                  Twoja oferta
                </span>
                <svg className="relative h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </button>
          </div>
          <style>{`
            @property --angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
            @keyframes fy-spin { to { --angle: 360deg; transform: rotate(360deg); } }
            @keyframes fy-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
          `}</style>

          <div id="wniosek-form" className="mt-8 scroll-mt-24">
            <SinglePageApplicationForm />
          </div>
        </div>
      </section>

      {/* Ostatnie wnioski */}
      <RecentApplicationsList />

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
          <div className="grid gap-8 md:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <FinanceYouLogo variant="light" size="md" />
              <p className="mt-3 text-sm font-semibold text-foreground">Finance You sp. z o.o.</p>
              <address className="mt-1 not-italic text-sm leading-relaxed text-muted-foreground">
                ul. Nowogrodzka 31<br />00-511 Warszawa
              </address>
              <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div className="flex gap-2"><dt className="font-semibold text-foreground/80">KRS:</dt><dd>0000635207</dd></div>
                <div className="flex gap-2"><dt className="font-semibold text-foreground/80">NIP:</dt><dd>7010611803</dd></div>
                <div className="flex gap-2"><dt className="font-semibold text-foreground/80">REGON:</dt><dd>365350668</dd></div>
              </dl>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Kontakt</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><a href={`tel:${PHONE_HREF}`} className="hover:text-foreground">{PHONE_DISPLAY}</a></li>
                <li><a href={`mailto:${EMAIL}`} className="hover:text-foreground">{EMAIL}</a></li>
                <li>pn–pt 9:00–17:00</li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Informacje</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><Link to="/blog" className="hover:text-foreground">Blog</Link></li>
                <li><a href="/polityka-prywatnosci" className="hover:text-foreground">Polityka prywatności</a></li>
                <li><a href="/regulamin" className="hover:text-foreground">Regulamin serwisu</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row md:items-center">
            <span>© {new Date().getFullYear()} Finance You sp. z o.o. Wszelkie prawa zastrzeżone.</span>
            <span>Prywatne pożyczki zabezpieczone hipoteką na nieruchomości w Polsce.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
