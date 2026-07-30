import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/shell";
import { MktButton } from "@/components/marketing/primitives";
import { OfferCalculatorPanel } from "@/components/landing/offer-calculator-panel";

export const Route = createFileRoute("/kalkulator-pozyczki")({
  head: () => ({
    meta: [
      { title: "Kalkulator pożyczki pod zastaw nieruchomości | Finance You" },
      {
        name: "description",
        content:
          "Policz ratę pożyczki pod zastaw nieruchomości. Ustaw kwotę, okres spłaty i wynagrodzenie inwestora — zobacz miesięczną ratę i pełny harmonogram spłat.",
      },
      { property: "og:title", content: "Kalkulator pożyczki — Finance You" },
      {
        property: "og:description",
        content: "Policz ratę pożyczki pod zastaw nieruchomości — kwota, okres, harmonogram.",
      },
      { property: "og:url", content: "https://financeyou.pl/kalkulator-pozyczki" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/kalkulator-pozyczki" }],
  }),
  component: LoanCalculatorPage,
});

function LoanCalculatorPage() {
  const [amount, setAmount] = useState(200_000);
  const [months, setMonths] = useState(36);
  const [maxPayment, setMaxPayment] = useState(0);
  const [annualRate, setAnnualRate] = useState(30);
  const rateTouchedRef = useRef(false);

  // Max okres spłaty maleje wraz z kwotą:
  // ≤ 400 000 zł → 72 mies., powyżej liniowo z 36 mies. (>400k) do 12 mies. (1 000 000 zł)
  const maxMonths = useMemo(() => {
    if (amount <= 400_000) return 72;
    const t = Math.min(1, Math.max(0, (amount - 400_000) / (1_000_000 - 400_000)));
    return Math.round(36 - t * (36 - 12));
  }, [amount]);
  useEffect(() => {
    if (months > maxMonths) setMonths(maxMonths);
  }, [maxMonths, months]);

  // Sugerowane wynagrodzenie inwestora — aktualizuje się, dopóki użytkownik nie ruszy suwaka.
  const suggestedRate = useMemo(() => {
    const amountT = Math.min(1, Math.max(0, (amount - 20_000) / (1_000_000 - 20_000)));
    const monthsT = Math.min(1, Math.max(0, (months - 6) / (72 - 6)));
    return Math.round(Math.min(45, Math.max(15, 22 + amountT * 18 - monthsT * 8)) * 2) / 2;
  }, [amount, months]);
  useEffect(() => {
    if (!rateTouchedRef.current) setAnnualRate(suggestedRate);
  }, [suggestedRate]);

  return (
    <MarketingShell page="kalkulator">
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          background: "radial-gradient(120% 140% at 0% 0%, #10193f 0%, #0a1030 55%, #070b22 100%)",
          color: "#fff",
        }}
      >
        <div
          style={{
            position: "relative",
            maxWidth: "48rem",
            margin: "0 auto",
            padding: "3.5rem 1.5rem 5rem",
          }}
        >
          <h1
            style={{
              fontSize: "clamp(1.9rem, 3.6vw, 2.6rem)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            Kalkulator pożyczki
          </h1>
          <p
            style={{
              marginTop: "0.9rem",
              maxWidth: "36rem",
              fontSize: "1rem",
              lineHeight: 1.6,
              color: "rgba(255,255,255,.8)",
            }}
          >
            Ustaw kwotę, okres spłaty i wynagrodzenie inwestora — zobaczysz miesięczną ratę oraz
            pełny harmonogram spłat. Wyliczenia mają charakter poglądowy.
          </p>
          <div style={{ marginTop: "2rem" }}>
            <OfferCalculatorPanel
              amount={amount}
              setAmount={setAmount}
              months={months}
              setMonths={setMonths}
              maxMonths={maxMonths}
              annualRate={annualRate}
              setAnnualRate={setAnnualRate}
              rateTouchedRef={rateTouchedRef}
              maxPayment={maxPayment}
              setMaxPayment={setMaxPayment}
              headerLabel="Kalkulator pożyczki"
            />
          </div>
          <div
            style={{
              marginTop: "2rem",
              display: "flex",
              gap: "0.7rem",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <MktButton variant="cta" size="lg" href="/dla-klienta">
              Złóż bezpłatny wniosek
            </MktButton>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
