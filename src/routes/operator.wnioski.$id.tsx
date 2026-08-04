import { createFileRoute } from "@tanstack/react-router";
import { WniosekDetail } from "./admin.wnioski.$id";

export const Route = createFileRoute("/operator/wnioski/$id")({
  component: () => <WniosekDetail backTo="/operator/wnioski" />,
});
