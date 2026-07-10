import { createFileRoute } from "@tanstack/react-router";
import { MojeWnioski } from "./posrednik.wnioski.index";

export const Route = createFileRoute("/operator/wnioski/")({
  component: MojeWnioski,
});
