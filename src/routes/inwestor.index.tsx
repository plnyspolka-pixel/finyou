import { createFileRoute, redirect } from "@tanstack/react-router";

// Zakładka „Dostępne wnioski" została usunięta z panelu inwestora. Pierwszym
// ekranem są „Okazje inwestycyjne" (/inwestor/umowy): pipeline inwestora,
// Zlecenia poszukiwania okazji i projekty z ich wykonania. Trasa zostaje
// wyłącznie jako przekierowanie dla starych linków (e-maile, zakładki).
export const Route = createFileRoute("/inwestor/")({
  beforeLoad: () => {
    throw redirect({ to: "/inwestor/umowy" });
  },
  component: () => null,
});
