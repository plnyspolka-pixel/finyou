import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComplianceNotice } from "@/components/affiliate/compliance-notice";
import { formatPLN } from "@/lib/labels";
import { INVESTOR_COMMISSION_PLN } from "@/lib/affiliate/engine-pure";
import {
  Network,
  Wallet,
  BadgeCheck,
  Link2,
  UserCheck,
  HandCoins,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/program-partnerski/")({
  head: () => ({
    meta: [
      { title: "Program partnerski Finance You — 1000 zł za każdego nowego inwestora" },
      {
        name: "description",
        content:
          "Polecaj inwestorów Finance You. Za każdego nowego inwestora, który kupi abonament, płacimy 1000 zł prowizji. Rejestracja bezpłatna, rozliczenie B2B lub działalność nierejestrowana.",
      },
      { property: "og:title", content: "Program partnerski Finance You — 1000 zł za inwestora" },
      {
        property: "og:description",
        content:
          "Za każdego nowego inwestora, który kupi abonament Finance You, płacimy 1000 zł prowizji.",
      },
      { property: "og:url", content: "https://financeyou.pl/program-partnerski" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/program-partnerski" }],
  }),
  component: ProgramPartnerskiLanding,
});

const COMMISSION = formatPLN(INVESTOR_COMMISSION_PLN);

const steps = [
  {
    icon: UserCheck,
    title: "1. Zarejestruj się",
    desc: "Bezpłatnie: dane, akceptacja umowy i numer konta do wypłaty prowizji. Konto działa od razu.",
  },
  {
    icon: Link2,
    title: "2. Polecaj inwestorów",
    desc: "W panelu dostajesz swój link polecający. Inwestor zakłada konto z Twojego linku.",
  },
  {
    icon: HandCoins,
    title: `3. Otrzymujesz ${COMMISSION}`,
    desc: "Gdy polecony nowy inwestor kupi abonament Finance You, naliczamy Ci prowizję.",
  },
];

function ProgramPartnerskiLanding() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30">
      <header className="flex items-center justify-between px-4 md:px-8 py-4 border-b">
        <Link to="/" className="flex items-center gap-2.5 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground text-xs font-extrabold">
            FY
          </span>
          <span>Finance You</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/logowanie">Zaloguj</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/program-partnerski/rejestracja" search={{ ref: "" }}>
              Dołącz do programu
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 space-y-12">
        <section className="text-center space-y-5">
          <Badge variant="secondary" className="gap-1">
            <Network className="h-3.5 w-3.5" /> Program partnerski Finance You
          </Badge>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            {COMMISSION} za każdego nowego inwestora
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Polecaj inwestorów zainteresowanych pożyczkami zabezpieczonymi na nieruchomościach. Za
            każdego nowego inwestora, który kupi abonament Finance You, płacimy {COMMISSION}{" "}
            prowizji. Rozliczasz się jako B2B lub w ramach działalności nierejestrowanej.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button asChild size="lg">
              <Link to="/program-partnerski/rejestracja" search={{ ref: "" }}>
                Dołącz do programu <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-center">Jak to działa</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {steps.map((e) => (
              <Card key={e.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <e.icon className="h-5 w-5 text-primary" /> {e.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{e.desc}</CardContent>
              </Card>
            ))}
          </div>
          <ComplianceNotice kind="partner" />
          <p className="text-center text-sm text-muted-foreground">
            Program partnerski dotyczy tylko polecania inwestorów. Prowadzisz klientów szukających
            pożyczki?{" "}
            <Link to="/dla-posrednika" className="text-primary hover:underline">
              Zostań pośrednikiem
            </Link>{" "}
            — to osobne konto z prowizją od uruchomionych pożyczek.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5 text-primary" /> Kiedy prowizja jest należna
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Wyłącznie za abonament nowego inwestora (pierwszy, bez odnowień), gdy płatność jest
              zaksięgowana i nie została zwrócona. Prowizję zatwierdza Finance You.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BadgeCheck className="h-5 w-5 text-primary" /> Dwie formy rozliczenia
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <b>B2B</b> — faktura lub dokument księgowy. <b>Działalność nierejestrowana</b> — w
              ramach limitu przychodów (2026: 10 813,50 zł/kwartał). System pilnuje limitu za
              Ciebie.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-5 w-5 text-primary" /> Próg wypłaty 500 zł
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Prowizje gromadzą się jako saldo. Wypłata po osiągnięciu 500 zł, zatwierdzeniu
              prowizji i spełnieniu wymogów rozliczeniowych.
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-primary/30">
            <CardContent className="py-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">
                    Wynagrodzenie za realny zakup, nie za rejestrację
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Sama rejestracja poleconej osoby nie daje prowizji. {COMMISSION} należy się, gdy
                    nowy inwestor faktycznie kupi abonament Finance You.
                  </p>
                </div>
              </div>
              <Button asChild>
                <Link to="/program-partnerski/rejestracja" search={{ ref: "" }}>
                  Dołącz do programu <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        Finance You ·{" "}
        <a href="mailto:kontakt@financeyou.pl" className="hover:underline">
          kontakt@financeyou.pl
        </a>{" "}
        · financeyou.pl
      </footer>
    </div>
  );
}
