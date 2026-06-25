import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/wniosek-1")({
  beforeLoad: () => {
    throw redirect({ to: "/klient" });
  },
  component: () => null,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
});
