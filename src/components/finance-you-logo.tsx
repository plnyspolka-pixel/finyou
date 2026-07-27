import { cn } from "@/lib/utils";
import logoAsset from "@/assets/financeyou-logo.png.asset.json";

type Props = {
  className?: string;
  variant?: "dark" | "light" | "mono";
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

/**
 * FinanceYou — oficjalne logo (dom + financeyou.pl).
 * `variant="light"` (na jasnym tle) wyświetla logo bez zmian.
 * `variant="dark"` (na ciemnym tle) odwraca kolory na białe via filter.
 */
export function FinanceYouLogo({ className, variant = "dark", size = "md" }: Props) {
  const h = size === "sm" ? "h-9" : size === "lg" ? "h-20" : "h-14";
  // logo zostało wygenerowane na jasnym beżowym tle — na dark hero odwracamy
  // jasność, na light tle (header, footer) pokazujemy oryginał.
  const filter =
    variant === "dark"
      ? "brightness(0) invert(1)"
      : variant === "mono"
        ? "grayscale(1)"
        : undefined;

  return (
    <img
      src={logoAsset.url}
      alt="Finance You"
      className={cn(h, "w-auto select-none", className)}
      style={filter ? { filter } : undefined}
      draggable={false}
    />
  );
}
