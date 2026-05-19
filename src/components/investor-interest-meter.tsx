import { Progress } from "@/components/ui/progress";

export function InvestorInterestMeter({ score }: { score: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Orientacyjny wskaźnik zainteresowania inwestora</span>
        <span className="text-2xl font-bold tabular-nums">{score}/100</span>
      </div>
      <Progress value={score} />
    </div>
  );
}
