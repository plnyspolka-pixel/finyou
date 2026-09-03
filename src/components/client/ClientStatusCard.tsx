// Karta „Status wniosku" na pulpicie klienta — aktualny status w języku
// klienta, oś czterech etapów procesu i historia zmian. Jedyne źródło
// etykiet: clientLoanStatusView (src/lib/loan-status.ts), więc klient widzi
// w panelu to samo, co usłyszy od bota.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronDown, ChevronUp, CircleDot, Circle } from "lucide-react";
import { CLIENT_STAGES } from "@/lib/loan-status";
import { getMyLoanProgress } from "@/lib/my-loan.functions";
import { cn } from "@/lib/utils";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

export function ClientStatusCard() {
  const fetchProgress = useServerFn(getMyLoanProgress);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["my-loan-status"],
    queryFn: () => fetchProgress(),
    staleTime: 60_000,
  });

  const status = data?.status_info;
  if (!status) return null;

  const { info, changed_at, history } = status;
  const changedLabel = formatDate(changed_at);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Status wniosku
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xl font-bold">{info.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
          {changedLabel && (
            <p className="mt-1 text-xs text-muted-foreground">Ostatnia zmiana: {changedLabel}</p>
          )}
        </div>

        {/* Oś czterech etapów procesu */}
        <ol className="grid grid-cols-4 gap-1 sm:gap-2">
          {CLIENT_STAGES.map((stage, i) => {
            const done = i < info.stage_index || (info.is_closed && i <= info.stage_index);
            const current = !info.is_closed && i === info.stage_index;
            return (
              <li key={stage.key} className="flex flex-col items-center gap-1.5 text-center">
                <div
                  className={cn(
                    "h-1.5 w-full rounded-full",
                    done ? "bg-primary" : current ? "bg-primary/60" : "bg-muted",
                  )}
                />
                <span
                  className={cn(
                    "flex items-center gap-1 text-[11px] leading-tight sm:text-xs",
                    done || current ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : current ? (
                    <CircleDot className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ol>

        {history.length > 1 && (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => setHistoryOpen((v) => !v)}
            >
              {historyOpen ? (
                <ChevronUp className="mr-1 h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="mr-1 h-3.5 w-3.5" />
              )}
              Historia zmian ({history.length})
            </Button>
            {historyOpen && (
              <ul className="mt-2 space-y-1.5 border-l pl-3">
                {history.map((h, i) => (
                  <li key={`${h.changed_at}-${i}`} className="text-xs">
                    <span className={cn(i === 0 ? "font-medium" : "text-muted-foreground")}>
                      {h.label}
                    </span>
                    <span className="ml-2 text-muted-foreground">{formatDate(h.changed_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
