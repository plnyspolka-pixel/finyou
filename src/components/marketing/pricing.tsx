import type { ReactNode } from "react";
import { formatGroszPln, yearlySavingsGrosz, type AccessProduct } from "@/lib/access/core";
import { MktButton } from "./primitives";
import { BrandIcon } from "./brand-icon";

/**
 * Finance You — marketing pricing.
 * Renders the real access catalog (access_products) on the public landing so
 * the cennik always matches the panel. Buying is auth + role gated (access is
 * tied to a user account), so each CTA deep-links into the authenticated
 * abonament page with the product preselected — that page runs the full
 * Tpay checkout + sales-invoice flow. Anonymous visitors are routed through
 * login by the panel guard first.
 */

type Props = {
  products: AccessProduct[];
  audience: "investor" | "broker";
  ctaLabel: string;
  featuresByDuration?: Record<number, string[]>;
  /** Shown when the catalog can't be read (e.g. DB unavailable during SSR). */
  fallback?: ReactNode;
};

const PANEL: Record<Props["audience"], string> = {
  investor: "/inwestor",
  broker: "/posrednik",
};

function periodLabel(days: number): string {
  if (days === 365) return "/ rok (365 dni)";
  if (days === 30) return "/ 30 dni";
  return `/ ${days} dni`;
}

export function MarketingPricing({ products, audience, ctaLabel, featuresByDuration, fallback }: Props) {
  const active = (products ?? []).filter((p) => p.active).sort((a, b) => a.sort_order - b.sort_order);
  if (active.length === 0) {
    return <>{fallback ?? null}</>;
  }

  const monthly = active.find((p) => p.duration_days === 30);
  const yearly = active.find((p) => p.duration_days === 365);
  const savings = monthly && yearly ? yearlySavingsGrosz(monthly.amount_grosz, yearly.amount_grosz) : 0;

  return (
    <div
      style={{
        display: "grid",
        gap: "1.2rem",
        gridTemplateColumns: `repeat(${Math.min(active.length, 2)}, minmax(0, 1fr))`,
        maxWidth: active.length > 1 ? "52rem" : "26rem",
        margin: "0 auto",
      }}
      className={active.length > 1 ? "fy-compare" : undefined}
    >
      {active.map((p) => {
        const best = p.duration_days === 365 && savings > 0;
        const feats = featuresByDuration?.[p.duration_days] ?? [];
        return (
          <div
            key={p.id}
            style={{
              display: "flex",
              flexDirection: "column",
              borderRadius: "var(--radius-3xl)",
              border: best ? "1px solid oklch(0.78 0.18 85 / 0.5)" : "1px solid oklch(0.40 0.25 268 / 0.35)",
              background: "var(--card)",
              boxShadow: best ? "var(--shadow-xl)" : "var(--shadow-lg)",
              overflow: "hidden",
            }}
          >
            <div style={{ background: "var(--gradient-brand)", color: "#fff", padding: "1.5rem", position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.85 }}>
                  {p.label}
                </div>
                {best && (
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
                    Najlepsza cena
                  </span>
                )}
              </div>
              <div style={{ marginTop: "0.9rem", display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: "2.2rem", fontWeight: 900 }}>{formatGroszPln(p.amount_grosz)}</span>
                <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>{periodLabel(p.duration_days)}</span>
              </div>
              {best && savings > 0 && (
                <div style={{ marginTop: "0.4rem", fontSize: "0.75rem", fontWeight: 600, opacity: 0.9 }}>
                  Oszczędzasz {formatGroszPln(savings)} względem 12× pakietu 30-dniowego
                </div>
              )}
            </div>
            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", flex: 1 }}>
              {feats.length > 0 && (
                <ul style={{ padding: 0, listStyle: "none", display: "grid", gap: "0.65rem", flex: 1 }}>
                  {feats.map((f) => (
                    <li key={f} style={{ display: "flex", gap: 10, fontSize: "0.9rem" }}>
                      <BrandIcon name="check" size={18} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
              <MktButton
                variant="cta"
                href={`${PANEL[audience]}/abonament?product=${encodeURIComponent(p.code)}`}
                style={{ width: "100%", marginTop: feats.length > 0 ? "1.4rem" : 0 }}
              >
                {ctaLabel}
              </MktButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}
