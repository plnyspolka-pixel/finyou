import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LoanCalculator, type LoanCalculatorState } from "@/components/loan-calculator";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { DyrektorFinansowyChat } from "@/components/inwestor/dyrektor-finansowy-chat";

export const Route = createFileRoute("/inwestor/kalkulator")({
  component: DyrektorFinansowy,
});

function DyrektorFinansowy() {
  const [calc, setCalc] = useState<LoanCalculatorState | null>(null);

  return (
    <div className="space-y-6 max-w-5xl">
      <FancyPageHeader
        eyebrow="Narzędzia inwestora"
        title="Dyrektor finansowy"
        subtitle="Ustaw parametry w kalkulatorze i od razu przegadaj je z asystentem AI. Dyrektor finansowy widzi Twoje ustawienia kalkulatora oraz ma dostęp do Twoich danych, ofert, pełnych danych klientów po akceptacji i wzorów dokumentów."
      />

      <LoanCalculator investorGuidance onChange={setCalc} />

      <DyrektorFinansowyChat calculatorState={calc} />
    </div>
  );
}
