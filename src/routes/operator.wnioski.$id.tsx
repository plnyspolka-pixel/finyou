import { createFileRoute } from "@tanstack/react-router";
import { BrokerApplicationDetail } from "./posrednik.wnioski.$id";

export const Route = createFileRoute("/operator/wnioski/$id")({
  component: () => <BrokerApplicationDetail showInternalOffer />,
});
