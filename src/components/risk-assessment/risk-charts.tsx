// Wykresy do analizy ryzyka (recharts). Forma dobrana do zadania danych:
//  - ocena inwestycji 0–100  → miernik radialny (jeden nagłówek),
//  - oceny cząstkowe 0–100    → poziome słupki (magnituda w kategoriach),
//  - wycena i wymuszona sprzedaż → „drabina wartości" vs kwota pożyczki.
// Kolor NA KOŃCU: pasma statusu z etykietami liczbowymi (nigdy sam kolor) dla ocen,
// jeden odcień wartości + czerwona linia odniesienia dla kwoty pożyczki.
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ReferenceLine,
} from "recharts";
import type { RiskComponentScores } from "@/lib/risk-assessment/types";

// --- Paleta statusu (zarezerwowana; zawsze z etykietą wartości obok) ---
const AXIS = "hsl(var(--muted-foreground))";
const GRID = "hsl(var(--border))";
const VALUE_HUE = "#6366f1"; // indygo — jednolity odcień dla wartości PLN
const LOAN_HUE = "#ef4444"; // czerwony — linia odniesienia kwoty pożyczki

export function scoreColor(v: number): string {
  if (v >= 85) return "#059669"; // A
  if (v >= 70) return "#10b981"; // B
  if (v >= 55) return "#f59e0b"; // C
  if (v >= 40) return "#f97316"; // D
  return "#ef4444"; // E
}

function fmtPlnCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} mln zł`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1000)} tys zł`;
  return `${Math.round(v)} zł`;
}

// ---------- Miernik oceny inwestycji ----------
export function InvestmentScoreGauge({ score, grade }: { score: number; grade: string }) {
  const color = scoreColor(score);
  const data = [{ name: "score", value: Math.max(0, Math.min(100, score)) }];
  return (
    <div className="relative" style={{ width: 150, height: 150 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            background={{ fill: GRID }}
            dataKey="value"
            cornerRadius={12}
            fill={color}
            angleAxisId={0}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold leading-none" style={{ color }}>
          {grade}
        </span>
        <span className="text-lg font-semibold leading-tight">
          {score}
          <span className="text-xs text-muted-foreground">/100</span>
        </span>
        <span className="text-[10px] text-muted-foreground">ocena inwestycji</span>
      </div>
    </div>
  );
}

// ---------- Oceny cząstkowe (poziome słupki) ----------
const COMPONENT_LABELS: Record<keyof RiskComponentScores, string> = {
  collateral: "Zabezpieczenie",
  valuationConfidence: "Pewność wyceny",
  legal: "Stan prawny (KW)",
  borrowerLongevity: "Ryzyko dożycia",
  correspondence: "Korespondencja",
  documentCompleteness: "Dokumenty (OCR)",
  exitLiquidity: "Łatwość sprzedaży",
};

export function ComponentScoresChart({ scores }: { scores: RiskComponentScores }) {
  const data = (Object.keys(COMPONENT_LABELS) as Array<keyof RiskComponentScores>).map((k) => ({
    key: k,
    name: COMPONENT_LABELS[k],
    value: Math.round(scores[k] ?? 0),
  }));
  const height = data.length * 34 + 16;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 44, bottom: 4, left: 8 }}
        barCategoryGap={8}
      >
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="name"
          width={128}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: AXIS }}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: `1px solid ${GRID}`,
            borderRadius: 8,
            fontSize: 12,
            color: "hsl(var(--popover-foreground))",
          }}
          formatter={(v: any) => [`${v}/100`, "Ocena"]}
        />
        <Bar
          dataKey="value"
          radius={[4, 4, 4, 4]}
          isAnimationActive={false}
          background={{ fill: GRID, radius: 4 } as any}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={scoreColor(d.value)} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            style={{ fontSize: 12, fontWeight: 600, fill: "hsl(var(--foreground))" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------- Wycena i wymuszona sprzedaż (drabina wartości) ----------
export interface ValuationChartInput {
  marketMidPln: number | null;
  firstAuctionPln: number | null;
  secondAuctionPln: number | null;
  expectedLowPln: number | null;
  loanAmountPln: number | null;
}

export function ValuationLadderChart({ input }: { input: ValuationChartInput }) {
  const rows = [
    { name: "Wartość rynkowa", value: input.marketMidPln },
    { name: "I licytacja (¾)", value: input.firstAuctionPln },
    { name: "II licytacja (⅔)", value: input.secondAuctionPln },
    { name: "Odzysk (dolny)", value: input.expectedLowPln },
  ].filter((r) => r.value != null && Number.isFinite(r.value)) as Array<{
    name: string;
    value: number;
  }>;

  if (rows.length === 0) return null;
  const loan = input.loanAmountPln;
  const height = rows.length * 36 + 28;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 84, bottom: 4, left: 8 }}
        barCategoryGap={10}
      >
        <XAxis type="number" domain={[0, "dataMax"]} hide />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: AXIS }}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: `1px solid ${GRID}`,
            borderRadius: 8,
            fontSize: 12,
            color: "hsl(var(--popover-foreground))",
          }}
          formatter={(v: any) => [fmtPlnCompact(Number(v)), "Kwota"]}
        />
        {loan != null && Number.isFinite(loan) && (
          <ReferenceLine
            x={loan}
            stroke={LOAN_HUE}
            strokeWidth={2}
            strokeDasharray="4 3"
            label={{
              value: `pożyczka ${fmtPlnCompact(loan)}`,
              position: "top",
              fill: LOAN_HUE,
              fontSize: 11,
            }}
          />
        )}
        <Bar dataKey="value" radius={[4, 4, 4, 4]} fill={VALUE_HUE} isAnimationActive={false}>
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: any) => fmtPlnCompact(Number(v))}
            style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
