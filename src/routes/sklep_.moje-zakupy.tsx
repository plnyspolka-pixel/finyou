import { createFileRoute, redirect } from "@tanstack/react-router";

// Dawna biblioteka zakupów /sklep/moje-zakupy (linkowana w starych e-mailach
// potwierdzających) → zakładka „Moje zakupy” sklepu panelu inwestora.
export const Route = createFileRoute("/sklep_/moje-zakupy")({
  beforeLoad: () => {
    throw redirect({ to: "/inwestor/sklep", search: { tab: "zakupy" }, statusCode: 301 });
  },
  component: () => null,
});
