import { createFileRoute, redirect } from "@tanstack/react-router";

// Dawny pierwszy krok kreatora wniosku. Adres wciąż jest podlinkowany w starszych
// artykułach bloga i mógł zostać zaindeksowany — trwałe przekierowanie na stronę
// dla klienta z formularzem zamiast 404.
export const Route = createFileRoute("/wniosek-start")({
  beforeLoad: () => {
    throw redirect({ to: "/dla-klienta", statusCode: 301 });
  },
});
