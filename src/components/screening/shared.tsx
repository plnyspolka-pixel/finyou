// Wspólne elementy UI panelu screeningu.
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CASE_TYPE_LABELS, PEP_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/screening/types";

export function fmtDate(t: string | null | undefined, withTime = true): string {
  if (!t) return "—";
  const d = new Date(t);
  return withTime ? d.toLocaleString("pl-PL") : d.toLocaleDateString("pl-PL");
}

export function ageDays(t: string): number {
  return Math.floor((Date.now() - new Date(t).getTime()) / 86400_000);
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge
      className={cn(
        priority === "critical" && "bg-red-600 text-white hover:bg-red-600",
        priority === "high" && "bg-amber-500 text-white hover:bg-amber-500",
        priority === "normal" && "bg-slate-200 text-slate-800 hover:bg-slate-200",
      )}
    >
      {PRIORITY_LABELS[priority] ?? priority}
    </Badge>
  );
}

export function CaseTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className={cn(type === "sanctions" && "border-red-400 text-red-700")}>
      {CASE_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}

export function PepStatusBadge({ status }: { status: string }) {
  const danger = ["pep", "family_member", "close_associate"].includes(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        danger && "border-amber-500 text-amber-700",
        status === "none" && "text-emerald-700",
      )}
    >
      PEP: {PEP_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function SanctionsStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "hit" && "border-red-500 bg-red-50 text-red-700",
        status === "none" && "text-emerald-700",
      )}
    >
      Sankcje: {status === "hit" ? "TRAFIENIE" : status === "none" ? "brak" : "nie sprawdzono"}
    </Badge>
  );
}

export function ScoreBar({
  score,
  possible = 70,
  strong = 90,
}: {
  score: number;
  possible?: number;
  strong?: number;
}) {
  const color =
    score >= strong ? "bg-red-600" : score >= possible ? "bg-amber-500" : "bg-slate-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded bg-muted" aria-hidden>
        <div
          className={cn("h-full", color)}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
      <span className="font-mono text-sm tabular-nums">{score}</span>
    </div>
  );
}

export const SOURCE_NAMES: Record<string, string> = {
  sejm_api: "API Sejmu",
  wikidata: "Wikidata",
  senat: "Senat",
  kprm: "KPRM",
  krs: "KRS",
  eu_fsf: "Lista UE",
  un_sc: "Lista ONZ",
  mswia: "Lista MSWiA",
  ofac_sdn: "OFAC SDN",
};
