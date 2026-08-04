import { createFileRoute } from "@tanstack/react-router";
import { ApplicationsPage } from "./admin.wnioski-niekompletne";

export const Route = createFileRoute("/operator/wnioski/")({
  component: () => <ApplicationsPage detailTo="/operator/wnioski/$id" />,
});
