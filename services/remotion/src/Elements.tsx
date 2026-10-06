// Katalog elementów ekranowych rolki (src/lib/overlay-elements.ts w aplikacji):
// licznik, porównanie, kroki, cytat, CTA, pieczątka, słupki, belka. Który
// element i kiedy — wybiera planer AI Studia z tekstu lektora; tu tylko
// rysujemy. Wszystkie (poza belką) leżą w górnym pasie kadru i dostają ten
// sam język: szkło, złoto brandu, sprężyste wejścia, liczniki od zera.

import type { OverlayElement } from "../../../src/lib/overlay-elements";
import {
  B,
  C,
  FONT_STACK,
  countUpText,
  ease,
  glassPanel,
  onImageText,
  onPanelText,
  pop,
  ramp,
  rgba,
  shimmerStyle,
  type Clock,
} from "./ui";

/** Wspólna ramka elementu górnego pasa: pozycja, wejście/wyjście, szerokość. */
const Frame: React.FC<{
  el: OverlayElement;
  c: Clock;
  width: number;
  defaultTop: number;
  children: React.ReactNode;
  panel?: boolean;
}> = ({ el, c, width, defaultTop, children, panel = true }) => {
  const { s, t } = c;
  const start = el.startSeconds;
  const end = el.endSeconds == null ? Infinity : Math.max(el.endSeconds, start + 1);
  if (t < start || t >= end) return null;
  const enter = pop(c, start, { damping: 16, stiffness: 120, mass: 0.8 });
  const fade = ramp(t, start, start + 0.18);
  const outFade = Number.isFinite(end) ? 1 - ramp(t, end - 0.2, end) : 1;
  return (
    <div
      style={{
        position: "absolute",
        left: (c.width - width) / 2,
        top: c.height * (el.y ?? defaultTop),
        width,
        opacity: fade * outFade,
        transform: `translateY(${(1 - enter) * 22 * s}px) scale(${0.96 + 0.04 * enter})`,
        transformOrigin: "50% 0%",
        ...(panel ? glassPanel(s) : {}),
        padding: panel ? `${C.padding * s}px ${C.padding * 1.1 * s}px` : 0,
        boxSizing: "border-box",
        fontFamily: FONT_STACK,
        color: "#FFFFFF",
      }}
    >
      {children}
    </div>
  );
};

/** Złoty nagłówek plansz: wersaliki z rozstrzeleniem i kreskami po bokach. */
const Title: React.FC<{ text: string; c: Clock; from: number; panel?: boolean }> = ({
  text,
  c,
  from,
  panel = true,
}) => {
  const { s } = c;
  const e = pop(c, from);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10 * s,
        height: C.titleHeight * s,
        fontWeight: 800,
        fontSize: C.titleFontSize * s,
        letterSpacing: C.titleSpacing * 1.3 * s,
        textTransform: "uppercase",
        color: B.gold,
        whiteSpace: "pre",
        ...(panel ? onPanelText(s) : onImageText(s)),
      }}
    >
      <span style={{ width: 18 * s * e, height: 2 * s, background: rgba(B.gold, 0.8) }} />
      {text}
      <span style={{ width: 18 * s * e, height: 2 * s, background: rgba(B.gold, 0.8) }} />
    </div>
  );
};

// ── stat ────────────────────────────────────────────────────────────────────

const Stat: React.FC<{ el: Extract<OverlayElement, { kind: "stat" }>; c: Clock }> = ({ el, c }) => {
  const { s } = c;
  const start = el.startSeconds;
  const big = 92 * s;
  return (
    <Frame el={el} c={c} width={Math.min(c.width - 72 * s, 520 * s)} defaultTop={C.defaultTop}>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontWeight: 900,
            fontSize: big,
            lineHeight: 1.05,
            letterSpacing: -0.03 * big,
            fontVariantNumeric: "tabular-nums",
            transform: `scale(${0.9 + 0.1 * pop(c, start)})`,
            ...shimmerStyle(c, start + 0.6, 1.2, B.gold, "#FFF4CC"),
            filter: `drop-shadow(0 ${4 * s}px ${14 * s}px ${rgba(B.gold, 0.35)})`,
          }}
        >
          {countUpText(c, el.value, start + 0.05)}
        </div>
        <div
          style={{
            marginTop: 6 * s,
            fontWeight: 700,
            fontSize: 30 * s,
            letterSpacing: 0.04 * 30 * s,
            textTransform: "uppercase",
            opacity: ramp(c.t, start + 0.2, start + 0.45),
            ...onPanelText(s),
          }}
        >
          {el.label}
        </div>
        {el.note && (
          <div
            style={{
              marginTop: 8 * s,
              fontWeight: 500,
              fontSize: 24 * s,
              color: "rgba(255,255,255,0.72)",
              opacity: ramp(c.t, start + 0.45, start + 0.7),
            }}
          >
            {el.note}
          </div>
        )}
      </div>
    </Frame>
  );
};

