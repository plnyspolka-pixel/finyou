// Podpis elektroniczny (forma dokumentowa) — panel administratora.
import { createFileRoute } from "@tanstack/react-router";
import { EsignPanel } from "@/components/esign/esign-panel";

export const Route = createFileRoute("/admin/podpisy")({
  component: () => <EsignPanel eyebrow="Dokumenty" basePath="/admin/podpisy" />,
});
