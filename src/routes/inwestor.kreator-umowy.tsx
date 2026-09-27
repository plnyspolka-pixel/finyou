import { createFileRoute, redirect } from "@tanstack/react-router";

// Kreator umowy żyje w module „Dokumenty i umowy" (/inwestor/dokumenty) —
// jeden ekran, bez zakładek. Trasa zostaje jako przekierowanie dla starych linków.
export const Route = createFileRoute("/inwestor/kreator-umowy")({
  beforeLoad: () => {
    throw redirect({ to: "/inwestor/dokumenty" });
  },
  component: () => null,
});
