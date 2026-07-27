import { useState } from "react";
import {
  Building2,
  Home,
  Trees,
  Map,
  Store,
  FileQuestion,
  Pencil,
  type LucideIcon,
} from "lucide-react";
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
  const [expanded, setExpanded] = useState(value === null);
  const selected = value ? tiles.find((t) => t.type === value) : null;

  if (!expanded && selected) {
    const Icon = selected.icon;
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-3 rounded-lg border-2 border-primary bg-primary/10 p-3 text-left transition hover:bg-primary/15"
      >
        <Icon className="h-7 w-7 shrink-0 text-primary" />
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
      {tiles.map(({ type, icon: Icon }) => {
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => {
              onChange(type);
              setExpanded(false);
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center touch-manipulation select-none",
              active
                ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                : "border-border hover:border-primary/60",
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
