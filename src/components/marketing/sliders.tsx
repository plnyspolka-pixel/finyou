import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Finance You — marketing sliders. Ported from the design system export
 * (site/inwestor.jsx two-column slider + site/smart-offer.jsx). Consume the
 * `.fy-marketing` scoped tokens.
 */

/* ------------------------ Two-column image slider ----------------------- */
// Used for "Akademia inwestora", "7 warstw ochrony" and "Automatyczna windykacja".

export type TwoColSlide = {
  src: string;
  etap: string; // eyebrow chip, e.g. "Moduł 1" / "Warstwa 1" / "Etap 1"
  dni?: string; // optional "Dzień 1–7" line (windykacja)
  short?: string; // fallback tab label when no `dni`
  title: string;
  desc: string;
};

function arrowStyle(): CSSProperties {
  return {
    cursor: "pointer",
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: "var(--radius-full)",
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
    fontSize: "1.5rem",
    lineHeight: 1,
    display: "grid",
    placeItems: "center",
    boxShadow: "var(--shadow-xs)",
  };
}

export function TwoColSlider({ slides }: { slides: TwoColSlide[] }) {
  const [i, setI] = useState(0);
  const n = slides.length;
  const s = slides[i];
  const go = (d: number) => setI((p) => (p + d + n) % n);
  return (
    <div style={{ maxWidth: "82rem", margin: "0 auto" }}>
      <div
        className="fy-windykacja"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 36rem) 1fr",
          gap: "3rem",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button onClick={() => go(-1)} aria-label="Poprzedni" style={arrowStyle()}>
            ‹
          </button>
          <div style={{ position: "relative", flex: "1 1 auto" }}>
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: "-1rem",
                borderRadius: "var(--radius-3xl)",
                background:
                  "linear-gradient(135deg, oklch(0.40 0.25 268 / .22), oklch(0.78 0.18 85 / .18))",
                filter: "blur(30px)",
              }}
            />
            <div
              style={{
                position: "relative",
                borderRadius: "var(--radius-2xl)",
                overflow: "hidden",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <img
                key={s.src}
                src={s.src}
                alt={`${s.etap} — ${s.title}`}
                draggable={false}
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>
          </div>
          <button onClick={() => go(1)} aria-label="Następny" style={arrowStyle()}>
            ›
          </button>
        </div>
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "0.35rem 0.85rem",
              borderRadius: "var(--radius-full)",
              border: "1px solid oklch(0.78 0.18 85 / 0.5)",
              background: "oklch(0.78 0.18 85 / 0.08)",
              fontSize: "0.72rem",
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--gold)",
            }}
          >
            {s.etap}
          </div>
          {s.dni ? (
            <div
              style={{
                marginTop: "0.9rem",
                fontSize: "0.78rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--accent)",
              }}
            >
              {s.dni} po terminie
            </div>
          ) : null}
          <h3
            style={{
              marginTop: "0.4rem",
              fontSize: "clamp(1.5rem, 2.4vw, 2.1rem)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.08,
            }}
          >
            {s.title}
          </h3>
          <p
            style={{
              marginTop: "1rem",
              fontSize: "1rem",
              lineHeight: 1.65,
              color: "var(--muted-foreground)",
            }}
          >
            {s.desc}
          </p>
          <div
            style={{
              marginTop: "1.4rem",
              fontSize: "0.85rem",
              fontWeight: 700,
              color: "var(--muted-foreground)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {i + 1} / {n}
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: "2rem",
          display: "grid",
          gridTemplateColumns: `repeat(${n}, 1fr)`,
          gap: "0.6rem",
        }}
      >
        {slides.map((sl, idx) => {
          const on = idx === i;
          return (
            <button
              key={idx}
              onClick={() => setI(idx)}
              style={{
                cursor: "pointer",
                font: "inherit",
                textAlign: "left",
                padding: "0.7rem 0.85rem",
                borderRadius: "var(--radius-lg)",
                border: `1px solid ${on ? "oklch(0.78 0.18 85 / 0.6)" : "var(--border)"}`,
                background: on
                  ? "linear-gradient(160deg, var(--card), oklch(0.78 0.18 85 / 0.06))"
                  : "var(--card)",
                boxShadow: on ? "var(--shadow-sm)" : "none",
                transition: "all var(--duration-base) var(--ease-out)",
                color: "inherit",
              }}
            >
              <div
                style={{
                  fontSize: "0.62rem",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: on ? "var(--gold)" : "var(--muted-foreground)",
                }}
              >
                {sl.etap}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  color: on ? "var(--foreground)" : "var(--muted-foreground)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {sl.dni || sl.short}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------- Smart offer (system) slider ---------------------- */

const SO = {
  bg: "rgba(16, 25, 58, 0.32)",
  panel: "rgba(16, 25, 58, 0.72)",
  line: "rgba(84, 124, 214, 0.38)",
  lineSoft: "rgba(84, 124, 214, 0.2)",
  cyan: "oklch(0.82 0.12 192)",
  gold: "oklch(0.82 0.13 85)",
  goldSoft: "oklch(0.82 0.13 85 / 0.5)",
  ink: "#e8eefc",
  muted: "#aeb9db",
  faint: "#7d88ac",
};

const SO_SLIDES = [
  {
    src: "/marketing/system-inwestora/slide-1.png",
    kicker: "Dostęp na wyłączność",
    label: "Krok 1",
    short: "Wyłączność",
    title: "Oferta wybrana specjalnie dla Ciebie",
    desc: "Naszym Partnerom Biznesowym zapewniamy indywidualny dostęp do wybranych okazji inwestycyjnych. Każda propozycja trafia w danym momencie tylko do jednego Partnera i zostaje zarezerwowana dla niego na 24 godziny, z możliwością przedłużenia o kolejne 12 godzin.",
  },
  {
    src: "/marketing/system-inwestora/slide-2.png",
    kicker: "Transparentność",
    label: "Krok 2",
    short: "Transparentność",
    title: "Pełna wiedza przed podjęciem decyzji",
    desc: "W jednym miejscu otrzymujesz najważniejsze informacje o nieruchomości i zabezpieczeniu: treść księgi wieczystej, dane właściciela, wpisane hipoteki, roszczenia, wartość nieruchomości, LTV oraz lokalizację. Widzisz zarówno mocne strony propozycji, jak i kwestie wymagające wyjaśnienia.",
  },
  {
    src: "/marketing/system-inwestora/slide-3.png",
    kicker: "Analiza AI",
    label: "Krok 3",
    short: "Analiza AI",
    title: "Analiza AI pokazuje możliwości i ryzyko",
    desc: "System analizuje zgromadzone dane, porządkuje dokumenty i ocenia kluczowe elementy transakcji. AI wskazuje potencjał, poziom zabezpieczenia oraz zidentyfikowane ryzyka, ale nie podejmuje decyzji za Ciebie. System pokazuje możliwości i ryzyko — Ty wybierasz.",
  },
  {
    src: "/marketing/system-inwestora/slide-4.png",
    kicker: "Twoje warunki",
    label: "Krok 4",
    short: "Twoje warunki",
    title: "Ty ustalasz warunki finansowania",
    desc: "W kalkulatorze samodzielnie określasz kwotę, okres, oprocentowanie i prowizję, a system pokazuje prognozowany wynik. Możesz zaakceptować propozycję, negocjować albo zrezygnować — bez publicznej licytacji i konkurowania z innymi inwestorami. Po zakończeniu rezerwacji sprawa może trafić do kolejnego dopasowanego Partnera.",
  },
];

function soArrow(): CSSProperties {
  return {
    cursor: "pointer",
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: "50%",
    border: `1px solid ${SO.line}`,
    background: SO.panel,
    color: SO.ink,
    fontSize: "1.5rem",
    lineHeight: 1,
    display: "grid",
    placeItems: "center",
  };
}

export function SmartOfferSlider({
  style,
  children,
}: {
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const [i, setI] = useState(0);
  const n = SO_SLIDES.length;
  const s = SO_SLIDES[i];
  const go = (d: number) => setI((v) => (v + d + n) % n);

  return (
    <div
      style={{
        borderRadius: "clamp(20px, 2.4vw, 34px)",
        background: SO.bg,
        border: `1px solid ${SO.line}`,
        boxShadow: "0 30px 90px -50px rgba(8, 16, 48, 0.9)",
        padding: "clamp(1.4rem, 3vw, 3rem)",
        color: SO.ink,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: "0.72rem",
          fontWeight: 800,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: SO.cyan,
        }}
      >
        <span style={{ width: 30, height: 2, background: SO.gold, borderRadius: 2 }} />
        Inteligentny system inwestora
      </div>

      <div
        className="so-grid"
        style={{
          marginTop: "clamp(1.2rem, 2.5vw, 2rem)",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.05fr) 1fr",
          gap: "clamp(1.4rem, 3vw, 3rem)",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
          <button onClick={() => go(-1)} aria-label="Poprzedni slajd" style={soArrow()}>
            ‹
          </button>
          <div
            style={{
              position: "relative",
              flex: "1 1 auto",
              borderRadius: 18,
              overflow: "hidden",
              border: `1px solid ${SO.lineSoft}`,
            }}
          >
            <img
              key={s.src}
              src={s.src}
              alt={s.title}
              draggable={false}
              style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
            />
          </div>
          <button onClick={() => go(1)} aria-label="Następny slajd" style={soArrow()}>
            ›
          </button>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span
              style={{
                fontWeight: 500,
                fontSize: "clamp(2.2rem, 4vw, 3.4rem)",
                lineHeight: 1,
                color: SO.goldSoft,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 800,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: SO.cyan,
              }}
            >
              {s.kicker}
            </span>
          </div>
          <h3
            style={{
              margin: "1rem 0 0",
              fontWeight: 500,
              fontSize: "clamp(1.7rem, 3.2vw, 2.6rem)",
              lineHeight: 1.08,
              letterSpacing: "-0.01em",
              background: `linear-gradient(100deg, ${SO.ink}, ${SO.gold} 70%, oklch(0.92 0.09 88))`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {s.title}
          </h3>
          <p
            style={{
              margin: "1.1rem 0 0",
              fontSize: "clamp(0.98rem, 1.5vw, 1.12rem)",
              lineHeight: 1.65,
              color: SO.muted,
              textWrap: "pretty",
            }}
          >
            {s.desc}
          </p>

          <div
            style={{
              marginTop: "1.6rem",
              fontSize: "0.85rem",
              fontWeight: 700,
              color: SO.faint,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {i + 1} / {n}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: "clamp(1.4rem, 2.6vw, 2rem)",
          display: "grid",
          gridTemplateColumns: `repeat(${n}, 1fr)`,
          gap: "0.6rem",
        }}
      >
        {SO_SLIDES.map((sl, k) => {
          const on = k === i;
          return (
            <button
              key={k}
              onClick={() => setI(k)}
              style={{
                cursor: "pointer",
                font: "inherit",
                textAlign: "left",
                padding: "0.7rem 0.85rem",
                borderRadius: 14,
                border: `1px solid ${on ? SO.goldSoft : SO.lineSoft}`,
                background: on
                  ? "linear-gradient(160deg, rgba(16,25,58,0.9), oklch(0.82 0.13 85 / 0.08))"
                  : SO.panel,
                transition: "all var(--duration-base, .25s)",
              }}
            >
              <div
                style={{
                  fontSize: "0.62rem",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: on ? SO.gold : SO.faint,
                }}
              >
                {sl.label}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  color: on ? SO.ink : SO.muted,
                }}
              >
                {sl.short}
              </div>
            </button>
          );
        })}
      </div>

      {children ? <div style={{ marginTop: "clamp(1.4rem, 2.6vw, 2rem)" }}>{children}</div> : null}

      <div
        style={{
          marginTop: "clamp(1.2rem, 2.4vw, 1.8rem)",
          paddingTop: "1.1rem",
          borderTop: `1px solid ${SO.lineSoft}`,
          textAlign: "center",
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: SO.faint,
        }}
      >
        System pokazuje możliwości i ryzyko — Ty wybierasz.
      </div>
    </div>
  );
}
