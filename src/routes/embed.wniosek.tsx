import { createFileRoute, redirect } from "@tanstack/react-router";

// Stara strona /embed/wniosek została wycofana. Cały ruch kierujemy
// na główny landing financeyou.pl, gdzie jest jeden prosty wniosek.
export const Route = createFileRoute("/embed/wniosek")({
  beforeLoad: () => {
    throw redirect({ href: "https://financeyou.pl" });
  },
  component: () => null,
});
