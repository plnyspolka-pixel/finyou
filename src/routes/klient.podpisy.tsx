// Panel klienta — dokumenty do podpisu elektronicznego (forma dokumentowa).
import { createFileRoute } from "@tanstack/react-router";
import { ClientEsignPanel } from "@/components/esign/client-esign-panel";

export const Route = createFileRoute("/klient/podpisy")({
  component: ClientEsignPanel,
});
