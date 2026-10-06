// Wspólne klocki wyglądu kompozycji Studia: kolory brandu, czcionka, zegar
// klatek i funkcje ruchu. Wszystko liczone z numeru klatki — Lambda renderuje
// film kawałkami na różnych maszynach, więc żadnych animacji „na czas".

import { interpolate, spring, staticFile } from "remotion";
import { loadFont } from "@remotion/fonts";
import {
  DYNAMIC_OVERLAY_LAYOUT,
  OVERLAY_BRAND,
  OVERLAY_CARD_LAYOUT,
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
export const FONT_STACK = `Inter, "DejaVu Sans", Arial, sans-serif`;

export const B = OVERLAY_BRAND;
export const L = DYNAMIC_OVERLAY_LAYOUT;
export const C = OVERLAY_CARD_LAYOUT;

/** Zegar klatki: czas w sekundach, klatkaż, skala względem kadru 720×1280 i wymiary. */
export type Clock = { t: number; fps: number; s: number; width: number; height: number };

export const rgba = (hex: string, alpha: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? m[1] : "000000";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Przejście liniowe `from → to` w sekundach, jak \fad / \t w ASS. */
export const ramp = (t: number, from: number, to: number) =>
  to <= from ? (t >= to ? 1 : 0) : clamp01((t - from) / (to - from));

/** Obrys tekstu jak Outline w ASS: kreska o podwójnej szerokości pod wypełnieniem. */
export const stroke = (width: number, color: string): React.CSSProperties =>
  width > 0
    ? { WebkitTextStroke: `${width * 2}px ${color}`, paintOrder: "stroke fill" }
    : {};

/** Sprężyste wejście od `startSec` (0 → 1 z lekkim przestrzeleniem). */
export const pop = (
  c: Clock,
  startSec: number,
  config = { damping: 14, stiffness: 160, mass: 0.6 },
) => spring({ frame: Math.max(0, (c.t - startSec) * c.fps), fps: c.fps, config });
/** Wejście bez przestrzelenia (dla rozmycia i przezroczystości). */
export const ease = (c: Clock, startSec: number, config = { damping: 200, stiffness: 120 }) =>
  spring({ frame: Math.max(0, (c.t - startSec) * c.fps), fps: c.fps, config });

/**
 * Połysk złota: jasny pas gradientu przesuwany po tekście jedną falą
 * (`-150% → 250%`) w ciągu `durSec` od `startSec`. Działa na warstwie
 * z `background-clip: text`, więc tekst pod spodem nie może mieć obrysu —
 * obrys rysuje osobna warstwa pod nią.
 */
export function shimmerStyle(
  c: Clock,
  startSec: number,
  durSec: number,
  base: string,
  light: string,
): React.CSSProperties {
  const p = ramp(c.t, startSec, startSec + durSec);
  const x = interpolate(p, [0, 1], [-150, 250]);
  return {
    backgroundImage: `linear-gradient(100deg, ${base} 0%, ${base} 35%, ${light} 50%, ${base} 65%, ${base} 100%)`,
    backgroundSize: "300% 100%",
    backgroundPosition: `${x}% 0`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
}

/** Niebieska poświata pod tekstem (odpowiednik warstwy OvGlow: \bord + \blur). */
export const textGlow = (px: number) =>
  `0 0 ${px}px ${rgba(B.glow, 0.55)}, 0 0 ${px * 2.2}px ${rgba(B.glow, 0.28)}`;

/** Szklana plansza — wspólny wygląd kart i elementów. */
export const glassPanel = (s: number, radius: number = C.cornerRadius): React.CSSProperties => ({
  borderRadius: radius * s,
  background: `linear-gradient(160deg, ${rgba(B.navy, 0.66)}, ${rgba(B.navyDeep, 0.58)})`,
  backdropFilter: `blur(${18 * s}px) saturate(1.4)`,
  WebkitBackdropFilter: `blur(${18 * s}px) saturate(1.4)`,
  border: `${1 * s}px solid rgba(255,255,255,0.14)`,
  boxShadow: `inset 0 ${1 * s}px 0 rgba(255,255,255,0.18), 0 ${22 * s}px ${50 * s}px rgba(0,0,0,0.38), 0 0 ${28 * s}px ${rgba(B.glow, 0.22)}`,
});

/** Tekst na planszy: delikatny cień zamiast obrysu. */
export const onPanelText = (s: number): React.CSSProperties => ({
  textShadow: `0 ${1 * s}px ${2 * s}px rgba(0,0,0,0.35)`,
});

/** Tekst wprost na obrazie: granatowy obrys + poświata (czytelność na każdym tle). */
export const onImageText = (s: number): React.CSSProperties => ({
  ...stroke(3 * s, B.navyDeep),
  textShadow: `0 ${2 * s}px ${8 * s}px ${rgba(B.navyDeep, 0.7)}, ${textGlow(10 * s)}`,
});

/** Liczba na początku wartości (np. „60% LTV" → 60) — do liczników. */
export function splitValue(value: string): {
  prefix: string;
  num: number | null;
  suffix: string;
  decimals: number;
} {
  const m = /^(\D*?)(\d(?:[\d\s]*\d)?(?:[.,]\d+)?)(.*)$/.exec(value);
  if (!m) return { prefix: value, num: null, suffix: "", decimals: 0 };
  const raw = m[2].replace(/\s/g, "");
  const decimals = (raw.split(/[.,]/)[1] ?? "").length;
  return { prefix: m[1], num: Number(raw.replace(",", ".")), suffix: m[3], decimals };
}

export function formatNumber(n: number, decimals: number): string {
  const fixed = n.toFixed(decimals).replace(".", ",");
  const [int, frac] = fixed.split(",");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return frac ? `${grouped},${frac}` : grouped;
}

/** Wartość tekstowa z liczbą „nabijaną" od zera od `from` (s). */
export function countUpText(c: Clock, value: string, from: number): string {
  const { prefix, num, suffix, decimals } = splitValue(value);
  if (num == null) return value;
  const p = ease(c, from, { damping: 30, stiffness: 60 });
  return `${prefix}${formatNumber(num * p, decimals)}${suffix}`;
}
