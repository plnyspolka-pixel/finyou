// Znacznik „✓” na stronie marketingowej (listy korzyści, cennik, program
// szkolenia): grafika 3D z projektu właściciela (04.11.2026) —
// public/marketing/check-3d.webp (160 px, przezroczyste tło) zamiast
// rysowanego SVG z BrandIcon. Jeden komponent, żeby każda lista wyglądała tak samo.
import type { CSSProperties } from "react";

export const CHECK_ICON_SRC = "/marketing/check-3d.webp";

export function CheckIcon({
  size = 20,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <img
      src={CHECK_ICON_SRC}
      alt=""
      aria-hidden
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-block",
        verticalAlign: "middle",
        filter: "drop-shadow(0 3px 5px rgba(5,10,30,.35))",
        ...style,
      }}
    />
  );
}
