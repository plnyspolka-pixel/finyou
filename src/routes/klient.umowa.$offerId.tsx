import { createFileRoute } from "@tanstack/react-router";
import { ContractPrepView } from "@/components/contract-prep-view";

export const Route = createFileRoute("/klient/umowa/$offerId")({
  component: KlientUmowa,
});

function KlientUmowa() {
  const { offerId } = Route.useParams();
  return <ContractPrepView offerId={offerId} side="client" backTo="/klient/oferta" />;
}
