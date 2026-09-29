import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { BrandIcon } from "./brand-icon";
import { Icon3D, type Icon3DName } from "./icon-3d";
import { MktButton, MktBadge, Eyebrow } from "./primitives";

/**
 * Finance You — marketing section building blocks. Ported from the design
 * system export (site/shared.jsx). Consume the `.fy-marketing` scoped tokens.
 */

/* ------------------------------ Section --------------------------------- */

export function Section({
  id,
  dark,
  tint,
  children,
  style,
}: {
  id?: string;
  dark?: boolean;
  tint?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const bg = dark
    ? "linear-gradient(180deg,#0a1030,#070b22)"
    : tint
      ? "rgba(120,160,255,0.04)"
      : "transparent";
  return (
    <section
      id={id}
      style={{
        background: bg,
        color: dark ? "#fff" : "inherit",
        borderTop: tint || dark ? "1px solid rgba(84,124,214,0.2)" : "none",
        ...style,
      }}
    >
      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "5rem 1.5rem" }}>{children}</div>
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  sub,
  center,
  tone,
}: {
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  center?: boolean;
  tone?: "accent" | "gold" | "muted" | "white";
}) {
  return (
    <div
      style={{
        maxWidth: center ? "44rem" : "40rem",
        margin: center ? "0 auto" : 0,
        textAlign: center ? "center" : "left",
      }}
    >
      {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
      <h2
        style={{
          marginTop: "0.5rem",
          fontSize: "clamp(1.9rem, 3.2vw, 2.6rem)",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1.08,
        }}
      >
        {title}
      </h2>
      {sub && (
        <p
          style={{
            marginTop: "0.9rem",
            fontSize: "1.02rem",
            lineHeight: 1.6,
            color: tone === "white" ? "rgba(255,255,255,.8)" : "var(--muted-foreground)",
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

/* ------------------------------ RoleCard -------------------------------- */

export type RoleCardProps = {
  icon3d?: Icon3DName;
  badge: { v: "default" | "secondary" | "accent" | "gold"; t: string };
  title: string;
  desc: string;
  cta: string;
  href: string;
  accent: string;
};

export function RoleCard({ icon3d, badge, title, desc, cta, href, accent }: RoleCardProps) {
  const [h, setH] = useState(false);
  return (
    <a
      href={href}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        color: "inherit",
        background: "var(--card)",
        border: `1px solid ${h ? accent : "var(--border)"}`,
        borderRadius: "var(--radius-2xl)",
        padding: "1.6rem",
        boxShadow: h ? "var(--shadow-xl)" : "var(--shadow-sm)",
        transform: h ? "translateY(-3px)" : "none",
        transition: "all var(--duration-base) var(--ease-out)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          insetInline: 0,
          top: 0,
          height: 3,
          background: accent,
          opacity: h ? 1 : 0.4,
          transition: "opacity var(--duration-base)",
        }}
      />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        {icon3d ? <Icon3D name={icon3d} size={72} style={{ margin: "-6px 0 -8px -8px" }} /> : null}
        <MktBadge variant={badge.v}>{badge.t}</MktBadge>
      </div>
      <h3 style={{ marginTop: "1.1rem", fontSize: "1.35rem", fontWeight: 800 }}>{title}</h3>
      <p
        style={{
          marginTop: "0.5rem",
          flex: 1,
          fontSize: "0.92rem",
          lineHeight: 1.55,
          color: "var(--muted-foreground)",
        }}
      >
        {desc}
      </p>
      <span
        style={{
          marginTop: "1.1rem",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 700,
          color: accent,
        }}
      >
        {cta}{" "}
        <span
          style={{
            transform: h ? "translateX(3px)" : "none",
            transition: "transform var(--duration-base)",
          }}
        >
          →
        </span>
      </span>
    </a>
  );
}

/* --------------------------- Feature grid ------------------------------- */

export type FeatureItemData = { icon: string; t: string; d?: string };

function FeatureItem({ it, icon3d }: { it: FeatureItemData; icon3d?: boolean }) {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: "var(--card)",
        border: `1px solid ${h ? "oklch(0.40 0.25 268 / 0.5)" : "var(--border)"}`,
        borderRadius: "var(--radius-2xl)",
        padding: "1.4rem",
        boxShadow: h ? "var(--shadow-lg)" : "var(--shadow-sm)",
        transform: h ? "translateY(-2px)" : "none",
        transition: "all var(--duration-base) var(--ease-out)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: icon3d ? 12 : 10 }}>
        {icon3d ? (
          <Icon3D name={it.icon as Icon3DName} size={48} />
        ) : (
          <BrandIcon name={it.icon} size={26} />
        )}
        <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>{it.t}</h3>
      </div>
      {it.d && (
        <p
          style={{
            marginTop: "0.55rem",
            fontSize: "0.88rem",
            lineHeight: 1.55,
            color: "var(--muted-foreground)",
          }}
        >
          {it.d}
        </p>
      )}
    </div>
  );
}

export function FeatureGrid({
  items,
  cols = 3,
  icon3d,
}: {
  items: FeatureItemData[];
  cols?: number;
  icon3d?: boolean;
}) {
  return (
    <div
      className="fy-grid"
      style={{ display: "grid", gap: "1rem", gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {items.map((it) => (
        <FeatureItem key={it.t} it={it} icon3d={icon3d} />
      ))}
    </div>
  );
}

/* --------------------------- Module grid -------------------------------- */

export function ModuleGrid({ items }: { items: { icon: Icon3DName; t: string }[] }) {
  return (
    <div
      className="fy-modules"
      style={{ display: "grid", gap: "0.7rem", gridTemplateColumns: "repeat(5, 1fr)" }}
    >
      {items.map((m) => (
        <div
          key={m.t}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 10,
            padding: "1.3rem 0.6rem 1.1rem",
            borderRadius: "var(--radius-xl)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <Icon3D name={m.icon} size={56} />
          <span style={{ fontSize: "0.76rem", fontWeight: 600 }}>{m.t}</span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- Process steps ------------------------------ */

export function ProcessSteps({
  steps,
  cols,
}: {
  steps: { t: string; d?: string }[];
  cols?: number;
}) {
  return (
    <div
      className="fy-steps"
      style={{
        display: "grid",
        gap: "1.1rem",
        gridTemplateColumns: `repeat(${cols || Math.min(steps.length, 3)}, 1fr)`,
      }}
    >
      {steps.map((s, i) => (
        <div
          key={i}
          style={{
            position: "relative",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-2xl)",
            padding: "1.4rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              display: "grid",
              placeItems: "center",
              width: 44,
              height: 44,
              borderRadius: "var(--radius-xl)",
              background: "linear-gradient(135deg, var(--navy-800), var(--navy-950))",
              color: "#fff",
              fontWeight: 800,
              boxShadow: "var(--shadow-md)",
            }}
          >
            {i + 1}
          </div>
          <h3 style={{ marginTop: "0.9rem", fontSize: "0.98rem", fontWeight: 700 }}>{s.t}</h3>
          {s.d && (
            <p
              style={{
                marginTop: "0.3rem",
                fontSize: "0.85rem",
                lineHeight: 1.5,
                color: "var(--muted-foreground)",
              }}
            >
              {s.d}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* --------------------------- Comparison --------------------------------- */

export function ComparisonTable({
  left,
  rightLabel,
  rows,
}: {
  left: string;
  rightLabel: ReactNode;
  rows: [string, string][];
}) {
  return (
    <div
      className="fy-compare"
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
    >
      <div
        style={{
          borderRadius: "var(--radius-2xl)",
          border: "1px solid var(--border)",
          background: "var(--card)",
          padding: "1.5rem",
        }}
      >
        <h3 style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--muted-foreground)" }}>
          {left}
        </h3>
        <ul
          style={{
            marginTop: "1rem",
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: "0.7rem",
          }}
        >
          {rows.map((r) => (
            <li
              key={r[0]}
              style={{
                display: "flex",
                gap: 10,
                fontSize: "0.88rem",
                color: "var(--muted-foreground)",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "var(--secondary)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12,
                }}
              >
                ×
              </span>
              <span>{r[0]}</span>
            </li>
          ))}
        </ul>
      </div>
      <div
        style={{
          borderRadius: "var(--radius-2xl)",
          border: "1px solid oklch(0.40 0.25 268 / 0.4)",
          background: "linear-gradient(160deg, var(--card), oklch(0.40 0.25 268 / 0.05))",
          padding: "1.5rem",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <h3
          style={{
            fontSize: "1.05rem",
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {rightLabel}
        </h3>
        <ul
          style={{
            marginTop: "1rem",
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: "0.7rem",
          }}
        >
          {rows.map((r) => (
            <li
              key={r[1]}
              style={{ display: "flex", gap: 10, fontSize: "0.88rem", fontWeight: 500 }}
            >
              <span style={{ flexShrink: 0, marginTop: 1 }}>
                <BrandIcon name="check" size={18} />
              </span>
              <span>{r[1]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* --------------------------- Pricing card ------------------------------- */

export function PricingCard({
  eyebrow,
  title,
  price,
  period,
  features,
  cta,
  href,
  note,
}: {
  eyebrow: string;
  title: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  href: string;
  note?: string;
}) {
  return (
    <div
      style={{
        maxWidth: "26rem",
        margin: "0 auto",
        borderRadius: "var(--radius-3xl)",
        border: "1px solid oklch(0.40 0.25 268 / 0.35)",
        background: "var(--card)",
        boxShadow: "var(--shadow-xl)",
        overflow: "hidden",
      }}
    >
      <div style={{ background: "var(--gradient-brand)", color: "#fff", padding: "1.5rem" }}>
        <div
          style={{
            fontSize: "0.7rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            opacity: 0.85,
          }}
        >
          {eyebrow}
        </div>
        <h3 style={{ marginTop: "0.4rem", fontSize: "1.5rem", fontWeight: 800 }}>{title}</h3>
        <div style={{ marginTop: "0.9rem", display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: "2.2rem", fontWeight: 900 }}>{price}</span>
          <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>{period}</span>
        </div>
      </div>
      <div style={{ padding: "1.5rem" }}>
        <ul style={{ padding: 0, listStyle: "none", display: "grid", gap: "0.65rem" }}>
          {features.map((f) => (
            <li key={f} style={{ display: "flex", gap: 10, fontSize: "0.9rem" }}>
              <BrandIcon name="check" size={18} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <MktButton variant="cta" href={href} style={{ width: "100%", marginTop: "1.4rem" }}>
          {cta}
        </MktButton>
        {note && (
          <p
            style={{
              margin: "0.8rem 0 0",
              textAlign: "center",
              fontSize: "0.72rem",
              color: "var(--muted-foreground)",
            }}
          >
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- FAQ ------------------------------------ */

export function FAQ({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div
      style={{
        maxWidth: "52rem",
        margin: "2.5rem auto 0",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-2xl)",
        background: "var(--card)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      {items.map((f, i) => (
        <div key={i} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
          <button
            onClick={() => setOpen(open === i ? -1 : i)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              padding: "1.1rem 1.4rem",
              background: "none",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              font: "inherit",
              color: "inherit",
            }}
          >
            <span style={{ fontSize: "0.98rem", fontWeight: 600 }}>{f.q}</span>
            <span
              style={{
                color: "var(--accent)",
                transform: open === i ? "rotate(45deg)" : "none",
                transition: "transform .2s",
                fontSize: "1.4rem",
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              +
            </span>
          </button>
          {open === i && (
            <p
              style={{
                margin: 0,
                padding: "0 1.4rem 1.2rem",
                fontSize: "0.9rem",
                lineHeight: 1.65,
                color: "var(--muted-foreground)",
              }}
            >
              {f.a}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* --------------------------- Compliance note ---------------------------- */

export function ComplianceNote({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        maxWidth: "52rem",
        margin: "0 auto",
        padding: "0.9rem 1.1rem",
        borderRadius: "var(--radius-xl)",
        background: "var(--secondary)",
        border: "1px solid var(--border)",
        ...style,
      }}
    >
      <BrandIcon name="shield" size={18} />
      <p
        style={{
          margin: 0,
          fontSize: "0.78rem",
          lineHeight: 1.55,
          color: "var(--muted-foreground)",
        }}
      >
        {children}
      </p>
    </div>
  );
}

/* ---------------------------- CTA section ------------------------------- */

export function CTASection({
  title,
  sub,
  buttons,
  single,
}: {
  title: ReactNode;
  sub?: ReactNode;
  buttons: { label: string; href: string; img?: string }[];
  single?: boolean;
}) {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(135deg, var(--navy-800), var(--navy-950))",
        color: "#fff",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.5,
          backgroundImage:
            "radial-gradient(circle at 18% 25%, oklch(0.40 0.25 268 / .5), transparent 55%), radial-gradient(circle at 82% 75%, oklch(0.65 0.13 235 / .4), transparent 55%)",
        }}
      />
      <div
        style={{
          position: "relative",
          maxWidth: "60rem",
          margin: "0 auto",
          padding: "5rem 1.5rem",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(1.9rem, 3.4vw, 2.7rem)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          {title}
        </h2>
        {sub && (
          <p
            style={{
              marginTop: "1rem",
              fontSize: "1.05rem",
              color: "rgba(255,255,255,.8)",
              maxWidth: "40rem",
              marginInline: "auto",
            }}
          >
            {sub}
          </p>
        )}
        <div
          style={{
            marginTop: "2rem",
            display: "flex",
            gap: "0.8rem",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {buttons.map((b, i) =>
            b.img ? (
              <a key={b.label} href={b.href} className="fy-imgbtn">
                <img src={`/marketing/buttons/${b.img}`} alt={b.label} />
              </a>
            ) : (
              <MktButton
                key={b.label}
                variant={single || i === 0 ? "cta" : "outline"}
                size={single ? "cta" : "lg"}
                href={b.href}
                style={
                  single || i === 0
                    ? {}
                    : {
                        background: "rgba(255,255,255,.08)",
                        borderColor: "rgba(255,255,255,.3)",
                        color: "#fff",
                      }
                }
              >
                {b.label}
              </MktButton>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
