import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/przypomnienia")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/klienci" });
  },
});
