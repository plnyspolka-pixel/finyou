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
// kwestie SRT już pocięte pod styl (chunkCues), nakładki z czasami
// dopasowanymi do SRT (overlaysWithCueTiming) i — gdy są — czasy słów
// z ElevenLabs (`words`). Kompozycja niczego nie liczy z tekstu, tylko rysuje.
//
// RUCH: wszystko wynika z numeru klatki (`useCurrentFrame`), nigdy z zegara —
// Lambda renderuje film w kawałkach na różnych maszynach, więc animacja
// „na czas" rozjechałaby się między kawałkami. Wejścia to `spring()`
// (lekki overshoot), połysk złota to gradient przesuwany po klatkach.
//
// ZASADA WYGLĄDU: mało elementów, dużo powietrza, konsekwentne złoto brandu
// na granacie; tekst zawsze na przyciemnieniu (scrim), nigdy „gołym" obrazie.

import { useMemo } from "react";
import { AbsoluteFill, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AI_BADGE,
  DEFAULT_ASS_DIMENSIONS,
  layoutLines,
  type CaptionStyle,
  type DynamicOverlays,
  type OverlayCard,
  type SrtCue,
} from "../../../src/lib/caption-style";
import { Element, elementsActive } from "./Elements";
import {
  B,
  C,
  FONT_STACK,
  L,
  countUpText,
  ease,
  glassPanel,
  onImageText,
  onPanelText,
  pop,
  ramp,
  rgba,
  shimmerStyle,
  stroke,
  textGlow,
  type Clock,
} from "./ui";

export type TimedWord = { text: string; start: number; end: number };

export type StudioReelProps = {
  /** Adres https czystego mastera (HeyGen / bucket studio-media). */
  videoUrl: string;
  /** Kwestie pocięte pod styl (chunkCues) — bez stylu: bez napisów. */
  cues: SrtCue[];
  style: CaptionStyle | null;
  aiBadge: boolean;
  overlays: DynamicOverlays | null;
  /** Czasy słów z ElevenLabs; `[]` = czasy słów liczone proporcjonalnie do liter. */
  words: TimedWord[];
};

export const studioReelDefaults: StudioReelProps = {
  videoUrl: "",
  cues: [],
  style: null,
  aiBadge: true,
  overlays: null,
  words: [],
};

// ── Czasy słów ──────────────────────────────────────────────────────────────

type CueWords = { cue: SrtCue; lines: TimedWord[][] };

/**
 * Słowa kwestii z czasami. Gdy liczba słów we wszystkich kwestiach zgadza się
 * z listą słów ElevenLabs (ten sam tekst scenariusza), bierzemy czasy
 * prawdziwe; inaczej — proporcjonalnie do liczby liter (jak highlightedEvents
 * w ASS). Zwraca słowa pogrupowane w wiersze kwestii.
 */
function timeCueWords(cues: SrtCue[], timed: TimedWord[]): CueWords[] {
  const perCue = cues.map((cue) => cue.text.split("\n").map((l) => l.split(" ").filter(Boolean)));
  const total = perCue.reduce((n, lines) => n + lines.reduce((m, l) => m + l.length, 0), 0);
  const exact = timed.length === total && total > 0;
  let k = 0;
  return cues.map((cue, ci) => {
    const lines = perCue[ci];
    const flat = lines.flat();
    const weights = flat.map((w) => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, "").length));
    const sum = weights.reduce((a, b) => a + b, 0);
    const span = cue.end - cue.start;
    let acc = 0;
    let idx = 0;
    const out: TimedWord[][] = lines.map((ws) =>
      ws.map((text) => {
        let start: number;
        let end: number;
        if (exact) {
          const tw = timed[k++];
          // Czas słowa nie może wyjść poza kwestię (cięcie chunkCues), ale
          // pierwsze słowo rusza razem z kwestią — bez „dziury" na starcie.
          start = idx === 0 ? cue.start : Math.min(Math.max(tw.start, cue.start), cue.end);
          end = Math.min(Math.max(tw.end, start + 0.05), cue.end);
        } else {
          start = cue.start + (span * acc) / sum;
          acc += weights[idx];
          end = cue.start + (span * acc) / sum;
        }
        idx++;
        return { text, start, end };
      }),
    );
    return { cue, lines: out };
  });
}

