import { createFileRoute } from "@tanstack/react-router";
import { AffiliateRegistration } from "@/components/affiliate/affiliate-registration";

// Rejestracja w PROGRAMIE PARTNERSKIM (osobne konto niż pośrednik).
export const Route = createFileRoute("/program-partnerski/rejestracja")({
  validateSearch: (s: Record<string, unknown>) => ({ ref: typeof s.ref === "string" ? s.ref : "" }),
  head: () => ({
    meta: [{ title: "Rejestracja partnera — Program partnerski Finance You" }],
    links: [{ rel: "canonical", href: "https://financeyou.pl/program-partnerski/rejestracja" }],
  }),
  component: RejestracjaPartnera,
});

function RejestracjaPartnera() {
  const { ref } = Route.useSearch();
  return <AffiliateRegistration kind="partner" refCode={ref} />;
}
