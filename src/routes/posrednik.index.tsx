import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/posrednik/")({
  beforeLoad: () => {
    throw redirect({ to: "/posrednik/leady" });
  },
});
