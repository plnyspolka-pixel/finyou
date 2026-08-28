import { createFileRoute } from "@tanstack/react-router";
import { DocumentCreatorPage } from "@/components/document-creator/DocumentCreatorPage";

export const Route = createFileRoute("/inwestor/kreator-dokumentow")({
  // Bez kategorii „Umowy": umowy powstają wyłącznie w zakładce „Tworzenie umowy".
  component: () => <DocumentCreatorPage excludeCategories={["umowa"]} />,
});
