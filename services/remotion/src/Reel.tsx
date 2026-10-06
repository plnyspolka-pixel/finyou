// Rolka Studia w React: czysty master + napisy + nakładki dynamiczne
// (znacznik kategorii, tytuł, karty) + znaczek „AI". Kadr 720×1280, 30 fps.
// Kolory i typografia z systemu „dark-glow navy+gold" strony
// (src/styles.css, .fy-marketing) — Montserrat, złoto, niebieska poświata.

import type React from "react";
import {
  AbsoluteFill,
  Easing,
  OffthreadVideo,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import type { Card, Caption, CaptionLook, CardRow, ReelProps } from "./types";

// Montserrat (font strony, licencja OFL) dołączony do paczki — render nie
// zależy od zewnętrznego serwera czcionek.
const fontFamily = "Montserrat";
loadFont({ family: fontFamily, url: staticFile("Montserrat.ttf"), weight: "100 900" });

const BRAND = {
  navy: "rgba(13,22,56,0.84)",
  navyDeep: "#070B22",
  gold: "#EABE4A",
  border: "rgba(84,124,214,0.45)",
  text: "#FFFFFF",
};
const FONT = `${fontFamily}, "Inter", system-ui, sans-serif`;

/** Obrys za tekstem + miękka niebieska poświata akcentu strony. */
const edge = (px: number): React.CSSProperties => ({
  WebkitTextStroke: `${px}px ${BRAND.navyDeep}`,
  paintOrder: "stroke fill",
  filter: "drop-shadow(0 0 14px rgba(79,139,240,0.55)) drop-shadow(0 2px 2px rgba(0,0,0,0.5))",
});

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Znacznik: duży na środku, potem zjeżdża i zmniejsza się pod górną krawędź. */
const Tag: React.FC<{ text: string; hold: number }> = ({ text, hold }) => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const t = frame / fps;
  const p = interpolate(t, [Math.max(0, hold - 0.45), hold], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const enter = interpolate(t, [0, 0.14], [0, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: width / 2,
        top: interpolate(p, [0, 1], [height * 0.3125, height * 0.117]),
        transform: `translate(-50%, -50%) scale(${1 - 0.58 * p})`,
        opacity: enter,
        background: BRAND.navy,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 14,
        padding: "14px 26px",
        boxShadow: "0 0 34px rgba(79,139,240,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
        color: BRAND.gold,
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: 34,
        letterSpacing: 1.5,
        lineHeight: 1.15,
        textAlign: "center",
        textTransform: "uppercase",
        whiteSpace: "pre",
      }}
    >
      {text}
    </div>
  );
};

/** Tytuł / pytanie w górnym pasie kadru — wejście sprężyną, wyjście fade. */
const Headline: React.FC<{ text: string; start: number; end: number }> = ({ text, start, end }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = frame / fps;
  if (t < start || t > end) return null;
  const s = spring({
    frame: frame - Math.round(start * fps),
    fps,
    config: { damping: 14, stiffness: 160 },
  });
  const out = interpolate(t, [end - 0.25, end], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: height * 0.25,
        transform: `translateY(-50%) scale(${0.92 + 0.08 * s})`,
        opacity: Math.min(s, out),
        textAlign: "center",
        padding: "0 40px",
      }}
    >
      <span
        style={{
          display: "inline-block",
          maxWidth: 640,
          color: BRAND.text,
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 56,
          lineHeight: 1.1,
          ...edge(7),
        }}
      >
        {text}
      </span>
    </div>
  );
};

const Icon: React.FC<{ kind: "check" | "dot" }> = ({ kind }) =>
  kind === "check" ? (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      style={{ flex: "none", filter: "drop-shadow(0 0 8px rgba(234,190,74,0.6))" }}
    >
      <path
        d="M4 12.5l5 5L20 7"
        fill="none"
        stroke={BRAND.gold}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <span style={{ width: 30, display: "inline-flex", justifyContent: "center", flex: "none" }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          background: BRAND.gold,
          boxShadow: "0 0 10px rgba(234,190,74,0.7)",
        }}
      />
    </span>
  );

