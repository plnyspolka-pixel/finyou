import { FileQuestion } from "lucide-react";
import apartmentAsset from "@/assets/property-icons/apartment.png.asset.json";
import houseAsset from "@/assets/property-icons/house.png.asset.json";
import shopAsset from "@/assets/property-icons/shop.png.asset.json";
import pinAsset from "@/assets/property-icons/pin.png.asset.json";
import landAsset from "@/assets/property-icons/land.png.asset.json";
import otherAsset from "@/assets/property-icons/other.png.asset.json";

export type PropertyTypeKey =
  | "mieszkanie"
  | "dom"
  | "grunt_rolny"
  | "dzialka_budowlana"
  | "lokal_uslugowy"
  | "apartment"
  | "house"
  | "plot_building"
  | "commercial"
  | "inna"
  | (string & {});

const MAP: Record<string, { label: string; img?: string }> = {
  mieszkanie: { label: "Mieszkanie", img: apartmentAsset.url },
  apartment: { label: "Mieszkanie", img: apartmentAsset.url },
  dom: { label: "Dom", img: houseAsset.url },
  house: { label: "Dom", img: houseAsset.url },
  grunt_rolny: { label: "Grunt rolny", img: landAsset.url },
  dzialka_budowlana: { label: "Działka budowlana", img: pinAsset.url },
  plot_building: { label: "Działka budowlana", img: pinAsset.url },
  lokal_uslugowy: { label: "Lokal usługowy", img: shopAsset.url },
  commercial: { label: "Lokal usługowy", img: shopAsset.url },
  inna: { label: "Inna nieruchomość", img: otherAsset.url },
};

export function getPropertyVisual(type?: string | null) {
  if (!type) return { label: "Nieruchomość", img: undefined as string | undefined };
  return MAP[type] ?? { label: type, img: undefined };
}

export function PropertyTypeIcon({
  type,
  className = "h-10 w-10 object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.35)]",
}: {
  type?: string | null;
  className?: string;
}) {
  const v = getPropertyVisual(type);
  if (v.img) return <img src={v.img} alt={v.label} loading="lazy" className={className} />;
  return <FileQuestion className={className} />;
}

export function PropertyTypeBadge({
  type,
  size = "sm",
}: {
  type?: string | null;
  size?: "xs" | "sm" | "md";
}) {
  const v = getPropertyVisual(type);
  const dims = size === "xs" ? "h-5 w-5" : size === "md" ? "h-8 w-8" : "h-6 w-6";
  const text = size === "xs" ? "text-[10px]" : size === "md" ? "text-sm" : "text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2 py-0.5 font-semibold text-foreground ${text}`}
      title={v.label}
    >
      <PropertyTypeIcon type={type} className={`${dims} object-contain`} />
      <span className="truncate">{v.label}</span>
    </span>
  );
}

/**
 * Anonimizuje numer księgi wieczystej — pozostawia kod wydziału i cyfrę kontrolną,
 * ukrywa środkową część numeru. Np. "WA1P/00035902/4" -> "WA1P/•••••••/4".
 */
export function anonymizeKw(kw?: string | null): string {
  if (!kw) return "—";
  const first = kw.split(/[,|;]/)[0]!.trim();
  const m = first.match(/^([A-Z0-9]{2,5})\/(\d+)\/(\d)/i);
  if (!m) return first.length > 6 ? `${first.slice(0, 4)}/•••••/${first.slice(-1)}` : first;
  return `${m[1]!.toUpperCase()}/•••••••/${m[3]}`;
}
