import { createFileRoute } from "@tanstack/react-router";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { UmowaAgentPanel } from "@/components/inwestor/umowa-agent-panel";
import { StoreDpaGate } from "@/components/storefront/StoreDpaGate";

/** Osobny kreator umowy pożyczki. Wzory pism i e-podpis mają własny moduł. */
export const Route = createFileRoute("/inwestor/dokumenty")({
  component: LoanAgreementCreator,
});

function LoanAgreementCreator() {
  return (
    <div className="space-y-5">
      <FancyPageHeader
        eyebrow="Panel inwestora"
        title="Kreator umowy pożyczki"
        subtitle="Agent pomaga przygotować umowę pożyczki z danych transakcji. Pozostałe pisma i ich e-podpis obsługuje osobny generator dokumentów."
      />
      <div className="rounded-lg border p-3 text-sm">
        <a href="/inwestor/kreator-dokumentow" className="font-semibold underline">
          Przejdź do generatora dokumentów i e-podpisu
        </a>
      </div>
      <StoreDpaGate>
        <section id="kreator-umowy"><UmowaAgentPanel /></section>
      </StoreDpaGate>
    </div>
  );
}
