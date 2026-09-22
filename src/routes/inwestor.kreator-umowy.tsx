import { createFileRoute, redirect } from "@tanstack/react-router";

// „Tworzenie umowy" żyje w module „Dokumenty i umowy" (/inwestor/dokumenty).
// Trasa zostaje jako przekierowanie dla starych linków.
export const Route = createFileRoute("/inwestor/kreator-umowy")({
  beforeLoad: () => {
    throw redirect({ to: "/inwestor/dokumenty", search: { tab: "umowa" } });
  },
  component: () => null,
});
