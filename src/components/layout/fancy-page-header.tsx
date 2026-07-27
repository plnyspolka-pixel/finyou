import type { ReactNode } from "react";

/**
 * Premium nagłówek strony — navy/aurora, w duchu FancyShell.
 * Używany jako wspólny "fancy" akcent wszystkich paneli (m.in. /inwestor).
 */
export function FancyPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="relative w-full overflow-hidden rounded-3xl p-[2px] shadow-[0_12px_45px_-15px_oklch(0.40_0.25_268/0.55)]">
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "conic-gradient(from 0deg, oklch(0.40 0.25 268), oklch(0.65 0.18 240), oklch(0.55 0.20 255), oklch(0.30 0.15 265), oklch(0.40 0.25 268))",
          animation: "fy-ph-spin 8s linear infinite",
        }}
      />
      <div className="relative overflow-hidden rounded-[22px] p-5 text-white md:p-7">
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 140% at 0% 0%, oklch(0.32 0.16 265) 0%, oklch(0.18 0.06 265) 55%, oklch(0.13 0.04 265) 100%)",
          }}
        />
        <span
          aria-hidden
          className="absolute -left-10 -top-10 h-44 w-44 rounded-full blur-2xl"
          style={{
            background: "radial-gradient(circle, oklch(0.55 0.22 268 / 0.85), transparent 70%)",
            animation: "fy-ph-drift-a 9s ease-in-out infinite alternate",
          }}
        />
        <span
          aria-hidden
          className="absolute -right-12 top-2 h-48 w-48 rounded-full blur-2xl"
          style={{
            background: "radial-gradient(circle, oklch(0.68 0.16 235 / 0.75), transparent 70%)",
            animation: "fy-ph-drift-b 11s ease-in-out infinite alternate",
          }}
        />
        <span
          aria-hidden
          className="absolute inset-0 opacity-25 mix-blend-overlay"
          style={{
            backgroundImage:
              "linear-gradient(115deg, transparent 0 48%, oklch(0.95 0.05 240 / 0.35) 48% 49%, transparent 49% 62%, oklch(0.95 0.05 240 / 0.25) 62% 62.5%, transparent 62.5%)",
            backgroundSize: "180% 100%",
            animation: "fy-ph-lines 7s linear infinite",
          }}
        />
        <div className="relative flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
                {eyebrow}
              </p>
            )}
            <h1 className="mt-1.5 text-xl font-extrabold tracking-tight text-white drop-shadow-sm break-words [overflow-wrap:anywhere] sm:text-2xl md:text-3xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-sm text-white/75 break-words [overflow-wrap:anywhere] md:text-[15px]">
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{actions}</div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes fy-ph-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes fy-ph-drift-a { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(20px,12px) scale(1.15); } }
        @keyframes fy-ph-drift-b { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(-22px,8px) scale(1.1); } }
        @keyframes fy-ph-lines { 0% { background-position: 0% 0; } 100% { background-position: 100% 0; } }
      `}</style>
    </div>
  );
}
