import { createFileRoute } from "@tanstack/react-router";
import { ClientWorkflowBoard } from "@/components/admin/client-workflow-board";

export const Route = createFileRoute("/operator/tablica")({
  component: OperatorTablicaPage,
});

function OperatorTablicaPage() {
  return (
    <ClientWorkflowBoard
      wniosekDetailTo="/operator/wnioski/$id"
      leadDetailTo="/operator/leady/$id"
    />
  );
}