// ── Przyciemnienia i winieta ────────────────────────────────────────────────

/**
 * Warstwa „kinowa": stała winieta na brzegach, przyciemnienie u dołu pod
 * napisami i u góry pod nakładkami (to drugie tylko, gdy coś tam jest).
 * Daje czytelność tekstu na jasnych ujęciach i spójny, droższy obraz.
 */
const Cinematic: React.FC<{ topScrim: number; bottomScrim: number }> = ({ topScrim, bottomScrim }) => (
  <>
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse 80% 70% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)",
      }}
    />
    <AbsoluteFill
      style={{
        opacity: topScrim,
        background: `linear-gradient(to bottom, ${rgba(B.navyDeep, 0.62)} 0%, ${rgba(B.navyDeep, 0.25)} 28%, rgba(0,0,0,0) 48%)`,
      }}
    />
    <AbsoluteFill
      style={{
        opacity: bottomScrim,
        background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.18) 30%, rgba(0,0,0,0) 46%)",
      }}
    />
  </>
);

// ── Napisy ──────────────────────────────────────────────────────────────────

/**
 * Napisy słowo po słowie. Każde słowo wchodzi sprężyście w swoim czasie
 * (style z podświetlaniem) albo cała kwestia wchodzi naraz z lekkim
 * rozstrzeleniem (pozostałe style). Mówione słowo jest jaśniejsze i ma
 * miękką poświatę; słowa, które dopiero padną, są przygaszone. Styl „box"
 * dostaje szklaną plakietkę zamiast płaskiej ramki.
 */
