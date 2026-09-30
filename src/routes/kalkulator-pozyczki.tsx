import { createFileRoute, redirect } from "@tanstack/react-router";

// Kalkulator pożyczki zdjęty — stary adres (linki, indeks Google) prowadzi
// na stronę programu pośrednika.
export const Route = createFileRoute("/kalkulator-pozyczki")({
  beforeLoad: () => {
    throw redirect({ to: "/dla-posrednika", statusCode: 301 });
  },
});
