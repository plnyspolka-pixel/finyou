import { createFileRoute } from "@tanstack/react-router";
import { AffiliateRegistration } from "@/components/affiliate/affiliate-registration";

// Rejestracja POŚREDNIKA (osobne konto niż program partnerski).
export const Route = createFileRoute("/posrednicy/rejestracja")({
  validateSearch: (s: Record<string, unknown>) => ({ ref: typeof s.ref === "string" ? s.ref : "" }),
  head: () => ({
    meta: [{ title: "Rejestracja pośrednika — Finance You" }],
    links: [{ rel: "canonical", href: "https://financeyou.pl/posrednicy/rejestracja" }],
  }),
  component: RejestracjaPosrednika,
});

function RejestracjaPosrednika() {
  const { ref } = Route.useSearch();
  return <AffiliateRegistration kind="broker" refCode={ref} />;
}
