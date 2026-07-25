import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, Menu, X } from "lucide-react";
import { FinanceYouLogo } from "@/components/finance-you-logo";
import { useAuth, defaultPathForRoles } from "@/hooks/use-auth";
import { LandingWizardForm } from "@/components/landing/landing-wizard-form";
import { ChatWidget } from "@/components/landing/chat-widget";



export const PHONE_DISPLAY = "+48 732 059 898";
export const PHONE_HREF = "+48732059898";
export const EMAIL = "kontakt@financeyou.pl";

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
  const { user, roles, loading } = useAuth();
  const panelHref = user ? defaultPathForRoles(roles) : null;
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = roles.includes("administrator") || roles.includes("operator") || roles.includes("ksiegowosc");
  useEffect(() => {
    if (!loading && user && panelHref && !isAdmin) {
      navigate({ to: panelHref, replace: true });
    }
  }, [loading, user, panelHref, navigate, isAdmin]);


  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2 md:px-6 md:py-3">
          <Link to="/" className="shrink-0">
            <FinanceYouLogo variant="light" size="lg" />
          </Link>

          {/* Desktop actions */}
          <div className="hidden items-center gap-2 md:flex">
            <Button asChild size="sm" className="bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] text-accent-foreground shadow-lg shadow-accent/30 hover:brightness-110 transition">
              <a href={`tel:${PHONE_HREF}`} aria-label={`Zadzwoń ${PHONE_DISPLAY}`}>
                <Phone className="h-4 w-4 mr-2" />
                {PHONE_DISPLAY}
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={panelHref ?? "/auth"}>{panelHref ? "Panel" : "Zaloguj"}</Link>
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Zamknij menu" : "Otwórz menu"}
            aria-expanded={menuOpen}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-foreground md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu panel */}
        {menuOpen && (
          <div className="border-t border-border bg-background/95 backdrop-blur md:hidden">
            <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3">
              <Button asChild size="sm" className="justify-center bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] text-accent-foreground shadow-lg shadow-accent/30">
                <a href={`tel:${PHONE_HREF}`} aria-label={`Zadzwoń ${PHONE_DISPLAY}`}>
                  <Phone className="h-4 w-4 mr-2" />
                  {PHONE_DISPLAY}
                </a>
              </Button>
              <Button asChild size="sm" variant="outline" className="justify-center">
                <Link to={panelHref ?? "/auth"} onClick={() => setMenuOpen(false)}>
                  {panelHref ? "Panel" : "Zaloguj"}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Wniosek */}
      <section className="border-b border-border bg-gradient-to-b from-[oklch(0.98_0.01_265)] to-background dark:from-[oklch(0.18_0.04_265)]">
        <div className="mx-auto max-w-3xl px-4 pt-4 pb-8 md:px-6 md:pt-8 md:pb-12">
          <LandingWizardForm />
        </div>
      </section>





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

      {/* Czat z asystentem — kanał komunikacji przychodzącej "chat" */}
      <ChatWidget source="landing" />
    </div>
  );
}