// ── compare ─────────────────────────────────────────────────────────────────

const Compare: React.FC<{ el: Extract<OverlayElement, { kind: "compare" }>; c: Clock }> = ({
  el,
  c,
}) => {
  const { s, t } = c;
  const start = el.startSeconds;
  const rows = Math.max(el.left.rows.length, el.right.rows.length);
  const col = (side: "left" | "right") => {
    const data = el[side];
    const ours = side === "right";
    const from = start + (ours ? 0.35 : 0.15);
    const e = pop(c, from);
    return (
      <div
        style={{
          flex: 1,
          borderRadius: 14 * s,
          padding: `${14 * s}px ${12 * s}px`,
          background: ours ? rgba(B.gold, 0.14) : "rgba(255,255,255,0.05)",
          border: `${1 * s}px solid ${ours ? rgba(B.gold, 0.6) : "rgba(255,255,255,0.1)"}`,
          boxShadow: ours ? `0 0 ${18 * s}px ${rgba(B.gold, 0.25)}` : undefined,
          opacity: ramp(t, from, from + 0.2),
          transform: `translateX(${(1 - e) * (ours ? 16 : -16) * s}px)`,
        }}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: 22 * s,
            letterSpacing: 0.08 * 22 * s,
            textTransform: "uppercase",
            color: ours ? B.gold : "rgba(255,255,255,0.6)",
            marginBottom: 10 * s,
            textAlign: "center",
            ...onPanelText(s),
          }}
        >
          {data.title}
        </div>
        {Array.from({ length: rows }).map((_, i) => {
          const text = data.rows[i];
          const rowFrom = from + 0.2 + i * 0.3;
          return (
            <div
              key={i}
              style={{
                height: 40 * s,
                display: "flex",
                alignItems: "center",
                gap: 8 * s,
                fontWeight: ours ? 700 : 500,
                fontSize: 26 * s,
                color: ours ? "#FFFFFF" : "rgba(255,255,255,0.72)",
                textDecoration: !ours && text ? undefined : undefined,
                opacity: text ? ramp(t, rowFrom, rowFrom + 0.15) : 0,
                transform: `translateX(${(1 - pop(c, rowFrom)) * -10 * s}px)`,
                whiteSpace: "pre",
                ...onPanelText(s),
              }}
            >
              <span
                style={{
                  width: 8 * s,
                  height: 8 * s,
                  borderRadius: 999,
                  background: ours ? B.gold : "rgba(255,255,255,0.35)",
                  flex: "none",
                }}
              />
              {text ?? ""}
            </div>
          );
        })}
      </div>
    );
  };
  return (
    <Frame el={el} c={c} width={c.width - 64 * s} defaultTop={C.defaultTop}>
      {el.title && <Title text={el.title} c={c} from={start} />}
      <div style={{ display: "flex", gap: 12 * s, marginTop: el.title ? 8 * s : 0 }}>
        {col("left")}
        {col("right")}
      </div>
    </Frame>
  );
};

// ── steps ───────────────────────────────────────────────────────────────────

