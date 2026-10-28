// Cennik inwestora na stronie publicznej: JEDEN abonament z przełącznikiem
// okresu (suwak Miesięcznie / Rocznie). Ceny, rabat, tagline i punkty oferty
// pochodzą z lib/investor-plan/plans.ts (jedno źródło prawdy dla strony,
// panelu i botów). Prowizję od Pożyczkobiorcy płaci klient.
//
// Karta od góry: nazwa → cena i podpowiedź → chip „bez karty” → raty →
// przycisk do płatności (od razu pod niebieskim polem) → punkty oferty.
// Sprzedawca, regulamin, kod rabatowy i warunki rat są na stronie zakupu.
import type { AccessProduct } from "@/lib/access/core";
import {
  ACCESS_PRESENTATION,
  SUBSCRIPTION_OPTIONS,
  installmentEstimatePln,
  plnLabel,
  type BenefitBullet,
  type BillingPeriod,
} from "@/lib/investor-plan/plans";
import { MktButton } from "./primitives";
import { BrandIcon } from "./brand-icon";
import { INVESTOR_MODULES, investorModulePath } from "./investor-modules";

// Przycisk prowadzi do płatności Tpay; konto inwestora powstaje z danych
// płatności po jej zaksięgowaniu (lib/access/guest-checkout.functions.ts).
const CHECKOUT = "/abonament-inwestora";
const BONUS_INSTALLMENTS: Record<BillingPeriod, number> = { rocznie: 12 };

/** Złota plakietka „BONUS: w ratach” z orientacyjną ratą dla wybranego okresu. */
export function InstallmentBonus({
  period,
  tone = "dark",
}: {
  period: BillingPeriod;
  tone?: "dark" | "light";
}) {
  const n = BONUS_INSTALLMENTS[period];
  const rate = installmentEstimatePln(SUBSCRIPTION_OPTIONS[period].pricePln, n);
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        textAlign: "left",
        borderRadius: "var(--radius-2xl)",
        padding: "0.9rem 1rem",
        background:
          tone === "dark"
            ? "linear-gradient(120deg, rgba(240,198,103,.22), rgba(246,220,156,.10))"
            : "linear-gradient(120deg, oklch(0.95 0.06 88), oklch(0.98 0.03 88))",
        border: "1px solid oklch(0.80 0.14 85 / 0.7)",
        color: tone === "dark" ? "#fff" : "var(--foreground)",
      }}
    >
      <span
        style={{
          flex: "0 0 auto",
          borderRadius: 999,
          padding: "0.25rem 0.6rem",
          fontSize: "0.72rem",
          fontWeight: 900,
          letterSpacing: "0.08em",
          background: "linear-gradient(95deg,#f0c667,#f6dc9c)",
          color: "#101430",
        }}
      >
        RATY
      </span>
      <div style={{ lineHeight: 1.45 }}>
        <div style={{ fontWeight: 800, fontSize: "0.98rem" }}>
          W ratach już od ok. {plnLabel(rate)} / mies.
        </div>
        <div style={{ fontSize: "0.82rem", opacity: tone === "dark" ? 0.9 : 0.8 }}>
          {n} rat × ok. {plnLabel(rate)} — także jako firma (PragmaPay: 3–12 rat albo zapłata za
          14–60 dni). Wybierasz w bramce Tpay, bez karty kredytowej.
        </div>
      </div>
    </div>
  );
}

/** Podstrona modułu dla punktu oferty (o ile ma). */
function bulletModule(b: BenefitBullet) {
  return b.moduleSlug ? INVESTOR_MODULES.find((mod) => mod.slug === b.moduleSlug) : undefined;
}

// Punkt oferty: nazwa jako pogrubiony nagłówek (link do podstrony modułu,
// jeśli jest), pod nią sama korzyść — jedno zdanie (decyzja właściciela 28.10.2026).
// Bez etykiet części formuły i bez formy „Nazwa — Zdanie".
function BenefitItem({ b }: { b: BenefitBullet }) {
  const m = bulletModule(b);
  const href = m ? investorModulePath(m.slug) : undefined;
  return (
    <li style={{ display: "flex", gap: 10, fontSize: "0.9rem" }}>
      <BrandIcon name="check" size={18} />
      <div style={{ lineHeight: 1.45 }}>
        <div style={{ fontWeight: 700, color: "var(--foreground)" }}>
          {href ? (
            <a href={href} style={{ color: "inherit", textDecoration: "underline" }}>
              {b.cecha}
            </a>
          ) : (
            b.cecha
          )}
        </div>
        <p style={{ margin: "0.15rem 0 0", color: "var(--muted-foreground)" }}>{b.korzysc}</p>
      </div>
    </li>
  );
}

export function InvestorPricing(_props: { products?: AccessProduct[] }) {
  const t = ACCESS_PRESENTATION;
  // Domyślnie roczny — od razu widać rabat.
  const period: BillingPeriod = "rocznie";
  const opt = SUBSCRIPTION_OPTIONS[period];
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

          <div style={{ marginTop: "1rem" }}>
            <span>12 miesięcy</span>
          </div>

          <div
            aria-live="polite"
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
            <BrandIcon name="lock" size={16} /> Bez karty kredytowej i bez automatycznego odnawiania
          </div>
          <div style={{ marginTop: "1rem" }}>
            <InstallmentBonus period={period} />
          </div>
        </div>

        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", flex: 1 }}>
          {/* Przycisk od razu pod niebieskim polem z ceną. */}
          <MktButton variant="gold" href={`${CHECKOUT}?okres=${period}`} style={{ width: "100%" }}>
            Zostań partnerem
          </MktButton>
          <ul
            style={{
              marginTop: "1.4rem",
              padding: 0,
              listStyle: "none",
              display: "grid",
              gap: "0.65rem",
              flex: 1,
            }}
          >
            {t.bullets.map((b) => (
              <BenefitItem key={b.cecha} b={b} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
