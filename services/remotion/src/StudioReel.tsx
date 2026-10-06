// StudioReel — rolka Studia publikacji: czysty master z HeyGena + napisy
// + znaczek „AI" + nakładki dynamiczne, renderowane w React zamiast w ASS.
//
// Wygląd i wymiary biorą się z TEGO SAMEGO źródła co dawny plik ASS
// (src/lib/caption-style.ts w aplikacji — presety stylów, AI_BADGE,
// OVERLAY_BRAND, układy nakładek). Wszystkie rozmiary są tam podane
// w pikselach kadru 720×1280, więc tu skalujemy je współczynnikiem
// `height / 1280` do rzeczywistej rozdzielczości wideo.
//
// Wejście (inputProps) przygotowuje backend (src/lib/remotion-render.server.ts):
// kwestie SRT już pocięte pod styl (chunkCues) i nakładki z czasami
// dopasowanymi do SRT (overlaysWithCueTiming) — kompozycja niczego nie liczy
// z tekstu, tylko rysuje.

import { useMemo } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import {
  AI_BADGE,
  DEFAULT_ASS_DIMENSIONS,
  DYNAMIC_OVERLAY_LAYOUT,
  OVERLAY_BRAND,
  OVERLAY_CARD_LAYOUT,
  layoutLines,
  type CaptionStyle,
  type DynamicOverlays,
  type OverlayCard,
  type SrtCue,
} from "../../../src/lib/caption-style";

// Inter (zmienna, 100–900) z public/fonts — ta sama czcionka, co w obrazie
// usługi caption-burner; dołączona do bundle'a, żeby render nie zależał od
// Google Fonts. Zakresy znaków jak w Google Fonts (latin + latin-ext = polskie
// ogonki). Remotion czeka na obietnice czcionek przed zrzutem klatki.
const INTER_RANGES = {
  latin:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  "latin-ext":
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
} as const;
for (const [subset, unicodeRange] of Object.entries(INTER_RANGES)) {
  void loadFont({
    family: "Inter",
    url: staticFile(`fonts/Inter-${subset}.woff2`),
    weight: "100 900",
    unicodeRange,
  });
}
const FONT_STACK = `Inter, "DejaVu Sans", Arial, sans-serif`;

export type StudioReelProps = {
  /** Adres https czystego mastera (HeyGen / bucket studio-media). */
  videoUrl: string;
  /** Kwestie pocięte pod styl (chunkCues) — bez stylu: bez napisów. */
  cues: SrtCue[];
  style: CaptionStyle | null;
  aiBadge: boolean;
  overlays: DynamicOverlays | null;
};

export const studioReelDefaults: StudioReelProps = {
  videoUrl: "",
  cues: [],
  style: null,
  aiBadge: true,
  overlays: null,
};

const rgba = (hex: string, alpha: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? m[1] : "000000";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Obrys tekstu jak Outline w ASS: kreska o podwójnej szerokości pod wypełnieniem. */
const stroke = (width: number, color: string): React.CSSProperties =>
  width > 0
    ? { WebkitTextStroke: `${width * 2}px ${color}`, paintOrder: "stroke fill" }
    : {};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Przejście liniowe `from → to` w sekundach, jak \fad / \t w ASS. */
const ramp = (t: number, from: number, to: number) =>
  to <= from ? (t >= to ? 1 : 0) : clamp01((t - from) / (to - from));
/** Miękkie wejście (lekkie uniesienie + fade), jak karty .fy-marketing. */
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);

// ── Napisy ──────────────────────────────────────────────────────────────────

/**
 * Czasy słów proporcjonalnie do liczby liter (jak highlightedEvents w ASS);
 * zwraca indeks aktualnie mówionego słowa w spłaszczonej liście słów kwestii.
 */
function spokenWordIndex(cue: SrtCue, words: string[], t: number): number {
  if (words.length <= 1) return 0;
  const weights = words.map((w) => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, "").length));
  const total = weights.reduce((a, b) => a + b, 0);
  const span = cue.end - cue.start;
  let acc = 0;
  for (let i = 0; i < words.length - 1; i++) {
    acc += weights[i];
    if (t < cue.start + (span * acc) / total) return i;
  }
  return words.length - 1;
}

