import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComplianceNotice } from "@/components/affiliate/compliance-notice";
import {
  Network,
  Wallet,
  BadgeCheck,
  Building2,
  UserCheck,
  HandCoins,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/posrednicy/")({
  head: () => ({
    meta: [
      { title: "Program pośredników Finance You — sieć partnerska, 3-poziomowy system prowizji" },
      {
        name: "description",
        content:
          "Dołącz do sieci partnerskiej Finance You. Prowizja sieciowa do 3 poziomów wyłącznie od realnych zdarzeń gospodarczych. Rozliczenie B2B lub działalność nierejestrowana. Próg wypłaty 500 zł.",
      },
      { property: "og:title", content: "Program pośredników Finance You" },
      {
        property: "og:description",
        content:
          "Sieć partnerska i 3-poziomowy system prowizji. Prowizje wyłącznie od realnych zdarzeń gospodarczych.",
      },
      { property: "og:url", content: "https://financeyou.pl/posrednicy" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/posrednicy" }],
  }),
  component: PosrednicyLanding,
});

const events = [
  {
    icon: UserCheck,
    title: "Opłacone konto inwestora",
    desc: "Osoba polecona opłaca konto inwestora, a płatność zostaje zaksięgowana i nie jest zwrócona.",
  },
  {
    icon: Building2,
    title: "Opłacone konto pośrednika",
    desc: "Realnie opłacone, nieanulowane konto/usługa pośrednika — nie za samą rejestrację osoby.",
  },
  {
    icon: HandCoins,
    title: "Skuteczna wypłata środków klientowi",
    desc: "Klient polecony otrzymuje środki, a Finance You uzyskuje należne wynagrodzenie z transakcji.",
  },
];

function PosrednicyLanding() {
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
            <Link to="/posrednicy/rejestracja" search={{ ref: "" }}>
              Zostań partnerem
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 space-y-12">
        <section className="text-center space-y-5">
          <Badge variant="secondary" className="gap-1">
            <Network className="h-3.5 w-3.5" /> Sieć partnerska Finance You
          </Badge>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            Program pośredników i 3-poziomowy system prowizji
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Polecaj inwestorów, pośredników i klientów. Zarabiaj prowizję sieciową do trzech
            poziomów — wyłącznie od realnych zdarzeń gospodarczych. Rozliczaj się jako B2B lub w
            ramach działalności nierejestrowanej.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button asChild size="lg">
              <Link to="/posrednicy/rejestracja" search={{ ref: "" }}>
                Dołącz do programu <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-center">Za co powstaje prowizja</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {events.map((e) => (
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
          <ComplianceNotice />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-5 w-5 text-primary" /> 3 poziomy
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Poziom 1 — Ty (bezpośrednie polecenie). Poziom 2 — partner, który zaprosił Ciebie.
              Poziom 3 — jego sponsor. Prowizja sieciowa nie jest naliczana powyżej 3 poziomów.
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
                    Wynagrodzenie za realną sprzedaż, nie za rekrutację
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Program nie jest systemem zarabiania na zapraszaniu osób. Prowizja powstaje
                    wyłącznie z realnego zdarzenia gospodarczego.
                  </p>
                </div>
              </div>
              <Button asChild>
                <Link to="/posrednicy/rejestracja" search={{ ref: "" }}>
                  Zostań partnerem <ArrowRight className="ml-2 h-4 w-4" />
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
