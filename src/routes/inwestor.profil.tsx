import { createFileRoute } from "@tanstack/react-router";
import { InwestorProfil } from "@/components/inwestor/profil-view";

export const Route = createFileRoute("/inwestor/profil")({
  component: InwestorProfil,
});
