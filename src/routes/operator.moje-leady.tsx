import { createFileRoute } from "@tanstack/react-router";
import { MyBrokerLeads } from "./posrednik.moje-leady";

export const Route = createFileRoute("/operator/moje-leady")({
  component: MyBrokerLeads,
});
