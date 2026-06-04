import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  variant?: "dark" | "light" | "mono";
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

/**
 * FinanceYou — minimalistyczny monogram FY.
 * Cienkie linie, geometryczna precyzja, jeden gold akcent.
 * Inspirowane premium brandami (Maison Margiela / Aesop / private banking).
 */
export function FinanceYouLogo({
  className,
  variant = "dark",
  showWordmark = true,
  size = "md",
}: Props) {
  const dim = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const wordSize = size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base";

  const stroke =
    variant === "light" ? "oklch(0.18 0.09 265)" : "oklch(0.98 0 0)";
  const gold = "oklch(0.78 0.18 85)";
  const textColor =
    variant === "light" ? "text-[oklch(0.18_0.09_265)]" : "text-white";
  const subColor =
    variant === "light" ? "text-muted-foreground" : "text-white/55";

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 40 40"
        className={cn(dim)}
        role="img"
        aria-label="Finance You"
        fill="none"
      >
        {/* Krąg bazowy — cienka linia */}
        <circle
          cx="20"
          cy="20"
          r="18.5"
          stroke={stroke}
          strokeOpacity="0.18"
          strokeWidth="1"
        />

        {/* Monogram FY — linie, nie bloki */}
        {/* F: pion + górna poprzeczka + krótka środkowa */}
        <path
          d="M11 9 L11 31"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="square"
        />
        <path
          d="M11 9 L21 9"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="square"
        />
        <path
          d="M11 19 L18 19"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="square"
        />

        {/* Y: dwie skośne zbiegające się + pion w dół */}
        <path
          d="M22 9 L28 19 L28 31"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <path
          d="M34 9 L28 19"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="square"
        />

        {/* Złoty akcent — kropka jako sygnatura */}
        <circle cx="28" cy="31" r="1.6" fill={gold} />
      </svg>

      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span
            className={cn(
              "font-semibold tracking-tight",
              wordSize,
              textColor,
            )}
            style={{ fontFamily: "Inter, system-ui, sans-serif", letterSpacing: "-0.02em" }}
          >
            Finance<span style={{ color: gold, fontWeight: 600 }}>You</span>
          </span>
          <span
            className={cn(
              "mt-1 text-[9px] font-medium uppercase tracking-[0.28em]",
              subColor,
            )}
          >
            Private lending
          </span>
        </div>
      )}
    </div>
  );
}
