import { createFileRoute } from "@tanstack/react-router";
import { FileSignature } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { StoreDpaGate } from "@/components/storefront/StoreDpaGate";
import { DocumentCreatorPage } from "@/components/document-creator/DocumentCreatorPage";

/**
 * Oddzielny generator: biblioteka pism, ich wypełnianie, historia i e-podpis.
 * Nie miesza się z agentem tworzącym umowę pożyczki w /inwestor/dokumenty.
 */
export const Route = createFileRoute("/inwestor/kreator-dokumentow")({
  component: InvestorDocumentGenerator,
});

function InvestorDocumentGenerator() {
  return (
    <div className="space-y-5">
      <FancyPageHeader
        eyebrow="Panel inwestora"
        title="Generator dokumentów"
        subtitle="Wybierz rodzaj pisma, uzupełnij dane, wygeneruj DOCX i wyślij gotowy dokument do podpisu elektronicznego bez ponownego wgrywania. Historię i podpisy znajdziesz poniżej."
      />
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
        <FileSignature className="h-5 w-5 text-primary" />
        <span>Podpis dokumentowy z weryfikacją, kodem jednorazowym i Kartą podpisów.</span>
        <a href="/inwestor/podpisy" className="font-semibold underline">Wszystkie podpisy</a>
      </div>
      <StoreDpaGate>
        <DocumentCreatorPage embedded lenderFromProfile excludeCategories={["umowa"]} enableEsign />
      </StoreDpaGate>
    </div>
  );
}
