import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/wniosek-formularz")({
  beforeLoad: () => {
    throw redirect({ to: "/klient" });
  },
  component: () => null,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
});
