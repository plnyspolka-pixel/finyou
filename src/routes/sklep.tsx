
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/shell";
import { Section, SectionHead } from "@/components/marketing/sections";
import { MktBadge, MktButton, Eyebrow } from "@/components/marketing/primitives";
import { Icon3D, type Icon3DName } from "@/components/marketing/icon-3d";
import { LandingWizardForm } from "@/components/landing/landing-wizard-form";

/**
 * Finance You: koncepcja sklepu produktowego.
 *
 * KLUCZOWE: wizualnie to natywna podstrona marketingowa Finance You,
 * korzystająca z istniejących komponentów, tokenów, grafik i logo
 * (MarketingShell -> SiteHeader -> FinanceYouLogo).
 *
 * Ceny jednostkowe są propozycją, NIE zarejestrowanymi produktami Tpay.
 * Do wdrożenia sprzedaży indywidualnej potrzebne są SKU, uprawnienia,
 * regulaminy i webhooki. Nie kierujemy do nieistniejącego checkoutu.
 */
export const Route = createFileRoute("/sklep")({
  head: () => ({
    meta: [
      { title: "Narzędzia inwestora i Akademia | Finance You" },
      { name: "description", content: "Akademia inwestora, Kancelaria AI, Analityk AI, zarządzanie pożyczkami i dostęp do spraw — rozwiązania Finance You." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinanceYouSklep,
});

type Offer = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  icon: Icon3DName;
  benefits: string[];
  price: string;
  priceSub: string;
  target: string;
  action: string;
};

const OFFERS: Offer[] = [
  {
    id: "akademia",
    eyebrow: "01 / WIEDZA I PRAKTYKA",
    title: "Akademia Inwestora",
    description: "28 lekcji wideo, 7 obszarów tematycznych. Od strategii i prawa po analizę zabezpieczenia, case studies i windykację.",
    image: "/marketing/moduly/szkolenie-1.webp",
    icon: "academy",
    benefits: ["28 opublikowanych lekcji", "Prawo, analiza nieruchomości i windykacja", "Pojedyncze lekcje lub cały program"],
    price: "od 149 zł",
    priceSub: "za wybraną lekcję · proponowana cena",
    target: "/pobierz/darmowa-lekcja",
    action: "Obejrzyj bezpłatną lekcję",
  },
  {
    id: "kancelaria",
    eyebrow: "02 / DOKUMENTY",
    title: "Kancelaria AI",
    description: "Wybierasz dokument, uzupełniasz dane i otrzymujesz gotowy plik. Umowa pożyczki, aneks, ugoda, promesa, pisma i e-podpis w jednym narzędziu.",
    image: "/marketing/moduly/kancelaria-ai-1.webp",
    icon: "documents",
    benefits: ["Biblioteka wzorów DOCX", "Kreator umowy z klauzulami", "E-podpis i dokumenty windykacyjne"],
    price: "od 199 zł",
    priceSub: "za gotowy dokument · proponowana cena",
    target: "/dla-inwestora/kancelaria-ai",
    action: "Zobacz możliwości Kancelarii",
  },
  {
    id: "analityk",
    eyebrow: "03 / ANALIZA RYZYKA",
    title: "Analityk AI",
    description: "Kompleksowa analiza nieruchomości jako zabezpieczenia: KW, właściciele, wartość, lokalizacja, LTV i ocena ryzyka A–E.",
    image: "/marketing/moduly/analityk-ai-1.webp",
    icon: "ai",
    benefits: ["Księga wieczysta i właściciele", "Wartość zabezpieczenia i ryzyko A–E", "Raport do świadomej decyzji"],
    price: "499 zł",
    priceSub: "za kompletny raport · proponowana cena",
    target: "/dla-inwestora/analityk-ai",
    action: "Poznaj Analityka AI",
  },
  {
    id: "centrum",
    eyebrow: "04 / OBSŁUGA PORTFELA",
    title: "Centrum Zarządzania",
    description: "Jedno miejsce do pracy nad własnym portfelem: harmonogramy, dokumenty, AML/compliance i Windykator AI. Bez rozdzielania funkcji na osobne abonamenty.",
    image: "/marketing/moduly/aml-compliance-1.webp",
    icon: "crm",
    benefits: ["Portfel pożyczek i harmonogramy", "AML, KYC i screening", "Windykacja, rozliczenia i pisma"],
    price: "449 zł",
    priceSub: "miesięcznie · proponowana cena",
    target: "/dla-inwestora/aml-compliance",
    action: "Poznaj narzędzia zarządzania",
  },
  {
    id: "okazje",
    eyebrow: "05 / DOSTĘP DO SPRAW",
    title: "Okazje Inwestycyjne",
    description: "Złóż zlecenie poszukiwania finansowania i otrzymuj dopasowane sprawy. To Ty oceniasz ryzyko i decydujesz, czy chcesz udzielić pożyczki.",
    image: "/marketing/moduly/siec-sprzedazy-1.webp",
    icon: "investors",
    benefits: ["Dopasowanie według kwoty zlecenia", "KYC/AML i dokumenty przed dostępem", "Raport sprawy i rezerwacja"],
    price: "1 490 zł",
    priceSub: "raport + postulowana wyłączność 48 h · wariant do wdrożenia",
    target: "/abonament-inwestora",
    action: "Sprawdź obecne warunki dostępu",
  },
];


/** Tytuły opublikowanych lekcji i używanych wzorów z katalogu produkcyjnego.
 * To wyłącznie publiczne nazwy produktów — bez udostępniania treści lub plików. */
const LESSONS = [
  "Wprowadzenie do rynku pożyczek pod hipotekę",
  "Zarabianie na pożyczkach",
  "Strategie inwestycyjne w pożyczkach",
  "Pośrednictwo inwestycyjne — klucze do skuteczności",
  "Pozyskiwanie klientów — zalety i wady",
  "Aspekty prawne udzielania pożyczek",
  "Interpretacja wyłączeń z ustawy o kredycie konsumenckim",
  "Art. 304 Kodeksu Karnego — wykład",
  "Lichwa — analiza przepisów i orzecznictwa",
  "Zarządzanie umowami i klientami w nieruchomościach",
  "Możliwości spłaty pożyczek dla inwestorów",
  "Wymagane dokumenty do umowy pożyczki",
  "Analiza nieruchomości jako zabezpieczenia pożyczki",
  "Jak zawrzeć umowę pożyczki",
  "Różnice w rodzajach nieruchomości",
  "Analiza umowy pożyczki dla firm",
  "Analiza klientów i decyzji kredytowych",
  "Oferta dla klientów premium",
  "Optymalizowanie oferty dla klienta",
  "Case study: mieszkanie w Świebodzicach",
  "Miękka windykacja — jak podejść do klientów",
  "Case study: nieruchomość w Siemionce",
  "Wykup nieruchomości od dłużnika",
  "Case study: nieruchomość w Lipinach",
  "Droga cywilno-prawna w praktyce",
  "Case study: działka w Żelewie",
  "Case study: działka w Strzyżewicach",
  "Case study: Lubań",
] as const;

const TEMPLATES = [
  "Aneks — przedłużenie terminu i prowizja",
  "Monit — przypomnienie o płatności",
  "Wezwanie do zapłaty — standardowe",
  "Ostateczne przedsądowe wezwanie do zapłaty",
  "Wezwanie do zapłaty do poręczyciela",
  "Wezwanie z ostrzeżeniem BIG/KRD",
  "Oświadczenie o uznaniu długu",
  "Ugoda — rozłożenie na raty",
  "Protokół z negocjacji windykacyjnych",
  "Oświadczenie o potrąceniu wierzytelności",
  "Umowa przelewu wierzytelności (cesja)",
  "Zawiadomienie o cesji wierzytelności",
  "Oświadczenie wierzyciela (art. 786 KPC)",
  "Wniosek o nadanie klauzuli wykonalności (art. 777)",
  "Wniosek o przyspieszenie klauzuli",
  "Skarga na przewlekłość postępowania",
  "Pozew o zapłatę",
  "Wniosek o zabezpieczenie roszczenia",
  "Wniosek egzekucyjny do komornika",
  "Wniosek o wyjawienie majątku",
  "Promesa wykreślenia hipoteki",
  "Zgoda na wykreślenie hipoteki",
  "Załącznik 3 — Tabela opłat windykacyjnych",
  "Rejestr kosztów windykacyjnych",
  "Zawiadomienie o możliwości popełnienia przestępstwa",
  "Oświadczenie 777 — instrukcja dla notariusza",
  "Hipoteka — oświadczenie i wniosek o wpis",
  "Pokwitowanie wypłaty pożyczki",
  "Klauzula informacyjna RODO",
  "Karta AML/KYC — ocena ryzyka",
  "Procedura wewnętrzna AML/CFT — firma pożyczkowa B2B",
] as const;

const GOLD = "#f0c667";
const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-2xl)",
  boxShadow: "var(--shadow-sm)",
};
function ProductCard({ offer, choose, active }: { offer: Offer; choose: (id: string) => void; active: boolean }) {
  return (
    <article className="fy-sales-card fy-road-card" style={{ ...card, borderColor: active ? GOLD : undefined, boxShadow: active ? "var(--shadow-lg)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Icon3D name={offer.icon} size={48} />
        <span className="fy-sales-eyebrow">{offer.eyebrow}</span>
      </div>
      <h3>{offer.title}</h3>
      <img className="fy-sales-tool-image" src={offer.image} alt={offer.title} loading="lazy" />
      <p>{offer.description}</p>
      <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        <div style={{ color: GOLD, fontSize: "1.25rem", fontWeight: 900 }}>{offer.price}</div>
        <div style={{ fontSize: ".75rem", color: "var(--muted-foreground)", marginTop: 4 }}>{offer.priceSub}</div>
        <div style={{ marginTop: "1rem" }}>
          <MktButton variant={active ? "gold" : "cta"} size="lg" onClick={() => choose(offer.id)} style={{ width: "100%" }}>
            {active ? "Wybrano — zobacz szczegóły ↓" : "Sprawdź produkt →"}
          </MktButton>
        </div>
      </div>
    </article>
  );
}

function ProductDetail({ offer }: { offer: Offer }) {
  const variants: readonly string[] = offer.id === "akademia" ? LESSONS : offer.id === "kancelaria" ? TEMPLATES : [];
  const [selected, setSelected] = useState("pakiet");
  const variantName = selected === "pakiet" ? offer.title : selected;
  const mailto = "mailto:kontakt@financeyou.pl?subject=" + encodeURIComponent("Zakup produktu Finance You: " + offer.title) +
    "&body=" + encodeURIComponent("Dzień dobry, interesuje mnie zakup: " + variantName +
      ".\nProszę o potwierdzenie ceny i możliwości zakupu pojedynczego produktu.\n\nDane kontaktowe:");
  return (
    <div id="szczegoly" style={{ ...card, marginTop: "2rem", overflow: "hidden" }} aria-live="polite">
      <div style={{ height: 4, background: "linear-gradient(90deg,#c48d2a,#f0c667,#5fa2f6)" }} />
      <div className="fy-shop-detail" style={{ padding: "clamp(1.25rem,3vw,2.25rem)", display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,.8fr)", gap: "2rem" }}>
        <div>
          <Eyebrow tone="gold">{offer.eyebrow}</Eyebrow>
          <h3 style={{ fontSize: "clamp(1.6rem,3vw,2.1rem)", fontWeight: 850, marginTop: ".45rem" }}>{offer.title}</h3>
          <p style={{ color: "var(--muted-foreground)", lineHeight: 1.65, marginTop: ".9rem" }}>{offer.description}</p>
          <ul className="fy-sales-checks" style={{ margin: "1.35rem 0" }}>
            {offer.benefits.map((b) => <li key={b}><span style={{ color: GOLD, fontWeight: 900 }}>✓</span>{b}</li>)}
          </ul>
        </div>
        <div style={{ background: "rgba(79,139,240,.08)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "1.5rem", alignSelf: "stretch" }}>
          <div style={{ fontSize: ".75rem", color: "var(--muted-foreground)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>Planowana sprzedaż indywidualna</div>
          <div style={{ color: GOLD, fontSize: "2.15rem", fontWeight: 900, marginTop: ".65rem" }}>{offer.price}</div>
          <div style={{ color: "var(--muted-foreground)", fontSize: ".8rem", marginTop: 4 }}>{offer.priceSub}</div>
          {variants.length > 0 && (
            <div style={{ marginTop: "1.35rem" }}>
              <label htmlFor={offer.id + "-wariant"} style={{ fontSize: ".85rem", fontWeight: 700 }}>Wybierz {offer.id === "akademia" ? "lekcję" : "dokument"}</label>
              <select id={offer.id + "-wariant"} value={selected} onChange={(e) => setSelected(e.target.value)}
                style={{ display: "block", marginTop: ".5rem", padding: ".8rem", width: "100%", maxWidth: "100%", color: "var(--foreground)", background: "#0d1638", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: ".78rem" }}>
                <option value="pakiet">{offer.id === "akademia" ? "Cały program" : "Pakiet dokumentów"}</option>
                {variants.map((t, i) => <option key={t} value={t}>{i + 1}. {t}</option>)}
              </select>
            </div>
          )}
          <div style={{ marginTop: "1.3rem", display: "grid", gap: ".7rem" }}>
            <MktButton variant="gold" size="lg" href={mailto} style={{ width: "100%", height: "auto", whiteSpace: "normal", textAlign: "center", minHeight: 48, lineHeight: 1.4, padding: "1rem" }}>
              Zapytaj o zakup →
            </MktButton>
            <MktButton variant="outline" size="lg" href={offer.target} style={{ width: "100%", height: "auto", whiteSpace: "normal", textAlign: "center", minHeight: 48, lineHeight: 1.4, padding: "1rem" }}>
              {offer.action} →
            </MktButton>
          </div>
          <p style={{ fontSize: ".74rem", lineHeight: 1.6, color: "var(--muted-foreground)", marginTop: "1rem" }}>
            Zakup pojedynczego produktu nie jest jeszcze uruchomiony w Tpay. Link prowadzi do istniejącej strony Finance You.
          </p>
        </div>
      </div>
    </div>
  );
}

function FinanceYouSklep() {
  const [chosen, setChosen] = useState("analityk");
  const current = OFFERS.find((o) => o.id === chosen) ?? OFFERS[0];
  const choose = (id: string) => {
    setChosen(id);
    window.requestAnimationFrame(() => document.getElementById("szczegoly")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  return (
    <MarketingShell page="home" sticky={{ label: "Złóż bezpłatny wniosek pożyczkowy", href: "#wniosek" }}>
      <section className="fy-hero" style={{ color: "#fff" }}>
        <div aria-hidden className="fy-hero-fx" />
        <div className="fy-sales-hero-inner" style={{ position: "relative", maxWidth: "80rem", paddingTop: "4rem", paddingBottom: "4rem" }}>
          <div>
            <Eyebrow tone="gold">FINANCE YOU · DLA INWESTORA</Eyebrow>
            <h1 style={{ fontSize: "clamp(2.25rem,4vw,3.2rem)", fontWeight: 900, lineHeight: 1.08, marginTop: "1.25rem" }}>
              Wiedza i narzędzia do inwestowania <span style={{ color: GOLD }}>pod hipotekę.</span>
            </h1>
            <p style={{ marginTop: "1.3rem", maxWidth: "38rem", color: "rgba(255,255,255,.82)", lineHeight: 1.65, fontSize: "1.04rem" }}>
              Szkolenie, analizy, dokumenty i zarządzanie pożyczkami. Pięć praktycznych rozwiązań w jednym systemie Finance You.
            </p>
            <div className="fy-sales-actions">
              <MktButton variant="gold" size="lg" href="#produkty">Poznaj produkty →</MktButton>
              <MktButton variant="outline" size="lg" href="#wniosek">Potrzebuję pożyczki</MktButton>
            </div>
            <p style={{ marginTop: "1.35rem", color: "rgba(255,255,255,.7)", fontSize: ".8rem", lineHeight: 1.6 }}>
              28 opublikowanych lekcji · narzędzia AI · biblioteka dokumentów · mentoring
            </p>
          </div>
          <div className="fy-sales-hero-video">
            <video
              controls
              playsInline
              preload="metadata"
              poster="/marketing/prezentacja-poster.webp"
              src={encodeURI("https://jqvepxhulxdnbwbogkhe.supabase.co/storage/v1/object/public/studio-media/marketing-materials/Finance You - Kompleksowa Prezentacja (Merged)_1080p_caption (2).mp4")}
              aria-label="Finance You — kompleksowa prezentacja"
            />
          </div>
        </div>
      </section>

      <div className="fy-sales-proof">
        Finance You sp. z o.o. · Ponad 15 lat praktyki w pożyczkach hipotecznych · Jedna platforma, pięć rozwiązań
      </div>

      <Section id="produkty">
        <SectionHead
          eyebrow="FINANCE YOU / PRODUKTY"
          title="Wybierz, czego potrzebujesz"
          sub="Nie musisz kupować całej platformy, żeby poznać konkretne narzędzie. Ceny jednostkowe prezentujemy jako projekt nowej oferty, a funkcje jako działające elementy systemu."
        />
        <div className="fy-sales-cards">
          {OFFERS.map((offer) => <ProductCard key={offer.id} offer={offer} choose={choose} active={chosen === offer.id} />)}
        </div>
        <ProductDetail key={current.id} offer={current} />
      </Section>

      <Section id="kompletny" tint>
        <div style={{ ...card, padding: "clamp(1.5rem,4vw,3rem)", background: "linear-gradient(115deg, #111b46, #0a1030)", boxShadow: "var(--shadow-lg)" }}>
          <MktBadge variant="gold">WSZYSTKO W JEDNYM</MktBadge>
          <div className="fy-shop-bundle" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "1.5rem", alignItems: "center", marginTop: "1rem" }}>
            <div>
              <h2 style={{ fontSize: "clamp(1.7rem,3vw,2.4rem)", fontWeight: 850, color: "white" }}>Finance You Kompletny</h2>
              <p style={{ color: "rgba(255,255,255,.78)", lineHeight: 1.65, marginTop: ".8rem", maxWidth: "42rem" }}>
                Aktualny abonament inwestora: program szkoleniowy, narzędzia panelu i 4 godziny konsultacji. Dostęp do spraw po spełnieniu warunków KYC/AML i zawarciu właściwych umów.
              </p>
              <p style={{ fontSize: ".75rem", marginTop: ".9rem", color: "rgba(255,255,255,.6)" }}>
                Zasady dostępu, gwarancje i zakres uprawnień określa obowiązujący regulamin abonamentu.
              </p>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: GOLD, whiteSpace: "nowrap" }}>7 000 zł / rok</div>
              <div style={{ marginTop: "1rem" }}><MktButton variant="gold" size="lg" href="/abonament-inwestora">Kup abonament →</MktButton></div>
            </div>
          </div>
        </div>
      </Section>

      <Section id="wniosek">
        <SectionHead
          eyebrow="DLA FIRMY · BEZPŁATNY WNIOSEK"
          title="Potrzebujesz pożyczki pod zastaw nieruchomości?"
          sub="Wybierz nieruchomość, podaj kwotę i przejdź przez dokładnie ten sam proces wnioskowania, który działa na financeyou.pl."
        />
        <div style={{ maxWidth: "54rem", margin: "2rem auto 0" }}>
          <LandingWizardForm />
        </div>
        <p style={{ marginTop: "1rem", fontSize: ".8rem", color: "var(--muted-foreground)", textAlign: "center" }}>
          Złożenie wniosku jest bezpłatne. Finansowanie dotyczy celów związanych z działalnością gospodarczą.
        </p>
      </Section>
      <style>{`
        @media(max-width:760px) {
          .fy-shop-detail { grid-template-columns: minmax(0,1fr) !important; }
          .fy-shop-bundle { grid-template-columns: minmax(0,1fr) !important; }
        }
      `}</style>
    </MarketingShell>
  );
}
