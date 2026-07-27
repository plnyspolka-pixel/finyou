import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Finance You — marketing primitives (Button, Badge, Eyebrow).
 * Ported from the design-system export. Inline-styled on purpose: they consume
 * the CSS variables re-pointed by the `.fy-marketing` scope, so the same code
 * renders on-brand without pulling shadcn's light-theme variants onto the
 * public site. Not for use inside the authenticated app.
 */

/* ----------------------------- Button ----------------------------------- */

type ButtonVariant = "default" | "cta" | "outline" | "secondary" | "ghost" | "link";
type ButtonSize = "sm" | "default" | "lg" | "xl" | "cta" | "icon";

const base: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  whiteSpace: "nowrap",
  fontFamily: "var(--font-sans)",
  fontWeight: 600,
  border: "1px solid transparent",
  cursor: "pointer",
  textDecoration: "none",
  transition:
    "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), box-shadow var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-out), filter var(--duration-fast)",
  lineHeight: 1,
};

const sizes: Record<ButtonSize, CSSProperties> = {
  sm: {
    height: "2rem",
    padding: "0 0.75rem",
    fontSize: "0.75rem",
    borderRadius: "var(--radius-md)",
  },
  default: {
    height: "2.25rem",
    padding: "0 1rem",
    fontSize: "0.875rem",
    borderRadius: "var(--radius-md)",
  },
  lg: {
    height: "2.5rem",
    padding: "0 2rem",
    fontSize: "0.875rem",
    borderRadius: "var(--radius-md)",
  },
  xl: { height: "3.5rem", padding: "0 2.5rem", fontSize: "1rem", borderRadius: "var(--radius-xl)" },
  cta: {
    height: "3.5rem",
    padding: "0 2.5rem",
    fontSize: "1.0625rem",
    borderRadius: "var(--radius-2xl)",
  },
  icon: { height: "2.25rem", width: "2.25rem", padding: 0, borderRadius: "var(--radius-md)" },
};

const variants: Record<ButtonVariant, CSSProperties> = {
  default: {
    background: "var(--primary)",
    color: "var(--primary-foreground)",
    boxShadow: "var(--shadow-sm)",
  },
  cta: {
    background: "var(--gradient-cta)",
    color: "var(--accent-foreground)",
    fontWeight: 800,
    letterSpacing: "0.01em",
    boxShadow: "var(--shadow-sm)",
  },
  outline: {
    background: "var(--card)",
    color: "var(--foreground)",
    borderColor: "var(--border)",
    boxShadow: "var(--shadow-xs)",
  },
  secondary: {
    background: "var(--secondary)",
    color: "var(--secondary-foreground)",
    boxShadow: "var(--shadow-xs)",
  },
  ghost: { background: "transparent", color: "var(--foreground)" },
  link: {
    background: "transparent",
    color: "var(--accent)",
    textUnderlineOffset: "4px",
    padding: 0,
    height: "auto",
  },
};

function hoverFor(variant: ButtonVariant): CSSProperties {
  switch (variant) {
    case "cta":
      return {
        filter: "brightness(1.08)",
        transform: "translateY(-1px)",
        boxShadow: "var(--shadow-md)",
      };
    case "default":
      return { background: "oklch(0.20 0.08 265 / 0.9)" };
    case "outline":
      return {
        background: "var(--accent)",
        color: "var(--accent-foreground)",
        borderColor: "var(--accent)",
      };
    case "secondary":
      return { background: "oklch(0.91 0.012 250)" };
    case "ghost":
      return { background: "var(--secondary)" };
    case "link":
      return { textDecoration: "underline" };
    default:
      return {};
  }
}

type MktButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  "aria-label"?: string;
  target?: string;
  rel?: string;
};

export function MktButton({
  variant = "default",
  size = "default",
  href,
  type,
  disabled,
  onClick,
  className,
  style,
  children,
  target,
  rel,
  "aria-label": ariaLabel,
}: MktButtonProps) {
  const [hover, setHover] = useState(false);
  const composed: CSSProperties = {
    ...base,
    ...sizes[size],
    ...variants[variant],
    ...(disabled ? { opacity: 0.5, pointerEvents: "none" } : {}),
    ...(!disabled && hover ? hoverFor(variant) : {}),
    ...style,
  };
  const handlers = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
  };
  if (href != null) {
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        aria-label={ariaLabel}
        className={className}
        style={composed}
        onClick={onClick}
        {...handlers}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type={type ?? "button"}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
      style={composed}
      onClick={onClick}
      {...handlers}
    >
      {children}
    </button>
  );
}

/* ------------------------------ Badge ----------------------------------- */

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "accent"
  | "gold"
  | "success"
  | "destructive";

const badgeVariants: Record<BadgeVariant, CSSProperties> = {
  default: {
    background: "var(--primary)",
    color: "var(--primary-foreground)",
    border: "1px solid transparent",
    boxShadow: "var(--shadow-xs)",
  },
  secondary: {
    background: "var(--secondary)",
    color: "var(--secondary-foreground)",
    border: "1px solid transparent",
  },
  outline: {
    background: "transparent",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
  },
  accent: {
    background: "oklch(0.40 0.25 268 / 0.12)",
    color: "var(--accent)",
    border: "1px solid oklch(0.40 0.25 268 / 0.25)",
  },
  gold: {
    background: "oklch(0.78 0.18 85 / 0.16)",
    color: "var(--gold-600)",
    border: "1px solid oklch(0.78 0.18 85 / 0.35)",
  },
  success: {
    background: "oklch(0.62 0.15 155 / 0.12)",
    color: "var(--success)",
    border: "1px solid oklch(0.62 0.15 155 / 0.3)",
  },
  destructive: {
    background: "var(--destructive)",
    color: "var(--destructive-foreground)",
    border: "1px solid transparent",
  },
};

export function MktBadge({
  variant = "default",
  style,
  children,
}: {
  variant?: BadgeVariant;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        borderRadius: "var(--radius-md)",
        padding: "0.125rem 0.625rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...badgeVariants[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ----------------------------- Eyebrow ---------------------------------- */

type EyebrowTone = "accent" | "gold" | "muted" | "white";
const tones: Record<EyebrowTone, string> = {
  accent: "var(--accent)",
  gold: "var(--gold-600)",
  muted: "var(--muted-foreground)",
  white: "oklch(1 0 0 / 0.85)",
};

export function Eyebrow({
  tone = "accent",
  style,
  children,
}: {
  tone?: EyebrowTone;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: "0.75rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "var(--tracking-widest)",
        color: tones[tone] ?? tones.accent,
        ...style,
      }}
    >
      {children}
    </p>
  );
}
