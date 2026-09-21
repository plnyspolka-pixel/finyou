// Kolorowy stepper pipeline'u inwestora — jedna oś, dziewięć kroków, każdy
// z własnym odcieniem (hue z lib/investor-plan/pipeline.ts). Sam widok:
// logika kolejności i stanów jest policzona po stronie serwera.
import type { ReactNode } from "react";
import { Check, Lock, AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineStep, PipelineStepState } from "@/lib/investor-plan/pipeline";

function accent(hue: number, lightness: number, chroma: number, alpha = 1): string {
  return `oklch(${lightness} ${chroma} ${hue}${alpha < 1 ? ` / ${alpha}` : ""})`;
}

const STATE_BADGE: Record<PipelineStepState, string> = {
  zrobione: "Gotowe",
  biezacy: "Twój krok",
  zablokowany: "Zablokowany",
  uwaga: "Wymaga uwagi",
};

/** Pasek postępu całego pipeline'u z tęczowym gradientem kroków. */
export function PipelineProgress({
  steps,
  progress,
  tierLabel,
}: {
  steps: PipelineStep[];
  progress: number;
  tierLabel: string;
}) {
  const gradient = steps
    .map((s, i) => `${accent(s.hue, 0.68, 0.17)} ${Math.round((i / (steps.length - 1)) * 100)}%`)
    .join(", ");

  return (
    <div className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Pipeline inwestora
          </div>
          <div className="mt-1 text-2xl font-black tabular-nums">{progress}%</div>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-bold text-white"
          style={{
            background: "linear-gradient(95deg, oklch(0.45 0.22 268), oklch(0.62 0.17 220))",
          }}
        >
          Pakiet {tierLabel}
        </span>
      </div>

      <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${gradient})` }}
        />
      </div>

      <ol className="mt-4 flex flex-wrap gap-1.5">
        {steps.map((s) => {
          const done = s.state === "zrobione";
          const current = s.state === "biezacy";
          const attention = s.state === "uwaga";
          return (
            <li
              key={s.key}
              title={`${s.index}. ${s.title}`}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold transition",
                done && "text-white",
                !done && !current && !attention && "text-muted-foreground",
              )}
              style={{
                borderColor: attention
                  ? "oklch(0.60 0.20 25)"
                  : accent(s.hue, 0.62, 0.16, done || current ? 0.9 : 0.3),
                background: done
                  ? accent(s.hue, 0.58, 0.16)
                  : current
                    ? accent(s.hue, 0.92, 0.06)
                    : attention
                      ? "oklch(0.96 0.05 25)"
                      : "transparent",
                color: done
                  ? "#fff"
                  : attention
                    ? "oklch(0.45 0.18 25)"
                    : current
                      ? accent(s.hue, 0.35, 0.14)
                      : undefined,
              }}
            >
              <span className="tabular-nums opacity-70">{s.index}</span>
              <span className="hidden sm:inline">{s.title}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Pojedyncza karta kroku — kolorowa krawędź, numer w kółku, stan. */
export function PipelineStepCard({
  step,
  children,
  action,
}: {
  step: PipelineStep;
  children: ReactNode;
  /** Skrót akcji w nagłówku (np. przycisk „Uruchom ponownie"). */
  action?: ReactNode;
}) {
  const done = step.state === "zrobione";
  const current = step.state === "biezacy";
  const blocked = step.state === "zablokowany";
  const attention = step.state === "uwaga";

  const hue = attention ? 25 : step.hue;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border bg-card shadow-sm transition",
        current && "shadow-lg",
        blocked && "opacity-70",
      )}
      style={{
        borderColor: accent(hue, 0.62, 0.16, current || attention ? 0.75 : 0.28),
        boxShadow: current ? `0 18px 40px -26px ${accent(hue, 0.55, 0.18, 0.9)}` : undefined,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{
          background: `linear-gradient(180deg, ${accent(hue, 0.7, 0.17)}, ${accent(hue + 18, 0.55, 0.19)})`,
          opacity: blocked ? 0.35 : 1,
        }}
      />
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 pl-7">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black text-white"
            style={{
              background: done
                ? `linear-gradient(135deg, ${accent(hue, 0.62, 0.16)}, ${accent(hue + 20, 0.48, 0.18)})`
                : attention
                  ? "linear-gradient(135deg, oklch(0.65 0.20 25), oklch(0.52 0.22 20))"
                  : current
                    ? `linear-gradient(135deg, ${accent(hue, 0.68, 0.17)}, ${accent(hue + 20, 0.52, 0.19)})`
                    : "oklch(0.88 0.01 260)",
              color: blocked ? "oklch(0.45 0.02 260)" : "#fff",
            }}
          >
            {done ? (
              <Check className="h-4.5 w-4.5" />
            ) : attention ? (
              <AlertTriangle className="h-4 w-4" />
            ) : blocked ? (
              <Lock className="h-4 w-4" />
            ) : (
              step.index
            )}
          </span>
          <div>
            <h3 className="text-base font-bold leading-tight">{step.title}</h3>
            <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{step.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {action}
          <span
            className="rounded-full px-2.5 py-1 text-[0.68rem] font-bold"
            style={{
              background: done
                ? accent(hue, 0.94, 0.05)
                : attention
                  ? "oklch(0.95 0.06 25)"
                  : current
                    ? accent(hue, 0.94, 0.05)
                    : "oklch(0.95 0.005 260)",
              color: attention ? "oklch(0.45 0.18 25)" : accent(hue, 0.38, 0.13),
            }}
          >
            {STATE_BADGE[step.state]}
          </span>
        </div>
      </header>

      {step.hint ? (
        <p
          className="mx-5 mb-3 ml-7 flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs"
          style={{
            background: attention ? "oklch(0.97 0.04 25)" : "oklch(0.96 0.005 260)",
            color: attention ? "oklch(0.42 0.17 25)" : "oklch(0.45 0.02 260)",
          }}
        >
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {step.hint}
        </p>
      ) : null}

      <div className="px-5 pb-5 pl-7">{children}</div>
    </section>
  );
}
