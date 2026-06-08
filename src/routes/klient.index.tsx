import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/klient/")({
  beforeLoad: () => {
    throw redirect({ to: "/klient/profil" });
  },
});