const Steps: React.FC<{ el: Extract<OverlayElement, { kind: "steps" }>; c: Clock }> = ({ el, c }) => {
  const { s, t } = c;
  const start = el.startSeconds;
  const stagger = 0.55;
  return (
    <Frame el={el} c={c} width={Math.min(c.width - 72 * s, 560 * s)} defaultTop={C.defaultTop}>
      {el.title && <Title text={el.title} c={c} from={start} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 * s, marginTop: el.title ? 6 * s : 0 }}>
        {el.steps.map((step, i) => {
          const from = start + 0.25 + i * stagger;
          const e = pop(c, from);
          const done = t >= from + stagger * 0.9;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14 * s,
                opacity: ramp(t, from, from + 0.15),
                transform: `translateX(${(1 - e) * -18 * s}px)`,
              }}
            >
              <div style={{ position: "relative", width: 44 * s, height: 44 * s, flex: "none" }}>
                {i < el.steps.length - 1 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 21 * s,
                      top: 44 * s,
                      width: 2 * s,
                      height: 10 * s * ramp(t, from + 0.3, from + stagger),
                      background: rgba(B.gold, 0.6),
                    }}
                  />
                )}
                <div
                  style={{
                    width: 44 * s,
                    height: 44 * s,
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 22 * s,
                    color: done ? B.navyDeep : B.gold,
                    background: done
                      ? `linear-gradient(145deg, ${B.goldLight}, ${B.gold})`
                      : rgba(B.gold, 0.12),
                    border: `${1.5 * s}px solid ${rgba(B.gold, 0.9)}`,
                    boxShadow: `0 0 ${12 * s}px ${rgba(B.gold, done ? 0.5 : 0.25)}`,
                    transform: `scale(${0.6 + 0.4 * e})`,
                  }}
                >
                  {i + 1}
                </div>
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 30 * s,
                  letterSpacing: -0.01 * 30 * s,
                  whiteSpace: "pre",
                  ...onPanelText(s),
                }}
              >
                {step}
              </div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
};

// ── quote ───────────────────────────────────────────────────────────────────

const Quote: React.FC<{ el: Extract<OverlayElement, { kind: "quote" }>; c: Clock }> = ({ el, c }) => {
  const { s, t } = c;
  const start = el.startSeconds;
  const words = el.text.split(" ");
  return (
    <Frame el={el} c={c} width={c.width - 80 * s} defaultTop={C.defaultTop} panel={false}>
      <div style={{ position: "relative", padding: `${10 * s}px ${20 * s}px ${10 * s}px ${34 * s}px` }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 5 * s,
            borderRadius: 3 * s,
            background: `linear-gradient(to bottom, ${B.goldLight}, ${B.gold})`,
            boxShadow: `0 0 ${12 * s}px ${rgba(B.gold, 0.6)}`,
            transform: `scaleY(${ease(c, start, { damping: 20, stiffness: 120 })})`,
            transformOrigin: "50% 0%",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 26 * s,
            top: -26 * s,
            fontSize: 110 * s,
            lineHeight: 1,
            fontWeight: 900,
            color: rgba(B.gold, 0.35),
            opacity: ease(c, start + 0.1),
          }}
        >
          “
        </div>
        <div
          style={{
            fontWeight: 700,
            fontStyle: "italic",
            fontSize: 38 * s,
            lineHeight: 1.22,
            letterSpacing: -0.01 * 38 * s,
            textAlign: "left",
            ...onImageText(s),
          }}
        >
          {words.map((w, i) => {
            const from = start + 0.1 + i * 0.045;
            const e = ease(c, from, { damping: 20, stiffness: 140 });
            return (
              <span key={i} style={{ display: "inline-block", whiteSpace: "pre" }}>
                {i > 0 ? " " : ""}
                <span
                  style={{
                    display: "inline-block",
                    opacity: e,
                    transform: `translateY(${(1 - e) * 12 * s}px)`,
                    filter: e < 0.95 ? `blur(${(1 - e) * 8 * s}px)` : undefined,
                  }}
                >
                  {w}
                </span>
              </span>
            );
          })}
        </div>
        {el.author && (
          <div
            style={{
              marginTop: 10 * s,
              fontWeight: 600,
              fontSize: 22 * s,
              letterSpacing: 0.06 * 22 * s,
              textTransform: "uppercase",
              color: B.gold,
              opacity: ramp(t, start + 0.6, start + 0.9),
              ...onImageText(s),
            }}
          >
            — {el.author}
          </div>
        )}
      </div>
    </Frame>
  );
};

// ── cta ─────────────────────────────────────────────────────────────────────

