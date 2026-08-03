// Linkowalny asset (moduł 3a promptu SEO): kalkulator LTV / zdolności
// zastawnej. Czysty frontend — żadne dane nie są zapisywane ani wysyłane.
// Wynik można udostępnić (parametry w URL) lub wydrukować / zapisać do PDF.
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/shell";
import { Section, ComplianceNote } from "@/components/marketing/sections";
import { MktButton } from "@/components/marketing/primitives";
import { breadcrumbLd, SITE_URL } from "@/lib/seo/company";
import { formatPl } from "@/lib/seo-location/core";
import { Check, Link2, Printer } from "lucide-react";

const PAGE_URL = `${SITE_URL}/kalkulator-ltv`;

// Widełki spójne z publicznym kalkulatorem pożyczki (wynagrodzenie inwestora
// 15–45% rocznie, sugerowane zależnie od parametrów) oraz z komunikacją
// produktu (finansowanie typowo do ok. 50–60% wartości nieruchomości).
const MAX_LTV_LOW = 0.5;
const MAX_LTV_HIGH = 0.6;

type SearchParams = { w?: number; k?: number };

export const Route = createFileRoute("/kalkulator-ltv")({
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000_000) : undefined;
    };
    return { w: num(search.w), k: num(search.k) };
  },
  head: () => ({
    meta: [
      { title: "Kalkulator LTV — ile pożyczysz pod nieruchomość?" },
      {
        name: "description",
        content:
          "Bezpłatny kalkulator LTV: policz wskaźnik LTV, orientacyjną maksymalną kwotę pożyczki pod zastaw nieruchomości i widełki kosztów. Bez rejestracji, wynik od ręki.",
      },
      { property: "og:title", content: "Kalkulator LTV — ile pożyczysz pod nieruchomość?" },
      {
        property: "og:description",
        content:
          "Policz LTV i orientacyjną maksymalną kwotę pożyczki pod zastaw nieruchomości. Bez rejestracji.",
      },
      { property: "og:url", content: PAGE_URL },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pl_PL" },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Kalkulator LTV — Finance You",
          url: PAGE_URL,
          applicationCategory: "FinanceApplication",
          operatingSystem: "Web",
          inLanguage: "pl-PL",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "PLN" },
          provider: { "@type": "Organization", name: "Finance You", url: SITE_URL },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(
          breadcrumbLd([
            { name: "Finance You", path: "/" },
            { name: "Kalkulator LTV", path: "/kalkulator-ltv" },
          ]),
        ),
      },
    ],
  }),
  component: LtvCalculatorPage,
});

function fieldStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: "var(--radius-xl)",
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
    fontSize: "1rem",
    fontWeight: 600,
  };
}

function LtvCalculatorPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [value, setValue] = useState<number>(search.w ?? 600_000);
  const [amount, setAmount] = useState<number>(search.k ?? 250_000);
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => {
    if (!(value > 0) || !(amount > 0)) return null;
    const ltv = amount / value;
    const maxLow = Math.floor((value * MAX_LTV_LOW) / 1000) * 1000;
    const maxHigh = Math.floor((value * MAX_LTV_HIGH) / 1000) * 1000;
    // Orientacyjne widełki rocznego wynagrodzenia inwestora — im niższe LTV,
    // tym niższy koszt (spójne z zakresem 15–45% z kalkulatora pożyczki).
    const [rateLow, rateHigh] =
      ltv <= 0.35 ? [15, 25] : ltv <= 0.5 ? [18, 32] : ltv <= 0.6 ? [22, 38] : [25, 45];
    return { ltv, maxLow, maxHigh, rateLow, rateHigh, feasible: ltv <= MAX_LTV_HIGH };
  }, [value, amount]);

  const shareUrl = `${PAGE_URL}?w=${value}&k=${amount}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      void navigate({ search: { w: value, k: amount }, replace: true });
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* schowek niedostępny */
    }
  };

  return (
    <MarketingShell page="kalkulator">
      <Section>
        <div style={{ maxWidth: "44rem", margin: "0 auto" }}>
          <h1
            style={{
              fontSize: "clamp(1.9rem, 3.6vw, 2.6rem)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              color: "var(--foreground)",
            }}
          >
            Kalkulator LTV — zdolność zastawna nieruchomości
          </h1>
          <p
            style={{
              marginTop: "0.9rem",
              fontSize: "1rem",
              lineHeight: 1.65,
              color: "var(--muted-foreground)",
            }}
          >
            LTV (loan-to-value) to stosunek kwoty pożyczki do wartości nieruchomości. Im niższe LTV,
            tym większa szansa na finansowanie i lepsze warunki. Policz swój wskaźnik — bez
            rejestracji, dane nie są nigdzie wysyłane.
          </p>

          <div
            style={{
              marginTop: "2rem",
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
            }}
          >
            <label style={{ display: "grid", gap: "0.4rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--foreground)" }}>
                Wartość nieruchomości (zł)
              </span>
              <input
                type="number"
                min={10000}
                step={10000}
                value={value || ""}
                onChange={(e) => setValue(Number(e.target.value))}
                style={fieldStyle()}
                aria-label="Wartość nieruchomości w złotych"
              />
            </label>
            <label style={{ display: "grid", gap: "0.4rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--foreground)" }}>
                Oczekiwana kwota pożyczki (zł)
              </span>
              <input
                type="number"
                min={10000}
                step={10000}
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
                style={fieldStyle()}
                aria-label="Oczekiwana kwota pożyczki w złotych"
              />
            </label>
          </div>

          {result && (
            <div
              id="wynik-ltv"
              style={{
                marginTop: "1.6rem",
                borderRadius: "var(--radius-2xl)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                padding: "1.5rem",
                display: "grid",
                gap: "1rem",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gap: "0.8rem",
                  gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
                    Twoje LTV
                  </div>
                  <div
                    style={{
                      fontSize: "1.8rem",
                      fontWeight: 900,
                      color: result.feasible ? "var(--accent)" : "var(--destructive, #d33)",
                    }}
                  >
                    {(result.ltv * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
                    Orientacyjna maks. kwota (LTV {MAX_LTV_LOW * 100}–{MAX_LTV_HIGH * 100}%)
                  </div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--foreground)" }}>
                    {formatPl(result.maxLow)} – {formatPl(result.maxHigh)} zł
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
                    Orientacyjne widełki kosztu (rocznie)
                  </div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--foreground)" }}>
                    {result.rateLow}–{result.rateHigh}%
                  </div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--muted-foreground)" }}>
                {result.feasible
                  ? "Wnioskowana kwota mieści się w typowym zakresie LTV dla pożyczek pod zastaw nieruchomości."
                  : `Wnioskowana kwota przekracza typowy zakres LTV (${MAX_LTV_HIGH * 100}% wartości). Rozważ niższą kwotę albo dodatkowe zabezpieczenie — orientacyjnie do ${formatPl(result.maxHigh)} zł.`}
              </p>
              <div
                style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}
                className="no-print"
              >
                <MktButton variant="outline" onClick={copyLink} aria-label="Skopiuj link do wyniku">
                  {copied ? <Check size={15} /> : <Link2 size={15} />}
                  {copied ? " Skopiowano" : " Udostępnij wynik"}
                </MktButton>
                <MktButton
                  variant="outline"
                  onClick={() => window.print()}
                  aria-label="Drukuj lub zapisz PDF"
                >
                  <Printer size={15} /> Drukuj / PDF
                </MktButton>
                <MktButton variant="cta" href="/dla-klienta">
                  Złóż bezpłatny wniosek
                </MktButton>
              </div>
            </div>
          )}

          <h2 style={{ marginTop: "2.5rem", fontSize: "1.3rem", fontWeight: 800 }}>
            Jak interpretować LTV?
          </h2>
          <ul
            style={{
              marginTop: "0.8rem",
              paddingLeft: "1.2rem",
              display: "grid",
              gap: "0.5rem",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              color: "var(--foreground)",
            }}
          >
            <li>
              <strong>LTV do 35%</strong> — komfortowy poziom: szeroki wybór finansujących, zwykle
              najniższe koszty.
            </li>
            <li>
              <strong>LTV 35–50%</strong> — typowy zakres większości transakcji pożyczek pod zastaw
              nieruchomości.
            </li>
            <li>
              <strong>LTV 50–60%</strong> — górna granica akceptowana przy atrakcyjnych, płynnych
              nieruchomościach.
            </li>
            <li>
              <strong>LTV powyżej 60%</strong> — finansowanie mało prawdopodobne bez obniżenia kwoty
              lub dodatkowego zabezpieczenia.
            </li>
          </ul>

          <ComplianceNote style={{ marginTop: "2rem" }}>
            Kalkulator ma charakter symulacji i nie stanowi oferty w rozumieniu art. 66 Kodeksu
            cywilnego ani zapewnienia o udzieleniu finansowania. Rzeczywiste warunki zależą od oceny
            konkretnej nieruchomości i decyzji finansujących. Obliczenia wykonują się w Twojej
            przeglądarce — nie zapisujemy żadnych danych.
          </ComplianceNote>
        </div>
      </Section>
    </MarketingShell>
  );
}
