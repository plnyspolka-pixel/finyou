// Publiczna weryfikacja podpisanego dokumentu (kod z paska na każdej stronie).
import { createFileRoute } from "@tanstack/react-router";
import { VerificationPage } from "@/components/esign/verification-page";

export const Route = createFileRoute("/weryfikacja/$code")({
  component: WeryfikacjaRoute,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Weryfikacja podpisu — Finance You" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function WeryfikacjaRoute() {
  const { code } = Route.useParams();
  return <VerificationPage code={code} />;
}
