import { createFileRoute } from "@tanstack/react-router";
import { InvestorOrderPipeline } from "@/components/inwestor/order-pipeline";

// Pipeline zlecenia inwestora — treść w src/components/inwestor/order-pipeline.tsx.
// Jedyne miejsce składania Zlecenia; marketing (landing, sklep) linkuje tu przez
// ORDER_PIPELINE (components/marketing/investor-modules.ts).
export const Route = createFileRoute("/inwestor/umowy")({
  validateSearch: (search: Record<string, unknown>): { tpay?: string; payment?: string } => ({
    tpay: typeof search.tpay === "string" ? search.tpay : undefined,
    payment: typeof search.payment === "string" ? search.payment : undefined,
  }),
  component: PipelinePage,
});

function PipelinePage() {
  const { tpay, payment } = Route.useSearch();
  return <InvestorOrderPipeline tpay={tpay} payment={payment} />;
}
