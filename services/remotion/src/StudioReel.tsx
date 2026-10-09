// StudioReel — wykończenie rolki Studia silnikiem Remotion (render_engine =
// "remotion"): czysty master HeyGena + napisy, znaczek „AI" i nakładki
// dynamiczne. Wszystko, co da się policzyć (porcje napisów, podświetlanie
// słów, czasy nakładek, geometria kart), liczy serwer w
// src/lib/studio-reel-plan.ts — tu tylko rysujemy według planu, tym samym
// wyglądem co plik ASS caption-burnera (src/lib/caption-style.ts).
// Plan ma współrzędne kadru 720×1280; skalujemy je do rozdzielczości mastera.

import { loadFont } from "@remotion/fonts";
import { parseMedia } from "@remotion/media-parser";
import type React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import type {
  ReelCard,
  ReelCaptionEvent,
  ReelHeadline,
  ReelPlan,
  ReelTag,
} from "../../../src/lib/studio-reel-plan";

// Inter z paczki strony (public/fonts, licencja OFL) — bez pobierania z sieci
// w trakcie renderu; ta sama czcionka co w obrazie caption-burnera.
const fontFamily = "Inter";
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
const fontsHandle = delayRender("Inter");
Promise.all(
  (["400", "700", "800"] as const).flatMap((weight) => [
    loadFont({
      family: fontFamily,
      url: staticFile(`fonts/inter-latin-${weight}-normal.woff2`),
      weight,
      unicodeRange: LATIN,
    }),
    loadFont({
      family: fontFamily,
      url: staticFile(`fonts/inter-latin-ext-${weight}-normal.woff2`),
      weight,
      unicodeRange: LATIN_EXT,
    }),
  ]),
).then(
  () => continueRender(fontsHandle),
  (e) => {
    console.error("Inter się nie wczytał", e);
    continueRender(fontsHandle);
  },
);

export type StudioReelProps = {
  /** Czysty master HeyGena (bez napisów). */
  videoUrl: string;
  plan: ReelPlan | null;
  name?: string;
};

export const studioReelDefaults: StudioReelProps = { videoUrl: "", plan: null };

export const STUDIO_REEL_FPS = 30;

/** Długość i kadr z pliku mastera — kompozycja ma dokładnie jego rozmiar. */
export const calculateStudioReelMetadata: CalculateMetadataFunction<StudioReelProps> = async ({
  props,
}) => {
  if (!props.videoUrl) {
    return {
      durationInFrames: STUDIO_REEL_FPS * 5,
      width: 1080,
      height: 1920,
      fps: STUDIO_REEL_FPS,
    };
  }
  const meta = await parseMedia({
    src: props.videoUrl,
    fields: { durationInSeconds: true, dimensions: true },
    acknowledgeRemotionLicense: true,
  });
  const seconds = meta.durationInSeconds ?? 60;
  // Wymiary parzyste — wymóg H.264 / yuv420p.
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return {
    fps: STUDIO_REEL_FPS,
    durationInFrames: Math.max(1, Math.ceil(seconds * STUDIO_REEL_FPS)),
    width: even(meta.dimensions?.width ?? 1080),
    height: even(meta.dimensions?.height ?? 1920),
  };
};

// ── Pomocnicze ──────────────────────────────────────────────────────────────

