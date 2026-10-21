// Hook wizualny rolki (0–2,5 s) — pełny kadr nad pierwszym zdaniem lektora.
// Plan (klip, tekst, czasy, dźwięk) liczy serwer w src/lib/studio-hook.ts;
// tu rysujemy: klip z modelu wideo albo obraz z ruchem (najazd od pierwszej
// klatki, wstrząs i błysk na uderzeniu), duży tekst na całą szerokość
// (słowo akcentowane złotem) i efekt dźwiękowy zgrany z uderzeniem.
// Kadr bazowy 720×1280, `k` skaluje do mastera.

import type React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring } from "remotion";
import type { ReelHook } from "../../../src/lib/studio-hook";

const GOLD = "#EABE4A";
const GOLD_LIGHT = "#F3D57E";
const NAVY_DEEP = "#070B22";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Scale = { x: number; y: number };

/** Wstrząs po uderzeniu: gasnąca sinusoida (piksele kadru bazowego). */
export function hookShake(t: number, impactAt: number): { x: number; y: number } {
  const d = t - impactAt;
  if (d < 0 || d > 0.4) return { x: 0, y: 0 };
  const amp = 14 * Math.exp(-d * 11);
  return { x: amp * Math.sin(d * 95), y: amp * 0.7 * Math.cos(d * 120) };
}

/**
 * Skala kadru: od pierwszej klatki szybki „slam” 1,28 → 1,08 do uderzenia,
 * potem powolny najazd do 1,18 — ruch jest w kadrze od razu (wymóg 0,3 s).
 */
export function hookZoom(t: number, impactAt: number, end: number): number {
  if (t < impactAt) return interpolate(t, [0, impactAt], [1.28, 1.08], clamp);
  return interpolate(t, [impactAt, end], [1.08, 1.18], clamp);
}

export const HookLayer: React.FC<{
  hook: ReelHook;
  t: number;
  fps: number;
  k: Scale;
  width: number;
  height: number;
  fontFamily: string;
}> = ({ hook, t, fps, k, width, height, fontFamily }) => {
  if (t >= hook.end) return null;
  const fadeOut = interpolate(t, [hook.end - 0.22, hook.end], [1, 0], clamp);
  const zoom = hookZoom(t, hook.impactAt, hook.end);
  const shake = hookShake(t, hook.impactAt);
  const flash = interpolate(
    t,
    [hook.impactAt, hook.impactAt + 0.04, hook.impactAt + 0.22],
    [0, 0.6, 0],
    clamp,
  );
  const media = hook.media;
  const mediaStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: `translate(${shake.x * k.x}px, ${shake.y * k.y}px) scale(${zoom})`,
    transformOrigin: "50% 45%",
  };
  const fontSize = hook.fontSize * k.x;
  let wordIndex = 0;
  return (
    <AbsoluteFill style={{ opacity: fadeOut, backgroundColor: NAVY_DEEP, overflow: "hidden" }}>
      {media?.type === "video" ? (
        <OffthreadVideo src={media.url} muted style={mediaStyle} />
      ) : media?.type === "image" ? (
        <Img src={media.url} style={mediaStyle} />
      ) : null}
      {/* Przyciemnienie pod tekst: winieta + środek kadru. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(7,11,34,0.15) 0%, rgba(7,11,34,0.55) 60%, rgba(7,11,34,0.85) 100%)",
        }}
      />
      <AbsoluteFill style={{ backgroundColor: "#FFFFFF", opacity: flash }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          width,
          top: hook.centerY * height,
          transform: "translateY(-50%)",
          textAlign: "center",
          fontFamily,
          fontWeight: 800,
          fontSize,
          lineHeight: 1.0,
          letterSpacing: -0.01 * fontSize,
        }}
      >
        {hook.lines.map((line, li) => (
          <div key={li} style={{ whiteSpace: "nowrap" }}>
            {line.map((w, wi) => {
              const i = wordIndex++;
              // Pierwsze słowo wchodzi tuż przed uderzeniem, kolejne co 90 ms.
              const at = Math.max(0.04, hook.impactAt - 0.12) + i * 0.09;
              const s = spring({
                frame: Math.max(0, (t - at) * fps),
                fps,
                config: { damping: 11, mass: 0.6, stiffness: 180 },
              });
              const scale = interpolate(s, [0, 1], [1.9, 1]);
              const opacity = t < at ? 0 : Math.min(1, (t - at) / 0.06);
              const color = w.accent ? (t - at < 0.35 ? GOLD_LIGHT : GOLD) : "#FFFFFF";
              return (
                <span
                  key={wi}
                  style={{
                    display: "inline-block",
                    margin: `0 ${0.12 * fontSize}px`,
                    transform: `scale(${scale})`,
                    opacity,
                    color,
                    WebkitTextStroke: `${0.045 * fontSize}px ${NAVY_DEEP}`,
                    paintOrder: "stroke fill",
                    textShadow: w.accent
                      ? `0 0 ${0.18 * fontSize}px rgba(234,190,74,0.75), 0 ${0.04 * fontSize}px 0 rgba(7,11,34,0.6)`
                      : `0 ${0.04 * fontSize}px 0 rgba(7,11,34,0.6), 0 0 ${0.12 * fontSize}px rgba(7,11,34,0.6)`,
                  }}
                >
                  {w.text}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Dźwięk hooka: uderzenie od klatki `sfx.at` (zgrane z obrazem). */
export const HookAudio: React.FC<{ hook: ReelHook; fps: number }> = ({ hook, fps }) =>
  hook.sfx ? (
    <Sequence from={Math.max(0, Math.round(hook.sfx.at * fps))} layout="none">
      <Audio src={hook.sfx.url} volume={hook.sfx.volume} />
    </Sequence>
  ) : null;

/** Podkład muzyczny (opcjonalny) — przez cały film, ściszony pod lektorem. */
export const HookMusic: React.FC<{ hook: ReelHook }> = ({ hook }) =>
  hook.music ? <Audio src={hook.music.url} volume={hook.music.volume} loop /> : null;
