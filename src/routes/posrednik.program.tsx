import { createFileRoute, redirect } from "@tanstack/react-router";

// Link polecający dla inwestorów należy do programu partnerskiego (/partner).
// Pośrednik zarabia wyłącznie na uruchomionych pożyczkach — widzi je w Prowizjach.
export const Route = createFileRoute("/posrednik/program")({
  beforeLoad: () => {
    throw redirect({ to: "/posrednik/prowizje" });
  },
});
