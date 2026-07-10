import { createFileRoute } from "@tanstack/react-router";
import { OfertaWewnetrzna } from "./posrednik.oferta-wewnetrzna";

export const Route = createFileRoute("/operator/oferta-wewnetrzna")({
  component: OfertaWewnetrzna,
});
