import { createFileRoute } from "@tanstack/react-router";
import { BrokerNewApplication } from "./posrednik.wniosek";

export const Route = createFileRoute("/operator/wniosek")({
  component: BrokerNewApplication,
});
