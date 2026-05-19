import { Building2, Home, Trees, Map, Store, FileQuestion, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SecurityType } from "@/lib/loan-math";
import { securityTypeLabels } from "@/lib/loan-math";

const tiles: { type: SecurityType; icon: LucideIcon }[] = [
  { type: "mieszkanie", icon: Building2 },
  { type: "dom", icon: Home },
  { type: "grunt_rolny", icon: Trees },
  { type: "dzialka_budowlana", icon: Map },
  { type: "lokal_uslugowy", icon: Store },
  { type: "inna", icon: FileQuestion },
];

export function SecurityTypePicker({
  value,
  onChange,
}: {
  value: SecurityType | null;
  onChange: (t: SecurityType) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {tiles.map(({ type, icon: Icon }) => {
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-all hover:border-primary/60 hover:bg-accent",
              active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border",
            )}
          >
            <Icon className={cn("h-8 w-8", active ? "text-primary" : "text-muted-foreground")} />
            <span className="text-sm font-medium">{securityTypeLabels[type]}</span>
          </button>
        );
      })}
    </div>
  );
}
