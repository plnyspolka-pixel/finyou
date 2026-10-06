import { createFileRoute } from "@tanstack/react-router";
import { LoanProductPage } from "@/components/marketing/loan-product-page";
import { loanProductHead } from "@/lib/seo/loan-product-head";

const SLUG = "pozyczka-pod-zastaw-dzialki";

export const Route = createFileRoute("/pozyczka-pod-zastaw-dzialki")({
  head: () => loanProductHead(SLUG),
  component: () => <LoanProductPage slug={SLUG} />,
});
