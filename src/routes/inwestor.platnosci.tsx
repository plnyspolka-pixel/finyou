import { createFileRoute, redirect } from "@tanstack/react-router";

// „Płatności i faktury" to zakładka modułu „Pakiet i płatności"
// (/inwestor/abonament?tab=platnosci). Trasa zostaje jako przekierowanie dla
// starych linków (e-maile z fakturami, zakładki przeglądarki).
export const Route = createFileRoute("/inwestor/platnosci")({
  beforeLoad: () => {
    throw redirect({ to: "/inwestor/abonament", search: { tab: "platnosci" } });
  },
  component: () => null,
});
