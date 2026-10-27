import { createFileRoute } from "@tanstack/react-router";
import { ProwizjePage } from "./posrednik.prowizje";

export const Route = createFileRoute("/partner/prowizje")({
  component: () => <ProwizjePage kind="partner" />,
});
