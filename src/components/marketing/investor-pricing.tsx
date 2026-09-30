// Dostęp inwestora na stronie publicznej: JEDEN pakiet „Dostęp inwestora"
// — 0 zł. Usługa Finance You dla Inwestora jest nieodpłatna (Umowa ramowa v7);
// jedyną opłatą w systemie jest Prowizja Klientowska obciążająca Klienta.
// Lista funkcji pochodzi z lib/investor-plan/plans.ts (jedno źródło prawdy).
import type { AccessProduct } from "@/lib/access/core";
import { ACCESS_PRESENTATION } from "@/lib/investor-plan/plans";
import { MktButton } from "./primitives";
import { BrandIcon } from "./brand-icon";

const JOIN = "/rejestracja?role=inwestor";

export function InvestorPricing(_props: { products?: AccessProduct[] }) {
  const t = ACCESS_PRESENTATION;
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
              marginTop: "0.9rem",
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "2.2rem", fontWeight: 900 }}>{t.priceLabel}</span>
            <span style={{ fontSize: "0.85rem", opacity: 0.82 }}>{t.periodLabel}</span>
          </div>
          <p style={{ marginTop: "0.6rem", fontSize: "0.82rem", opacity: 0.88, lineHeight: 1.5 }}>
            {t.tagline}
          </p>
        </div>

        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", flex: 1 }}>
          <ul style={{ padding: 0, listStyle: "none", display: "grid", gap: "0.65rem", flex: 1 }}>
            {t.bullets.map((f) => (
              <li key={f} style={{ display: "flex", gap: 10, fontSize: "0.9rem" }}>
                <BrandIcon name="check" size={18} />
                <span>{f}</span>
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
            {t.note}
          </p>
          <MktButton variant="cta" href={JOIN} style={{ width: "100%", marginTop: "1rem" }}>
            Załóż konto inwestora
          </MktButton>
        </div>
      </div>
    </div>
  );
}
