import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  variant?: "dark" | "light" | "mono";
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

/**
 * Premium FY monogram — geometryczny, gold + navy.
 * F i Y zachodzące, w heksagonalnym kartuszu z złotym akcentem.
 */
export function FinanceYouLogo({
  className,
  variant = "dark",
  showWordmark = true,
  size = "md",
}: Props) {
  const dim = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const wordSize = size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base";

  // Kolory wg wariantu
  const bgFrom =
    variant === "dark"
      ? "oklch(0.18 0.09 265)"
      : variant === "light"
      ? "oklch(1 0 0)"
      : "transparent";
  const bgTo =
    variant === "dark"
      ? "oklch(0.10 0.07 265)"
      : variant === "light"
      ? "oklch(0.96 0.01 265)"
      : "transparent";
  const gold = "oklch(0.78 0.18 85)";
  const goldDeep = "oklch(0.68 0.15 78)";
  const mono = variant === "light" ? "oklch(0.18 0.09 265)" : "oklch(1 0 0)";

  const id = "fyLogo";

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 48 48"
        className={cn(dim, "drop-shadow-sm")}
        role="img"
        aria-label="Finance You"
      >
        <defs>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={bgFrom} />
            <stop offset="100%" stopColor={bgTo} />
          </linearGradient>
          <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={gold} />
            <stop offset="100%" stopColor={goldDeep} />
          </linearGradient>
          <linearGradient id={`${id}-mono`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mono} stopOpacity="1" />
            <stop offset="100%" stopColor={mono} stopOpacity="0.85" />
          </linearGradient>
        </defs>

        {/* Karusz */}
        <rect
          x="2"
          y="2"
          width="44"
          height="44"
          rx="11"
          fill={`url(#${id}-bg)`}
          stroke={`url(#${id}-gold)`}
          strokeWidth="1.2"
          strokeOpacity={variant === "mono" ? 0.6 : 1}
        />

        {/* F — pionowa kolumna + dwie poprzeczki */}
        <g>
          {/* pion */}
          <rect x="12" y="11" width="4.2" height="26" rx="1.2" fill={`url(#${id}-mono)`} />
          {/* górna poprzeczka */}
          <rect x="12" y="11" width="14" height="4.2" rx="1.2" fill={`url(#${id}-mono)`} />
          {/* środkowa poprzeczka — krótsza, gold akcent */}
          <rect x="12" y="22" width="9.5" height="3.6" rx="1" fill={`url(#${id}-gold)`} />
        </g>

        {/* Y — dwa ramiona zbiegają się w pion */}
        <g>
          {/* lewe ramię */}
          <path
            d="M22 11 L29.5 24 L29.5 28 L25.5 28 L19 16 Z"
            fill={`url(#${id}-mono)`}
            opacity="0.92"
          />
          {/* prawe ramię */}
          <path
            d="M37 11 L29.5 24 L29.5 28 L33.5 28 L40 16 Z"
            fill={`url(#${id}-mono)`}
            opacity="0.92"
          />
          {/* pion Y */}
          <rect x="27.4" y="24" width="4.2" height="13" rx="1.2" fill={`url(#${id}-mono)`} />
          {/* złoty akcent u góry prawego ramienia */}
          <circle cx="38" cy="12.5" r="1.8" fill={`url(#${id}-gold)`} />
        </g>
      </svg>

      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span
            className={cn(
              "font-extrabold tracking-tight",
              wordSize,
              variant === "light" ? "text-foreground" : "text-white",
            )}
            style={{ fontFamily: "Montserrat, sans-serif", letterSpacing: "-0.02em" }}
          >
            Finance<span style={{ color: gold }}>You</span>
          </span>
          <span
            className={cn(
              "mt-0.5 text-[9px] font-semibold uppercase tracking-[0.22em]",
              variant === "light" ? "text-muted-foreground" : "text-white/55",
            )}
          >
            Private lending
          </span>
        </div>
      )}
    </div>
  );
}
