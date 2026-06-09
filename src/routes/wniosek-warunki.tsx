import { createFileRoute, redirect } from "@tanstack/react-router";

// Krok "Maksymalna rata / koszt" został wycofany — przekierowujemy do formularza.
export const Route = createFileRoute("/wniosek-warunki")({
  beforeLoad: () => {
    throw redirect({ to: "/wniosek-formularz" });
  },
  component: () => null,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
});
