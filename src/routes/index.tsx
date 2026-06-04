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
import { Phone, ArrowRight } from "lucide-react";
import {
  IconVault,
  IconClock,
  IconLtv,
  IconBolt,
  IconShield,
  IconDoc,
  IconHandCoins,
  IconLock,
  IconCalc,
  IconApartment,
  IconHouse,
  IconShop,
  IconLand,
  IconPhone,
  IconMail,
  IconCheck,
} from "@/components/brand-icons";
import { QuickCalculator } from "@/components/landing/quick-calculator";
import { AuroraText } from "@/components/ui/aurora-text";
import { FinanceYouLogo } from "@/components/finance-you-logo";
import { Particles } from "@/components/ui/particles";
import { BorderBeam } from "@/components/ui/border-beam";
import { BlurFade } from "@/components/ui/blur-fade";
import { Marquee } from "@/components/ui/marquee";

import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";

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
          <Link to="/" className="shrink-0">
            <FinanceYouLogo variant="light" />
          </Link>
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

      {/* Hero — nowoczesne tło: gradient mesh + soft orbs */}
      <section className="relative overflow-hidden border-b border-border bg-[oklch(0.16_0.09_265)] text-primary-foreground">
        {/* Aurora mesh */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90 [background-image:radial-gradient(ellipse_70%_55%_at_15%_5%,oklch(0.45_0.22_265_/_0.55),transparent_60%),radial-gradient(ellipse_60%_45%_at_85%_15%,oklch(0.65_0.13_235_/_0.45),transparent_65%),radial-gradient(ellipse_70%_50%_at_50%_100%,oklch(0.78_0.18_85_/_0.18),transparent_65%)]"
        />
        {/* Subtelne dot pattern - bardzo cichy */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:32px_32px]"
        />
        {/* Animated soft orbs */}
        <div aria-hidden className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-[oklch(0.55_0.22_278)]/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-[oklch(0.78_0.18_85)]/15 blur-3xl" />
        {/* Premium particles — subtle, nowoczesny "stardust" */}
        <Particles className="absolute inset-0" quantity={90} staticity={40} ease={60} color="#fde68a" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1.15fr_1fr] md:px-6 md:py-24">
          <div>
            <BlurFade delay={0.05} inView>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
                <IconBolt size={16} />
                <AnimatedShinyText className="inline-flex items-center justify-center !text-white/90 !mx-0">
                  Decyzja w 48 godzin
                </AnimatedShinyText>
              </div>
            </BlurFade>
            <BlurFade delay={0.15} inView>
              <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
                Pożyczka pod zastaw{" "}
                <AuroraText
                  className="block"
                  colors={["#fbbf24", "#f59e0b", "#a78bfa", "#38bdf8", "#fbbf24"]}
                >nieruchomości</AuroraText>
                <span className="mt-2 block text-2xl font-bold text-white/85 md:text-3xl">
                  od 20 000 do 1 000 000 zł
                </span>
              </h1>
            </BlurFade>
            <BlurFade delay={0.3} inView>
              <p className="mt-5 max-w-xl text-base text-white/80 md:text-lg">
                Prywatne finansowanie dla osób prowadzących działalność gospodarczą.
                Zły BIK i istniejąca hipoteka — analizujemy indywidualnie.
                Liczy się <strong className="text-white">wartość zabezpieczenia</strong>, nie scoring banku.
              </p>
            </BlurFade>
            <BlurFade delay={0.4} inView>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  onClick={() => {
                    const el = document.getElementById("kalkulator");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="group bg-accent text-accent-foreground shadow-xl shadow-accent/30 hover:bg-accent/90"
                >
                  <IconCalc className="mr-2 h-4 w-4" />
                  Sprawdź warunki pożyczki
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
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
            </BlurFade>
            <BlurFade delay={0.5} inView>
              <ul className="mt-7 grid gap-2 text-sm text-white/85 sm:grid-cols-2">
                {[
                  "Złożenie wniosku darmowe",
                  "Decyzja do 48 godzin",
                  "Bez opłat za rozpatrzenie",
                  "Nowa działalność — od 1. dnia",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <IconCheck className="h-4 w-4 text-accent" />
                    {t}
                  </li>
                ))}
              </ul>
            </BlurFade>
          </div>

          <div className="relative">
            <div className="absolute inset-0 -rotate-3 rounded-3xl bg-gradient-to-br from-accent/30 to-[oklch(0.65_0.13_235)]/30 blur-2xl" />
            <div className="relative grid grid-cols-2 gap-3 overflow-hidden rounded-3xl border border-white/15 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-xl md:p-6">
              <BorderBeam size={140} duration={9} colorFrom="#fbbf24" colorTo="#a78bfa" borderWidth={1.5} />
              {[
                { v: "20 tys.–1 mln", l: "zł kwota", icon: IconVault },
                { v: "6 – 72", l: "mies. okres", icon: IconClock },
                { v: "do 50%", l: "wartości LTV", icon: IconLtv },
                { v: "48 h", l: "decyzja", icon: IconBolt },
              ].map((s) => (
                <div
                  key={s.l}
                  className="group rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-accent/40"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/95 shadow-md ring-1 ring-white/40">
                    <s.icon size={22} />
                  </div>
                  <div className="mt-3 text-2xl font-extrabold text-white md:text-3xl">{s.v}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wider text-white/60">{s.l}</div>
                </div>
              ))}
              <div className="col-span-2 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-accent/20 to-[oklch(0.65_0.13_235)]/20 p-4 ring-1 ring-white/15">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/95 shadow-md">
                  <IconShield size={24} />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/85">
                    Bezpieczna hipoteka u notariusza
                  </div>
                  <div className="mt-1 text-sm text-white/85">
                    Każda umowa zabezpieczona aktem notarialnym i wpisem do księgi wieczystej.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee — PDF-inspired benefits */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 py-4">
        <Marquee pauseOnHover className="[--duration:40s]">
          {[
            { icon: IconShield, t: "Hipoteka u notariusza" },
            { icon: IconBolt, t: "Decyzja w 48 godzin" },
            { icon: IconHandCoins, t: "Złożenie wniosku darmowe" },
            { icon: IconVault, t: "Bez opłat za rozpatrzenie" },
            { icon: IconLtv, t: "Do 50% wartości nieruchomości" },
            { icon: IconLock, t: "Wszystko w jednym miejscu" },
            { icon: IconDoc, t: "Sprawdzone konstrukcje prawne" },
            { icon: IconClock, t: "Od 6 do 72 miesięcy" },
            { icon: IconCheck, t: "Zły BIK — analizujemy" },
            { icon: IconHouse, t: "Mieszkania, domy, lokale, działki" },
          ].map((it) => (
            <div key={it.t} className="mx-6 flex items-center gap-3 text-sm font-semibold text-foreground/80">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-card ring-1 ring-border">
                <it.icon size={16} />
              </span>
              {it.t}
              <span className="text-accent">•</span>
            </div>
          ))}
        </Marquee>
      </section>

      {/* Trust strip */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-4 md:px-6">
          {[
            { icon: IconHandCoins, t: "Złożenie wniosku darmowe", d: "Bez opłat za rozpatrzenie." },
            { icon: IconLtv, t: "Do 50% wartości", d: "LTV liczone od wartości rynkowej." },
            { icon: IconLock, t: "Wszystko w jednym miejscu", d: "Bez SMS-ów i WhatsAppa — jeden formularz." },
            { icon: IconDoc, t: "Hipoteka u notariusza", d: "Akt notarialny i wpis do KW." },
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
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Krok 1 z 4</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-5xl">
            Sprawdź warunki
            <span className="bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] bg-clip-text text-transparent"> pożyczki pod zastaw</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Wybierz kwotę, okres i typ zabezpieczenia. W kolejnych krokach ustalimy z Tobą indywidualne warunki — ratę dopasowaną do Twojego budżetu.
          </p>
        </div>
        <div className="relative mt-10 overflow-hidden rounded-3xl">
          <BorderBeam size={220} duration={11} colorFrom="#fbbf24" colorTo="#38bdf8" borderWidth={1.5} />
          <QuickCalculator />
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
                <IconCalc className="mr-2 h-4 w-4" />
                Sprawdź swoją ratę
              </a>
            </Button>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { t: "Zły BIK / brak zdolności", d: "Decyduje wartość nieruchomości, nie scoring bankowy." },
              { t: "Istniejąca hipoteka", d: "Druga hipoteka nie przekreśla sprawy — analizujemy indywidualnie." },
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
                  <IconCheck className="h-5 w-5 text-accent" />
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
              { icon: IconApartment, t: "Mieszkanie" },
              { icon: IconHouse, t: "Dom / dom w budowie" },
              { icon: IconShop, t: "Lokal użytkowy / usługowy" },
              { icon: IconLand, t: "Działka / grunt rolny" },
            ].map((p, i) => (
              <BlurFade key={p.t} delay={0.1 + i * 0.08} inView>
                <div className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6 transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-xl">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-accent/15 to-[oklch(0.65_0.13_235)]/15 text-accent ring-1 ring-accent/20 transition group-hover:scale-110 group-hover:rotate-3">
                    <p.icon className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-bold text-foreground">{p.t}</div>
                </div>
              </BlurFade>
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
                <IconCalc className="mr-2 h-4 w-4" />
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
              <BlurFade key={s.n} delay={0.1 + i * 0.1} inView direction="up">
                <li className="relative rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.15_0.09_265)] text-primary-foreground text-base font-extrabold shadow-md">
                    {s.n}
                  </div>
                  <h3 className="mt-4 font-bold text-foreground">{s.t}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
                  {i < arr.length - 1 && (
                    <ArrowRight className="absolute right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground/50 md:block" />
                  )}
                </li>
              </BlurFade>
            ))}
          </ol>
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
                q: "Czy zły BIK mnie dyskwalifikuje?",
                a: "Nie. W pożyczce zabezpieczonej na nieruchomości kluczowa jest sama nieruchomość — analizujemy każdą sprawę indywidualnie.",
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
                <IconCalc className="mr-2 h-4 w-4" />
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
                <IconCalc className="mr-2 h-4 w-4" />
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
                <IconMail className="h-5 w-5" />
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
          <FinanceYouLogo variant="light" size="sm" />

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
            <IconCalc className="mr-2 h-4 w-4" />
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
