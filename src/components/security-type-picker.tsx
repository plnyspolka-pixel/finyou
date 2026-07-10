import { useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SecurityType } from "@/lib/loan-math";
import { securityTypeLabels } from "@/lib/loan-math";
import apartmentAsset from "@/assets/property-icons/apartment.png.asset.json";
import houseAsset from "@/assets/property-icons/house.png.asset.json";
import shopAsset from "@/assets/property-icons/shop.png.asset.json";
import pinAsset from "@/assets/property-icons/pin.png.asset.json";
import landAsset from "@/assets/property-icons/land.png.asset.json";
import otherAsset from "@/assets/property-icons/other.png.asset.json";

type TileDef = {
  type: SecurityType;
  img: string;
  alt: string;
};

const tiles: TileDef[] = [
  { type: "mieszkanie", img: apartmentAsset.url, alt: "Mieszkanie" },
  { type: "dom", img: houseAsset.url, alt: "Dom" },
  { type: "grunt_rolny", img: landAsset.url, alt: "Grunt rolny" },
  { type: "dzialka_budowlana", img: pinAsset.url, alt: "Działka budowlana" },
  { type: "lokal_uslugowy", img: shopAsset.url, alt: "Lokal usługowy" },
  { type: "inna", img: otherAsset.url, alt: "Inna nieruchomość" },
];

function TileIcon({ tile, className }: { tile: TileDef; className?: string }) {
  if (tile.img) {
    return <img src={tile.img} alt={tile.alt ?? ""} className={cn("object-contain", className)} loading="lazy" />;
  }
  const Fallback = tile.fallback!;
  return <Fallback className={cn(className)} />;
}

export function SecurityTypePicker({
  value,
  onChange,
}: {
  value: SecurityType | null;
  onChange: (t: SecurityType) => void;
}) {
  const [expanded, setExpanded] = useState(value === null);
  const selected = value ? tiles.find((t) => t.type === value) : null;

  if (!expanded && selected) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-3 rounded-lg border-2 border-primary bg-primary/10 p-3 text-left transition hover:bg-primary/15"
      >
        <TileIcon tile={selected} className="h-10 w-10 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Zabezpieczenie
          </div>
          <div className="truncate text-sm font-semibold text-foreground">
            {securityTypeLabels[selected.type]}
          </div>
        </div>
        <span className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground">
          <Pencil className="h-3.5 w-3.5" /> Zmień
        </span>
      </button>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {tiles.map((tile) => {
        const active = value === tile.type;
        return (
          <button
            key={tile.type}
            type="button"
            onClick={() => {
              onChange(tile.type);
              setExpanded(false);
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center touch-manipulation select-none transition",
              active
                ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                : "border-border hover:border-primary/60",
            )}
          >
            <TileIcon
              tile={tile}
              className={cn(
                "h-16 w-16",
                !tile.img && (active ? "text-primary" : "text-muted-foreground"),
              )}
            />
            <span className="text-sm font-medium">{securityTypeLabels[tile.type]}</span>
          </button>
        );
      })}
    </div>
  );
}
