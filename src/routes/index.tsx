import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MarketingShell } from "@/components/marketing/shell";
import {
  Section,
  SectionHead,
  FeatureGrid,
  ProcessSteps,
  FAQ,
} from "@/components/marketing/sections";
import { MktButton, Eyebrow } from "@/components/marketing/primitives";
import { BrandIcon } from "@/components/marketing/brand-icon";
import { InvestorPricing } from "@/components/marketing/investor-pricing";
import { Icon3D, type Icon3DName } from "@/components/marketing/icon-3d";
import { LoanCalculator } from "@/components/loan-calculator";
import { FreeMaterialsSection } from "@/components/marketing/free-materials";
import { getFreeMaterialsFn } from "@/lib/lead-magnets/free-materials.functions";
import { EMPTY_FREE_MATERIALS } from "@/lib/lead-magnets/free-materials";
import { getInvestorPublicProof } from "@/lib/investor-sales-public.functions";
import { PortfolioStories } from "@/components/marketing/portfolio-stories";
import { FounderPhoto } from "@/components/marketing/founder-photo";
import {
  SUBSCRIPTION_PRICE_SENTENCE,
  FOUNDATION_SALES_EXPLANATION,
  plnLabel,
} from "@/lib/investor-plan/plans";
import { INVESTOR_MODULES, investorModulePath } from "@/components/marketing/investor-modules";
export const PHONE_DISPLAY = "+48 732 059 898";
export const PHONE_HREF = "+48732059898";
export const EMAIL = "kontakt@financeyou.pl";
const LESSON = "/pobierz/darmowa-lekcja";
const proofQuery = queryOptions({
  queryKey: ["investor-public-proof"],
  queryFn: () => getInvestorPublicProof(),
  staleTime: 3600000,
  refetchInterval: 3600000,
});
export const Route = createFileRoute("/")({
  loader: async ({ context }) => ({
    proof: await context.queryClient.ensureQueryData(proofQuery),
    materials: await getFreeMaterialsFn({ data: { audience: "inwestor" } }).catch(() =>
      EMPTY_FREE_MATERIALS("inwestor"),
    ),
  }),
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
// Ikona 3D karty sprawy wg typu nieruchomości (pkt 14).
const CASE_ICON: Record<string, Icon3DName> = {
  Mieszkanie: "propApartment",
  Dom: "propHouse",
  "Lokal użytkowy": "propStore",
  "Działka budowlana": "propPlot",
  "Grunt rolny": "propField",
};
const TOOL_ICON: Icon3DName[] = ["ai", "documents", "complianceAml", "shieldcheck"];

const PROTECTION = [
  {
    icon: "shield" as const,
    t: "Czy to nie oszustwo?",
    d: "Pieniądze nie przechodzą przez nas. Umowa bezpośrednio z firmą, podpis u notariusza i hipoteka na Twoje nazwisko.",
  },
  {
    icon: "application" as const,
    t: "Skąd wezmę klientów?",
    d: "Sprawy z całej Polski trafiają do Ciebie według kwoty ze Zlecenia kwoty — podajesz, ile chcesz ulokować.",
  },
  {
    icon: "academy" as const,
    t: "Nigdy tego nie robiłem",
    d: "Dostajesz szkolenie w 7 modułach, Analityka AI z oceną A–E i gotową umowę.",
  },
  {
    icon: "shieldcheck" as const,
    t: "A jak nie zapłaci?",
    d: "Hipoteka do 60% LTV i Windykator AI. Poznaj historię spłaty przy sprzedaży zabezpieczenia poniżej.",
  },
];
function InvestorHome() {
  const { materials } = Route.useLoaderData();
  const { data: proof } = useSuspenseQuery(proofQuery);
  return (
    <MarketingShell page="home">
      <section className="fy-sales-hero">
        <div className="fy-sales-hero-inner">
          <Eyebrow tone="gold">Dla osób z kapitałem, które chcą zacząć</Eyebrow>
          <h1>Pożyczaj pod hipotekę jak bank — nawet jeśli nigdy tego nie robiłeś.</h1>
          <p className="fy-sales-brand">Finance You</p>
          <ul>
            {[
              "Twoje pieniądze nigdy nie przechodzą przez Finance You — przelewasz je bezpośrednio firmie po podpisie u notariusza, z hipoteką na Twoje nazwisko.",
              "Sprawy z całej Polski trafiają do Ciebie — nie szukasz klientów.",
              "Umowa, ocena ryzyka i hipoteka przygotowane w systemie.",
            ].map((t) => (
              <li key={t}>
                <BrandIcon name="check" size={20} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="fy-sales-actions">
            <MktButton variant="gold" size="lg" href={LESSON}>
              Obejrzyj darmową lekcję — ok. 35 minut
            </MktButton>
            <MktButton variant="outline" size="lg" href="#cennik">
              Zobacz program i cenę
            </MktButton>
          </div>
        </div>
      </section>
      <div className="fy-sales-proof">
        Finance You sp. z o.o. · 15 lat finansowania pod hipotekę · założyciel cytowany w
        „Rzeczpospolitej”
      </div>
      <Section id="ochrona">
        <SectionHead title="Boisz się? Słusznie. Oto co Cię chroni." />
        <div className="mt-8">
          <FeatureGrid items={PROTECTION} icon3d />
        </div>
        <a className="fy-sales-link" href="#historie">
          Zobacz, jak hipoteka zadziałała →
        </a>
      </Section>
      <Section id="sprawy" tint>
        <SectionHead
          title="Popyt na pieniądze jest nieograniczony. Wąskim gardłem jest kapitał."
          sub="Przez 15 lat nie było miesiąca, w którym brakowało spraw — brakowało kapitału, żeby wszystkie sfinansować. Finansujemy je także własnymi pieniędzmi, więc każdą sprawę oceniamy tak, jakbyśmy sami mieli wyłożyć kapitał. Spraw jest wielokrotnie więcej, niż udźwignie jeden portfel — dlatego szukamy partnerów."
        />
        {proof.cases.length > 0 && (
          <div className="fy-sales-cards">
            {proof.cases.map((c) => (
              <article className="fy-sales-card" key={c.ref}>
                <Icon3D name={CASE_ICON[c.propertyType] ?? "house"} size={56} />
                <span className="fy-sales-eyebrow">
                  {c.ref} · {c.daysAgo} dni temu
                </span>
                <h3>{c.propertyType}</h3>
                <p>{c.voivodeship}</p>
                <strong className="fy-sales-number">{plnLabel(c.amount)}</strong>
                <p>
                  {c.months ? `${c.months} miesięcy · ` : ""}
                  {c.status}
                </p>
              </article>
            ))}
          </div>
        )}
        <p className="mt-5 text-sm text-muted-foreground">
          Pełne dane sprawy widzą partnerzy z aktywnym abonamentem.
        </p>
      </Section>
      <Section id="jak-dziala">
        <SectionHead title="Jak to działa — 5 kroków" />
        <div className="mt-8">
          <ProcessSteps
            cols={5}
            steps={[
              {
                icon: "calculator",
                t: "Mówisz, ile chcesz ulokować",
                d: "Zlecenie kwoty: podajesz kapitał, dla którego szukamy spraw.",
              },
              {
                icon: "application",
                t: "Sprawy przychodzą do Ciebie",
                d: "Z całej Polski, w Twojej kwocie.",
              },
              {
                icon: "ai",
                t: "Analizujesz w ok. 15 minut",
                d: "Ocena A–E; rezerwacja 24 h + 12 h.",
              },
              {
                icon: "handshake",
                t: "Ustalasz warunki z firmą",
                d: "Harmonogram akceptowany przed wypłatą.",
              },
              {
                icon: "documents",
                t: "Notariusz, hipoteka i wypłata",
                d: "Hipoteka na Ciebie, spłaty na Twój rachunek. Gdy rata nie przychodzi — Windykator AI.",
              },
            ]}
          />
        </div>
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
      <Section id="szkolenie" tint>
        <SectionHead title="Szkolenie, po którym sam ocenisz zabezpieczenie, umowę i ryzyko" />
        <ul className="fy-sales-checks">
          {[
            "Po szkoleniu potrafisz ocenić księgę wieczystą i hipotekę.",
            "Porównać kwotę finansowania z wartością zabezpieczenia.",
            "Rozpoznać ryzyka klienta i źródło spłaty.",
            "Ustalić warunki, umowę i harmonogram.",
            "Poprowadzić działania, gdy rata nie przychodzi.",
          ].map((t) => (
            <li key={t}>
              <BrandIcon name="check" />
              {t}
            </li>
          ))}
        </ul>
        <ol className="fy-sales-modules">
          {(
            [
              ["Wprowadzenie i strategia", "academy"],
              ["Prawo", "compliance"],
              ["Operacje", "procedures"],
              ["Analiza nieruchomości", "house"],
              ["Analiza klienta", "investors"],
              ["Case study", "dossier"],
              ["Windykacja", "shieldcheck"],
            ] as const
          ).map(([t, icon], i) => (
            <li key={t}>
              <span>0{i + 1}</span>
              <Icon3D name={icon} size={40} />
              <strong>{t}</strong>
              {i === 0 ? <a href={LESSON}>Lekcja 1 za darmo →</a> : <BrandIcon name="lock" />}
            </li>
          ))}
        </ol>
        <div className="fy-sales-founder-line">
          <FounderPhoto small />
          <span>
            Prowadzi: <strong>Filip Bielak</strong>
          </span>
        </div>
      </Section>
      <Section id="narzedzia">
        <SectionHead title="Cztery narzędzia na cztery momenty, w których inwestor traci pieniądze" />
        <div className="fy-sales-cards">
          {["Analityk AI", "Kancelaria AI", "Moduł AML/compliance", "Windykator AI"].map(
            (name, i) => {
              const m = INVESTOR_MODULES.find((x) => x.name === name);
              return (
                <article className="fy-sales-card" key={name}>
                  <Icon3D name={TOOL_ICON[i]} size={48} />
                  <span className="fy-sales-eyebrow">
                    {
                      [
                        "Zanim wyłożysz",
                        "Zanim podpiszesz",
                        "Zanim przyjmiesz spłatę",
                        "Gdy rata nie przychodzi",
                      ][i]
                    }
                  </span>
                  <h3>{name}</h3>
                  {m && (
                    <>
                      <img
                        className="fy-sales-tool-image"
                        src={m.image}
                        alt={m.imageAlt}
                        loading="lazy"
                      />
                      <p>{m.tagline}</p>
                      <a className="fy-sales-link" href={investorModulePath(m.slug)}>
                        Poznaj narzędzie →
                      </a>
                    </>
                  )}
                </article>
              );
            },
          )}
        </div>
      </Section>
      <Section id="korzysci" tint>
        <SectionHead title="Ty decydujesz, na czym zarabiasz. My dostarczamy sprawy." />
        <div className="mt-8">
          <FeatureGrid
            icon3d
            items={[
              {
                icon: "application",
                t: "Sprawy trafiają do Ciebie",
                d: "Podajesz maksymalną kwotę w Zleceniu kwoty. My przedstawiamy sprawy firm z całej Polski.",
              },
              {
                icon: "procedures",
                t: "Decydujesz bez pośpiechu",
                d: "Rezerwujesz na 24 h i raz przedłużasz o 12 h.",
              },
              {
                icon: "chat",
                t: "Rozmawiasz z firmą bezpośrednio",
                d: "Po akceptacji dokumentów sprawy dostajesz kontakt i sam negocjujesz warunki.",
              },
              {
                icon: "status",
                t: "Spłaty znasz z góry",
                d: "Harmonogram widzisz przed wypłatą. Firma spłaca na Twój rachunek.",
              },
              {
                icon: "shieldcheck",
                t: "Formalności raz i zdalnie",
                d: "Weryfikacja online, umowy wypełnione Twoimi danymi.",
              },
              {
                icon: "loan",
                t: "Odsetki i Twoja prowizja dla Ciebie",
                d: "Bez opłaty sukcesu. Prowizję Finance You płaci firma z kwoty wypłaty.",
              },
            ]}
          />
        </div>
      </Section>
      <Section id="zespol">
        <SectionHead title="Kto za tym stoi" />
        <div className="fy-sales-founder-line">
          <FounderPhoto small />
          <div>
            <h3>Filip Bielak</h3>
            <p>
              Inwestor z ponad 15-letnim doświadczeniem. Absolwent Wydziału Prawa i Administracji
              UMCS. Jego komentarze publikowała „Rzeczpospolita”.
            </p>
            <a className="fy-sales-link" href="/o-nas">
              Poznaj nas →
            </a>
          </div>
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
      <FreeMaterialsSection data={materials} />
      <Section id="faq">
        <SectionHead title="Twoje pytania — konkretne odpowiedzi" />
        <FAQ items={FAQS} />
        <p className="mt-6">
          Masz inne pytanie? Zapytaj Anię na czacie albo napisz na{" "}
          <a href="mailto:kontakt@financeyou.pl">kontakt@financeyou.pl</a>.
        </p>
      </Section>
      <Section tint>
        <SectionHead title="Twój kapitał, Twoje decyzje, Twoje odsetki." />
        <div className="fy-sales-actions">
          <MktButton variant="gold" href="/abonament-inwestora?okres=rocznie">
            Zostań partnerem
          </MktButton>
          <MktButton variant="outline" href={LESSON}>
            Obejrzyj darmową lekcję
          </MktButton>
        </div>
        <details className="fy-sales-legal">
          <summary>Ważne informacje</summary>
          <p>
            Abonament jest odpłatnym programem szkoleniowym z narzędziami, sprzedawanym przez
            Fundację. Dostęp do spraw wynika z odrębnej, bezpłatnej umowy ramowej z Finance You. Nie
            gwarantujemy przedstawienia sprawy, zawarcia transakcji ani zysku. Hipoteka ogranicza
            ryzyko, ale go nie eliminuje. Decyzje podejmujesz samodzielnie. Kalkulator ma charakter
            informacyjny i nie stanowi oferty ani porady prawnej lub finansowej. Warunki historyczne
            nie są aktualną ofertą.
          </p>
        </details>
      </Section>
    </MarketingShell>
  );
}
