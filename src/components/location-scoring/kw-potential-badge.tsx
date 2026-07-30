// Zwięzła plakietka „potencjał lokalizacyjny" — do pokazania WSZĘDZIE, gdzie w
// systemie widać numer KW (widoki wewnętrzne administrator/operator; spec §18 —
// nie dla inwestora/klienta). Dwa tryby:
//   * dane wprost (score/priority/confidence) — bez zapytania (dla list, które
//     już mają kolumny location_* na wniosku),
//   * po applicationId lub kwNumber — pobranie przez server fn (react-query,
//     cache; tolerancyjne — brak danych/uprawnień = nic nie renderuje).
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { MapPin, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { getLocationPotentialBadge } from "@/lib/location-scoring.functions";
import { parseKwNumber } from "@/lib/location-scoring";

const PRIORITY_LABEL: Record<string, string> = {
  AUTO_ANALYZE_HIGH: "wysoki priorytet",
  AUTO_ANALYZE_STANDARD: "standard",
  LIGHT_LOCATION_CHECK: "lekka weryfikacja",
  LOW_PRIORITY: "niski priorytet",
  INVALID_KW: "błąd KW",
  INSUFFICIENT_DATA: "brak danych",
};

function scoreClass(v: number): string {
  if (v >= 75) return "border-emerald-400 text-emerald-700";
  if (v >= 60) return "border-lime-400 text-lime-700";
  if (v >= 40) return "border-amber-300 text-amber-700";
  return "border-muted-foreground/30 text-muted-foreground";
}

type Props = {
  applicationId?: string | null;
  kwNumber?: string | null;
  propertyType?: string | null;
  // Tryb „dane wprost" — pomija zapytanie, gdy podano score.
  score?: number | null;
  priority?: string | null;
  confidence?: number | null;
  className?: string;
};

export function KwPotentialBadge({
  applicationId,
  kwNumber,
  propertyType,
  score,
  priority,
  confidence,
  className,
}: Props) {
  const fetchBadge = useServerFn(getLocationPotentialBadge);

  // Klucz cache: wniosek (najdokładniej) albo prefiks KW (orientacyjnie).
  const prefix = kwNumber ? parseKwNumber(kwNumber).prefix : "";
  const hasDirect = typeof score === "number";
  const canFetch = !hasDirect && Boolean(applicationId || prefix);

  const { data } = useQuery({
    queryKey: ["kw-potential-badge", applicationId ?? "", prefix, propertyType ?? ""],
    enabled: canFetch,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const r = await fetchBadge({
          data: {
            applicationId: applicationId ?? null,
            kwNumber: kwNumber ?? null,
            propertyType: propertyType ?? null,
          },
        });
        return r.badge;
      } catch {
        return null;
      }
    },
  });

  const resolved = hasDirect
    ? {
        score: score as number,
        confidence: confidence ?? null,
        priority: priority ?? null,
        lowConfidence: confidence != null && confidence < 50,
        scope: "application" as const,
      }
    : data;

  if (!resolved || resolved.score == null) return null;

  const s = resolved.score;
  const prio = resolved.priority ? (PRIORITY_LABEL[resolved.priority] ?? resolved.priority) : null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`gap-1 px-1.5 py-0 h-5 font-medium tabular-nums ${scoreClass(s)} ${className ?? ""}`}
          >
            <MapPin className="h-3 w-3 shrink-0" />
            {s}
            {resolved.lowConfidence && (
              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          <div className="font-medium">Potencjał lokalizacyjny: {s}/100</div>
          {resolved.confidence != null && <div>Pewność: {resolved.confidence}%</div>}
          {prio && <div>Priorytet analizy: {prio}</div>}
          {resolved.scope === "prefix" && (
            <div className="text-muted-foreground">orientacyjny dla wydziału KW</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
