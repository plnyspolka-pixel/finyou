import { createFileRoute } from "@tanstack/react-router";
import { DocumentCreatorPage } from "@/components/document-creator/DocumentCreatorPage";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";

export const Route = createFileRoute("/inwestor/kreator-dokumentow")({
  component: KreatorDokumentow,
});

function KreatorDokumentow() {
  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Dokumenty"
        title="Kreator dokumentów"
        subtitle="Wygeneruj komplet dokumentów potrzebnych do podpisania umowy z klientem."
      />
      <DocumentCreatorPage />
    </div>
  );
}
