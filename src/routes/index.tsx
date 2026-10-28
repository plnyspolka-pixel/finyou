import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/shell";
import { Section, SectionHead, ProcessSteps, FAQ } from "@/components/marketing/sections";
import { MktButton, Eyebrow } from "@/components/marketing/primitives";
import { BrandIcon } from "@/components/marketing/brand-icon";
import { InvestorPricing } from "@/components/marketing/investor-pricing";
import { LoanCalculator } from "@/components/loan-calculator";
import { PortfolioStories } from "@/components/marketing/portfolio-stories";
import {
  SUBSCRIPTION_PRICE_SENTENCE,
  FOUNDATION_SALES_EXPLANATION,
} from "@/lib/investor-plan/plans";
import { RoadCards } from "@/components/marketing/road-cards";
export const PHONE_DISPLAY = "+48 732 059 898";
export const PHONE_HREF = "+48732059898";
export const EMAIL = "kontakt@financeyou.pl";
const LESSON = "/pobierz/darmowa-lekcja";
// Film w hero: „Kompleksowa prezentacja” (dawniej Wistia, od 2.10.2026 w naszym
// Storage) — ten sam, który był w hero /dla-inwestora. Plakat z 1. sekundy, bo
// film zaczyna się ciemnym kadrem.
const HERO_VIDEO_URL =
  "https://jqvepxhulxdnbwbogkhe.supabase.co/storage/v1/object/public/studio-media/marketing-materials/Finance You - Kompleksowa Prezentacja (Merged)_1080p_caption (2).mp4";
const HERO_VIDEO_TITLE = "Finance You — kompleksowa prezentacja";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pożyczaj pod hipotekę — szkolenie i narzędzia inwestora | Finance You" },
      {
        name: "description",
        content:
          "Zacznij inwestować w pożyczki dla firm zabezpieczone hipoteką. Darmowa lekcja, szkolenie w 7 modułach i narzędzia. Roczny abonament 7 000 zł.",
      },
      { property: "og:title", content: "Twój kapitał, Twoje decyzje — Finance You" },
      {
        property: "og:description",
        content:
          "Sprawy z całej Polski, ocena ryzyka i umowy w systemie. Poznaj proces w darmowej lekcji.",
      },
      { property: "og:url", content: "https://financeyou.pl/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:description",
        content:
          "Pożyczaj firmom pod hipotekę, nawet jeśli zaczynasz. Zobacz program i cenę Finance You.",
      },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/" }],
  }),
  component: InvestorHome,
});
const FAQS = [
  {
    q: "Ile to kosztuje i za co płacę?",
    a: `${SUBSCRIPTION_PRICE_SENTENCE}. Płacisz za program szkoleniowy i licencję na narzędzia. Dostęp do spraw wynika z bezpłatnej umowy ramowej.`,
  },
  {
    q: "Ile spraw dostanę i jak szybko?",
    a: "Popyt na finansowanie przewyższa kapitał. Ile spraw trafi do Ciebie, zależy od kwoty i preferencji w Zleceniu kwoty. Formalnie nie gwarantujemy liczby spraw ani terminu transakcji.",
  },
  {
    q: "Czy zysk jest gwarantowany?",
    a: "Nie. Kalkulator pokazuje przykład, a wynik zależy od konkretnej sprawy. Ty decydujesz, czy i na jakich warunkach finansujesz firmę.",
  },
  {
    q: "Kto jest stroną umowy pożyczki?",
    a: "Ty i firma, której pożyczasz. Przelewasz pieniądze bezpośrednio firmie; spłaty trafiają na Twój rachunek.",
  },
  {
    q: "Jak zabezpieczona jest pożyczka?",
    a: "Hipoteką na Twoją rzecz, przy LTV do 60%, i dokumentami przygotowanymi przed wypłatą. Notariusz potwierdza ustanowienie zabezpieczeń.",
  },
  {
    q: "Co, jeśli firma nie płaci?",
    a: "Windykator AI prowadzi Cię przez wezwania, negocjacje i egzekucję. Ty zatwierdzasz działania. Zobacz zamknięte sprawy z naszego portfela.",
  },
  {
    q: "Czy potrzebuję doświadczenia?",
    a: "Nie na start. Szkolenie obejmuje 7 modułów, a system pomaga ocenić ryzyko A–E i przygotować umowę.",
  },
  {
    q: "Czy mogę zapłacić w ratach albo na firmę?",
    a: "Tak. Tpay, BLIK i raty, także dla firm. Orientacyjnie ok. 583 zł miesięcznie w 12 ratach; dostępność i koszt finansowania potwierdza dostawca przed zakupem. Bez karty kredytowej i automatycznego odnawiania.",
  },
  { q: "Dlaczego sprzedawcą jest Fundacja?", a: FOUNDATION_SALES_EXPLANATION },
  {
    q: "Jak wygląda pierwszy miesiąc?",
    a: "Płatność i konto, szkolenie, zdalna weryfikacja, umowa ramowa, NDA i RODO. Potem Zlecenie kwoty i analiza pierwszych spraw. Tempo zależy od Ciebie i od spraw w Twojej kwocie.",
  },
  {
    q: "Jak zacząć?",
    a: "Obejrzyj darmową lekcję po zapisie e-mail. Poznaj program i cennik. Kody rabatowe wysyłamy w mailingu.",
  },
];

