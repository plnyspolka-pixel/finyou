// Cennik inwestora na stronie publicznej: dwa pakiety — Podstawowy (0 zł,
// płatność za pojedynczą okazję) i PRO (3 000 zł / 6 miesięcy + 5% od
// udzielonej pożyczki). Ceny PRO i opłata za okazję pochodzą z katalogu
// access_products; statyczne wartości z lib/investor-plan/plans.ts są tylko
// zabezpieczeniem na czas, gdy baza jest niedostępna przy SSR.
import { formatGroszPln, type AccessProduct } from "@/lib/access/core";
import {
  PRODUCT_PRO_180D,
  PRODUCT_OKAZJA_UNLOCK,
  PRO_PRICE_GROSZ,
  UNLOCK_PRICE_GROSZ,
  SUCCESS_FEE_BPS,
  TIER_PRESENTATION,
} from "@/lib/investor-plan/plans";
import { MktButton } from "./primitives";
import { BrandIcon } from "./brand-icon";

const JOIN = "/rejestracja?role=inwestor";

export function InvestorPricing({ products }: { products: AccessProduct[] }) {
  const pro = (products ?? []).find((p) => p.code === PRODUCT_PRO_180D && p.active) ?? null;
  const unlock = (products ?? []).find((p) => p.code === PRODUCT_OKAZJA_UNLOCK && p.active) ?? null;

  const proPrice = formatGroszPln(pro?.amount_grosz ?? PRO_PRICE_GROSZ);
  const unlockPrice = formatGroszPln(unlock?.amount_grosz ?? UNLOCK_PRICE_GROSZ);
  const feePercent = (pro?.success_fee_bps ?? SUCCESS_FEE_BPS) / 100;

  const cards = [
    {
      key: "podstawowy" as const,
      price: TIER_PRESENTATION.podstawowy.priceLabel,
      period: TIER_PRESENTATION.podstawowy.periodLabel,
      note: `Odblokowanie pojedynczej okazji: ${unlockPrice} brutto.`,
      href: JOIN,
      cta: "Załóż konto inwestora",
      accent: "linear-gradient(120deg, oklch(0.32 0.10 262), oklch(0.42 0.13 240))",
      border: "oklch(0.40 0.25 268 / 0.35)",
      best: false,
    },
    {
      key: "pro" as const,
      price: proPrice,
      period: `/ 6 miesięcy + ${feePercent}% od udzielonej pożyczki`,
      note: TIER_PRESENTATION.pro.note,
      href: `/inwestor/abonament?product=${encodeURIComponent(PRODUCT_PRO_180D)}`,
      cta: "Wykup pakiet PRO",
      accent:
        "linear-gradient(120deg, oklch(0.36 0.16 285), oklch(0.50 0.18 248) 55%, oklch(0.64 0.15 205))",
      border: "oklch(0.78 0.18 85 / 0.5)",
      best: true,
    },
  ];

  return (
    <div
      className="fy-compare"
      style={{
        display: "grid",
        gap: "1.2rem",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        maxWidth: "58rem",
        margin: "0 auto",
      }}
    >
      {cards.map((c) => {
        const t = TIER_PRESENTATION[c.key];
        return (
          <div
            key={c.key}
            style={{
              display: "flex",
              flexDirection: "column",
              borderRadius: "var(--radius-3xl)",
              border: `1px solid ${c.border}`,
              background: "var(--card)",
              boxShadow: c.best ? "var(--shadow-xl)" : "var(--shadow-lg)",
              overflow: "hidden",
            }}
          >
            <div style={{ background: c.accent, color: "#fff", padding: "1.5rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
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
                  Pakiet {t.name}
                </div>
                {c.best && (
                  <span
                    style={{
                      flexShrink: 0,
                      borderRadius: "var(--radius-full)",
                      padding: "0.15rem 0.6rem",
                      fontSize: "0.62rem",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      background: "oklch(0.82 0.14 88)",
                      color: "#1a1400",
                    }}
                  >
                    Pełny warsztat
                  </span>
                )}
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
                <span style={{ fontSize: "2.2rem", fontWeight: 900 }}>{c.price}</span>
                <span style={{ fontSize: "0.85rem", opacity: 0.82 }}>{c.period}</span>
              </div>
              <p
                style={{ marginTop: "0.6rem", fontSize: "0.82rem", opacity: 0.88, lineHeight: 1.5 }}
              >
                {t.tagline}
              </p>
            </div>

            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", flex: 1 }}>
              <ul
                style={{ padding: 0, listStyle: "none", display: "grid", gap: "0.65rem", flex: 1 }}
              >
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
                {c.note}
              </p>
              <MktButton variant="cta" href={c.href} style={{ width: "100%", marginTop: "1rem" }}>
                {c.cta}
              </MktButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}
