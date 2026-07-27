import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatPLN } from "@/lib/labels";
import { getPropertyAnalysis } from "@/lib/property-analysis/property-collateral-analysis.functions";
import type { PropertyAnalysisResult } from "@/lib/property-analysis/types";

export function InvestorSummaryCard({ applicationId }: { applicationId: string }) {
  const fetchAnalysis = useServerFn(getPropertyAnalysis);
  const [row, setRow] = useState<any | null>(null);

  useEffect(() => {
    void fetchAnalysis({ data: { applicationId } })
      .then(setRow)
      .catch(() => setRow(null));
  }, [applicationId]);

  const result = row?.result_json as PropertyAnalysisResult | undefined;
  if (!result) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Analiza zabezpieczenia</span>
          <Badge
            variant={
              result.collateralScore.total >= 70
                ? "default"
                : result.collateralScore.total >= 55
                  ? "secondary"
                  : "destructive"
            }
          >
            {result.collateralScore.total}/100
          </Badge>
        </CardTitle>
        <CardDescription>{result.investmentOfferText.investorShortSummary}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="text-muted-foreground text-xs">Zakres wartości (konserwatywnie)</div>
            <div className="font-medium">
              {formatPLN(result.valuationBenchmark.conservativeLowPln)} –{" "}
              {formatPLN(result.valuationBenchmark.conservativeHighPln)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">LTV</div>
            <div className="font-medium">{result.ltv.ltvPercent ?? "—"}%</div>
          </div>
        </div>

        {result.collateralScore.mainStrengths.length > 0 && (
          <div>
            <div className="text-muted-foreground text-xs mb-1">Mocne strony</div>
            <ul className="list-disc pl-5 space-y-0.5">
              {result.collateralScore.mainStrengths.slice(0, 3).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {result.collateralScore.mainRisks.length > 0 && (
          <div>
            <div className="text-muted-foreground text-xs mb-1">Ryzyka</div>
            <ul className="list-disc pl-5 space-y-0.5">
              {result.collateralScore.mainRisks.slice(0, 3).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {result.floodRisk &&
          result.floodRisk.riskLevel !== "none" &&
          result.floodRisk.riskLevel !== "unknown" && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">Ryzyko powodziowe</div>
              <div className="font-medium">
                {
                  (
                    {
                      low: "Niskie (scenariusz 0,2%)",
                      medium: "Średnie (scenariusz 1%)",
                      high: "Wysokie (scenariusz 10%)",
                      very_high: "Bardzo wysokie — obszar szczególnego zagrożenia",
                    } as Record<string, string>
                  )[result.floodRisk.riskLevel]
                }
              </div>
              {result.investmentOfferText.floodRiskSummary && (
                <div className="text-xs text-muted-foreground mt-1">
                  {result.investmentOfferText.floodRiskSummary}
                </div>
              )}
            </div>
          )}

        <Separator />
        <div className="text-xs text-muted-foreground">
          Źródła:{" "}
          {result.dataSourcesUsed
            .filter((s) => s.used)
            .map((s) => s.source)
            .join(", ") || "—"}
        </div>
      </CardContent>
    </Card>
  );
}
