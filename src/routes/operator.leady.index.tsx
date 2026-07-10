import { createFileRoute } from "@tanstack/react-router";
import { OperatorLeadsList } from "./posrednik.leady";

export const Route = createFileRoute("/operator/leady/")({
  component: OperatorLeadsList,
});
