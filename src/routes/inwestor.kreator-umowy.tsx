import { createFileRoute } from "@tanstack/react-router";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { UmowaAgentPanel } from "@/components/inwestor/umowa-agent-panel";

/**
 * JEDYNA ścieżka tworzenia umowy w panelu inwestora: agent AI zbiera dane,
 * a tekst umowy składa deterministycznie silnik klauzul (contract-engine).
 * Wcześniejsze równoległe kreatory (wzór DOCX z asystentem, kreator
 * udzielenia, umowy w kreatorze dokumentów) zostały wycofane z tego panelu.
 */
export const Route = createFileRoute("/inwestor/kreator-umowy")({
  component: TworzenieUmowy,
});

function TworzenieUmowy() {
  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Panel inwestora"
        title="Tworzenie umowy"
        subtitle="Jedno miejsce przygotowania umowy pożyczki: agent czatowy zbiera dane (strony, kwota i warunki, nieruchomość z KW, zabezpieczenia), a umowę składa deterministycznie silnik klauzul — z walidacją, podglądem i plikiem .docx."
      />
      <UmowaAgentPanel />
    </div>
  );
}
