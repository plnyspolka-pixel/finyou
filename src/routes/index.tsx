import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, defaultPathForRoles } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ShieldCheck,
  Clock,
  Wallet,
  FileCheck,
  Home,
  Building2,
  TreePine,
  Phone,
  Mail,
  CheckCircle2,
  Zap,
  Lock,
  HandCoins,
} from "lucide-react";

const PHONE_DISPLAY = "+48 732 059 898";
const PHONE_HREF = "+48732059898";
const EMAIL = "kontakt@financeyou.pl";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pożyczka pod zastaw nieruchomości — Finance You" },
      {
        name: "description",
        content:
          "Prywatna pożyczka hipoteczna od 20 000 zł do 1 000 000 zł. Decyzja do 48 h, złożenie wniosku darmowe. Zabezpieczenie na nieruchomości w Polsce.",
      },
      { property: "og:title", content: "Pożyczka pod zastaw nieruchomości — Finance You" },
      {
        property: "og:description",
        content: "Decyzja do 48 h. Kwoty 20 000 – 1 000 000 zł. Złożenie wniosku darmowe.",
      },
    ],
  }),
  component: Landing,
});

const ConvaiWidget = "elevenlabs-convai" as unknown as React.FC<
  { "agent-id": string } & React.HTMLAttributes<HTMLElement>
>;

