import { createFileRoute } from "@tanstack/react-router";
import { InvestorProposalCalculator } from "@/components/client/InvestorProposalCalculator";

export const Route = createFileRoute("/klient/kalkulator")({
  component: InvestorProposalCalculator,
});
