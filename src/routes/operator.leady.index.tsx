import { createFileRoute } from "@tanstack/react-router";
import { OperatorLeadsList } from "./posrednik.leady.index";

export const Route = createFileRoute("/operator/leady/")({
  component: OperatorLeadsList,
});