const Cta: React.FC<{ el: Extract<OverlayElement, { kind: "cta" }>; c: Clock }> = ({ el, c }) => {
  const { s, t } = c;
  const start = el.startSeconds;
  // Puls: delikatne oddychanie pigułki i obwódki, okres 1,6 s — zaproszenie, nie alarm.
  const pulse = 0.5 + 0.5 * Math.sin(((t - start) / 1.6) * Math.PI * 2);
  const e = pop(c, start, { damping: 12, stiffness: 140, mass: 0.7 });
  return (
    <Frame el={el} c={c} width={c.width - 80 * s} defaultTop={0.2} panel={false}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 * s }}>
        <div
          style={{
            padding: 2 * s,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${B.gold}, ${B.goldLight}, ${B.gold})`,
            boxShadow: `0 0 ${(18 + 14 * pulse) * s}px ${rgba(B.gold, 0.35 + 0.25 * pulse)}, 0 ${12 * s}px ${30 * s}px rgba(0,0,0,0.35)`,
            transform: `scale(${(0.85 + 0.15 * e) * (1 + 0.012 * pulse)})`,
          }}
        >
          <div
            style={{
              padding: `${16 * s}px ${34 * s}px`,
              borderRadius: 999,
              background: `linear-gradient(160deg, ${B.navy}, ${B.navyDeep})`,
              fontWeight: 800,
              fontSize: 36 * s,
              letterSpacing: 0.02 * 36 * s,
              whiteSpace: "pre",
              ...shimmerStyle(c, start + 0.4, 1.4, "#FFFFFF", B.goldLight),
            }}
          >
            {el.text}
          </div>
        </div>
        {el.sub && (
          <div
            style={{
              fontWeight: 600,
              fontSize: 24 * s,
              letterSpacing: 0.04 * 24 * s,
              color: "rgba(255,255,255,0.9)",
              opacity: ramp(t, start + 0.3, start + 0.6),
              whiteSpace: "pre",
              ...onImageText(s),
            }}
          >
            {el.sub}
          </div>
        )}
      </div>
    </Frame>
  );
};

// ── sticker ─────────────────────────────────────────────────────────────────

const Sticker: React.FC<{ el: Extract<OverlayElement, { kind: "sticker" }>; c: Clock }> = ({
  el,
  c,
}) => {
  const { s, t, width, height } = c;
  const start = el.startSeconds;
  const end = el.endSeconds == null ? Infinity : Math.max(el.endSeconds, start + 1);
  if (t < start || t >= end) return null;
  // Pieczątka: wbija się z góry (duża → normalna) i lekko odbija.
  const e = pop(c, start, { damping: 11, stiffness: 220, mass: 0.5 });
  const outFade = Number.isFinite(end) ? 1 - ramp(t, end - 0.2, end) : 1;
  const fontSize = 46 * s;
  return (
    <div
      style={{
        position: "absolute",
        left: width / 2,
        top: height * (el.y ?? 0.22),
        transform: `translate(-50%, -50%) rotate(-7deg) scale(${1.6 - 0.6 * e})`,
        opacity: Math.min(ramp(t, start, start + 0.08), outFade),
        padding: `${10 * s}px ${22 * s}px`,
        border: `${4 * s}px solid ${B.gold}`,
        borderRadius: 10 * s,
        background: rgba(B.navyDeep, 0.55),
        backdropFilter: `blur(${8 * s}px)`,
        WebkitBackdropFilter: `blur(${8 * s}px)`,
        boxShadow: `0 0 ${20 * s}px ${rgba(B.gold, 0.45)}, inset 0 0 ${16 * s}px ${rgba(B.gold, 0.2)}`,
        fontFamily: FONT_STACK,
        fontWeight: 900,
        fontSize,
        letterSpacing: 0.1 * fontSize,
        textTransform: "uppercase",
        color: B.gold,
        whiteSpace: "pre",
        textShadow: `0 ${2 * s}px ${6 * s}px rgba(0,0,0,0.4)`,
      }}
    >
      {el.text}
    </div>
  );
};

// ── bars ────────────────────────────────────────────────────────────────────

const Bars: React.FC<{ el: Extract<OverlayElement, { kind: "bars" }>; c: Clock }> = ({ el, c }) => {
  const { s, t } = c;
  const start = el.startSeconds;
  const max = Math.max(...el.bars.map((b) => b.value), 1);
  const anyHighlight = el.bars.some((b) => b.highlight);
  const best = anyHighlight ? -1 : el.bars.reduce((bi, b, i, arr) => (b.value > arr[bi].value ? i : bi), 0);
  return (
    <Frame el={el} c={c} width={c.width - 64 * s} defaultTop={C.defaultTop}>
      {el.title && <Title text={el.title} c={c} from={start} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 * s, marginTop: el.title ? 8 * s : 0 }}>
        {el.bars.map((bar, i) => {
          const from = start + 0.2 + i * 0.25;
          const grow = ease(c, from, { damping: 26, stiffness: 70 });
          const hot = bar.highlight || i === best;
          const display = bar.display ?? String(bar.value);
          return (
            <div key={i} style={{ opacity: ramp(t, from, from + 0.15) }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 700,
                  fontSize: 24 * s,
                  color: hot ? "#FFFFFF" : "rgba(255,255,255,0.72)",
                  marginBottom: 6 * s,
                  whiteSpace: "pre",
                  ...onPanelText(s),
                }}
              >
                <span>{bar.label}</span>
                <span style={{ color: hot ? B.gold : undefined, fontVariantNumeric: "tabular-nums" }}>
                  {countUpText(c, display, from)}
                </span>
              </div>
              <div
                style={{
                  height: 14 * s,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(bar.value / max) * 100 * grow}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: hot
                      ? `linear-gradient(90deg, ${B.gold}, ${B.goldLight})`
                      : `linear-gradient(90deg, ${rgba(B.glow, 0.7)}, ${rgba(B.glow, 0.45)})`,
                    boxShadow: hot ? `0 0 ${12 * s}px ${rgba(B.gold, 0.6)}` : undefined,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
};

// ── lowerThird ──────────────────────────────────────────────────────────────

const LowerThird: React.FC<{ el: Extract<OverlayElement, { kind: "lowerThird" }>; c: Clock }> = ({
  el,
  c,
}) => {
  const { s, t, height } = c;
  const start = el.startSeconds;
  const end = el.endSeconds == null ? Infinity : Math.max(el.endSeconds, start + 1);
  if (t < start || t >= end) return null;
  const e = pop(c, start, { damping: 18, stiffness: 120, mass: 0.8 });
  const outFade = Number.isFinite(end) ? 1 - ramp(t, end - 0.2, end) : 1;
  return (
    <div
      style={{
        position: "absolute",
        left: 36 * s,
        top: height * (el.y ?? 0.5),
        display: "flex",
        alignItems: "stretch",
        gap: 12 * s,
        opacity: Math.min(ramp(t, start, start + 0.15), outFade),
        transform: `translateX(${(1 - e) * -40 * s}px)`,
        fontFamily: FONT_STACK,
      }}
    >
      <div
        style={{
          width: 5 * s,
          borderRadius: 3 * s,
          background: `linear-gradient(to bottom, ${B.goldLight}, ${B.gold})`,
          boxShadow: `0 0 ${10 * s}px ${rgba(B.gold, 0.6)}`,
        }}
      />
      <div
        style={{
          ...glassPanel(s, 12),
          padding: `${10 * s}px ${18 * s}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 2 * s,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 28 * s, color: "#FFFFFF", whiteSpace: "pre", ...onPanelText(s) }}>
          {el.name}
        </div>
        <div
          style={{
            fontWeight: 600,
            fontSize: 20 * s,
            letterSpacing: 0.05 * 20 * s,
            textTransform: "uppercase",
            color: B.gold,
            whiteSpace: "pre",
            opacity: ramp(t, start + 0.15, start + 0.35),
          }}
        >
          {el.role}
        </div>
      </div>
    </div>
  );
};

// ── Rejestr ─────────────────────────────────────────────────────────────────

export const Element: React.FC<{ el: OverlayElement; c: Clock }> = ({ el, c }) => {
  switch (el.kind) {
    case "stat":
      return <Stat el={el} c={c} />;
    case "compare":
      return <Compare el={el} c={c} />;
    case "steps":
      return <Steps el={el} c={c} />;
    case "quote":
      return <Quote el={el} c={c} />;
    case "cta":
      return <Cta el={el} c={c} />;
    case "sticker":
      return <Sticker el={el} c={c} />;
    case "bars":
      return <Bars el={el} c={c} />;
    case "lowerThird":
      return <LowerThird el={el} c={c} />;
    default:
      return null;
  }
};

/** Czy jakiś element górnego pasa jest w tej sekundzie na ekranie (do przyciemnienia). */
export function elementsActive(elements: OverlayElement[] | undefined, t: number): number {
  let a = 0;
  for (const el of elements ?? []) {
    if (el.kind === "lowerThird") continue;
    const end = el.endSeconds == null ? Infinity : el.endSeconds;
    a = Math.max(a, Math.min(ramp(t, el.startSeconds - 0.3, el.startSeconds), 1 - ramp(t, end - 0.3, end)));
  }
  return a;
}

