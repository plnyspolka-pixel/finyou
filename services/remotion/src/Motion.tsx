// Elementy dynamiczne rolki — komponenty z katalogu src/lib/motion-catalog.ts.
// Co, gdzie i kiedy pokazać projektuje AI (motion-designer.server.ts), czasy
// liczy serwer z SRT; tu tylko rysujemy. Styl jak strona (.fy-marketing):
// granatowe szkło, złoto, niebieska poświata. Współrzędne w kadrze 720×1280
// (`k` skaluje do mastera), czasy w sekundach.

import type React from "react";
import { interpolate, spring } from "remotion";
import { MOTION_ZONES, type ReelMotion } from "../../../src/lib/motion-catalog";

export const MOTION_BRAND = {
  navy: "#0D1638",
  navyDeep: "#070B22",
  gold: "#EABE4A",
  goldLight: "#F3D57E",
  glow: "#4F8BF0",
  border: "#547CD6",
  white: "#FFFFFF",
  muted: "#AFC0E8",
  red: "#F0616B",
};

const B = MOTION_BRAND;
const BASE_W = 720;
const MARGIN = 36;
const PANEL_W = BASE_W - MARGIN * 2;

type Scale = { x: number; y: number };
type Ctx = { t: number; fps: number; k: Scale; height: number; fontFamily: string };

