import { createFileRoute } from "@tanstack/react-router";
import { LinearLoanApplication } from "@/components/loan-application-variants";

export const Route = createFileRoute("/wniosek-1")({
  component: LinearLoanApplication,
  head: () => ({
    meta: [
      { title: "Wniosek 1 — krok po kroku" },
      { name: "robots", content: "noindex" },
    ],
  }),
});