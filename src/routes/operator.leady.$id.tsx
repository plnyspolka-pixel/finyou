import { createFileRoute } from "@tanstack/react-router";
import { OperatorLeadDetail } from "./posrednik.leady.$id";

export const Route = createFileRoute("/operator/leady/$id")({
  component: OperatorLeadDetail,
});