const Captions: React.FC<{ cues: SrtCue[]; style: CaptionStyle; s: number; t: number }> = ({
  cues,
  style,
  s,
  t,
}) => {
  const cue = cues.find((c) => t >= c.start && t < c.end);
  if (!cue) return null;
  const text = style.uppercase ? cue.text.toLocaleUpperCase("pl-PL") : cue.text;
  const lines = text.split("\n").map((l) => l.split(" ").filter(Boolean));
  const flat = lines.flat();
  const current = style.highlight ? spokenWordIndex(cue, flat, t) : -1;

  const base: React.CSSProperties = {
    fontFamily: FONT_STACK,
    fontWeight: style.bold ? 800 : 500,
    fontSize: style.fontSize * s,
    lineHeight: 1.15,
    color: style.color,
    textAlign: "center",
    whiteSpace: "pre",
  };
  const edge: React.CSSProperties = style.box
    ? {
        background: rgba(style.box.color, style.box.opacity),
        padding: `${style.outline * 0.5 * s}px ${style.outline * s}px`,
        borderRadius: 4 * s,
      }
    : {
        ...stroke(style.outline * s, style.outlineColor),
        textShadow: style.shadow
          ? `${style.shadow * s}px ${style.shadow * s}px 0 rgba(0,0,0,0.5)`
          : undefined,
      };
  const position: React.CSSProperties =
    style.placement === "center"
      ? { top: 0, bottom: 0, justifyContent: "center" }
      : { bottom: style.marginBottom * s, justifyContent: "flex-end" };

  let k = 0;
  return (
    <div
      style={{
        position: "absolute",
        left: style.marginSide * s,
        right: style.marginSide * s,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: style.box ? 4 * s : 0,
        ...position,
      }}
    >
      {lines.map((words, li) => (
        <div key={li} style={{ ...base, ...edge }}>
          {words.map((w, wi) => {
            const idx = k++;
            const hl = idx === current && style.highlight;
            return (
              <span key={wi} style={hl ? { color: style.highlight! } : undefined}>
                {wi > 0 ? " " : ""}
                {w}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ── Znaczek „AI" ────────────────────────────────────────────────────────────

const AiBadge: React.FC<{ s: number }> = ({ s }) => {
  const B = AI_BADGE;
  return (
    <div
      style={{
        position: "absolute",
        top: B.marginTop * s,
        right: B.marginRight * s,
        width: B.width * s,
        height: B.height * s,
        borderRadius: B.radius * s,
        background: rgba(B.fill, B.fillOpacity),
        border: `${B.borderWidth * s}px solid ${rgba(B.border, 0.53)}`,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT_STACK,
        fontWeight: 800,
        fontSize: B.fontSize * s,
        letterSpacing: 1 * s,
        color: rgba(B.textColor, 0.78),
      }}
    >
      {B.text}
    </div>
  );
};

// ── Nakładki dynamiczne ─────────────────────────────────────────────────────

const L = DYNAMIC_OVERLAY_LAYOUT;
const C = OVERLAY_CARD_LAYOUT;
const B = OVERLAY_BRAND;

/** Niebieska poświata pod tekstem (odpowiednik warstwy OvGlow: \bord + \blur). */
const textGlow = (px: number) => `0 0 ${px}px ${rgba(B.glow, 0.62)}, 0 0 ${px * 2}px ${rgba(B.glow, 0.35)}`;

/** Połysk złota po pojawieniu się elementu: `from → light → from` (sekundy od startu). */
function shimmer(age: number, from: string, light: string, a: number, b: number, c: number): string {
  if (age < a) return from;
  if (age < b) return mixColor(from, light, (age - a) / (b - a));
  if (age < c) return mixColor(light, from, (age - b) / (c - b));
  return from;
}
function mixColor(x: string, y: string, p: number): string {
  const px = clamp01(p);
  const ch = (h: string, i: number) => parseInt(h.replace("#", "").slice(i, i + 2), 16);
  const mix = (i: number) => Math.round(ch(x, i) * (1 - px) + ch(y, i) * px);
  return `rgb(${mix(0)}, ${mix(2)}, ${mix(4)})`;
}

const Tag: React.FC<{ ov: DynamicOverlays; s: number; t: number; width: number; height: number }> = ({
  ov,
  s,
  t,
  width,
  height,
}) => {
  if (!ov.tag) return null;
  const hold = ov.tagHoldSeconds ?? 1.2;
  const shrinkFrom = Math.min(ov.headlineStartSeconds ?? hold, hold);
  const p = ramp(t, shrinkFrom, hold);
  const y = interpolate(p, [0, 1], [height * L.tagBigY, height * L.tagSmallY]);
  const scale = interpolate(p, [0, 1], [1, L.tagSmallScale / 100]);
  const opacity = ramp(t, 0, 0.12);
  const color = shimmer(t, B.gold, B.goldLight, 0, 0.7, 1.4);
  const glowPx = (L.tagPadding + L.glowSize + 4) * s;
  return (
    <div
      style={{
        position: "absolute",
        left: width / 2,
        top: y,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        fontFamily: FONT_STACK,
        fontWeight: 800,
        fontSize: L.tagFontSize * s,
        lineHeight: 1.2,
        letterSpacing: L.tagSpacing * s,
        textAlign: "center",
        whiteSpace: "pre",
        color,
        background: rgba(B.navy, B.navyOpacity),
        padding: `${L.tagPadding * s}px ${L.tagPadding * 1.4 * s}px`,
        borderRadius: 6 * s,
        boxShadow: `0 0 ${glowPx}px ${rgba(B.glow, 0.45)}, 0 0 ${glowPx * 2}px ${rgba(B.glow, 0.25)}`,
      }}
    >
      {ov.tag}
    </div>
  );
};

const Headline: React.FC<{ ov: DynamicOverlays; s: number; t: number; width: number; height: number }> = ({
  ov,
  s,
  t,
  width,
  height,
}) => {
  if (!ov.headline) return null;
  const start = ov.headlineStartSeconds ?? 0.8;
  const end = Math.max(ov.headlineEndSeconds ?? 6, start + 1);
  if (t < start || t >= end) return null;
  const opacity = Math.min(ramp(t, start, start + 0.16), 1 - ramp(t, end - 0.2, end));
  const age = t - start;
  const color = shimmer(age, "#FFFFFF", B.goldLight, 0.25, 0.85, 1.5);
  const lines = layoutLines(ov.headline, L.headlineMaxChars);
  return (
    <div
      style={{
        position: "absolute",
        left: 40 * s,
        right: 40 * s,
        top: height * L.headlineY,
        transform: "translateY(-50%)",
        opacity,
        fontFamily: FONT_STACK,
        fontWeight: 800,
        fontSize: L.headlineFontSize * s,
        lineHeight: 1.15,
        textAlign: "center",
        whiteSpace: "pre",
        color,
        ...stroke(4 * s, B.navyDeep),
        textShadow: `${2 * s}px ${2 * s}px 0 ${rgba(B.navyDeep, 0.5)}, ${textGlow(L.glowSize * 2 * s)}`,
        width: width - 80 * s,
      }}
    >
      {lines.join("\n")}
    </div>
  );
};

const CARD_ICONS = { check: "✓", dot: "•" } as const;

const Card: React.FC<{ card: OverlayCard; s: number; t: number; width: number; height: number }> = ({
  card,
  s,
  t,
  width,
  height,
}) => {
  if (!card.rows.length) return null;
  const start = card.startSeconds;
  const end = card.endSeconds == null ? Infinity : Math.max(card.endSeconds, start + 1);
  if (t < start || t >= end) return null;
  const panel = card.frame === "panel";
  const hasIcons = card.rows.some((r) => r.icon);
  // Szerokość jak w ASS: szacunek szerokości znaków Inter — kadr 720 px.
  const rowChars = (r: OverlayCard["rows"][number]) =>
    r.text.length + (r.value ? r.value.length + 2 : 0);
  const maxChars = Math.max(
    ...card.rows.map(rowChars),
    card.title ? Math.round((card.title.length * C.titleFontSize) / C.fontSize) : 0,
  );
  const innerW = (hasIcons ? C.iconWidth : 0) + Math.ceil(maxChars * C.fontSize * C.charWidth);
  const panelW = Math.min(Math.max(C.padding * 2 + innerW, 300), DEFAULT_ASS_DIMENSIONS.width - 72) * s;
  const contentH = ((card.title ? C.titleHeight : 0) + card.rows.length * C.rowHeight) * s;
  const panelH = C.padding * 2 * s + contentH;
  const panelX = (width - panelW) / 2;
  const panelY = height * (card.y ?? C.defaultTop);

  const enter = easeOut(ramp(t, start, start + 0.26));
  const rise = (p: number) => `translateY(${(1 - p) * 16 * s}px)`;
  const textEdge: React.CSSProperties = panel
    ? {}
    : {
        ...stroke(3 * s, B.navyDeep),
        textShadow: `${2 * s}px ${2 * s}px 0 ${rgba(B.navyDeep, 0.5)}, ${textGlow(10 * s)}`,
      };

  return (
    <div style={{ position: "absolute", left: panelX, top: panelY, width: panelW, height: panelH }}>
      {panel && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: ramp(t, start, start + 0.2),
            transform: rise(enter),
            background: rgba(B.navy, B.navyOpacity),
            border: `${1.5 * s}px solid ${rgba(B.border, 0.44)}`,
            borderRadius: C.cornerRadius * s,
            boxShadow: `0 0 ${14 * s}px ${rgba(B.glow, 0.4)}, 0 0 ${28 * s}px ${rgba(B.glow, 0.2)}`,
          }}
        />
      )}
      {card.title && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: C.padding * s,
            height: C.titleHeight * s,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: ramp(t, start, start + 0.2),
            transform: rise(enter),
            fontFamily: FONT_STACK,
            fontWeight: 800,
            fontSize: C.titleFontSize * s,
            letterSpacing: C.titleSpacing * s,
            color: B.gold,
            whiteSpace: "pre",
            ...textEdge,
          }}
        >
          {card.title}
        </div>
      )}
      {card.rows.map((row, i) => {
        const rowStart =
          row.startSeconds != null
            ? Math.max(row.startSeconds, start)
            : start + 0.25 + i * C.revealStagger;
        if (t < rowStart) return null;
        const p = easeOut(ramp(t, rowStart, rowStart + 0.22));
        const top = (C.padding + (card.title ? C.titleHeight : 0) + i * C.rowHeight) * s;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: C.padding * s,
              right: C.padding * s,
              top,
              height: C.rowHeight * s,
              display: "flex",
              alignItems: "center",
              opacity: ramp(t, rowStart, rowStart + 0.15),
              transform: rise(p),
              fontFamily: FONT_STACK,
              fontWeight: 800,
              fontSize: C.fontSize * s,
              color: "#FFFFFF",
              whiteSpace: "pre",
              ...textEdge,
            }}
          >
            {row.icon && (
              <span style={{ color: B.gold, width: C.iconWidth * s, display: "inline-block" }}>
                {CARD_ICONS[row.icon]}
              </span>
            )}
            <span>{row.text}</span>
            {row.value && <span style={{ color: B.gold, marginLeft: 0.6 * C.fontSize * s }}>{row.value}</span>}
          </div>
        );
      })}
    </div>
  );
};

const Overlays: React.FC<{ ov: DynamicOverlays; s: number; t: number; width: number; height: number }> = (
  props,
) => (
  <>
    <Tag {...props} />
    <Headline {...props} />
    {(props.ov.cards ?? []).map((card, i) => (
      <Card key={i} card={card} s={props.s} t={props.t} width={props.width} height={props.height} />
    ))}
  </>
);

// ── Kompozycja ──────────────────────────────────────────────────────────────

export const StudioReel: React.FC<StudioReelProps> = ({ videoUrl, cues, style, aiBadge, overlays }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const s = height / DEFAULT_ASS_DIMENSIONS.height;
  const sortedCues = useMemo(() => [...cues].sort((a, b) => a.start - b.start), [cues]);

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {videoUrl ? (
        <OffthreadVideo src={videoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}
      {style && sortedCues.length > 0 && <Captions cues={sortedCues} style={style} s={s} t={t} />}
      {overlays && <Overlays ov={overlays} s={s} t={t} width={width} height={height} />}
      {aiBadge && <AiBadge s={s} />}
    </AbsoluteFill>
  );
};
