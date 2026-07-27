import type { ReactNode } from "react";

type Variant = "navy" | "silver" | "gold";

/**
 * Wspólny "premium" kontener:
 * - navy (domyślny): obracający się conic-gradient + ciemne navy tło + dryfujące blob-y
 * - silver: jasna, srebrno-platynowa wersja w tym samym duchu (ciemny tekst, srebrne smugi)
 */
export function FancyShell({
  children,
  className = "",
  innerClassName = "",
  variant = "navy",
  motion = true,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  variant?: Variant;
  motion?: boolean;
}) {
  if (variant === "silver") {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-3xl p-[2px] shadow-[0_12px_45px_-18px_oklch(0.55_0.02_265/0.45)] ${className}`}
      >
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2"
          style={{
            background:
              "conic-gradient(from 0deg, oklch(0.95 0.01 260), oklch(0.78 0.02 250), oklch(0.88 0.015 255), oklch(0.70 0.02 260), oklch(0.95 0.01 260))",
            animation: "fy-kw-spin 9s linear infinite",
          }}
        />
        <div
          className={`relative overflow-hidden rounded-[22px] p-5 text-slate-800 md:p-6 ${innerClassName}`}
        >
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 140% at 0% 0%, oklch(0.99 0.005 250) 0%, oklch(0.94 0.01 255) 55%, oklch(0.88 0.015 260) 100%)",
            }}
          />
          <span
            aria-hidden
            className="absolute -left-10 -top-10 h-40 w-40 rounded-full blur-2xl"
            style={{
              background: "radial-gradient(circle, oklch(0.85 0.03 250 / 0.85), transparent 70%)",
              animation: "fy-kw-drift-a 11s ease-in-out infinite alternate",
            }}
          />
          <span
            aria-hidden
            className="absolute -right-12 top-2 h-44 w-44 rounded-full blur-2xl"
            style={{
              background: "radial-gradient(circle, oklch(0.92 0.02 255 / 0.85), transparent 70%)",
              animation: "fy-kw-drift-b 13s ease-in-out infinite alternate",
            }}
          />
          <span
            aria-hidden
            className="absolute inset-0 opacity-40 mix-blend-overlay"
            style={{
              backgroundImage:
                "linear-gradient(115deg, transparent 0 48%, oklch(0.98 0.005 250 / 0.55) 48% 49%, transparent 49% 62%, oklch(0.96 0.005 250 / 0.45) 62% 62.5%, transparent 62.5%)",
              backgroundSize: "180% 100%",
              animation: "fy-kw-lines 9s linear infinite",
            }}
          />
          <div className="relative">{children}</div>
        </div>
        <style>{`
          @keyframes fy-kw-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
          @keyframes fy-kw-drift-a { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(20px,12px) scale(1.15); } }
          @keyframes fy-kw-drift-b { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(-22px,8px) scale(1.1); } }
          @keyframes fy-kw-drift-c { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(15px,-14px) scale(1.2); } }
          @keyframes fy-kw-lines { 0% { background-position: 0% 0; } 100% { background-position: 100% 0; } }
        `}</style>
      </div>
    );
  }

  if (variant === "gold") {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-3xl p-[3px] shadow-[0_18px_60px_-15px_oklch(0.55_0.18_75/0.55)] ${className}`}
      >
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 aspect-square w-[220%] -translate-x-1/2 -translate-y-1/2"
          style={{
            background:
              "conic-gradient(from 0deg, oklch(0.85 0.16 90), oklch(0.62 0.15 55), oklch(0.78 0.18 80), oklch(0.55 0.14 50), oklch(0.90 0.14 95), oklch(0.85 0.16 90))",
            animation: motion ? "fy-kw-spin 7s linear infinite" : undefined,
          }}
        />
        <div
          className={`relative overflow-hidden rounded-[20px] p-5 text-white md:p-6 ${innerClassName}`}
        >
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 140% at 0% 0%, oklch(0.28 0.05 265) 0%, oklch(0.18 0.04 265) 55%, oklch(0.12 0.03 265) 100%)",
            }}
          />
          {motion && (
            <>
              <span
                aria-hidden
                className="absolute -left-10 -top-10 h-40 w-40 rounded-full blur-2xl"
                style={{
                  background:
                    "radial-gradient(circle, oklch(0.80 0.18 85 / 0.55), transparent 70%)",
                  animation: "fy-kw-drift-a 9s ease-in-out infinite alternate",
                }}
              />
              <span
                aria-hidden
                className="absolute -right-12 top-2 h-44 w-44 rounded-full blur-2xl"
                style={{
                  background:
                    "radial-gradient(circle, oklch(0.70 0.16 65 / 0.55), transparent 70%)",
                  animation: "fy-kw-drift-b 11s ease-in-out infinite alternate",
                }}
              />
            </>
          )}
          <div className="relative">{children}</div>
        </div>
        <style>{`
          @keyframes fy-kw-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
          @keyframes fy-kw-drift-a { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(20px,12px) scale(1.15); } }
          @keyframes fy-kw-drift-b { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(-22px,8px) scale(1.1); } }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-3xl p-[2px] shadow-[0_12px_45px_-15px_oklch(0.40_0.25_268/0.55)] ${className}`}
    >
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "conic-gradient(from 0deg, oklch(0.40 0.25 268), oklch(0.65 0.18 240), oklch(0.55 0.20 255), oklch(0.30 0.15 265), oklch(0.40 0.25 268))",
          animation: motion ? "fy-kw-spin 6s linear infinite" : undefined,
        }}
      />

      <div
        className={`relative overflow-hidden rounded-[22px] p-5 text-white md:p-6 ${innerClassName}`}
      >
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 140% at 0% 0%, oklch(0.32 0.16 265) 0%, oklch(0.18 0.06 265) 55%, oklch(0.13 0.04 265) 100%)",
          }}
        />
        {motion && (
          <>
            <span
              aria-hidden
              className="absolute -left-10 -top-10 h-40 w-40 rounded-full blur-2xl"
              style={{
                background: "radial-gradient(circle, oklch(0.55 0.22 268 / 0.85), transparent 70%)",
                animation: "fy-kw-drift-a 9s ease-in-out infinite alternate",
              }}
            />
            <span
              aria-hidden
              className="absolute -right-12 top-2 h-44 w-44 rounded-full blur-2xl"
              style={{
                background: "radial-gradient(circle, oklch(0.68 0.16 235 / 0.75), transparent 70%)",
                animation: "fy-kw-drift-b 11s ease-in-out infinite alternate",
              }}
            />
            <span
              aria-hidden
              className="absolute -bottom-10 left-1/3 h-36 w-36 rounded-full blur-2xl"
              style={{
                background: "radial-gradient(circle, oklch(0.50 0.22 285 / 0.6), transparent 70%)",
                animation: "fy-kw-drift-c 13s ease-in-out infinite alternate",
              }}
            />
            <span
              aria-hidden
              className="absolute inset-0 opacity-25 mix-blend-overlay"
              style={{
                backgroundImage:
                  "linear-gradient(115deg, transparent 0 48%, oklch(0.95 0.05 240 / 0.35) 48% 49%, transparent 49% 62%, oklch(0.95 0.05 240 / 0.25) 62% 62.5%, transparent 62.5%)",
                backgroundSize: "180% 100%",
                animation: "fy-kw-lines 7s linear infinite",
              }}
            />
          </>
        )}

        <div className="relative">{children}</div>
      </div>
      <style>{`
        @keyframes fy-kw-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes fy-kw-drift-a { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(20px,12px) scale(1.15); } }
        @keyframes fy-kw-drift-b { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(-22px,8px) scale(1.1); } }
        @keyframes fy-kw-drift-c { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(15px,-14px) scale(1.2); } }
        @keyframes fy-kw-lines { 0% { background-position: 0% 0; } 100% { background-position: 100% 0; } }
      `}</style>
    </div>
  );
}
