// Podpis elektroniczny (forma dokumentowa) — panel inwestora: wysyłka
// dokumentów klientom do podpisu oraz dokumenty do podpisu przez inwestora.
import { createFileRoute } from "@tanstack/react-router";
import { EsignPanel } from "@/components/esign/esign-panel";

export const Route = createFileRoute("/inwestor/podpisy")({
  component: () => <EsignPanel eyebrow="Panel inwestora" basePath="/inwestor/podpisy" />,
});