const Row: React.FC<{ row: CardRow; start: number }> = ({ row, start }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame / fps < start) return null;
  const s = spring({
    frame: frame - Math.round(start * fps),
    fps,
    config: { damping: 15, stiffness: 170 },
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity: s,
        transform: `translateY(${(1 - s) * 16}px)`,
        fontSize: 32,
        fontWeight: 700,
        color: BRAND.text,
        ...edge(5),
      }}
    >
      {row.icon ? <Icon kind={row.icon} /> : null}
      <span>{row.text}</span>
      {row.value ? <span style={{ color: BRAND.gold, marginLeft: 6 }}>{row.value}</span> : null}
    </div>
  );
};

/** Karta bez planszy: złoty nagłówek + wiersze wprost na obrazie. */
const CardView: React.FC<{ card: Card; duration: number }> = ({ card, duration }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = frame / fps;
  const end = card.endSeconds ?? duration;
  if (t < card.startSeconds || t > end) return null;
  const out = interpolate(t, [end - 0.2, end], [1, 0], clamp);
  const titleS = spring({
    frame: frame - Math.round(card.startSeconds * fps),
    fps,
    config: { damping: 16, stiffness: 180 },
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: height * 0.155,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: out,
        fontFamily: FONT,
      }}
    >
      {card.title ? (
        <div
          style={{
            color: BRAND.gold,
            fontWeight: 800,
            fontSize: 24,
            letterSpacing: 3,
            textTransform: "uppercase",
            marginBottom: 10,
            opacity: titleS,
            transform: `translateY(${(1 - titleS) * 14}px)`,
            ...edge(5),
          }}
        >
          {card.title}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {card.rows.map((row, i) => (
          <Row key={i} row={row} start={row.startSeconds ?? card.startSeconds + 0.25 + i * 0.45} />
        ))}
      </div>
    </div>
  );
};

const Captions: React.FC<{ captions: Caption[]; look: CaptionLook }> = ({ captions, look }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cue = captions.find((c) => t >= c.start && t < c.end);
  if (!cue) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        right: 40,
        bottom: look.marginBottom,
        textAlign: "center",
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: look.fontSize,
        lineHeight: 1.15,
        color: BRAND.text,
        whiteSpace: "pre-line",
        textTransform: look.uppercase ? "uppercase" : "none",
        WebkitTextStroke: "8px #000",
        paintOrder: "stroke fill",
        textShadow: "0 3px 3px rgba(0,0,0,0.6)",
      }}
    >
      {cue.text}
    </div>
  );
};

/** Dyskretna pigułka „AI" — czarno-biała, półprzezroczysta (jak w wersji ASS). */
const AiBadge: React.FC = () => (
  <div
    style={{
      position: "absolute",
      right: 28,
      top: 140,
      width: 64,
      height: 36,
      borderRadius: 10,
      background: "rgba(0,0,0,0.3)",
      border: "1.5px solid rgba(255,255,255,0.53)",
      color: "rgba(255,255,255,0.78)",
      fontFamily: FONT,
      fontWeight: 700,
      fontSize: 20,
      letterSpacing: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    AI
  </div>
);

export const Reel: React.FC<ReelProps> = ({ videoUrl, overlays, captions, caption, aiBadge }) => {
  const { durationInFrames, fps } = useVideoConfig();
  const duration = durationInFrames / fps;
  return (
    <AbsoluteFill style={{ background: "#101728" }}>
      <AbsoluteFill>
        <OffthreadVideo src={videoUrl} />
      </AbsoluteFill>
      <Captions captions={captions} look={caption} />
      {(overlays.cards ?? []).map((card, i) => (
        <CardView key={i} card={card} duration={duration} />
      ))}
      {overlays.headline ? (
        <Headline
          text={overlays.headline}
          start={overlays.headlineStartSeconds ?? 1}
          end={overlays.headlineEndSeconds ?? 6}
        />
      ) : null}
      {overlays.tag ? <Tag text={overlays.tag} hold={overlays.tagHoldSeconds ?? 1.5} /> : null}
      {aiBadge ? <AiBadge /> : null}
    </AbsoluteFill>
  );
};
