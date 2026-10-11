import { createFileRoute } from "@tanstack/react-router";
import { LoanProductPage } from "@/components/marketing/loan-product-page";
import { loanProductHead } from "@/lib/seo/loan-product-head";

const SLUG = "pozyczka-dla-nowych-firm";

export const Route = createFileRoute("/pozyczka-dla-nowych-firm")({
  head: () => loanProductHead(SLUG),
  component: () => <LoanProductPage slug={SLUG} />,
});