function rgba(hex: string, a: number): string {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Sprężyna od sekundy `at` (0 → 1). */
const pop = (c: Ctx, at: number, damping = 16) =>
  spring({ frame: Math.max(0, (c.t - at) * c.fps), fps: c.fps, config: { damping, mass: 0.7 } });

/** Postęp 0 → 1 w oknie [at, at + sec] z wygładzeniem. */
const ease = (c: Ctx, at: number, sec: number) => {
  const x = interpolate(c.t, [at, at + sec], [0, 1], clamp);
  return 1 - Math.pow(1 - x, 3);
};

/** Rozmiar czcionki, przy którym tekst mieści się w szerokości (szacunek Inter bold). */
const fit = (text: string, base: number, width: number, charW = 0.58) =>
  Math.min(base, width / Math.max(1, text.length * charW));

/** Liczba z początku tekstu („250 tys. zł” → 250) do odliczania; null gdy nie ma. */
function leadingNumber(
  v: string,
): { n: number; decimals: number; rest: string; pre: string } | null {
  const m = /^(\D*?)(\d+(?:[  ]\d{3})*(?:[.,]\d+)?)(.*)$/.exec(v);
  if (!m) return null;
  const raw = m[2].replace(/[  ]/g, "").replace(",", ".");
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return { n, decimals, rest: m[3], pre: m[1] };
}

const formatPl = (n: number, decimals: number) =>
  n.toLocaleString("pl-PL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const formatAxis = (n: number) => formatPl(n, Number.isInteger(n) ? 0 : 1);

// ── Wspólne: plansza w strefie ──────────────────────────────────────────────

const Panel: React.FC<{
  m: ReelMotion;
  c: Ctx;
  children: React.ReactNode;
  glass?: boolean;
  align?: "center" | "left";
}> = ({ m, c, children, glass = true, align = "left" }) => {
  const zone = MOTION_ZONES[m.zone];
  const enter = pop(c, m.start, 18);
  const exit = interpolate(c.t, [m.end - 0.28, m.end], [1, 0], clamp);
  const { k } = c;
  return (
    <div
      style={{
        position: "absolute",
        left: MARGIN * k.x,
        width: PANEL_W * k.x,
        top: zone.y * c.height,
        minHeight: zone.height * c.height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: align === "center" ? "center" : "stretch",
        boxSizing: "border-box",
        padding: glass ? `${22 * k.y}px ${28 * k.x}px` : 0,
        borderRadius: 26 * k.y,
        background: glass
          ? `linear-gradient(160deg, ${rgba(B.navy, 0.9)} 0%, ${rgba(B.navyDeep, 0.86)} 100%)`
          : "transparent",
        border: glass ? `${1.5 * k.y}px solid ${rgba(B.border, 0.45)}` : "none",
        boxShadow: glass
          ? `0 ${10 * k.y}px ${40 * k.y}px ${rgba(B.navyDeep, 0.55)}, 0 0 ${26 * k.y}px ${rgba(B.glow, 0.35)}`
          : "none",
        opacity: Math.min(enter, exit),
        transform: `translateY(${(1 - enter) * 28 * k.y}px) scale(${0.94 + 0.06 * enter})`,
        transformOrigin: "50% 0%",
        fontFamily: c.fontFamily,
        color: B.white,
      }}
    >
      {glass && (
        // Złota nitka u góry planszy — akcent jak na kartach strony.
        <div
          style={{
            position: "absolute",
            left: 28 * k.x,
            top: 0,
            height: 3 * k.y,
            width: `${ease(c, m.start + 0.1, 0.6) * 22}%`,
            background: `linear-gradient(90deg, ${B.gold}, ${rgba(B.gold, 0)})`,
            borderRadius: 2 * k.y,
          }}
        />
      )}
      {children}
    </div>
  );
};

const Title: React.FC<{ text: string | null; c: Ctx; at: number; center?: boolean }> = ({
  text,
  c,
  at,
  center,
}) => {
  if (!text) return null;
  const { k } = c;
  const size = fit(text.toLocaleUpperCase("pl-PL"), 26, (PANEL_W - 56) * 0.92, 0.72);
  return (
    <div
      style={{
        fontSize: size * k.y,
        fontWeight: 800,
        letterSpacing: 3 * k.x,
        color: B.gold,
        textTransform: "uppercase",
        textAlign: center ? "center" : "left",
        marginBottom: 12 * k.y,
        opacity: ease(c, at, 0.35),
      }}
    >
      {text}
    </div>
  );
};

// ── Komponenty ──────────────────────────────────────────────────────────────

const Stat: React.FC<{ m: Extract<ReelMotion, { component: "stat" }>; c: Ctx }> = ({ m, c }) => {
  const { k } = c;
  const p = m.props;
  const num = leadingNumber(p.value);
  const prog = ease(c, m.start + 0.15, 1.1);
  const shown = num ? `${num.pre}${formatPl(num.n * prog, num.decimals)}${num.rest}` : p.value;
  const size = fit(p.value, 116, PANEL_W - 56, 0.62);
  return (
    <Panel m={m} c={c} align="center">
      {p.kicker && (
        <div
          style={{
            fontSize: fit(p.kicker, 32, PANEL_W - 56) * k.y,
            fontWeight: 700,
            color: B.muted,
            textAlign: "center",
            opacity: ease(c, m.start, 0.3),
          }}
        >
          {p.kicker}
        </div>
      )}
      <div
        style={{
          fontSize: size * k.y,
          fontWeight: 800,
          lineHeight: 1.05,
          color: B.gold,
          textAlign: "center",
          textShadow: `0 0 ${24 * k.y}px ${rgba(B.gold, 0.45)}`,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {shown}
      </div>
      {p.caption && (
        <div
          style={{
            marginTop: 8 * k.y,
            fontSize: fit(p.caption, 34, PANEL_W - 56) * k.y,
            fontWeight: 700,
            textAlign: "center",
            opacity: ease(c, m.start + 0.9, 0.4),
          }}
        >
          {p.caption}
        </div>
      )}
    </Panel>
  );
};

/** Oś z podziałką: tor, etykiety 0 / max i (opcjonalnie) wyróżnione wartości. */
const Track: React.FC<{
  c: Ctx;
  children: React.ReactNode;
  ticks: { at: number; label: string; strong?: boolean }[];
  max: number;
}> = ({ c, children, ticks, max }) => {
  const { k } = c;
  const W = PANEL_W - 56;
  return (
    <div style={{ position: "relative", width: W * k.x, height: 74 * k.y, marginTop: 6 * k.y }}>
      <div
        style={{
          position: "absolute",
          top: 10 * k.y,
          left: 0,
          right: 0,
          height: 20 * k.y,
          borderRadius: 10 * k.y,
          background: rgba(B.border, 0.22),
          overflow: "hidden",
        }}
      >
        {children}
      </div>
      {ticks.map((tk, i) => {
        const x = (tk.at / max) * W;
        const anchor = x < 30 ? "0%" : x > W - 30 ? "-100%" : "-50%";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x * k.x,
              top: 38 * k.y,
              transform: `translateX(${anchor})`,
              fontSize: (tk.strong ? 26 : 20) * k.y,
              fontWeight: tk.strong ? 800 : 600,
              color: tk.strong ? B.white : B.muted,
              whiteSpace: "nowrap",
              opacity: ease(c, 0, 0.01),
            }}
          >
            {tk.label}
          </div>
        );
      })}
    </div>
  );
};

const Range: React.FC<{ m: Extract<ReelMotion, { component: "range" }>; c: Ctx }> = ({ m, c }) => {
  const { k } = c;
  const p = m.props;
  const grow = ease(c, m.start + 0.35, 0.9);
  const a = (p.from / p.max) * 100;
  const b = (p.to / p.max) * 100;
  const label = `${formatAxis(p.from)}–${formatAxis(p.to)} ${p.unit}`.trim();
  return (
    <Panel m={m} c={c}>
      <Title text={p.title} c={c} at={m.start} />
      <div
        style={{
          fontSize: fit(label, 66, PANEL_W - 56, 0.6) * k.y,
          fontWeight: 800,
          color: B.white,
          lineHeight: 1.05,
          opacity: ease(c, m.start + 0.2, 0.4),
        }}
      >
        <span style={{ color: B.gold }}>{`${formatAxis(p.from)}–${formatAxis(p.to)}`}</span>
        {p.unit ? ` ${p.unit}` : ""}
      </div>
      <Track
        c={c}
        max={p.max}
        ticks={[
          { at: 0, label: "0" },
          { at: p.from, label: formatAxis(p.from), strong: true },
          { at: p.to, label: formatAxis(p.to), strong: true },
        ]}
      >
        <div
          style={{
            position: "absolute",
            left: `${a}%`,
            width: `${(b - a) * grow}%`,
            top: 0,
            bottom: 0,
            borderRadius: 8 * k.y,
            background: `linear-gradient(90deg, ${B.gold}, ${B.goldLight})`,
            boxShadow: `0 0 ${14 * k.y}px ${rgba(B.gold, 0.6)}`,
          }}
        />
      </Track>
      {p.caption && (
        <div
          style={{
            fontSize: fit(p.caption, 30, PANEL_W - 56) * k.y,
            fontWeight: 700,
            color: B.muted,
            opacity: ease(c, m.start + 1.1, 0.4),
          }}
        >
          {p.caption}
        </div>
      )}
    </Panel>
  );
};

const Threshold: React.FC<{ m: Extract<ReelMotion, { component: "threshold" }>; c: Ctx }> = ({
  m,
  c,
}) => {
  const { k } = c;
  const p = m.props;
  const at = (p.value / p.max) * 100;
  const left = ease(c, m.start + 0.3, 0.6);
  const right = ease(c, m.start + 0.9, 0.7);
  const half = (PANEL_W - 56 - 16) / 2;
  // Jeden rozmiar dla obu stron — inaczej dłuższy podpis wygląda na mniej ważny.
  const sideSize = Math.min(fit(p.below, 29, half - 34), fit(p.above, 29, half - 34));
  return (
    <Panel m={m} c={c}>
      <Title text={p.title} c={c} at={m.start} />
      <Track
        c={c}
        max={p.max}
        ticks={[{ at: p.value, label: `${formatAxis(p.value)} ${p.unit}`.trim(), strong: true }]}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${at * left}%`,
            top: 0,
            bottom: 0,
            background: `linear-gradient(90deg, ${rgba(B.red, 0.55)}, ${B.red})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${at}%`,
            width: `${(100 - at) * right}%`,
            top: 0,
            bottom: 0,
            background: `linear-gradient(90deg, ${B.gold}, ${B.goldLight})`,
            boxShadow: `0 0 ${14 * k.y}px ${rgba(B.gold, 0.6)}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${at}%`,
            top: -4 * k.y,
            bottom: -4 * k.y,
            width: 3 * k.x,
            background: B.white,
            opacity: ease(c, m.start + 0.25, 0.2),
          }}
        />
      </Track>
      <div style={{ display: "flex", gap: 16 * k.x, marginTop: 4 * k.y }}>
        {[
          { text: p.below, color: B.red, sign: "↓", o: left },
          { text: p.above, color: B.gold, sign: "↑", o: right },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "baseline",
              gap: 8 * k.x,
              fontSize: sideSize * k.y,
              whiteSpace: "nowrap",
              fontWeight: 700,
              opacity: s.o,
              transform: `translateY(${(1 - s.o) * 10 * k.y}px)`,
            }}
          >
            <span style={{ color: s.color, fontWeight: 800 }}>{s.sign}</span>
            <span>{s.text}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
};

const Versus: React.FC<{ m: Extract<ReelMotion, { component: "versus" }>; c: Ctx }> = ({
  m,
  c,
}) => {
  const { k } = c;
  const p = m.props;
  const sides = [
    { s: p.left, win: p.winner === "left", at: m.start + 0.2 },
    { s: p.right, win: p.winner === "right", at: m.start + 0.55 },
  ];
  const verdict = ease(c, m.start + 1.2, 0.4);
  const colW = (PANEL_W - 56 - 60) / 2;
  return (
    <Panel m={m} c={c}>
      <Title text={p.title} c={c} at={m.start} center />
      <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
        {sides.map(({ s, win, at }, i) => {
          const e = pop(c, at, 14);
          const dim = p.winner !== "none" && !win ? 1 - 0.45 * verdict : 1;
          return [
            i === 1 ? (
              <div
                key="vs"
                style={{
                  width: 60 * k.x,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26 * k.y,
                  fontWeight: 800,
                  color: B.muted,
                }}
              >
                vs
              </div>
            ) : null,
            <div
              key={i}
              style={{
                width: colW * k.x,
                padding: `${12 * k.y}px ${10 * k.x}px`,
                borderRadius: 16 * k.y,
                textAlign: "center",
                background: win ? rgba(B.gold, 0.12 * verdict) : rgba(B.border, 0.1),
                border: `${1.5 * k.y}px solid ${win ? rgba(B.gold, 0.2 + 0.6 * verdict) : rgba(B.border, 0.35)}`,
                boxShadow: win ? `0 0 ${22 * k.y * verdict}px ${rgba(B.gold, 0.4)}` : "none",
                opacity: e * dim,
                transform: `scale(${0.9 + 0.1 * e})`,
              }}
            >
              <div
                style={{
                  fontSize: fit(s.label, 26, colW - 20) * k.y,
                  fontWeight: 700,
                  color: B.muted,
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontSize: fit(s.value, 54, colW - 20, 0.62) * k.y,
                  fontWeight: 800,
                  color: win ? B.gold : B.white,
                  whiteSpace: "nowrap",
                }}
              >
                {s.value}
              </div>
            </div>,
          ];
        })}
      </div>
    </Panel>
  );
};

const CheckIcon: React.FC<{ size: number; draw: number }> = ({ size, draw }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: "none" }}>
    <circle
      cx="12"
      cy="12"
      r="11"
      fill={rgba(B.gold, 0.16)}
      stroke={rgba(B.gold, 0.7)}
      strokeWidth={1.4}
    />
    <path
      d="M7 12.4l3.3 3.3L17.2 8.6"
      fill="none"
      stroke={B.gold}
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={16}
      strokeDashoffset={16 * (1 - draw)}
    />
  </svg>
);

const ItemList: React.FC<{
  m: Extract<ReelMotion, { component: "checklist" | "steps" }>;
  c: Ctx;
}> = ({ m, c }) => {
  const { k } = c;
  const p = m.props;
  const steps = m.component === "steps";
  const starts = m.itemStarts ?? p.items.map((_, i) => m.start + 0.3 + i * 0.5);
  const rowW = PANEL_W - 56 - 62;
  const size = Math.min(...p.items.map((it) => fit(it, 40, rowW)));
  return (
    <Panel m={m} c={c}>
      <Title text={p.title} c={c} at={m.start} />
      <div style={{ position: "relative" }}>
        {steps && (
          // Oś łącząca kroki — rośnie razem z odsłanianiem.
          <div
            style={{
              position: "absolute",
              left: 21 * k.x,
              top: 22 * k.y,
              width: 2 * k.x,
              height: `calc(${ease(c, starts[0], Math.max(0.3, starts[starts.length - 1] - starts[0])) * 100}% - ${44 * k.y}px)`,
              background: rgba(B.gold, 0.5),
            }}
          />
        )}
        {p.items.map((it, i) => {
          const e = pop(c, starts[i], 15);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16 * k.x,
                minHeight: 60 * k.y,
                opacity: e,
                transform: `translateX(${(1 - e) * -24 * k.x}px)`,
              }}
            >
              {steps ? (
                <div
                  style={{
                    width: 44 * k.y,
                    height: 44 * k.y,
                    flex: "none",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: `linear-gradient(140deg, ${B.gold}, ${B.goldLight})`,
                    color: B.navyDeep,
                    fontSize: 24 * k.y,
                    fontWeight: 800,
                    position: "relative",
                  }}
                >
                  {i + 1}
                </div>
              ) : (
                <CheckIcon size={44 * k.y} draw={ease(c, starts[i] + 0.1, 0.35)} />
              )}
              <div style={{ fontSize: size * k.y, fontWeight: 700, lineHeight: 1.15 }}>{it}</div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

const Keyword: React.FC<{ m: Extract<ReelMotion, { component: "keyword" }>; c: Ctx }> = ({
  m,
  c,
}) => {
  const { k } = c;
  const p = m.props;
  const e = pop(c, m.start, 11);
  const size = fit(p.text, 92, PANEL_W, 0.62);
  const idx = p.highlight
    ? p.text.toLocaleLowerCase("pl-PL").indexOf(p.highlight.toLocaleLowerCase("pl-PL"))
    : -1;
  const parts =
    idx >= 0
      ? [
          { s: p.text.slice(0, idx), gold: false },
          { s: p.text.slice(idx, idx + (p.highlight?.length ?? 0)), gold: true },
          { s: p.text.slice(idx + (p.highlight?.length ?? 0)), gold: false },
        ]
      : [{ s: p.text, gold: false }];
  const sweep = ease(c, m.start + 0.25, 0.5);
  return (
    <Panel m={m} c={c} glass={false} align="center">
      <div
        style={{
          fontSize: size * k.y,
          fontWeight: 800,
          lineHeight: 1.05,
          textAlign: "center",
          transform: `scale(${0.6 + 0.4 * e})`,
          WebkitTextStroke: `${6 * k.y}px ${B.navyDeep}`,
          paintOrder: "stroke fill",
          textShadow: `0 ${4 * k.y}px 0 ${rgba(B.navyDeep, 0.6)}, 0 0 ${28 * k.y}px ${rgba(B.glow, 0.7)}`,
          whiteSpace: "nowrap",
        }}
      >
        {parts.map((pt, i) => (
          <span key={i} style={{ color: pt.gold ? B.gold : B.white }}>
            {pt.s}
          </span>
        ))}
      </div>
      <div
        style={{
          marginTop: 10 * k.y,
          height: 6 * k.y,
          width: `${sweep * 60}%`,
          borderRadius: 3 * k.y,
          background: `linear-gradient(90deg, ${rgba(B.gold, 0)}, ${B.gold}, ${rgba(B.gold, 0)})`,
        }}
      />
    </Panel>
  );
};

const Chip: React.FC<{ text: string; color: string; c: Ctx }> = ({ text, color, c }) => (
  <span
    style={{
      display: "inline-block",
      padding: `${4 * c.k.y}px ${12 * c.k.x}px`,
      borderRadius: 8 * c.k.y,
      background: rgba(color, 0.18),
      border: `${1.5 * c.k.y}px solid ${rgba(color, 0.7)}`,
      color,
      fontSize: 20 * c.k.y,
      fontWeight: 800,
      letterSpacing: 2 * c.k.x,
      marginBottom: 6 * c.k.y,
    }}
  >
    {text}
  </span>
);

const MythFact: React.FC<{ m: Extract<ReelMotion, { component: "mythFact" }>; c: Ctx }> = ({
  m,
  c,
}) => {
  const { k } = c;
  const p = m.props;
  const flip = m.start + Math.min(1.6, (m.end - m.start) * 0.4);
  const strike = ease(c, flip - 0.45, 0.4);
  const fact = pop(c, flip, 15);
  const W = PANEL_W - 56;
  return (
    <Panel m={m} c={c}>
      <div style={{ opacity: 1 - 0.45 * strike }}>
        <Chip text="MIT" color={B.red} c={c} />
        <div style={{ position: "relative", display: "inline-block" }}>
          <div style={{ fontSize: fit(p.myth, 34, W) * k.y, fontWeight: 700, color: B.muted }}>
            {p.myth}
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "52%",
              height: 3 * k.y,
              width: `${strike * 100}%`,
              background: B.red,
              borderRadius: 2 * k.y,
            }}
          />
        </div>
      </div>
      <div
        style={{
          marginTop: 14 * k.y,
          opacity: fact,
          transform: `translateY(${(1 - fact) * 16 * k.y}px)`,
        }}
      >
        <Chip text="FAKT" color={B.gold} c={c} />
        <div style={{ fontSize: fit(p.fact, 42, W) * k.y, fontWeight: 800 }}>{p.fact}</div>
      </div>
    </Panel>
  );
};

const Alert: React.FC<{ m: Extract<ReelMotion, { component: "alert" }>; c: Ctx }> = ({ m, c }) => {
  const { k } = c;
  const p = m.props;
  const pulse = 1 + 0.06 * Math.sin(Math.max(0, c.t - m.start) * 5);
  const amber = "#F5A524";
  const W = PANEL_W - 56 - 76;
  return (
    <Panel m={m} c={c}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 * k.x }}>
        <svg
          width={56 * k.y}
          height={56 * k.y}
          viewBox="0 0 24 24"
          style={{ flex: "none", transform: `scale(${pulse})` }}
        >
          <path
            d="M12 2.8L22.4 20.6H1.6Z"
            fill={rgba(amber, 0.18)}
            stroke={amber}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
          <path d="M12 9v5.2" stroke={amber} strokeWidth={2.2} strokeLinecap="round" />
          <circle cx="12" cy="17.4" r="1.25" fill={amber} />
        </svg>
        <div>
          <div
            style={{
              fontSize: fit(p.title, 26, W, 0.72) * k.y,
              fontWeight: 800,
              letterSpacing: 2.5 * k.x,
              color: amber,
              textTransform: "uppercase",
            }}
          >
            {p.title}
          </div>
          <div
            style={{
              fontSize: fit(p.text, 34, W * 1.9) * k.y,
              fontWeight: 700,
              lineHeight: 1.2,
              opacity: ease(c, m.start + 0.3, 0.4),
            }}
          >
            {p.text}
          </div>
        </div>
      </div>
    </Panel>
  );
};

const Cta: React.FC<{ m: Extract<ReelMotion, { component: "cta" }>; c: Ctx }> = ({ m, c }) => {
  const { k } = c;
  const p = m.props;
  const e = pop(c, m.start + 0.1, 12);
  const shine = interpolate((c.t - m.start) % 2.2, [0.4, 1.3], [-30, 130], clamp);
  return (
    <Panel m={m} c={c} glass={false} align="center">
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          padding: `${18 * k.y}px ${38 * k.x}px`,
          borderRadius: 999,
          background: `linear-gradient(140deg, ${B.gold}, ${B.goldLight})`,
          color: B.navyDeep,
          fontSize: fit(p.text, 42, PANEL_W - 100) * k.y,
          fontWeight: 800,
          boxShadow: `0 0 ${30 * k.y}px ${rgba(B.gold, 0.55)}`,
          transform: `scale(${0.7 + 0.3 * e})`,
          whiteSpace: "nowrap",
        }}
      >
        {p.text}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${shine}%`,
            width: "22%",
            background: `linear-gradient(100deg, ${rgba(B.white, 0)}, ${rgba(B.white, 0.55)}, ${rgba(B.white, 0)})`,
          }}
        />
      </div>
      {p.sub && (
        <div
          style={{
            marginTop: 12 * k.y,
            fontSize: fit(p.sub, 30, PANEL_W - 40) * k.y,
            fontWeight: 700,
            color: B.white,
            WebkitTextStroke: `${4 * k.y}px ${B.navyDeep}`,
            paintOrder: "stroke fill",
            opacity: ease(c, m.start + 0.5, 0.4),
          }}
        >
          {p.sub}
        </div>
      )}
    </Panel>
  );
};

/** Elementy widoczne w chwili `t` (zwykle jeden — serwer pilnuje, by się nie nakładały). */
export const MotionLayer: React.FC<{ items: ReelMotion[]; c: Ctx }> = ({ items, c }) => (
  <>
    {items
      .filter((m) => c.t >= m.start && c.t < m.end)
      .map((m, i) => {
        switch (m.component) {
          case "stat":
            return <Stat key={i} m={m} c={c} />;
          case "range":
            return <Range key={i} m={m} c={c} />;
          case "threshold":
            return <Threshold key={i} m={m} c={c} />;
          case "versus":
            return <Versus key={i} m={m} c={c} />;
          case "checklist":
          case "steps":
            return <ItemList key={i} m={m} c={c} />;
          case "keyword":
            return <Keyword key={i} m={m} c={c} />;
          case "mythFact":
            return <MythFact key={i} m={m} c={c} />;
          case "alert":
            return <Alert key={i} m={m} c={c} />;
          case "cta":
            return <Cta key={i} m={m} c={c} />;
        }
        return null;
      })}
  </>
);
