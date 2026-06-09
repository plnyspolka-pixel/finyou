import { createFileRoute } from "@tanstack/react-router";
import { SinglePageLoanApplication } from "@/components/loan-application-variants";

export const Route = createFileRoute("/wniosek-2")({
  component: SinglePageLoanApplication,
  head: () => ({
    meta: [
      { title: "Wniosek 2 — jedna strona" },
      { name: "robots", content: "noindex" },
    ],
  }),
});