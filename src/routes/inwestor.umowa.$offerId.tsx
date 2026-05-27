import { createFileRoute } from "@tanstack/react-router";
import { ContractPrepView } from "@/components/contract-prep-view";

export const Route = createFileRoute("/inwestor/umowa/$offerId")({
  component: InwestorUmowa,
});

function InwestorUmowa() {
  const { offerId } = Route.useParams();
  return <ContractPrepView offerId={offerId} side="investor" backTo="/inwestor/oferty" />;
}
