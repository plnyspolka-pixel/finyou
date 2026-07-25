import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/shell";
import {
  Section,
  SectionHead,
  FeatureGrid,
  PricingCard,
  FAQ,
  ComplianceNote,
  CTASection,
  type FeatureItemData,
} from "@/components/marketing/sections";
import { MktBadge, MktButton } from "@/components/marketing/primitives";
import { BrandIcon } from "@/components/marketing/brand-icon";
import { Icon3D, type Icon3DName } from "@/components/marketing/icon-3d";

const JOIN = "/rejestracja?role=posrednik";

export const Route = createFileRoute("/dla-posrednika")({
  head: () => ({
    meta: [
      { title: "Program Pośrednika — zarabiaj z CRM, AI i bazą inwestorów | Finance You" },
      {
        name: "description",
        content:
          "Dołącz do Programu Pośrednika Finance You: gotowy CRM, szkolenie, kampanie wspierane AI, dostęp do prywatnych inwestorów, wzory dokumentów i transparentny model prowizji.",
      },
      { property: "og:title", content: "Dla pośredników — Finance You" },
      { property: "og:description", content: "Gotowy system: CRM, szkolenie, kampanie AI, baza inwestorów i model prowizji." },
      { property: "og:url", content: "https://financeyou.pl/dla-posrednika" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/dla-posrednika" }],
  }),
  component: BrokerLanding,
});

const GET: FeatureItemData[] = [
  { icon: "automation", t: "Dedykowana kampania reklamowa w Twoim regionie", d: "Kampania kierowana na miasta powyżej 30 000 mieszkańców oraz obszar w promieniu około 17 km, czyli tam, gdzie najczęściej poszukują nieruchomości nasi inwestorzy." },
  { icon: "aibrain", t: "Osobista asystentka Ania AI", d: "Dzwoni do klientów, odpowiada na e-maile i wiadomości prywatne, zbiera informacje i zapisuje wszystko w systemie." },
  { icon: "application", t: "Prosty kreator wniosku", d: "Prowadzi Cię krok po kroku przez cały proces i podpowiada, jakie dane, dokumenty oraz informacje należy zebrać od klienta." },
  { icon: "ai", t: "Wsparcie analityka AI", d: "Pomaga sprawdzić nieruchomość, wychwycić potencjalne ryzyka i przygotować kompletną ofertę inwestycyjną." },
  { icon: "investors", t: "Dostęp do prywatnych inwestorów", d: "Gotową sprawę możesz szybko przekazać inwestorom zainteresowanym finansowaniem zabezpieczonym nieruchomością." },
  { icon: "documents", t: "Pełna obsługa formalna transakcji", d: "Przygotowujemy umowę, organizujemy notariusza, koordynujemy dokumenty i pomagamy doprowadzić sprawę do wypłaty środków." },
  { icon: "shieldcheck", t: "Zabezpieczenie wypłaty Twojej prowizji", d: "Zasady rozliczenia są ustalane z góry, a status prowizji możesz śledzić w systemie." },
  { icon: "knowledge", t: "Komplet materiałów marketingowych", d: "Otrzymujesz gotowe grafiki, teksty reklamowe, posty, skrypty rozmów i materiały do samodzielnego generowania leadów." },
  { icon: "training", t: "Pełne szkolenie branżowe", d: "Nauczysz się pozyskiwać klientów, kwalifikować sprawy, analizować nieruchomości i skutecznie domykać transakcje." },
  { icon: "crm", t: "Przejrzysty system CRM", d: "W jednym miejscu widzisz klientów, historię kontaktu, dokumenty, aktualny etap sprawy i kolejne zadania." },
  { icon: "access", t: "Możliwość pracy z dowolnego miejsca", d: "Do prowadzenia biznesu potrzebujesz przede wszystkim telefonu, komputera i dostępu do internetu." },
  { icon: "community", t: "Możliwość rozpoczęcia bez własnego biura i zespołu", d: "Nie musisz od początku budować zaplecza marketingowego, technologicznego, prawnego ani administracyjnego." },
  { icon: "compliance", t: "Możliwość rozpoczęcia bez zakładania działalności gospodarczej", d: "W określonych przypadkach współpraca może być prowadzona w dopuszczalnej prawnie formie bez natychmiastowego zakładania firmy." },
];

const EARN = [
  { t: "Pozyskujesz klienta", d: "Z własnej sieci lub z kampanii wspieranych AI." },
  { t: "Wprowadzasz go do systemu", d: "Sprawa trafia do uporządkowanego procesu." },
  { t: "Prowadzisz sprawę w CRM", d: "Dokumenty, komunikacja i statusy w jednym miejscu." },
  { t: "Sprawa trafia do inwestorów", d: "Finansujący analizują okazję." },
  { t: "Powstaje prowizja", d: "Po uruchomieniu finansowania naliczana jest prowizja." },
  { t: "Rozliczenie", d: "Prowizja jest rozliczana transparentnie przez Finance You zgodnie z zasadami współpracy." },
];

const STAGES = ["Rejestracja", "Szkolenie", "Pierwszy klient", "Obsługa w CRM", "Współpraca z inwestorem", "Prowizja", "Skalowanie", "Lokalna sieć klientów"];

const CRM: { icon: Icon3DName; t: string }[] = [
  { icon: "status", t: "Status klienta" },
  { icon: "documents", t: "Dokumenty" },
  { icon: "house", t: "Nieruchomość" },
  { icon: "dossier", t: "Numer KW" },
  { icon: "investors", t: "Inwestorzy" },
  { icon: "chat", t: "Komunikacja" },
  { icon: "growth", t: "Prowizja" },
  { icon: "procedures", t: "Zadania" },
  { icon: "crm", t: "Historia kontaktu" },
];

const CAMP: FeatureItemData[] = [
  { icon: "documents", t: "Gotowe materiały", d: "Kreacje i treści gotowe do użycia." },
  { icon: "automation", t: "Automatyzacja kontaktu", d: "Sekwencje follow-up bez ręcznej pracy." },
  { icon: "chat", t: "Komunikaty SMS / e-mail", d: "Wielokanałowa komunikacja z leadami." },
  { icon: "growth", t: "Wsparcie leadów", d: "Dogrzewanie i kwalifikacja kontaktów." },
  { icon: "updates", t: "Follow-upy", d: "Przypomnienia i ponawianie kontaktu." },
  { icon: "crmfolder", t: "Segmentacja klientów", d: "Porządek w bazie i priorytetach." },
];

const FAQS = [
  { q: "Czy muszę mieć doświadczenie?", a: "Nie. Otrzymujesz szkolenie i gotowy proces. Program jest dostosowany do osób na różnym poziomie zaawansowania." },
  { q: "Czy dostaję szkolenie?", a: "Tak. Wdrożenie obejmuje szkolenie z procesu, standardów i obsługi w CRM." },
  { q: "Jak działa CRM?", a: "CRM porządkuje klientów, dokumenty, nieruchomości, komunikację, statusy i prowizje w jednym panelu partnera." },
  { q: "Jak rozliczana jest prowizja?", a: "Po uruchomieniu finansowania powstaje prowizja, rozliczana transparentnie przez Finance You zgodnie z zasadami współpracy. Szczegóły określa umowa partnerska." },
  { q: "Czy mogę obsługiwać własnych klientów?", a: "Tak. Możesz wprowadzać własnych klientów i prowadzić ich sprawy w systemie." },
  { q: "Czy Finance You daje inwestorów?", a: "Tak. Uzyskujesz dostęp do bazy finansujących współpracujących z platformą." },
  { q: "Czy mogę korzystać z kampanii AI?", a: "Tak. Otrzymujesz gotowe materiały i automatyzację kontaktu wspieraną AI." },
  { q: "Czy mogę skalować współpracę?", a: "Tak. Model pozwala budować lokalną sieć klientów i rozwijać współpracę." },
];

function Hero() {
  return (
    <section className="fy-hero" style={{ color: "#fff", borderBottom: "1px solid var(--border)" }}>
      <div aria-hidden className="fy-hero-fx" />
      <div className="fy-hero-grid" style={{ position: "relative", maxWidth: "80rem", margin: "0 auto", padding: "4rem 1.5rem 4.5rem" }}>
        <div>
          <MktBadge variant="gold">Program Pośrednika</MktBadge>
          <h1 style={{ marginTop: "1rem", fontSize: "clamp(2.1rem, 4vw, 3.1rem)", fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.025em" }}>
            Zarabiaj jako{" "}
            <span style={{ background: "linear-gradient(95deg,#f0c667,#f6dc9c 34%,#5fa2f6 82%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              pośrednik Finance You.
            </span>
          </h1>
          <p style={{ marginTop: "1.1rem", maxWidth: "34rem", fontSize: "1.05rem", lineHeight: 1.6, color: "rgba(255,255,255,.82)" }}>
            Otrzymujesz gotowy system: CRM, szkolenie, kampanie wspierane AI, bazę inwestorów, dokumenty i model rozliczeń prowizji.
          </p>
          <div style={{ marginTop: "1.8rem", display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
            <MktButton variant="cta" href={JOIN}>
              <BrandIcon name="ltv" size={18} /> Dołącz jako pośrednik
            </MktButton>
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <div aria-hidden style={{ position: "absolute", inset: "-1.5rem", borderRadius: "var(--radius-3xl)", background: "linear-gradient(135deg, oklch(0.78 0.18 85 / .28), oklch(0.40 0.25 268 / .25))", filter: "blur(34px)" }} />
          <div style={{ position: "relative", borderRadius: "var(--radius-2xl)", overflow: "hidden", border: "1px solid rgba(255,255,255,.15)", boxShadow: "var(--shadow-2xl)" }}>
            <iframe
              title="Program Pośrednika Finance You"
              allow="autoplay; fullscreen"
              allowFullScreen
              src="https://fast.wistia.net/embed/iframe/fws0jrux1n?seo=false"
              style={{ width: "100%", aspectRatio: "16 / 9", display: "block", border: 0 }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function BrokerLanding() {
  return (
    <MarketingShell page="posrednik" sticky={{ label: "Dołącz jako pośrednik", href: JOIN }}>
      <Hero />

      <Section>
        <SectionHead eyebrow="Co dostajesz" title="Gotowy system do prowadzenia klientów" />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={GET} icon3d />
        </div>
      </Section>

      <Section tint>
        <SectionHead eyebrow="Jak zarabiasz" title="Od klienta do rozliczonej prowizji" />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={EARN.map((e) => ({ icon: "check", t: e.t, d: e.d }))} />
        </div>
        <ComplianceNote style={{ marginTop: "2rem" }}>
          Warunki współpracy i rozliczeń prowizyjnych określa umowa partnerska. Nie gwarantujemy konkretnych kwot.
        </ComplianceNote>
      </Section>

      <Section>
        <SectionHead eyebrow="Ścieżka rozwoju" title="Od pierwszego klienta do własnego biznesu" />
        <div className="fy-steps" style={{ marginTop: "2.5rem", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.9rem" }}>
          {STAGES.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "1rem", borderRadius: "var(--radius-xl)", border: "1px solid var(--border)", background: "var(--card)", boxShadow: "var(--shadow-xs)" }}>
              <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, flexShrink: 0, borderRadius: "50%", background: "var(--gradient-brand)", color: "#fff", fontWeight: 800, fontSize: "0.78rem" }}>
                {i + 1}
              </span>
              <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{s}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section tint>
        <SectionHead eyebrow="CRM dla pośrednika" title="Wszystko o kliencie w jednym panelu" />
        <div className="fy-modules" style={{ marginTop: "2.5rem", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.8rem" }}>
          {CRM.map((c) => (
            <div key={c.t} style={{ display: "flex", alignItems: "center", gap: 12, padding: "0.9rem 1.1rem", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", background: "var(--card)", boxShadow: "var(--shadow-xs)" }}>
              <Icon3D name={c.icon} size={40} />
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{c.t}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Kampanie AI" title="Pozyskuj leady z gotowymi narzędziami" />
        <div style={{ marginTop: "2.5rem" }}>
          <FeatureGrid items={CAMP} icon3d />
        </div>
      </Section>

      <Section>
        <SectionHead center eyebrow="Na żywo" title="Ostatnie transakcje" sub="Faktury sprzedaży realizowane w systemie Finance You — aktualizowane na bieżąco." />
        <div style={{ marginTop: "2.5rem", maxWidth: "60rem", marginLeft: "auto", marginRight: "auto", borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}>
          <iframe
            src="https://app.financeyou.pl/embed/faktury"
            style={{ border: 0, width: "100%", minHeight: 600, height: 720, display: "block" }}
            loading="lazy"
            title="Faktury sprzedaży Finance You"
          />
        </div>
      </Section>

      <Section tint>
        <SectionHead center eyebrow="Rejestracja" title="Program Pośrednika Finance You" />
        <div style={{ marginTop: "2.5rem" }}>
          <PricingCard
            eyebrow="Program Pośrednika Finance You"
            title="Konto partnera"
            price="XXX zł"
            period="/ start"
            cta="Załóż konto partnera"
            href={JOIN}
            features={["CRM + panel partnera", "Szkolenie wdrożeniowe", "Kampanie AI i materiały", "Dostęp do bazy inwestorów", "Wzory dokumentów i procedury", "Transparentny model prowizyjny"]}
            note="Cena orientacyjna (placeholder). Warunki określa umowa partnerska."
          />
        </div>
      </Section>

      <Section id="faq">
        <SectionHead center eyebrow="FAQ" title="Najczęstsze pytania pośredników" />
        <FAQ items={FAQS} />
      </Section>

      <CTASection
        single
        title="Zacznij prowadzić klientów w systemie, który daje Ci proces, narzędzia i inwestorów."
        buttons={[{ label: "Dołącz jako pośrednik", href: JOIN }]}
      />
    </MarketingShell>
  );
}
