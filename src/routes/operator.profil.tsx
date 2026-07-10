import { createFileRoute } from "@tanstack/react-router";
import { BrokerProfile } from "./posrednik.profil";

export const Route = createFileRoute("/operator/profil")({
  component: BrokerProfile,
});
