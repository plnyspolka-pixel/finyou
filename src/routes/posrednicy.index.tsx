import { createFileRoute, redirect } from "@tanstack/react-router";

// Dawny adres programu partnerskiego.
export const Route = createFileRoute("/posrednicy/")({
  beforeLoad: () => {
    throw redirect({ to: "/program-partnerski", statusCode: 301 });
  },
});
