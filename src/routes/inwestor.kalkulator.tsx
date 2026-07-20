import { createFileRoute } from "@tanstack/react-router";
import { LoanCalculator } from "@/components/loan-calculator";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { useAccessState } from "@/hooks/use-access";

export const Route = createFileRoute("/inwestor/kalkulator")({
  component: Kalkulator,
});

function Kalkulator() {
  // Konto darmowe: ten sam kalkulator w trybie freeTierMode (oprocentowanie
  // stałe = odsetki maksymalne z NBP, prowizja inwestora 0, prowizja FY 2×).
  const { loading, hasFullAccess } = useAccessState("investor");
  const freeTier = !loading && !hasFullAccess;
  return (
    <div className="space-y-6 max-w-5xl">
      <FancyPageHeader
        eyebrow="Narzędzia inwestora"
        title="Kalkulator pożyczki"
        subtitle={
          freeTier
            ? "Konto darmowe: oprocentowanie stałe w maksymalnej ustawowej wysokości (wg NBP), bez prowizji inwestora, prowizja Finance You 2× wyższa niż w planie pełnym."
            : "Ustaw parametry — od razu zobaczysz harmonogram, koszty oraz ostrzeżenia o limitach odsetek, MPKK i krotności spłaty."
        }
      />
      {!loading && <LoanCalculator investorGuidance freeTierMode={freeTier} />}
    </div>
  );
}
