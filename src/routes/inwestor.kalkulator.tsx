import { createFileRoute } from "@tanstack/react-router";
import { LoanCalculator } from "@/components/loan-calculator";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";

export const Route = createFileRoute("/inwestor/kalkulator")({
  component: Kalkulator,
});

function Kalkulator() {
  return (
    <div className="space-y-6 max-w-5xl">
      <FancyPageHeader
        eyebrow="Narzędzia inwestora"
        title="Kalkulator pożyczki"
        subtitle="Ustaw parametry — od razu zobaczysz harmonogram, koszty oraz ostrzeżenia o limitach odsetek, MPKK i krotności spłaty."
      />
      <LoanCalculator investorGuidance />
    </div>
  );
}
