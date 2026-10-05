// Podpis elektroniczny (forma dokumentowa) — panel operatora.
import { createFileRoute } from "@tanstack/react-router";
import { EsignPanel } from "@/components/esign/esign-panel";

export const Route = createFileRoute("/operator/podpisy")({
  component: () => <EsignPanel eyebrow="Panel operatora" basePath="/operator/podpisy" />,
});
