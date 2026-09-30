import { createFileRoute, Link } from "@tanstack/react-router";
import { OPEN_SETTINGS_HASH } from "@/lib/cookie-consent";

export const Route = createFileRoute("/polityka-cookies")({
  component: PolitykaCookies,
  head: () => ({
    meta: [
      { title: "Polityka cookies | Finance You" },
      {
        name: "description",
        content:
          "Polityka plików cookies serwisu Finance You — jakie cookies stosujemy, w jakim celu i jak zmienić zgodę.",
      },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/polityka-cookies" }],
  }),
});

type Row = { name: string; provider: string; purpose: string; ttl: string };

const NECESSARY: Row[] = [
  {
    name: "fy_cookie_consent",
    provider: "Finance You",
    purpose: "Zapamiętanie Twojego wyboru dotyczącego cookies",
    ttl: "12 miesięcy",
  },
  {
    name: "sb-*-auth-token (localStorage)",
    provider: "Finance You (Supabase)",
    purpose: "Utrzymanie sesji po zalogowaniu",
    ttl: "do wylogowania",
  },
  {
    name: "sidebar_state",
    provider: "Finance You",
    purpose: "Zapamiętanie stanu menu w panelu",
    ttl: "7 dni",
  },
  {
    name: "fy_ref (localStorage)",
    provider: "Finance You",
    purpose: "Przypisanie polecenia do partnera, gdy wejdziesz z linku polecającego",
    ttl: "do usunięcia",
  },
  {
    name: "dane formularzy (sessionStorage)",
    provider: "Finance You",
    purpose: "Zachowanie wpisanych danych wniosku przy przechodzeniu między krokami",
    ttl: "do zamknięcia karty",
  },
  {
    name: "__stripe_mid, __stripe_sid",
    provider: "Stripe",
    purpose: "Bezpieczeństwo i zapobieganie oszustwom przy płatnościach",
    ttl: "do 1 roku / 30 min",
  },
];

const ANALYTICS: Row[] = [
  {
    name: "_ga, _ga_*",
    provider: "Google (Google Analytics 4)",
    purpose: "Statystyki odwiedzin, źródła ruchu",
    ttl: "do 2 lat",
  },
  {
    name: "_clck, _clsk",
    provider: "Microsoft (Clarity)",
    purpose:
      "Analiza sposobu korzystania ze strony, nagrania sesji (treść pól formularzy jest maskowana)",
    ttl: "do 1 roku / 1 dzień",
  },
];

const MARKETING: Row[] = [
  {
    name: "_fbp, _fbc",
    provider: "Meta (Meta Pixel, Conversions API)",
    purpose: "Pomiar skuteczności reklam na Facebooku i Instagramie, remarketing",
    ttl: "do 90 dni",
  },
  {
    name: "_gcl_au, _gcl_aw",
    provider: "Google (Google Ads)",
    purpose: "Pomiar konwersji z reklam Google",
    ttl: "do 90 dni",
  },
];

function CookieTable({ rows }: { rows: Row[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[36rem] text-left text-xs">
        <thead className="bg-muted/50 text-foreground">
          <tr>
            <th className="p-2 font-semibold">Nazwa</th>
            <th className="p-2 font-semibold">Dostawca</th>
            <th className="p-2 font-semibold">Cel</th>
            <th className="p-2 font-semibold">Czas przechowywania</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t align-top">
              <td className="p-2 font-mono">{r.name}</td>
              <td className="p-2">{r.provider}</td>
              <td className="p-2">{r.purpose}</td>
              <td className="p-2 whitespace-nowrap">{r.ttl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PolitykaCookies() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <Link to="/" className="text-sm text-accent hover:underline">
          ← Wróć do strony głównej
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
          Polityka cookies
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Ostatnia aktualizacja: wrzesień 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-xl font-bold text-foreground">1. Czym są pliki cookies</h2>
            <p className="mt-2">
              Cookies to niewielkie pliki tekstowe zapisywane na Twoim urządzeniu przez
              przeglądarkę. Podobnie działają inne technologie, np. pamięć lokalna przeglądarki
              (localStorage, sessionStorage) i piksele śledzące — w tej polityce nazywamy je łącznie
              „cookies”. Administratorem serwisu jest <strong>Finance You sp. z o.o.</strong>, ul.
              Nowogrodzka 31, 00-511 Warszawa.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">2. Twoja zgoda</h2>
            <p className="mt-2">
              Cookies niezbędne stosujemy bez zgody, bo bez nich serwis nie działa (art. 399 ust. 3
              Prawa komunikacji elektronicznej). Cookies analityczne i marketingowe uruchamiamy
              wyłącznie po wyrażeniu przez Ciebie zgody w banerze (art. 6 ust. 1 lit. a RODO). Do
              tego czasu odpowiednie narzędzia nie są w ogóle ładowane.
            </p>
            <p className="mt-2">
              Zgodę możesz w każdej chwili zmienić lub wycofać — bez wpływu na zgodność z prawem
              wcześniejszego przetwarzania —{" "}
              <a href={OPEN_SETTINGS_HASH} className="font-semibold text-accent hover:underline">
                otwierając ustawienia cookies
              </a>{" "}
              (link jest też w stopce każdej strony). Po wycofaniu zgody usuwamy cookies danego
              narzędzia i przeładowujemy stronę.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">3. Cookies niezbędne</h2>
            <CookieTable rows={NECESSARY} />
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">4. Cookies analityczne (za zgodą)</h2>
            <CookieTable rows={ANALYTICS} />
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">
              5. Cookies marketingowe (za zgodą)
            </h2>
            <CookieTable rows={MARKETING} />
            <p className="mt-2">
              Po wyrażeniu zgody marketingowej informacje o zdarzeniach (np. wysłanie wniosku)
              przekazujemy do Meta także bezpośrednio z serwera (Conversions API), w tym dane
              kontaktowe w postaci zaszyfrowanej funkcją skrótu.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">6. Przekazywanie danych poza EOG</h2>
            <p className="mt-2">
              Google, Microsoft i Meta mogą przetwarzać dane w USA. Przekazanie odbywa się na
              podstawie decyzji Komisji Europejskiej w sprawie EU-US Data Privacy Framework albo
              standardowych klauzul umownych.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">7. Ustawienia przeglądarki</h2>
            <p className="mt-2">
              Niezależnie od ustawień w serwisie możesz blokować lub usuwać cookies w ustawieniach
              przeglądarki. Zablokowanie cookies niezbędnych może uniemożliwić logowanie i wysłanie
              wniosku.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground">8. Więcej informacji</h2>
            <p className="mt-2">
              Zasady przetwarzania danych osobowych i Twoje prawa opisujemy w{" "}
              <Link to="/polityka-prywatnosci" className="text-accent hover:underline">
                polityce prywatności
              </Link>
              . Pytania prosimy kierować na{" "}
              <a href="mailto:kontakt@financeyou.pl" className="text-accent hover:underline">
                kontakt@financeyou.pl
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
