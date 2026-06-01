import { createFileRoute } from "@tanstack/react-router";
import { LoanCalculator } from "@/components/loan-calculator";

export const Route = createFileRoute("/inwestor/kalkulator")({
  component: Kalkulator,
});

function Kalkulator() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Kalkulator pożyczki</h1>
        <p className="text-sm text-muted-foreground">Ustaw parametry — od razu zobaczysz harmonogram, koszty i zgodność z limitami ustawowymi.</p>
      </div>
      <LoanCalculator />
    </div>
  );
}
