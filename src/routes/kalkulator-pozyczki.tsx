import { createFileRoute, redirect } from "@tanstack/react-router";

// Kalkulator pożyczki zdjęty — stary adres (linki, indeks Google) prowadzi
// na stronę główną.
export const Route = createFileRoute("/kalkulator-pozyczki")({
  beforeLoad: () => {
    throw redirect({ to: "/", statusCode: 301 });
  },
});
