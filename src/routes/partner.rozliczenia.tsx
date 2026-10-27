import { createFileRoute } from "@tanstack/react-router";
import { RozliczeniaPage } from "./posrednik.rozliczenia";

export const Route = createFileRoute("/partner/rozliczenia")({
  component: RozliczeniaPage,
});