function InvestorHome() {
  return (
    <MarketingShell page="home">
      <section className="fy-sales-hero">
        <div className="fy-sales-hero-inner">
          <div className="fy-sales-hero-copy">
            <Eyebrow tone="gold">Dla osób z kapitałem, które chcą zacząć</Eyebrow>
            <h1>Inwestuj w pożyczki pod zastaw nieruchomości</h1>
            <p className="fy-sales-brand">Finance You</p>
            <ul>
              {[
                "Osiągaj ponadprzeciętne stopy zwrotu z nieruchomości.",
                "Dbaj o bezpieczeństwo kapitału tak jak banki — Twoje nazwisko w księdze wieczystej.",
                "Bez kupowania, budowania, sprzedawania, remontowania, bez najemców, bez wysiłku, bez stresu i bez czekania na efekty!",
              ].map((t) => (
                <li key={t}>
                  <BrandIcon name="check" size={20} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <div className="fy-sales-actions">
              <MktButton variant="gold" size="lg" href={LESSON}>
                Obejrzyj darmową lekcję — ok.{"\u00a0"}35 minut
              </MktButton>
              <MktButton variant="outline" size="lg" href="#cennik">
                Zobacz program i cenę
              </MktButton>
            </div>
          </div>
          {/* Film „Kompleksowa prezentacja” — ten sam, który był w hero /dla-inwestora. */}
          <div className="fy-sales-hero-video">
            <video
              src={encodeURI(HERO_VIDEO_URL)}
              poster="/marketing/prezentacja-poster.webp"
              controls
              playsInline
              preload="metadata"
              aria-label={HERO_VIDEO_TITLE}
            />
          </div>
        </div>
      </section>
      <div className="fy-sales-proof">
        Finance You sp. z o.o. · 15 lat finansowania pod hipotekę · założyciel cytowany w
        „Rzeczpospolitej”
      </div>
      <Section id="narzedzia">
        <SectionHead title="Twoja droga na rynek pożyczek pod zastaw nieruchomości" />
        <RoadCards />
      </Section>
      <Section id="historie" tint>
        <SectionHead
          title="Historie z naszego portfela"
          sub="Finansujemy sprawy także własnym kapitałem — od 15 lat, tym samym procesem, który dostajesz w abonamencie."
        />
        <PortfolioStories limit={3} />
        <a className="fy-sales-link" href="/historie">
          Zobacz więcej →
        </a>
      </Section>
      <Section id="kalkulator">
        <SectionHead title="Policz przykład dla swojego kapitału" />
        <div className="mt-8">
          <LoanCalculator marketingPreview initialMaxPayment={0} />
        </div>
      </Section>
      <Section id="cennik" tint>
        <SectionHead center title="Abonament inwestora — 12 miesięcy" />
        <div className="mt-8">
          <InvestorPricing />
        </div>
        <h3 className="fy-sales-subtitle">Twoje pierwsze 30 dni</h3>
        <div className="mt-8">
          <ProcessSteps
            cols={4}
            steps={[
              { icon: "access", t: "Dzień 1", d: "Płatność, konto, moduł 1." },
              {
                icon: "compliance",
                t: "Dni 1–7",
                d: "Weryfikacja tożsamości online, umowa ramowa, NDA, RODO.",
              },
              {
                icon: "application",
                t: "Dni 7–14",
                d: "Zlecenie kwoty, pierwsze sprawy w panelu.",
              },
              {
                icon: "handshake",
                t: "Dni 14–30",
                d: "Pierwsza rozmowa z firmą, umowa, notariusz.",
              },
            ]}
          />
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Tempo zależy od Ciebie i od spraw w Twojej kwocie.
        </p>
      </Section>
      <Section id="faq">
        <SectionHead title="Twoje pytania — konkretne odpowiedzi" />
        <FAQ items={FAQS} />
        <p className="mt-6">
          Masz inne pytanie? Zapytaj Anię na czacie albo napisz na{" "}
          <a href="mailto:kontakt@financeyou.pl">kontakt@financeyou.pl</a>.
        </p>
      </Section>
    </MarketingShell>
  );
}
