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
  BgMoney,
  BgPeriod,
  BgScale,
  BgRocket,
} from "@/components/brand-icons";
import { QuickCalculator } from "@/components/landing/quick-calculator";
import { LinearLoanApplication } from "@/components/loan-application-variants";
import { PropertyTypesShowcase } from "@/components/landing/property-types-showcase";
import { AuroraText } from "@/components/ui/aurora-text";
import { FinanceYouLogo } from "@/components/finance-you-logo";
import { Particles } from "@/components/ui/particles";
import { BorderBeam } from "@/components/ui/border-beam";
import { BlurFade } from "@/components/ui/blur-fade";

import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";

const PHONE_DISPLAY = "+48 732 059 898";
const PHONE_HREF = "+48732059898";
const EMAIL = "kontakt@financeyou.pl";

const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: "Ile mogę pożyczyć?", a: "Do 1 000 000 zł, ale nie przekraczamy połowy wartości nieruchomości. Ostateczna kwota zależy od analizy nieruchomości i decyzji inwestorów." },
  { q: "Na jaki okres mogę wziąć pożyczkę?", a: "Od 6 miesięcy do 72 miesięcy. Okres zależy od konkretnej sprawy, kwoty, zabezpieczenia i decyzji inwestorów." },
  { q: "Ile kosztuje pożyczka?", a: "Orientacyjnie koszty najczęściej mieszczą się między około 1,79% a 3% miesięcznie. To nie jest jeszcze oferta — wszystko zależy od nieruchomości, kwoty, lokalizacji, obciążeń i decyzji inwestorów. Złożenie wniosku jest darmowe." },
  { q: "Czy wniosek kosztuje?", a: "Nie. Złożenie wniosku jest całkowicie darmowe. Nie pobieramy opłat za rozpatrzenie wniosku." },
  { q: "Kiedy będzie decyzja?", a: "Wniosek zostanie rozpatrzony do 24 godzin. Jeśli decyzja będzie pozytywna, informacja przyjdzie mailowo." },
  { q: "Czy mogę spłacić pożyczkę wcześniej?", a: "Tak, zawsze jest możliwość wcześniejszej spłaty. Szczegóły określane są w dokumentach umowy." },
  { q: "Czy zły BIK mnie dyskwalifikuje?", a: "Nie. W pożyczce zabezpieczonej na nieruchomości kluczowa jest sama nieruchomość — analizujemy każdą sprawę indywidualnie." },
  { q: "Czy potrzebny jest operat szacunkowy?", a: "Nie. Operat szacunkowy nie jest wymagany na etapie wniosku. Jeśli masz operat, możesz go dodać jako dokument dodatkowy." },
  { q: "Czy nieruchomość może być za granicą?", a: "Nie. Akceptujemy wyłącznie nieruchomości położone na terenie Polski." },
  { q: "Czy muszę być właścicielem nieruchomości?", a: "Nie musisz być właścicielem, ale właściciel nieruchomości musi przystąpić do umowy." },
  { q: "Czy mogę wysłać dokumenty SMS-em lub mailem?", a: "Prosimy, żeby nie wysyłać dokumentów poza formularzem. Najlepiej dodać je do wniosku na financeyou.pl — wszystko trafia w jedno miejsce, a sprawa od razu idzie do inwestorów." },
  { q: "Co jest zabezpieczeniem pożyczki?", a: "Zabezpieczeniem pożyczki jest hipoteka ustanawiana na nieruchomości oraz oświadczenie o poddaniu się egzekucji w trybie art. 777 Kodeksu postępowania cywilnego, składane w formie aktu notarialnego." },
  { q: "Czy wypełnienie wniosku oznacza utratę nieruchomości?", a: "Nie. Samo złożenie wniosku i analiza nie powodują utraty nieruchomości. Zabezpieczeniem jest hipoteka ustanawiana u notariusza po pozytywnej decyzji." },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pożyczka pod zastaw nieruchomości — szybka decyzja, do 1 mln zł | Finance You" },
      {
        name: "description",
        content:
          "Prywatna pożyczka pod zastaw nieruchomości do 1 000 000 zł. Decyzja do 24 h, bez zbędnych procedur bankowych. Zabezpieczenie na nieruchomości w Polsce.",
      },
      { property: "og:title", content: "Pożyczka pod zastaw nieruchomości — Finance You" },
      {
        property: "og:description",
        content: "Decyzja do 24 h. Do 1 000 000 zł. Bez zbędnych procedur bankowych.",
      },
      { property: "og:url", content: "https://financeyou.pl/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Finance You",
          url: "https://financeyou.pl",
          logo: "https://financeyou.pl/favicon.png",
          email: EMAIL,
          telephone: PHONE_HREF,
          areaServed: "PL",
          description:
            "Prywatne pożyczki pod zastaw nieruchomości w Polsce — decyzja w 24 godziny, do 1 000 000 zł.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Finance You",
          url: "https://financeyou.pl",
          inLanguage: "pl-PL",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ_ITEMS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
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
    <div className="min-h-screen overflow-x-hidden bg-background font-[Montserrat] pb-16 md:pb-0">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link to="/" className="shrink-0">
            <FinanceYouLogo variant="light" size="lg" />
          </Link>
          <nav className="hidden items-center gap-6 lg:flex">
            <a href="#kalkulator" className="text-sm font-medium text-muted-foreground hover:text-foreground">Kalkulator</a>
            <a href="#jak-to-dziala" className="text-sm font-medium text-muted-foreground hover:text-foreground">Jak to działa</a>
            <a href="#faq" className="text-sm font-medium text-muted-foreground hover:text-foreground">FAQ</a>
            <Link to="/blog" className="text-sm font-medium text-muted-foreground hover:text-foreground">Blog</Link>
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
          <Button asChild size="sm" className="md:size-default bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] text-accent-foreground shadow-lg shadow-accent/30 hover:shadow-xl hover:shadow-accent/40 hover:brightness-110 transition">
            {panelHref ? <Link to={panelHref}>Panel</Link> : <a href="#kalkulator">Sprawdź ratę</a>}
          </Button>
        </div>
      </header>

      {/* Hero z wbudowanym wnioskiem — wniosek jest GŁÓWNYM elementem */}
      <section id="kalkulator" className="relative overflow-hidden border-b border-border bg-[oklch(0.16_0.09_265)] text-primary-foreground scroll-mt-20">
        {/* Aurora mesh */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90 [background-image:radial-gradient(ellipse_70%_55%_at_15%_5%,oklch(0.45_0.22_265_/_0.55),transparent_60%),radial-gradient(ellipse_60%_45%_at_85%_15%,oklch(0.65_0.13_235_/_0.45),transparent_65%),radial-gradient(ellipse_70%_50%_at_50%_100%,oklch(0.78_0.18_85_/_0.18),transparent_65%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:32px_32px]"
        />
        <div aria-hidden className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-[oklch(0.55_0.22_278)]/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-[oklch(0.78_0.18_85)]/15 blur-3xl" />
        <Particles className="absolute inset-0" quantity={90} staticity={40} ease={60} color="#fde68a" />

        <div className="relative mx-auto grid max-w-7xl items-start gap-10 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[1fr_minmax(0,640px)]">
          {/* Lewa kolumna — krótkie wprowadzenie */}
          <div className="lg:sticky lg:top-24">
            <BlurFade delay={0.05} inView>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
                <IconBolt size={16} />
                <AnimatedShinyText className="inline-flex items-center justify-center !text-white/90 !mx-0">
                  Decyzja w 24 godziny
                </AnimatedShinyText>
              </div>
            </BlurFade>
            <BlurFade delay={0.15} inView>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">
                Pożyczka pod zastaw{" "}
                <AuroraText
                  className="block"
                  colors={["#a78bfa", "#6366f1", "#38bdf8", "#22d3ee", "#a78bfa"]}
                >nieruchomości</AuroraText>
                <span className="mt-2 block text-xl font-bold text-white/85 md:text-2xl">
                  — do 1 mln zł, decyzja w 24 h
                </span>
              </h1>
            </BlurFade>
            <BlurFade delay={0.3} inView>
              <p className="mt-4 max-w-xl text-base text-white/80">
                Liczy się <strong className="text-white">wartość zabezpieczenia</strong>, nie scoring banku.
                Wypełnij wniosek obok — to zajmuje kilka minut, jest darmowe i bez zobowiązań.
              </p>
            </BlurFade>
            <BlurFade delay={0.4} inView>
              <ul className="mt-6 grid gap-2 text-sm text-white/85 sm:grid-cols-2">
                {[
                  "Złożenie wniosku darmowe",
                  "Decyzja do 24 godzin",
                  "Do 50% wartości nieruchomości",
                  "Bez procedur bankowych",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <IconCheck className="h-4 w-4 text-accent" />
                    {t}
                  </li>
                ))}
              </ul>
            </BlurFade>
            <BlurFade delay={0.5} inView>
              <div className="mt-6 hidden lg:block">
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
          </div>

          {/* Prawa kolumna — WNIOSEK jako główny element */}
          <div className="relative">
            <div className="absolute -inset-4 -rotate-1 rounded-3xl bg-gradient-to-br from-accent/25 to-[oklch(0.65_0.13_235)]/25 blur-2xl" />
            <div className="relative w-full max-w-full overflow-hidden rounded-3xl border border-white/15 bg-card text-foreground shadow-2xl">
              <BorderBeam size={260} duration={11} colorFrom="#fbbf24" colorTo="#38bdf8" borderWidth={1.5} />
              <LinearLoanApplication embedded />
            </div>
          </div>
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
              { t: "Pilna gotówka", d: "Wypłata po formalnościach u notariusza." },
              { t: "Konsolidacja zobowiązań", d: "Spłata kilku zobowiązań jedną pożyczką." },
              
              { t: "Bez procedur bankowych", d: "Mniej dokumentów, decyzja do 24 godzin." },
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
              Nieruchomości na terenie Polski. Każdą sprawę analizujemy indywidualnie.
            </p>
          </div>

          <PropertyTypesShowcase />

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
              { n: "1", t: "Wylicz ratę", d: "Suwaki, 5 sekund." },
              { n: "2", t: "Złóż wniosek", d: "Numer KW i zdjęcia nieruchomości w formularzu." },
              { n: "3", t: "Decyzja do 24 h", d: "Wniosek trafia od razu do inwestorów." },
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
            {FAQ_ITEMS.map((f, i) => (
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
            <Button asChild size="lg" className="bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] text-accent-foreground shadow-lg shadow-accent/30 hover:shadow-xl hover:brightness-110 transition">
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
            <Button asChild size="lg" className="mt-6 bg-gradient-to-r from-accent via-[oklch(0.72_0.18_60)] to-[oklch(0.65_0.13_235)] text-accent-foreground shadow-xl shadow-accent/40 hover:shadow-2xl hover:brightness-110 transition">
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
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
          <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
            {/* Dane firmy */}
            <div>
              <FinanceYouLogo variant="light" size="md" />
              <p className="mt-4 text-sm font-semibold text-foreground">Finance You sp. z o.o.</p>
              <address className="mt-1 not-italic text-sm leading-relaxed text-muted-foreground">
                ul. Nowogrodzka 31<br />
                00-511 Warszawa
              </address>
              <dl className="mt-4 space-y-1 text-xs text-muted-foreground">
                <div className="flex gap-2"><dt className="font-semibold text-foreground/80">KRS:</dt><dd>0000635207</dd></div>
                <div className="flex gap-2"><dt className="font-semibold text-foreground/80">NIP:</dt><dd>7010611803</dd></div>
                <div className="flex gap-2"><dt className="font-semibold text-foreground/80">REGON:</dt><dd>365350668</dd></div>
                <div className="flex gap-2"><dt className="font-semibold text-foreground/80">Kapitał zakładowy:</dt><dd>389 600,00 zł</dd></div>
              </dl>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
                Sąd Rejonowy dla m.st. Warszawy w Warszawie, XII Wydział Gospodarczy Krajowego Rejestru Sądowego.
              </p>
            </div>

            {/* Kontakt */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Kontakt</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li><a href={`tel:${PHONE_HREF}`} className="hover:text-foreground">{PHONE_DISPLAY}</a></li>
                <li><a href={`mailto:${EMAIL}`} className="hover:text-foreground">{EMAIL}</a></li>
                <li>pn–pt 9:00–17:00</li>
              </ul>
            </div>

            {/* Nawigacja */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Informacje</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li><a href="#kalkulator" className="hover:text-foreground">Kalkulator</a></li>
                <li><a href="#jak-to-dziala" className="hover:text-foreground">Jak to działa</a></li>
                <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
                <li><Link to="/blog" className="hover:text-foreground">Blog</Link></li>
                <li><a href="/polityka-prywatnosci" className="hover:text-foreground">Polityka prywatności</a></li>
                <li><a href="/regulamin" className="hover:text-foreground">Regulamin serwisu</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row md:items-center">
            <span>© {new Date().getFullYear()} Finance You sp. z o.o. Wszelkie prawa zastrzeżone.</span>
            <span>Prywatne pożyczki zabezpieczone hipoteką na nieruchomości.</span>
          </div>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur md:hidden">
        <Button
          asChild
          size="lg"
          className="w-full bg-gradient-to-r from-accent via-[oklch(0.72_0.18_60)] to-[oklch(0.65_0.13_235)] text-accent-foreground shadow-lg shadow-accent/40 hover:brightness-110 transition"
        >
          <a href="#kalkulator">
            <IconCalc className="mr-2 h-4 w-4" />
            Wylicz ratę
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
