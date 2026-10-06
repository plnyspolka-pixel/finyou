// Publiczna strona podpisu dokumentowego — link osobisty z e-maila, bez logowania.
import { createFileRoute } from "@tanstack/react-router";
import { SigningPage } from "@/components/esign/signing-page";

export const Route = createFileRoute("/podpis/$token")({
  component: PodpisRoute,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Podpisz dokument — Finance You" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PodpisRoute() {
  const { token } = Route.useParams();
  return <SigningPage token={token} />;
}
