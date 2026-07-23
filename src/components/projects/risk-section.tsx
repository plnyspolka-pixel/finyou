// Sekcja „Analiza ryzyka" pełnej karty projektu: wynik zbiorczy, obszary,
// czerwone flagi i „Czego jeszcze nie wiemy". Wynik ma charakter pomocniczy.
import { AlertTriangle, HelpCircle, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RISK_LEVEL_LABELS, type RiskAnalysis } from "@/lib/projects/module-types";

const LEVEL_STYLES: Record<string, string> = {
  niski: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  umiarkowany: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  podwyzszony: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  wysoki: "bg-destructive/15 text-destructive",
};

export function RiskSection({ risk }: { risk: RiskAnalysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" /> Analiza ryzyka
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Wynik zbiorczy */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-primary/30">
            <div className="text-center">
              <div className="text-xl font-bold leading-none">{risk.score}</div>
              <div className="text-[10px] text-muted-foreground">/100</div>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${LEVEL_STYLES[risk.level] ?? ""}`}
            >
              Ryzyko: {RISK_LEVEL_LABELS[risk.level]}
            </span>
            <p className="text-sm text-muted-foreground">{risk.summary}</p>
          </div>
        </div>

        {/* Obszary analizy */}
        <div className="space-y-3">
          {risk.factors.map((f) => (
            <div key={f.area} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{f.label}</span>
                <span className="text-muted-foreground">{f.score}/100</span>
              </div>
              <Progress value={f.score} className="h-2" />
              <p className="text-xs text-muted-foreground">{f.comment}</p>
            </div>
          ))}
        </div>

        {/* Czerwone flagi */}
        {risk.redFlags.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" /> Ryzyka krytyczne
            </div>
            {risk.redFlags.map((flag) => (
              <div
                key={flag.code}
                className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
              >
                <div className="font-medium">{flag.label}</div>
                <div className="text-xs text-muted-foreground">{flag.explanation}</div>
              </div>
            ))}
          </div>
        )}

        {/* Czego jeszcze nie wiemy */}
        {risk.missingInformation.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <HelpCircle className="h-4 w-4" /> Czego jeszcze nie wiemy
            </div>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {risk.missingInformation.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <Badge variant="outline" className="whitespace-normal text-xs font-normal">
          {risk.disclaimer}
        </Badge>
      </CardContent>
    </Card>
  );
}
