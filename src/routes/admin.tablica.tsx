import { createFileRoute } from "@tanstack/react-router";
import { ClientWorkflowBoard } from "@/components/admin/client-workflow-board";

export const Route = createFileRoute("/admin/tablica")({
  component: AdminTablicaPage,
});

function AdminTablicaPage() {
  return <ClientWorkflowBoard />;
}