const Captions: React.FC<{ cues: CueWords[]; style: CaptionStyle; c: Clock }> = ({ cues, style, c }) => {
  const item = cues.find(({ cue }) => c.t >= cue.start && c.t < cue.end);
  if (!item) return null;
  const { cue, lines } = item;
  const s = c.s;
  const wordPop = Boolean(style.highlight);
  const fontSize = style.fontSize * s;
  const glass = Boolean(style.box);

  const textBase: React.CSSProperties = {
    fontFamily: FONT_STACK,
    fontWeight: style.bold ? 800 : 500,
    fontSize,
    lineHeight: 1.18,
    letterSpacing: -0.01 * fontSize,
    textAlign: "center",
    whiteSpace: "pre",
  };
  const edge: React.CSSProperties = glass
    ? {}
    : {
        ...stroke(style.outline * s, style.outlineColor),
        textShadow: `0 ${Math.max(2, style.shadow + 2) * s}px ${8 * s}px rgba(0,0,0,0.45)`,
      };
  const position: React.CSSProperties =
    style.placement === "center"
      ? { top: 0, bottom: 0, justifyContent: "center" }
      : { bottom: style.marginBottom * s, justifyContent: "flex-end" };

  // Wejście kwestii: z dołu, miękko; przy word-pop każde słowo osobno.
  const cueIn = ease(c, cue.start, { damping: 24, stiffness: 180 });

  return (
    <div
      style={{
        position: "absolute",
        left: style.marginSide * s,
        right: style.marginSide * s,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: glass ? 6 * s : 0,
        ...position,
        opacity: wordPop ? 1 : cueIn,
        transform: wordPop ? undefined : `translateY(${(1 - cueIn) * 14 * s}px)`,
      }}
    >
      {lines.map((ws, li) => (
        <div
          key={li}
          style={{
            ...textBase,
            ...edge,
            ...(glass
              ? {
                  background: rgba(style.box!.color, Math.min(0.72, style.box!.opacity)),
                  backdropFilter: `blur(${14 * s}px) saturate(1.3)`,
                  WebkitBackdropFilter: `blur(${14 * s}px) saturate(1.3)`,
                  border: `${1 * s}px solid rgba(255,255,255,0.14)`,
                  boxShadow: `inset 0 ${1 * s}px 0 rgba(255,255,255,0.12), 0 ${12 * s}px ${30 * s}px rgba(0,0,0,0.35)`,
                  padding: `${style.outline * 0.45 * s}px ${style.outline * 1.1 * s}px`,
                  borderRadius: 12 * s,
                }
              : {}),
          }}
        >
          {ws.map((w, wi) => {
            const said = c.t >= w.end;
            const current = c.t >= w.start && c.t < w.end;
            const enter = wordPop ? pop(c, w.start) : 1;
            const visible = wordPop ? c.t >= w.start : true;
            const text = style.uppercase ? w.text.toLocaleUpperCase("pl-PL") : w.text;
            const color = current && style.highlight ? style.highlight : style.color;
            return (
              <span key={wi} style={{ display: "inline-block", whiteSpace: "pre" }}>
                {wi > 0 ? " " : ""}
                <span
                  style={{
                    display: "inline-block",
                    color,
                    opacity: !visible ? 0 : current || said ? 1 : 0.62,
                    transform: `scale(${wordPop ? 0.7 + 0.3 * enter : 1}) translateY(${current ? -0.03 * fontSize : 0}px)`,
                    transformOrigin: "50% 80%",
                    textShadow: current
                      ? `0 0 ${0.35 * fontSize}px ${rgba(style.highlight ?? "#FFFFFF", 0.55)}`
                      : undefined,
                  }}
                >
                  {text}
                </span>
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
  const A = AI_BADGE;
  return (
    <div
      style={{
        position: "absolute",
        top: A.marginTop * s,
        right: A.marginRight * s,
        width: A.width * s,
        height: A.height * s,
        borderRadius: A.radius * s,
        background: rgba(A.fill, A.fillOpacity),
        backdropFilter: `blur(${10 * s}px)`,
        WebkitBackdropFilter: `blur(${10 * s}px)`,
        border: `${A.borderWidth * s}px solid ${rgba(A.border, 0.45)}`,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT_STACK,
        fontWeight: 800,
        fontSize: A.fontSize * s,
        letterSpacing: 1.5 * s,
        color: rgba(A.textColor, 0.82),
      }}
    >
      {A.text}
    </div>
  );
};

// ── Nakładki dynamiczne ─────────────────────────────────────────────────────

/**
 * Znacznik kategorii: szklana pigułka z obracającą się złoto-niebieską
 * obwódką, duża na środku, potem sprężyście zmniejsza się do góry kadru.
 */
const Tag: React.FC<{ ov: DynamicOverlays; c: Clock }> = ({ ov, c }) => {
  if (!ov.tag) return null;
  const { s, t, width, height } = c;
  const hold = ov.tagHoldSeconds ?? 1.2;
  const shrinkFrom = Math.min(ov.headlineStartSeconds ?? hold, hold);
  const p = ease(c, shrinkFrom, { damping: 18, stiffness: 90 });
  const y = interpolate(p, [0, 1], [height * L.tagBigY, height * L.tagSmallY]);
  const scale = interpolate(p, [0, 1], [1, L.tagSmallScale / 100]) * (0.85 + 0.15 * pop(c, 0));
  const opacity = ramp(t, 0, 0.12);
  const angle = (c.t * 90) % 360;
  const border = 1.6 * s;
  const fontSize = L.tagFontSize * s;
  return (
    <div
      style={{
        position: "absolute",
        left: width / 2,
        top: y,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        padding: border,
        borderRadius: 999,
        background: `conic-gradient(from ${angle}deg, ${B.gold}, ${rgba(B.gold, 0.15)} 30%, ${B.glow} 50%, ${rgba(B.gold, 0.15)} 70%, ${B.gold})`,
        boxShadow: `0 0 ${24 * s}px ${rgba(B.glow, 0.4)}, 0 ${10 * s}px ${30 * s}px rgba(0,0,0,0.35)`,
      }}
    >
      <div
        style={{
          padding: `${L.tagPadding * 0.9 * s}px ${L.tagPadding * 2.2 * s}px`,
          borderRadius: 999,
          background: rgba(B.navy, 0.86),
          backdropFilter: `blur(${12 * s}px)`,
          WebkitBackdropFilter: `blur(${12 * s}px)`,
          fontFamily: FONT_STACK,
          fontWeight: 800,
          fontSize,
          lineHeight: 1.2,
          letterSpacing: L.tagSpacing * 1.6 * s,
          textTransform: "uppercase",
          textAlign: "center",
          whiteSpace: "pre",
          ...shimmerStyle(c, 0.15, 1.3, B.gold, "#FFF4CC"),
        }}
      >
        {ov.tag}
      </div>
    </div>
  );
};

/**
 * Pytanie rolki — kinetyczna typografia: słowa wchodzą po kolei z rozmycia
 * i lekkiego uniesienia, potem po tekście przechodzi złoty połysk, a pod
 * spodem rysuje się cienka złota linia. Dwie warstwy: obrys + cień pod
 * spodem, gradient na wierzchu (gradient w tekście nie znosi obrysu).
 */
const Headline: React.FC<{ ov: DynamicOverlays; c: Clock }> = ({ ov, c }) => {
  if (!ov.headline) return null;
  const { s, t, width, height } = c;
  const start = ov.headlineStartSeconds ?? 0.8;
  const end = Math.max(ov.headlineEndSeconds ?? 6, start + 1);
  if (t < start - 0.05 || t >= end) return null;
  const out = ramp(t, end - 0.22, end);
  const lines = layoutLines(ov.headline, L.headlineMaxChars);
  const fontSize = L.headlineFontSize * s;
  const base: React.CSSProperties = {
    fontFamily: FONT_STACK,
    fontWeight: 800,
    fontSize,
    lineHeight: 1.12,
    letterSpacing: -0.015 * fontSize,
    textAlign: "center",
    whiteSpace: "pre",
  };
  let k = 0;
  const renderLines = (layer: "back" | "front") =>
    lines.map((line, li) => (
      <div key={li} style={{ display: "block" }}>
        {line.split(" ").map((w, wi) => {
          const i = k++;
          const at = start + i * 0.055;
          const e = ease(c, at, { damping: 20, stiffness: 140 });
          const blur = (1 - e) * 14 * s;
          return (
            <span key={wi} style={{ display: "inline-block", whiteSpace: "pre" }}>
              {wi > 0 ? " " : ""}
              <span
                style={{
                  display: "inline-block",
                  opacity: e,
                  filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
                  transform: `translateY(${(1 - e) * 0.45 * fontSize}px) scale(${0.94 + 0.06 * e})`,
                  ...(layer === "back"
                    ? { color: B.navyDeep, ...stroke(4 * s, B.navyDeep), textShadow: `0 ${3 * s}px ${10 * s}px ${rgba(B.navyDeep, 0.6)}, ${textGlow(L.glowSize * 2 * s)}` }
                    : shimmerStyle(c, start + 0.5, 1.1, "#FFFFFF", B.goldLight)),
                }}
              >
                {w}
              </span>
            </span>
          );
        })}
      </div>
    ));
  const wordCount = lines.reduce((n, l) => n + l.split(" ").length, 0);
  const ruleIn = ease(c, start + wordCount * 0.055 + 0.1, { damping: 22, stiffness: 110 });
  const wrap: React.CSSProperties = {
    position: "absolute",
    left: 40 * s,
    width: width - 80 * s,
    top: height * L.headlineY,
    transform: "translateY(-50%)",
    opacity: 1 - out,
    filter: out > 0 ? `blur(${out * 8 * s}px)` : undefined,
  };
  return (
    <>
      <div style={{ ...wrap, ...base }}>{renderLines("back")}</div>
      <div style={{ ...wrap, ...base }}>
        {(() => {
          k = 0;
          return renderLines("front");
        })()}
        <div
          style={{
            margin: `${0.35 * fontSize}px auto 0`,
            width: `${ruleIn * 38}%`,
            height: 3 * s,
            borderRadius: 2 * s,
            background: `linear-gradient(90deg, ${rgba(B.gold, 0)}, ${B.gold} 30%, ${B.gold} 70%, ${rgba(B.gold, 0)})`,
            boxShadow: `0 0 ${10 * s}px ${rgba(B.gold, 0.6)}`,
          }}
        />
      </div>
    </>
  );
};

const CARD_ICONS = { check: "✓", dot: "•" } as const;

/**
 * Karta informacyjna. Domyślnie tekst leży wprost na obrazie (granatowy
 * obrys + poświata); `frame: "panel"` daje szklaną planszę: rozmyte tło,
 * jasna krawędź u góry, miękki cień. Wiersze wjeżdżają z lewej z lekkim
 * przestrzeleniem, ikona „ptaszka" to złote kółko, wartości liczbowe
 * nabijają się od zera.
 */
const Card: React.FC<{ card: OverlayCard; c: Clock }> = ({ card, c }) => {
  if (!card.rows.length) return null;
  const { s, t, width, height } = c;
  const start = card.startSeconds;
  const end = card.endSeconds == null ? Infinity : Math.max(card.endSeconds, start + 1);
  if (t < start || t >= end) return null;
  const panel = card.frame === "panel";
  const hasIcons = card.rows.some((r) => r.icon);
  const rowChars = (r: OverlayCard["rows"][number]) =>
    r.text.length + (r.value ? r.value.length + 2 : 0);
  const maxChars = Math.max(
    ...card.rows.map(rowChars),
    card.title ? Math.round((card.title.length * C.titleFontSize) / C.fontSize) : 0,
  );
  const innerW = (hasIcons ? C.iconWidth : 0) + Math.ceil(maxChars * C.fontSize * C.charWidth);
  const panelW =
    Math.min(Math.max(C.padding * 2 + innerW, 300), DEFAULT_ASS_DIMENSIONS.width - 72) * s;
  const titleH = card.title ? C.titleHeight * s : 0;
  const panelH = C.padding * 2 * s + titleH + card.rows.length * C.rowHeight * s;
  const panelX = (width - panelW) / 2;
  const panelY = height * (card.y ?? C.defaultTop);

  const enter = pop(c, start, { damping: 16, stiffness: 120, mass: 0.8 });
  const fade = ramp(t, start, start + 0.18);
  const outFade = Number.isFinite(end) ? 1 - ramp(t, end - 0.2, end) : 1;
  const textEdge: React.CSSProperties = panel ? onPanelText(s) : onImageText(s);

  return (
    <div
      style={{
        position: "absolute",
        left: panelX,
        top: panelY,
        width: panelW,
        height: panelH,
        opacity: fade * outFade,
        transform: `translateY(${(1 - enter) * 22 * s}px) scale(${0.96 + 0.04 * enter})`,
        transformOrigin: "50% 0%",
      }}
    >
      {panel && (
        <div
          style={{ position: "absolute", inset: 0, ...glassPanel(s) }}
        />
      )}
      {card.title && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: C.padding * s,
            height: titleH,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10 * s,
            fontFamily: FONT_STACK,
            fontWeight: 800,
            fontSize: C.titleFontSize * s,
            letterSpacing: C.titleSpacing * 1.3 * s,
            textTransform: "uppercase",
            color: B.gold,
            whiteSpace: "pre",
            ...textEdge,
          }}
        >
          <span style={{ width: 18 * s * enter, height: 2 * s, background: rgba(B.gold, 0.8), borderRadius: 1 }} />
          {card.title}
          <span style={{ width: 18 * s * enter, height: 2 * s, background: rgba(B.gold, 0.8), borderRadius: 1 }} />
        </div>
      )}
      {card.rows.map((row, i) => {
        const rowStart =
          row.startSeconds != null
            ? Math.max(row.startSeconds, start)
            : start + 0.25 + i * C.revealStagger;
        if (t < rowStart) return null;
        const p = pop(c, rowStart, { damping: 15, stiffness: 150, mass: 0.7 });
        const top = C.padding * s + titleH + i * C.rowHeight * s;
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
              opacity: ramp(t, rowStart, rowStart + 0.14),
              transform: `translateX(${(1 - p) * -18 * s}px)`,
              fontFamily: FONT_STACK,
              fontWeight: 700,
              fontSize: C.fontSize * s,
              letterSpacing: -0.01 * C.fontSize * s,
              color: "#FFFFFF",
              whiteSpace: "pre",
              ...textEdge,
            }}
          >
            {row.icon && (
              <span
                style={{
                  width: C.iconWidth * s,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    width: 0.78 * C.fontSize * s,
                    height: 0.78 * C.fontSize * s,
                    borderRadius: 999,
                    background:
                      row.icon === "check"
                        ? `linear-gradient(145deg, ${B.goldLight}, ${B.gold})`
                        : rgba(B.gold, 0.22),
                    border: row.icon === "dot" ? `${1.5 * s}px solid ${rgba(B.gold, 0.9)}` : undefined,
                    boxShadow: `0 0 ${10 * s}px ${rgba(B.gold, 0.45)}`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transform: `scale(${0.4 + 0.6 * p})`,
                    color: B.navyDeep,
                    fontSize: 0.5 * C.fontSize * s,
                    fontWeight: 900,
                    WebkitTextStroke: "0",
                    textShadow: "none",
                  }}
                >
                  {row.icon === "check" ? CARD_ICONS.check : ""}
                </span>
              </span>
            )}
            <span>{row.text}</span>
            {row.value && (
              <span
                style={{
                  marginLeft: "auto",
                  paddingLeft: 0.6 * C.fontSize * s,
                  color: B.gold,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {countUpText(c, row.value, rowStart + 0.05)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** Czy w tej sekundzie coś jest w górnym pasie (znacznik / pytanie / karta) — do przyciemnienia. */
function overlaysActive(ov: DynamicOverlays | null, t: number): number {
  if (!ov) return 0;
  let a = 0;
  if (ov.tag) a = Math.max(a, 0.6);
  if (ov.headline) {
    const start = ov.headlineStartSeconds ?? 0.8;
    const end = Math.max(ov.headlineEndSeconds ?? 6, start + 1);
    a = Math.max(a, Math.min(ramp(t, start - 0.3, start), 1 - ramp(t, end - 0.3, end)));
  }
  for (const card of ov.cards ?? []) {
    const end = card.endSeconds == null ? Infinity : card.endSeconds;
    a = Math.max(a, Math.min(ramp(t, card.startSeconds - 0.3, card.startSeconds), 1 - ramp(t, end - 0.3, end)));
  }
  return Math.max(a, elementsActive(ov.elements, t));
}

// ── Kompozycja ──────────────────────────────────────────────────────────────

export const StudioReel: React.FC<StudioReelProps> = ({
  videoUrl,
  cues,
  style,
  aiBadge,
  overlays,
  words,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const s = height / DEFAULT_ASS_DIMENSIONS.height;
  const c: Clock = { t, fps, s, width, height };
  const timedCues = useMemo(
    () => timeCueWords([...cues].sort((a, b) => a.start - b.start), words ?? []),
    [cues, words],
  );
  const captionsOn = Boolean(style && timedCues.length);
  // Delikatne „osiadanie" kadru na starcie — ruch w pierwszej sekundzie,
  // gdy awatar jeszcze stoi; zero czarnych klatek (hook rolki to pierwsze 0,5 s).
  const settle = interpolate(ease(c, 0, { damping: 40, stiffness: 40 }), [0, 1], [1.045, 1]);

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {videoUrl ? (
        <OffthreadVideo
          src={videoUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${settle})`,
            transformOrigin: "50% 40%",
          }}
        />
      ) : null}
      <Cinematic topScrim={overlaysActive(overlays, t)} bottomScrim={captionsOn ? 0.85 : 0} />
      {captionsOn && <Captions cues={timedCues} style={style!} c={c} />}
      {overlays && (
        <>
          <Tag ov={overlays} c={c} />
          <Headline ov={overlays} c={c} />
          {(overlays.cards ?? []).map((card, i) => (
            <Card key={i} card={card} c={c} />
          ))}
          {(overlays.elements ?? []).map((el, i) => (
            <Element key={i} el={el} c={c} />
          ))}
        </>
      )}
      {aiBadge && <AiBadge s={s} />}
    </AbsoluteFill>
  );
};
