// Podpis elektroniczny — panel pośrednika: obserwator umów klientów, których
// wnioski dodał (podgląd treści, stan podpisów, pobieranie plików).
import { createFileRoute } from "@tanstack/react-router";
import { EsignPanel } from "@/components/esign/esign-panel";

export const Route = createFileRoute("/posrednik/podpisy")({
  component: () => <EsignPanel eyebrow="Panel pośrednika" basePath="/posrednik/podpisy" />,
});
