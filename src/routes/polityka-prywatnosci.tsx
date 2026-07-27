import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/polityka-prywatnosci")({
  component: PolitykaPrywatnosci,
  head: () => ({
    meta: [
      { title: "Polityka prywatności | Finance You" },
      {
        name: "description",
        content:
          "Polityka prywatności serwisu Finance You — zasady przetwarzania danych osobowych zgodnie z RODO.",
      },
    ],
  }),
});

function PolitykaPrywatnosci() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <Link to="/" className="text-sm text-accent hover:underline">
          ← Wróć do strony głównej
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
          Polityka prywatności
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Ostatnia aktualizacja: czerwiec 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-xl font-bold text-foreground">1. Administrator danych</h2>
            <p className="mt-2">
              Administratorem danych osobowych jest <strong>Finance You sp. z o.o.</strong>, ul.
              Nowogrodzka 31, 00-511 Warszawa, KRS 0000635207, NIP 7010611803, REGON 365350668.
              Kontakt:{" "}
              <a href="mailto:kontakt@financeyou.pl" className="text-accent hover:underline">
                kontakt@financeyou.pl
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">2. Cele i podstawy przetwarzania</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>obsługa wniosku o pożyczkę (art. 6 ust. 1 lit. b RODO),</li>
              <li>realizacja obowiązków prawnych (art. 6 ust. 1 lit. c RODO),</li>
              <li>
                kontakt telefoniczny, e-mail i SMS, w tym przez agentów AI, na podstawie zgody (art.
                6 ust. 1 lit. a RODO),
              </li>
              <li>marketing własnych usług na podstawie zgody (art. 6 ust. 1 lit. a RODO).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">3. Odbiorcy danych</h2>
            <p className="mt-2">
              Dane mogą być przekazywane podmiotom przetwarzającym — dostawcom infrastruktury IT,
              usług telekomunikacyjnych, podmiotom obsługującym kontakt głosowy i tekstowy (w tym
              agentom AI), biurom informacji gospodarczej oraz inwestorom udzielającym pożyczek.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">4. Okres przechowywania</h2>
            <p className="mt-2">
              Dane przechowujemy przez okres niezbędny do realizacji celu, dla którego zostały
              zebrane, oraz przez okres wynikający z przepisów prawa (m.in. księgowych i AML).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">5. Twoje prawa</h2>
            <p className="mt-2">
              Masz prawo dostępu do swoich danych, ich sprostowania, usunięcia, ograniczenia
              przetwarzania, przenoszenia, sprzeciwu oraz wycofania zgody w dowolnym momencie.
              Możesz wnieść skargę do Prezesa UODO.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">6. Pliki cookies</h2>
            <p className="mt-2">
              Serwis używa plików cookies w celach analitycznych i funkcjonalnych. Ustawienia plików
              cookies możesz zmienić w swojej przeglądarce.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
