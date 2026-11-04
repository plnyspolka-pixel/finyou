// Grafika modułu z opcjonalną pieczątką (np. „E-PODPIS GRATIS” na Kancelarii AI).
// Pieczątka siedzi w prawym górnym rogu, lekko przekrzywiona, i wystaje poza
// grafikę (ok. 40 % na grafice, 60 % na tle) — dlatego wrapper nie przycina
// zawartości, a karta nadrzędna też nie może mieć overflow:hidden.
import type { CSSProperties, ReactNode } from "react";

export type ModuleStamp = { src: string; alt: string };

export function StampOverlay({ stamp, size = "34%" }: { stamp: ModuleStamp; size?: string }) {
  return (
    <img
      src={stamp.src}
      alt={stamp.alt}
      loading="lazy"
      draggable={false}
      className="fy-module-stamp"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: size,
        height: "auto",
        transform: "translate(34%, -42%) rotate(-12deg)",
        filter: "drop-shadow(0 6px 14px rgba(0,0,0,.35))",
        pointerEvents: "none",
        zIndex: 2,
      }}
    />
  );
}

/**
 * `children` = właściwy <img> (albo slajdy). Wrapper jest `position: relative`
 * i nie przycina pieczątki.
 */
export function StampedFrame({
  stamp,
  children,
  style,
  className,
}: {
  stamp?: ModuleStamp;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={className} style={{ position: "relative", ...style }}>
      {children}
      {stamp && <StampOverlay stamp={stamp} />}
    </div>
  );
}
