import { createFileRoute, redirect } from "@tanstack/react-router";

// „Kreator dokumentów" żyje w module „Dokumenty i umowy" (/inwestor/dokumenty).
// Trasa zostaje jako przekierowanie dla starych linków.
export const Route = createFileRoute("/inwestor/kreator-dokumentow")({
  beforeLoad: () => {
    throw redirect({ to: "/inwestor/dokumenty", search: { tab: "kreator" } });
  },
  component: () => null,
});