function rgba(hex: string, opacity = 1): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? m[1] : "000000";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${opacity})`;
}

/** Liniowe przejście koloru (jak \t po \1c w ASS). */
function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  const k = Math.min(1, Math.max(0, t));
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Krycie z wejściem/wyjściem (\fad): 0 przed startem i po końcu. */
function fade(t: number, start: number, end: number, inSec: number, outSec = 0): number {
  if (t < start || t >= end) return 0;
  const a = inSec > 0 ? Math.min(1, (t - start) / inSec) : 1;
  const b = outSec > 0 && Number.isFinite(end) ? Math.min(1, (end - t) / outSec) : 1;
  return Math.min(a, b);
}

/** Uniesienie przy wejściu (\move o 16 px w górę). */
const rise = (t: number, start: number, sec: number) =>
  interpolate(t, [start, start + sec], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

/** Obrys liter jak w ASS: kontur na zewnątrz glifu, wypełnienie na wierzchu. */
const stroke = (px: number, color: string): React.CSSProperties =>
  px > 0 ? { WebkitTextStroke: `${px * 2}px ${color}`, paintOrder: "stroke fill" } : {};

type Scale = { x: number; y: number };

// ── Napisy ──────────────────────────────────────────────────────────────────

const Captions: React.FC<{ plan: NonNullable<ReelPlan["captions"]>; t: number; k: Scale }> = ({
  plan,
  t,
  k,
}) => {
  const ev: ReelCaptionEvent | undefined = plan.events.find((e) => t >= e.start && t < e.end);
  if (!ev) return null;
  const s = plan.style;
  const fs = s.fontSize * k.y;
  const box = s.box;
  const position: React.CSSProperties =
    s.placement === "center"
      ? { top: "50%", transform: "translateY(-50%)" }
      : { bottom: s.marginBottom * k.y };
  return (
    <div
      style={{
        position: "absolute",
        left: s.marginSide * k.x,
        right: s.marginSide * k.x,
        ...position,
        textAlign: "center",
        fontFamily,
        fontWeight: s.bold ? 800 : 400,
        fontSize: fs,
        lineHeight: 1.18,
        color: s.color,
      }}
    >
      {ev.lines.map((line, i) => (
        <div key={i}>
          <span
            style={
              box
                ? {
                    background: rgba(box.color, box.opacity),
                    padding: `0 ${s.outline * k.x}px`,
                    boxDecorationBreak: "clone",
                    WebkitBoxDecorationBreak: "clone",
                  }
                : {
                    ...stroke(s.outline * k.y, s.outlineColor),
                    textShadow: s.shadow
                      ? `${s.shadow * k.x}px ${s.shadow * k.y}px 0 ${rgba("#000000", 0.5)}`
                      : undefined,
                  }
            }
          >
            {line.map((span, j) => (
              <span key={j} style={{ color: span.color, whiteSpace: "pre" }}>
                {span.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Znaczek „AI" ────────────────────────────────────────────────────────────

const Badge: React.FC<{ spec: NonNullable<ReelPlan["badge"]>; k: Scale; width: number }> = ({
  spec,
  k,
  width,
}) => (
  <div
    style={{
      position: "absolute",
      left: width - (spec.marginRight + spec.width) * k.x,
      top: spec.marginTop * k.y,
      width: spec.width * k.x,
      height: spec.height * k.y,
      borderRadius: spec.radius * k.y,
      background: rgba(spec.fill, spec.fillOpacity),
      // \3a&H78& — ramka w ok. 53% krycia, napis \1a&H38& — ok. 78%.
      border: `${spec.borderWidth * k.y}px solid ${rgba(spec.border, 0.53)}`,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily,
      fontWeight: 700,
      fontSize: spec.fontSize * k.y,
      letterSpacing: 1 * k.x,
      color: rgba(spec.textColor, 0.78),
    }}
  >
    {spec.text}
  </div>
);

// ── Nakładki dynamiczne ─────────────────────────────────────────────────────

type Overlays = NonNullable<ReelPlan["overlays"]>;

const Tag: React.FC<{
  ov: Overlays;
  tag: ReelTag;
  t: number;
  k: Scale;
  width: number;
  height: number;
}> = ({ ov, tag, t, k, width, height }) => {
  const L = ov.layout;
  const B = ov.brand;
  const prog = interpolate(
    t,
    [tag.shrinkFrom, Math.max(tag.holdUntil, tag.shrinkFrom + 0.01)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const y = interpolate(prog, [0, 1], [L.tagBigY, L.tagSmallY]) * height;
  const scale = interpolate(prog, [0, 1], [1, L.tagSmallScale / 100]);
  const opacity = fade(t, 0, Infinity, 0.12);
  // Połysk złota: rozjaśnienie i powrót tuż po pojawieniu się znacznika.
  const color =
    t < 0.7 ? mixHex(B.gold, B.goldLight, t / 0.7) : mixHex(B.goldLight, B.gold, (t - 0.7) / 0.7);
  return (
    <div
      style={{
        position: "absolute",
        left: width / 2,
        top: y,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        padding: `${L.tagPadding * k.y}px ${L.tagPadding * k.x}px`,
        background: rgba(B.navy, B.navyOpacity),
        boxShadow: `0 0 ${(L.glowSize + 4) * 2 * k.y}px ${rgba(B.glow, 0.62)}`,
        fontFamily,
        fontWeight: 800,
        fontSize: L.tagFontSize * k.y,
        letterSpacing: L.tagSpacing * k.x,
        lineHeight: 1.15,
        color,
        textAlign: "center",
        whiteSpace: "pre",
      }}
    >
      {tag.lines.join("\n")}
    </div>
  );
};

const Headline: React.FC<{
  ov: Overlays;
  head: ReelHeadline;
  t: number;
  k: Scale;
  height: number;
}> = ({ ov, head, t, k, height }) => {
  const opacity = fade(t, head.start, head.end, 0.16, 0.2);
  if (!opacity) return null;
  const L = ov.layout;
  const B = ov.brand;
  const local = t - head.start;
  // Złoty błysk po pojawieniu się pytania, potem czysta biel.
  const color =
    local < 0.25
      ? "#FFFFFF"
      : local < 0.85
        ? mixHex("#FFFFFF", B.goldLight, (local - 0.25) / 0.6)
        : mixHex(B.goldLight, "#FFFFFF", (local - 0.85) / 0.65);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: L.headlineY * height,
        transform: "translateY(-50%)",
        opacity,
        textAlign: "center",
        fontFamily,
        fontWeight: 800,
        fontSize: L.headlineFontSize * k.y,
        lineHeight: 1.15,
        color,
        ...stroke(4 * k.y, B.navyDeep),
        textShadow: `${2 * k.x}px ${2 * k.y}px 0 ${rgba(B.navyDeep, 0.5)}, 0 0 ${L.glowSize * 2 * k.y}px ${rgba(B.glow, 0.62)}`,
      }}
    >
      {head.lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
};

const Card: React.FC<{ ov: Overlays; card: ReelCard; t: number; k: Scale; width: number }> = ({
  ov,
  card,
  t,
  k,
  width,
}) => {
  const end = card.end ?? Infinity;
  if (t < card.start || t >= end) return null;
  const C = ov.cardLayout;
  const B = ov.brand;
  const onPanel = card.panel !== null;
  const glow = `0 0 ${10 * k.y}px ${rgba(B.glow, 0.53)}`;
  const edge: React.CSSProperties = onPanel
    ? {}
    : {
        ...stroke(3 * k.y, B.navyDeep),
        textShadow: `${2 * k.x}px ${2 * k.y}px 0 ${rgba(B.navyDeep, 0.6)}, ${glow}`,
      };
  const enter = (start: number, sec: number, fadeSec: number) => ({
    opacity: fade(t, start, end, fadeSec),
    transform: `translateY(${rise(t, start, sec) * k.y}px)`,
  });
  return (
    <>
      {card.panel && (
        <div
          style={{
            position: "absolute",
            left: card.panel.x * k.x,
            top: card.panel.y * k.y,
            width: card.panel.width * k.x,
            height: card.panel.height * k.y,
            borderRadius: C.cornerRadius * k.y,
            background: rgba(B.navy, B.navyOpacity),
            border: `${1.5 * k.y}px solid ${rgba(B.border, 0.44)}`,
            boxShadow: `0 0 ${14 * k.y}px ${rgba(B.glow, 0.6)}`,
            boxSizing: "border-box",
            ...enter(card.start, 0.26, 0.2),
          }}
        />
      )}
      {card.title && (
        <div
          style={{
            position: "absolute",
            left: 0,
            width,
            top: card.title.y * k.y,
            marginTop: -(C.titleFontSize * 1.2 * k.y) / 2,
            textAlign: "center",
            fontFamily,
            fontWeight: 800,
            fontSize: C.titleFontSize * k.y,
            lineHeight: 1.2,
            letterSpacing: C.titleSpacing * k.x,
            color: B.gold,
            ...edge,
            ...enter(card.start, 0.26, 0.2),
          }}
        >
          {card.title.text}
        </div>
      )}
      {card.rows.map((row, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: row.x * k.x,
            top: row.y * k.y,
            marginTop: -(C.fontSize * 1.2 * k.y) / 2,
            fontFamily,
            fontWeight: 800,
            fontSize: C.fontSize * k.y,
            lineHeight: 1.2,
            color: "#FFFFFF",
            whiteSpace: "pre",
            ...edge,
            ...enter(row.start, 0.22, 0.15),
          }}
        >
          {row.icon === "✓" ? (
            // Ptaszek rysujemy — Inter nie ma znaku U+2713.
            <svg
              width={C.fontSize * 0.8 * k.y}
              height={C.fontSize * 0.8 * k.y}
              viewBox="0 0 24 24"
              style={{ marginRight: C.fontSize * 0.45 * k.y, verticalAlign: "-0.08em" }}
            >
              <path
                d="M4 12.5l5 5L20 6.5"
                fill="none"
                stroke={B.gold}
                strokeWidth={3.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : row.icon ? (
            <span style={{ color: B.gold }}>{`${row.icon}  `}</span>
          ) : null}
          {row.text}
          {row.value && <span style={{ color: B.gold }}>{`  ${row.value}`}</span>}
        </div>
      ))}
    </>
  );
};

// ── Kompozycja ──────────────────────────────────────────────────────────────

export const StudioReel: React.FC<StudioReelProps> = ({ videoUrl, plan }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const base = plan?.base ?? { width: 720, height: 1280 };
  const k: Scale = { x: width / base.width, y: height / base.height };
  const ov = plan?.overlays ?? null;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {videoUrl ? <OffthreadVideo src={videoUrl} /> : null}
      {ov?.cards.map((card, i) => (
        <Card key={i} ov={ov} card={card} t={t} k={k} width={width} />
      ))}
      {plan?.captions ? <Captions plan={plan.captions} t={t} k={k} /> : null}
      {ov?.tag ? <Tag ov={ov} tag={ov.tag} t={t} k={k} width={width} height={height} /> : null}
      {ov?.headline ? <Headline ov={ov} head={ov.headline} t={t} k={k} height={height} /> : null}
      {plan?.badge ? <Badge spec={plan.badge} k={k} width={width} /> : null}
    </AbsoluteFill>
  );
};
