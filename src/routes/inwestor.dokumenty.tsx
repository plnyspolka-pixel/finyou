import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { UmowaAgentPanel } from "@/components/inwestor/umowa-agent-panel";
import { DocumentCreatorPage } from "@/components/document-creator/DocumentCreatorPage";

/**
 * JEDEN ekran dokumentów inwestora (bez zakładek):
 *  • u góry kreator umowy — agent AI zbiera dane, a tekst umowy pożyczki
 *    składa deterministycznie silnik klauzul (contract-engine). To JEDYNA
 *    ścieżka tworzenia umowy w panelu.
 *    „Wyślij do kreatora" z kalkulatora otwiera ten ekran, a harmonogram
 *    spłat jest pierwszą wiadomością rozmowy.
 *  • pod spodem kreator dokumentów — wzory DOCX (bez kategorii „Umowy") —
 *    dostępny dla każdego inwestora (usługa nieodpłatna).
 * Stare trasy /inwestor/kreator-umowy i /inwestor/kreator-dokumentow
 * przekierowują tutaj.
 */
export const Route = createFileRoute("/inwestor/dokumenty")({
  component: DokumentyIUmowy,
});

function DokumentyIUmowy() {
  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Panel inwestora"
        title="Dokumenty i umowy"
        subtitle="Kreator umowy pożyczki i wzory dokumentów w jednym miejscu: agent przygotowuje umowę w rozmowie (strony, kwota i warunki, nieruchomość z KW, zabezpieczenia), a kreator dokumentów uzupełnia gotowe wzory DOCX danymi z GUS, KRS i kalkulatora."
      />

      <section id="kreator-umowy" className="space-y-3">
        <UmowaAgentPanel />
      </section>

      <section id="kreator-dokumentow" className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Kreator dokumentów (wzory DOCX)</h2>
        </div>
        {/* Bez kategorii „Umowy": umowy powstają wyłącznie w kreatorze umowy powyżej.
            Kreator dokumentów jest dostępny dla każdego inwestora (usługa nieodpłatna). */}
        <DocumentCreatorPage excludeCategories={["umowa"]} embedded />
      </section>
    </div>
  );
}
