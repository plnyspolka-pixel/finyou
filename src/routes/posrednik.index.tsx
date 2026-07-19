import { createFileRoute, redirect } from "@tanstack/react-router";

// „Moje wnioski" są dostępne na każdym poziomie konta (darmowym i płatnym) —
// bezpieczne miejsce startowe panelu; leady wymagają płatnego pakietu.
export const Route = createFileRoute("/posrednik/")({
  beforeLoad: () => {
    throw redirect({ to: "/posrednik/wnioski" });
  },
});
