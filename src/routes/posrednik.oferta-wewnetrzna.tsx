import { createFileRoute } from "@tanstack/react-router";
import { LoanCalculator } from "@/components/loan-calculator";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";

export const Route = createFileRoute("/posrednik/oferta-wewnetrzna")({
  component: OfertaWewnetrzna,
});

export function OfertaWewnetrzna() {
  return (
    <div className="space-y-6 max-w-5xl">
      <FancyPageHeader
        eyebrow="Kalkulator wewnętrzny"
        title="Oferta wewnętrzna"
        subtitle="Kalkulator inwestora bez prowizji Finance You. Ustaw prowizję operatora (2–5%) — zostanie odjęta z prowizji inwestora jako Twój udział."
      />
      <LoanCalculator investorGuidance hideFinanceYouFee internalOperatorMode />
    </div>
  );
}
