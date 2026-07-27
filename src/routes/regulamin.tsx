import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/regulamin")({
  component: Regulamin,
  head: () => ({
    meta: [
      { title: "Regulamin serwisu | Finance You" },
      {
        name: "description",
        content:
          "Regulamin korzystania z serwisu Finance You — zasady składania wniosków o pożyczkę zabezpieczoną nieruchomością.",
      },
    ],
  }),
});

function Regulamin() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <Link to="/" className="text-sm text-accent hover:underline">
          ← Wróć do strony głównej
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
          Regulamin serwisu
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Ostatnia aktualizacja: czerwiec 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-xl font-bold text-foreground">1. Postanowienia ogólne</h2>
            <p className="mt-2">
              Serwis prowadzi <strong>Finance You sp. z o.o.</strong>, ul. Nowogrodzka 31, 00-511
              Warszawa, KRS 0000635207. Regulamin określa zasady korzystania z serwisu, w tym
              składania wniosków o pożyczki prywatne zabezpieczone nieruchomością.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">2. Charakter usługi</h2>
            <p className="mt-2">
              Finance You pośredniczy w kojarzeniu klientów z prywatnymi inwestorami. Serwis nie
              jest bankiem ani instytucją pożyczkową. Decyzję o udzieleniu pożyczki podejmuje
              inwestor.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">3. Złożenie wniosku</h2>
            <p className="mt-2">
              Złożenie wniosku jest bezpłatne i nie zobowiązuje do zawarcia umowy. Klient
              zobowiązuje się do podania prawdziwych danych i dostarczenia wymaganych dokumentów.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">4. Kontakt</h2>
            <p className="mt-2">
              Po wyrażeniu odpowiednich zgód Finance You może kontaktować się z klientem
              telefonicznie, e-mailowo oraz przez SMS — w tym z wykorzystaniem agentów
              konwersacyjnych AI — w celu obsługi wniosku oraz informowania o postępach.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">5. Reklamacje</h2>
            <p className="mt-2">
              Reklamacje można składać na adres{" "}
              <a href="mailto:kontakt@financeyou.pl" className="text-accent hover:underline">
                kontakt@financeyou.pl
              </a>
              . Odpowiedź udzielana jest w terminie 30 dni.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">6. Postanowienia końcowe</h2>
            <p className="mt-2">
              W sprawach nieuregulowanych stosuje się przepisy prawa polskiego. Finance You
              zastrzega prawo do zmiany regulaminu — o zmianach klient zostanie poinformowany
              e-mailem.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
