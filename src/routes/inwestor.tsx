import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyInvestorFlags } from "@/lib/investor-agreements/legal-pack.functions";
import { ConsentGate } from "@/components/consent/consent-gate";
import { PanelShell } from "@/components/layout/panel-shell";
import { InvestorAssistantWidget } from "@/components/inwestor/assistant-widget";
import { investorNavGroups } from "@/components/inwestor/investor-nav";
import { InvestorSubscriptionGate } from "@/components/inwestor/subscription-gate";

export const Route = createFileRoute("/inwestor")({
  component: InwestorLayout,
});

// Pozycje menu i reguła chowania „Złóż zlecenie" po złożeniu Zlecenia:
// src/components/inwestor/investor-nav.ts (czysta funkcja od flag konta).
function InwestorLayout() {
  const fetchFlags = useServerFn(getMyInvestorFlags);
  const { data: flags } = useQuery({
    queryKey: ["investor-flags"],
    queryFn: () => fetchFlags(),
    staleTime: 10 * 60_000,
  });
  const groups = investorNavGroups(flags);
  return (
    <>
      <PanelShell
        title="Panel inwestora"
        allow={["inwestor", "administrator"]}
        groups={groups}
        wrapOutlet={(outlet) => (
          <ConsentGate audience="inwestor">
            <InvestorSubscriptionGate>{outlet}</InvestorSubscriptionGate>
          </ConsentGate>
        )}
      />
      <InvestorAssistantWidget />
    </>
  );
}