function Landing() {
  const { user, roles, loading } = useAuth();

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("elevenlabs-convai-script")) return;
    const s = document.createElement("script");
    s.id = "elevenlabs-convai-script";
    s.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
    s.async = true;
    s.type = "text/javascript";
    document.body.appendChild(s);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Ładowanie…
      </div>
    );
  }

  if (user) {
    const pending =
      typeof window !== "undefined" ? localStorage.getItem("pending_role_selection") : null;
    if (pending === "1") {
      try {
        localStorage.removeItem("pending_role_selection");
      } catch {
        /* noop */
      }
      return <Navigate to="/wybor-roli" />;
    }
    return <Navigate to={defaultPathForRoles(roles)} />;
  }

  return (
    <div className="min-h-screen bg-background font-[Montserrat]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground text-sm">
              FY
            </div>
            <span className="text-base md:text-lg">Finance You</span>
          </div>
          <div className="hidden items-center gap-4 md:flex">
            <a
              href={`tel:${PHONE_HREF}`}
              className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-accent"
            >
              <Phone className="h-4 w-4" />
              {PHONE_DISPLAY}
            </a>
            <a
              href={`mailto:${EMAIL}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-accent"
            >
              <Mail className="h-4 w-4" />
              {EMAIL}
            </a>
          </div>
          <Button asChild size="sm" className="md:size-default">
            <a href="#wniosek">Złóż wniosek</a>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary via-primary to-[oklch(0.22_0.07_260)] text-primary-foreground">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_10%,oklch(0.62_0.13_230_/0.5),transparent_50%),radial-gradient(circle_at_80%_90%,oklch(0.62_0.13_230_/0.3),transparent_50%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:px-6 md:py-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              <Zap className="h-3.5 w-3.5 text-accent" />
              Decyzja do 48 godzin
            </div>
            <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
              Pożyczka pod zastaw nieruchomości
              <span className="block text-accent">od 20 000 do 1 000 000 zł</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-white/80 md:text-lg">
              Prywatna pożyczka hipoteczna dla osób prowadzących działalność gospodarczą.
              Zabezpieczenie na mieszkaniu, domu, lokalu lub działce. Zły BIK, komornik czy
              istniejąca hipoteka — analizujemy indywidualnie.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                <a href="#wniosek">Złóż darmowy wniosek</a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <a href={`tel:${PHONE_HREF}`}>
                  <Phone className="h-4 w-4" />
                  {PHONE_DISPLAY}
                </a>
              </Button>
            </div>
            <ul className="mt-6 grid gap-2 text-sm text-white/85 sm:grid-cols-2">
              {[
                "Złożenie wniosku darmowe",
                "Decyzja do 48 godzin",
                "Bez opłat za rozpatrzenie",
                "Nowa działalność — od 1. dnia",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-accent" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Stats card */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur md:p-6">
            {[
              { v: "20 tys. – 1 mln zł", l: "Kwota pożyczki" },
              { v: "6 – 72 mies.", l: "Okres finansowania" },
              { v: "do 50%", l: "Wartości nieruchomości" },
              { v: "48 h", l: "Czas decyzji" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="text-xl font-extrabold text-accent md:text-2xl">{s.v}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-white/70">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-4 md:px-6">
          {[
            { icon: HandCoins, t: "Darmowy wniosek", d: "Nie pobieramy opłaty za rozpatrzenie." },
            { icon: Clock, t: "Decyzja w 48 h", d: "Wniosek trafia od razu do inwestorów." },
            { icon: ShieldCheck, t: "Bezpieczeństwo", d: "Formalności u notariusza." },
            { icon: Lock, t: "Dane w jednym miejscu", d: "Bez SMS-ów i WhatsAppa." },
          ].map((f) => (
            <div key={f.t} className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">{f.t}</div>
                <div className="text-xs text-muted-foreground">{f.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* For whom */}
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Dla kogo</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Finansujemy tam, gdzie banki mówią „nie"
          </h2>
          <p className="mt-3 text-muted-foreground">
            Pomagamy klientom z trudną historią kredytową, świeżą działalnością lub nietypową
            sytuacją prawną. Liczy się dla nas przede wszystkim wartość zabezpieczenia.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              t: "Zły BIK / brak zdolności",
              d: "Decyduje wartość nieruchomości, nie scoring bankowy. Każda sprawa analizowana indywidualnie.",
            },
            {
              t: "Komornik lub hipoteka",
              d: "Komornik i istniejąca hipoteka nie przekreślają sprawy. Patrzymy na całość zabezpieczenia.",
            },
            {
              t: "Nowa działalność",
              d: "Finansujemy DG nawet od 1. dnia po założeniu. Wniosek możesz złożyć też jako osoba prywatna.",
            },
            {
              t: "Pilna gotówka na firmę",
              d: "Wypłata po formalnościach u notariusza. Szybkie tempo, prosty proces.",
            },
            {
              t: "Konsolidacja zobowiązań",
              d: "Spłata kilku zobowiązań jedną pożyczką zabezpieczoną na nieruchomości.",
            },
            {
              t: "Inwestycja / projekt",
              d: "Zakup nieruchomości, remont, rozwój firmy. Kwoty od 20 tys. do 1 mln zł.",
            },
          ].map((c) => (
            <div
              key={c.t}
              className="group rounded-xl border border-border bg-card p-5 transition hover:border-accent/60 hover:shadow-md"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-accent" />
                <h3 className="font-bold text-foreground">{c.t}</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Property types */}
      <section className="border-y border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Zabezpieczenie</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground md:text-4xl">
              Akceptujemy różne typy nieruchomości
            </h2>
            <p className="mt-3 text-muted-foreground">
              Nieruchomości na terenie Polski. Preferujemy mieszkaniówkę w miastach powyżej 20 000
              mieszkańców. Działki i grunty rolne — analiza indywidualna.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Home, t: "Mieszkanie" },
              { icon: Building2, t: "Dom / dom w budowie" },
              { icon: Building2, t: "Lokal użytkowy / usługowy" },
              { icon: TreePine, t: "Działka / grunt rolny" },
            ].map((p) => (
              <div
                key={p.t}
                className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5"
              >
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent/10 text-accent">
                  <p.icon className="h-5 w-5" />
                </div>
                <div className="text-sm font-bold text-foreground">{p.t}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Jak to działa</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Cztery proste kroki do decyzji
          </h2>
        </div>
        <ol className="mt-10 grid gap-5 md:grid-cols-4">
          {[
            { n: "1", t: "Wypełnij wniosek", d: "Zajmie ci to dosłownie minutę. Bez zobowiązań." },
            { n: "2", t: "Dodaj dokumenty", d: "Numer KW i zdjęcia nieruchomości — wszystko w formularzu." },
            { n: "3", t: "Decyzja do 48 h", d: "Wniosek trafia od razu do naszych inwestorów." },
            { n: "4", t: "Formalności u notariusza", d: "Po pozytywnej decyzji — hipoteka i wypłata środków." },
          ].map((s) => (
            <li key={s.n} className="relative rounded-xl border border-border bg-card p-5">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground text-base font-extrabold">
                {s.n}
              </div>
              <h3 className="mt-3 font-bold text-foreground">{s.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Form (CTA) */}
      <section id="wniosek" className="border-y border-border bg-gradient-to-b from-secondary/40 to-background scroll-mt-20">
        <div className="mx-auto max-w-5xl px-4 py-14 md:px-6 md:py-20">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Wniosek online</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground md:text-4xl">
              Złóż wniosek — to zajmie minutę
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Złożenie wniosku jest darmowe. Nie pobieramy opłaty za rozpatrzenie. Decyzja do 48 h
              mailem.
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
            <iframe
              src="/embed/wniosek"
              title="Wniosek o pożyczkę"
              className="h-[1200px] w-full md:h-[1100px]"
              loading="lazy"
            />
          </div>

          <div className="mt-6 flex flex-col items-center justify-center gap-4 text-sm text-muted-foreground md:flex-row">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" /> Dane przesyłane bezpiecznie
            </div>
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-accent" /> Bez zobowiązań
            </div>
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-accent" /> Darmowa analiza
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-4 py-14 md:px-6 md:py-20">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-accent">FAQ</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Najczęstsze pytania
          </h2>
        </div>

        <Accordion type="single" collapsible className="mt-8 rounded-xl border border-border bg-card px-4 md:px-6">
          {[
            {
              q: "Ile mogę pożyczyć?",
              a: "Od 20 000 zł do 1 000 000 zł, ale nie przekraczamy połowy wartości nieruchomości. Ostateczna kwota zależy od analizy nieruchomości i decyzji inwestorów.",
            },
            {
              q: "Na jaki okres mogę wziąć pożyczkę?",
              a: "Od 6 miesięcy do 72 miesięcy. Okres zależy od konkretnej sprawy, kwoty, zabezpieczenia i decyzji inwestorów.",
            },
            {
              q: "Ile kosztuje pożyczka?",
              a: "Orientacyjnie koszty najczęściej mieszczą się między około 1,79% a 3% miesięcznie. To nie jest jeszcze oferta — wszystko zależy od nieruchomości, kwoty, lokalizacji, obciążeń i decyzji inwestorów. Złożenie wniosku jest darmowe.",
            },
            {
              q: "Czy wniosek kosztuje?",
              a: "Nie. Złożenie wniosku jest całkowicie darmowe. Nie pobieramy opłat za rozpatrzenie wniosku.",
            },
            {
              q: "Kiedy będzie decyzja?",
              a: "Wniosek zostanie rozpatrzony do 48 godzin. Jeśli decyzja będzie pozytywna, informacja przyjdzie mailowo.",
            },
            {
              q: "Czy mogę spłacić pożyczkę wcześniej?",
              a: "Tak, zawsze jest możliwość wcześniejszej spłaty. Szczegóły określane są w dokumentach umowy.",
            },
            {
              q: "Czy muszę mieć działalność gospodarczą?",
              a: "Do złożenia wniosku nie musisz mieć działalności gospodarczej. Natomiast sama pożyczka jest udzielana osobom prowadzącym DG. Możemy finansować nawet nowe działalności, już od pierwszego dnia po założeniu.",
            },
            {
              q: "Czy zły BIK lub komornik mnie dyskwalifikują?",
              a: "Nie. W pożyczce zabezpieczonej na nieruchomości kluczowa jest sama nieruchomość. Komornik czy zły BIK nie przekreślają sprawy — analizujemy indywidualnie.",
            },
            {
              q: "Czy potrzebny jest operat szacunkowy?",
              a: "Nie. Operat szacunkowy nie jest wymagany na etapie wniosku. Jeśli masz operat, możesz go dodać jako dokument dodatkowy.",
            },
            {
              q: "Czy nieruchomość może być za granicą?",
              a: "Nie. Akceptujemy wyłącznie nieruchomości położone na terenie Polski.",
            },
            {
              q: "Czy muszę być właścicielem nieruchomości?",
              a: "Nie musisz być właścicielem, ale właściciel nieruchomości musi przystąpić do umowy.",
            },
            {
              q: "Czy mogę wysłać dokumenty SMS-em lub mailem?",
              a: "Prosimy, żeby nie wysyłać dokumentów poza formularzem. Najlepiej dodać je do wniosku na financeyou.pl — wszystko trafia w jedno miejsce, a sprawa od razu idzie do inwestorów.",
            },
            {
              q: "Czy wypełnienie wniosku oznacza utratę nieruchomości?",
              a: "Nie. Samo złożenie wniosku i analiza nie powodują utraty nieruchomości. Zabezpieczeniem jest hipoteka ustanawiana u notariusza po pozytywnej decyzji.",
            },
          ].map((f, i) => (
            <AccordionItem key={i} value={`q-${i}`} className="border-border">
              <AccordionTrigger className="text-left text-base font-semibold text-foreground">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Contact CTA */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-2 md:px-6 md:py-16">
          <div>
            <h2 className="text-2xl font-extrabold md:text-3xl">Wolisz porozmawiać?</h2>
            <p className="mt-3 max-w-md text-white/80">
              Zadzwoń lub napisz — odpowiemy na pytania, doradzimy, czy złożenie wniosku w twojej
              sytuacji ma sens.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <a
              href={`tel:${PHONE_HREF}`}
              className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-4 transition hover:bg-white/10"
            >
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-white/60">Telefon</div>
                <div className="text-lg font-bold">{PHONE_DISPLAY}</div>
              </div>
            </a>
            <a
              href={`mailto:${EMAIL}`}
              className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-4 transition hover:bg-white/10"
            >
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-white/60">E-mail</div>
                <div className="text-lg font-bold">{EMAIL}</div>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:px-6">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground text-xs">
              FY
            </div>
            Finance You
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a href={`tel:${PHONE_HREF}`} className="hover:text-accent">{PHONE_DISPLAY}</a>
            <a href={`mailto:${EMAIL}`} className="hover:text-accent">{EMAIL}</a>
            <Link to="/logowanie" className="hover:text-accent">Logowanie</Link>
          </div>
          <div className="text-xs">© {new Date().getFullYear()} Finance You</div>
        </div>
      </footer>

      {/* ElevenLabs Convai widget */}
      <ConvaiWidget agent-id="agent_1701kt4q868ben4vpcbgzga0vmy5" />
    </div>
  );
}
