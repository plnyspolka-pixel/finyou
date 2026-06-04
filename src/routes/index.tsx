import { createFileRoute, Link } from "@tanstack/react-router";
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
  Calculator,
  ArrowRight,
  Star,
  TrendingUp,
} from "lucide-react";
import { QuickCalculator } from "@/components/landing/quick-calculator";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { BorderBeam } from "@/components/ui/border-beam";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { AuroraText } from "@/components/ui/aurora-text";
import { Meteors } from "@/components/ui/meteors";
import { cn } from "@/lib/utils";

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
  const { user, roles } = useAuth();
  const panelHref = user ? defaultPathForRoles(roles) : null;

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

  return (
    <div className="min-h-screen bg-background font-[Montserrat] pb-16 md:pb-0">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-primary to-[oklch(0.15_0.09_265)] text-primary-foreground text-sm shadow-md">
              FY
            </div>
            <span className="text-base md:text-lg">Finance You</span>
          </div>
          <nav className="hidden items-center gap-6 lg:flex">
            <a href="#kalkulator" className="text-sm font-medium text-muted-foreground hover:text-foreground">Kalkulator</a>
            <a href="#jak-to-dziala" className="text-sm font-medium text-muted-foreground hover:text-foreground">Jak to działa</a>
            <a href="#faq" className="text-sm font-medium text-muted-foreground hover:text-foreground">FAQ</a>
          </nav>
          <div className="hidden items-center gap-4 md:flex">
            <a
              href={`tel:${PHONE_HREF}`}
              className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-accent"
            >
              <Phone className="h-4 w-4" />
              {PHONE_DISPLAY}
            </a>
          </div>
          <Button asChild size="sm" className="md:size-default bg-accent text-accent-foreground hover:bg-accent/90">
            {panelHref ? <Link to={panelHref}>Panel</Link> : <a href="#kalkulator">Sprawdź ratę</a>}
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary via-primary to-[oklch(0.13_0.09_265)] text-primary-foreground">
        {/* Animated grid (MagicUI) */}
        <AnimatedGridPattern
          numSquares={40}
          maxOpacity={0.15}
          duration={3}
          className={cn(
            "[mask-image:radial-gradient(ellipse_at_center,white_30%,transparent_75%)]",
            "inset-0 h-full w-full skew-y-12 text-white/40"
          )}
        />
        {/* Meteors */}
        <Meteors number={20} />
        {/* Glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_20%_10%,oklch(0.40_0.25_268_/0.6),transparent_55%),radial-gradient(circle_at_85%_85%,oklch(0.65_0.13_235_/0.45),transparent_55%)]"
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1.15fr_1fr] md:px-6 md:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
              <Zap className="h-3.5 w-3.5 text-accent" />
              Decyzja w 48 godzin
            </div>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              Pożyczka pod zastaw{" "}
              <AuroraText className="block">nieruchomości</AuroraText>
              <span className="mt-2 block text-2xl font-bold text-white/85 md:text-3xl">
                od 20 000 do 1 000 000 zł
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-white/80 md:text-lg">
              Prywatne finansowanie dla osób prowadzących działalność gospodarczą.
              Zły BIK, komornik, istniejąca hipoteka — analizujemy indywidualnie.
              Liczy się <strong className="text-white">wartość zabezpieczenia</strong>, nie scoring banku.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="group bg-accent text-accent-foreground shadow-xl shadow-accent/30 hover:bg-accent/90"
              >
                <a href="#kalkulator">
                  <Calculator className="mr-2 h-4 w-4" />
                  Wylicz ratę w 5 sekund
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <a href={`tel:${PHONE_HREF}`}>
                  <Phone className="mr-2 h-4 w-4" />
                  {PHONE_DISPLAY}
                </a>
              </Button>
            </div>
            <ul className="mt-7 grid gap-2 text-sm text-white/85 sm:grid-cols-2">
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

          {/* Stats glass card */}
          <div className="relative">
            <div className="absolute inset-0 -rotate-3 rounded-3xl bg-gradient-to-br from-accent/30 to-[oklch(0.65_0.13_235)]/30 blur-2xl" />
            <div className="relative grid grid-cols-2 gap-3 overflow-hidden rounded-3xl border border-white/15 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-xl md:p-6">
              <BorderBeam size={250} duration={12} colorFrom="oklch(0.78_0.18_85)" colorTo="oklch(0.65_0.13_235)" />
              {[
                { v: "20 tys.–1 mln", l: "zł kwota", icon: Wallet },
                { v: "6 – 72", l: "mies. okres", icon: Clock },
                { v: "do 50%", l: "wartości LTV", icon: TrendingUp },
                { v: "48 h", l: "decyzja", icon: Zap },
              ].map((s) => (
                <div
                  key={s.l}
                  className="group rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-accent/40"
                >
                  <s.icon className="h-5 w-5 text-accent" />
                  <div className="mt-3 text-2xl font-extrabold text-white md:text-3xl">{s.v}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wider text-white/60">{s.l}</div>
                </div>
              ))}
              <div className="col-span-2 rounded-2xl bg-gradient-to-br from-accent/20 to-[oklch(0.65_0.13_235)]/20 p-4 ring-1 ring-white/15">
                <div className="flex items-center gap-2 text-xs text-white/80">
                  <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                  <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                  <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                  <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                  <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                  <span className="font-semibold text-white">5.0</span>
                  <span className="text-white/60">— opinie klientów</span>
                </div>
                <div className="mt-2 text-sm text-white/85">
                  „Wszystko trafia w jedno miejsce. Decyzja przyszła w dobę."
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-4 md:px-6">
          {[
            { icon: HandCoins, t: "Darmowy wniosek", d: "Bez opłat za rozpatrzenie." },
            { icon: Clock, t: "Decyzja 48 h", d: "Bez kolejek i pośredników." },
            { icon: ShieldCheck, t: "Bezpiecznie", d: "Formalności u notariusza." },
            { icon: Lock, t: "Wszystko w jednym miejscu", d: "Bez SMS-ów i WhatsAppa." },
          ].map((f) => (
            <div key={f.t} className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 text-primary ring-1 ring-border">
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

      {/* KALKULATOR — main conversion tool */}
      <section className="relative mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Krok 1</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-5xl">
            Sprawdź ratę
            <span className="bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] bg-clip-text text-transparent"> bez logowania</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Przesuń suwaki — od razu zobaczysz orientacyjną ratę, całkowity koszt i sumę spłat.
            Bez podawania danych osobowych.
          </p>
        </div>
        <div className="mt-10">
          <QuickCalculator ctaHref="#wniosek" />
        </div>
      </section>

      {/* For whom */}
      <section className="border-t border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-widest text-accent">Dla kogo</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-5xl">
                Finansujemy tam, gdzie banki mówią „nie"
              </h2>
              <p className="mt-3 text-muted-foreground">
                Trudna historia kredytowa, świeża działalność, nietypowa sytuacja prawna.
                Liczy się dla nas przede wszystkim wartość zabezpieczenia.
              </p>
            </div>
            <Button asChild variant="outline" className="border-primary/30 bg-card">
              <a href="#kalkulator">
                <Calculator className="mr-2 h-4 w-4" />
                Sprawdź swoją ratę
              </a>
            </Button>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { t: "Zły BIK / brak zdolności", d: "Decyduje wartość nieruchomości, nie scoring bankowy." },
              { t: "Komornik lub hipoteka", d: "Komornik i istniejąca hipoteka nie przekreślają sprawy." },
              { t: "Nowa działalność", d: "Finansujemy DG nawet od 1. dnia po założeniu." },
              { t: "Pilna gotówka na firmę", d: "Wypłata po formalnościach u notariusza." },
              { t: "Konsolidacja zobowiązań", d: "Spłata kilku zobowiązań jedną pożyczką." },
              { t: "Inwestycja / projekt", d: "Zakup nieruchomości, remont, rozwój firmy." },
            ].map((c) => (
              <div
                key={c.t}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-xl"
              >
                <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 transition group-hover:opacity-100" />
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                  <h3 className="font-bold text-foreground">{c.t}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Property types */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Zabezpieczenie</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-5xl">
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
                className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6 transition hover:border-accent/60"
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-accent/15 to-[oklch(0.65_0.13_235)]/15 text-accent ring-1 ring-accent/20">
                  <p.icon className="h-5 w-5" />
                </div>
                <div className="text-sm font-bold text-foreground">{p.t}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="jak-to-dziala" className="border-t border-border bg-secondary/40 scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-widest text-accent">Jak to działa</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-5xl">
                Cztery kroki do gotówki
              </h2>
            </div>
            <Button asChild variant="outline" className="border-primary/30 bg-card">
              <a href="#kalkulator">
                <Calculator className="mr-2 h-4 w-4" />
                Zacznij od kalkulatora
              </a>
            </Button>
          </div>

          <ol className="mt-12 grid gap-5 md:grid-cols-4">
            {[
              { n: "1", t: "Wylicz ratę", d: "Suwaki, 5 sekund, bez logowania." },
              { n: "2", t: "Złóż wniosek", d: "Numer KW i zdjęcia nieruchomości w formularzu." },
              { n: "3", t: "Decyzja do 48 h", d: "Wniosek trafia od razu do inwestorów." },
              { n: "4", t: "Wypłata", d: "Hipoteka u notariusza — i środki na koncie." },
            ].map((s, i, arr) => (
              <li
                key={s.n}
                className="relative rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.15_0.09_265)] text-primary-foreground text-base font-extrabold shadow-md">
                  {s.n}
                </div>
                <h3 className="mt-4 font-bold text-foreground">{s.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
                {i < arr.length - 1 && (
                  <ArrowRight className="absolute right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground/50 md:block" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Form (CTA) */}
      <section
        id="wniosek"
        className="relative scroll-mt-20 border-t border-border bg-gradient-to-b from-background to-secondary/40"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
        />
        <div className="mx-auto max-w-5xl px-4 py-16 md:px-6 md:py-24">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Krok 2</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-5xl">
              Złóż wniosek — to zajmie minutę
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Złożenie jest darmowe. Nie pobieramy opłaty za rozpatrzenie. Decyzja do 48 h mailem.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
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
      <section id="faq" className="scroll-mt-20 border-t border-border">
        <div className="mx-auto max-w-4xl px-4 py-16 md:px-6 md:py-24">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-accent">FAQ</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-5xl">
              Najczęstsze pytania
            </h2>
          </div>

          <Accordion type="single" collapsible className="mt-10 rounded-2xl border border-border bg-card px-4 shadow-sm md:px-6">
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

          <div className="mt-10 text-center">
            <Button asChild size="lg" className="bg-accent text-accent-foreground shadow-lg shadow-accent/20 hover:bg-accent/90">
              <a href="#kalkulator">
                <Calculator className="mr-2 h-4 w-4" />
                Wróć do kalkulatora
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-[oklch(0.13_0.09_265)] text-primary-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_15%_30%,oklch(0.40_0.25_268_/0.5),transparent_55%),radial-gradient(circle_at_85%_70%,oklch(0.65_0.13_235_/0.4),transparent_55%)]"
        />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2 md:px-6 md:py-20">
          <div>
            <h2 className="text-3xl font-extrabold md:text-4xl">Wolisz porozmawiać?</h2>
            <p className="mt-3 max-w-md text-white/80">
              Zadzwoń lub napisz — odpowiemy na pytania, doradzimy, czy złożenie wniosku w twojej
              sytuacji ma sens.
            </p>
            <Button asChild size="lg" className="mt-6 bg-accent text-accent-foreground hover:bg-accent/90">
              <a href="#kalkulator">
                <Calculator className="mr-2 h-4 w-4" />
                Najpierw sprawdź ratę
              </a>
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            <a
              href={`tel:${PHONE_HREF}`}
              className="group flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur transition hover:bg-white/10"
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-foreground shadow-lg shadow-accent/30">
                <Phone className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-xs uppercase tracking-wider text-white/60">Telefon</div>
                <div className="text-lg font-bold">{PHONE_DISPLAY}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-white/60 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href={`mailto:${EMAIL}`}
              className="group flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur transition hover:bg-white/10"
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-foreground shadow-lg shadow-accent/30">
                <Mail className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-xs uppercase tracking-wider text-white/60">E-mail</div>
                <div className="text-lg font-bold">{EMAIL}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-white/60 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:px-6">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-primary to-[oklch(0.15_0.09_265)] text-primary-foreground text-xs">
              FY
            </div>
            Finance You
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href={`tel:${PHONE_HREF}`} className="hover:text-foreground">{PHONE_DISPLAY}</a>
            <a href={`mailto:${EMAIL}`} className="hover:text-foreground">{EMAIL}</a>
            <span>© {new Date().getFullYear()} Finance You</span>
          </div>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur md:hidden">
        <Button
          asChild
          size="lg"
          className="w-full bg-accent text-accent-foreground shadow-lg shadow-accent/30 hover:bg-accent/90"
        >
          <a href="#kalkulator">
            <Calculator className="mr-2 h-4 w-4" />
            Wylicz ratę
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>

      {/* ElevenLabs widget */}
      <ConvaiWidget agent-id="agent_1701kt4q868ben4vpcbgzga0vmy5" />
    </div>
  );
}
