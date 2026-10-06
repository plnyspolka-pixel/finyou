// Cennik inwestora na stronie publicznej: JEDEN abonament roczny. Cena i
// zdania o płatności pochodzą z lib/investor-plan/plans.ts (jedno źródło
// prawdy dla strony, panelu i botów). Prowizję od Pożyczkobiorcy płaci klient.
import type { AccessProduct } from "@/lib/access/core";
import {
  ACCESS_PRESENTATION,
  SUBSCRIPTION_OPTION,
  SUBSCRIPTION_PAYMENT_SENTENCE,
} from "@/lib/investor-plan/plans";
import { FUNDACJA, REGULAMIN_ABONAMENTU_PATH } from "@/lib/legal/regulamin-abonamentu";
import { MktButton } from "./primitives";
import { BrandIcon } from "./brand-icon";

// Przycisk prowadzi do płatności Tpay; konto inwestora powstaje z danych
// płatności po jej zaksięgowaniu (lib/access/guest-checkout.functions.ts).
const CHECKOUT = "/abonament-inwestora";

export function InvestorPricing(_props: { products?: AccessProduct[] }) {
  const t = ACCESS_PRESENTATION;
  const opt = SUBSCRIPTION_OPTION;
  return (
    <div
      className="fy-compare"
      style={{ display: "grid", gap: "1.2rem", maxWidth: "40rem", margin: "0 auto" }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: "var(--radius-3xl)",
          border: "1px solid oklch(0.78 0.18 85 / 0.5)",
          background: "var(--card)",
          boxShadow: "var(--shadow-xl)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(120deg, oklch(0.36 0.16 285), oklch(0.50 0.18 248) 55%, oklch(0.64 0.15 205))",
            color: "#fff",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              opacity: 0.85,
            }}
          >
            {t.name}
          </div>

          <div
            style={{
              marginTop: "1.1rem",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "2.6rem", fontWeight: 900, lineHeight: 1 }}>
              {opt.priceLabel}
            </span>
            <span style={{ fontSize: "0.95rem", opacity: 0.85 }}>{opt.periodLabel}</span>
          </div>
          <p
            style={{
              margin: "0.7rem auto 0",
              maxWidth: "30rem",
              fontSize: "0.84rem",
              opacity: 0.92,
              lineHeight: 1.5,
            }}
          >
            {opt.hint}
          </p>
          <div
            style={{
              marginTop: "0.9rem",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
              padding: "0.35rem 0.8rem",
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.28)",
              fontSize: "0.8rem",
              fontWeight: 700,
            }}
          >
            <BrandIcon name="lock" size={16} /> Bez konieczności podpinania karty kredytowej
          </div>
        </div>

        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", flex: 1 }}>
          <p style={{ fontSize: "0.88rem", lineHeight: 1.55, color: "var(--muted-foreground)" }}>
            {t.tagline}
          </p>
          <ul
            style={{
              marginTop: "1rem",
              padding: 0,
              listStyle: "none",
              display: "grid",
              gap: "0.65rem",
              flex: 1,
            }}
          >
            {t.bullets.map((b) => (
              <li key={b.cecha} style={{ display: "flex", gap: 10, fontSize: "0.9rem" }}>
                <BrandIcon name="check" size={18} />
                <span style={{ lineHeight: 1.45 }}>
                  <strong>{b.cecha}</strong>
                  <span style={{ display: "block", color: "var(--muted-foreground)" }}>
                    {b.zaleta}
                  </span>
                  <span style={{ display: "block", fontWeight: 600 }}>{b.korzysc}</span>
                </span>
              </li>
            ))}
          </ul>
          <p
            style={{
              marginTop: "1rem",
              fontSize: "0.74rem",
              lineHeight: 1.5,
              color: "var(--muted-foreground)",
            }}
          >
            {SUBSCRIPTION_PAYMENT_SENTENCE} Sprzedawca: {FUNDACJA.nazwa} (bez VAT),{" "}
            <a href={REGULAMIN_ABONAMENTU_PATH} style={{ textDecoration: "underline" }}>
              regulamin abonamentu
            </a>
            .
          </p>
          <MktButton variant="cta" href={CHECKOUT} style={{ width: "100%", marginTop: "1rem" }}>
            Załóż konto inwestora
          </MktButton>
        </div>
      </div>
    </div>
  );
}
