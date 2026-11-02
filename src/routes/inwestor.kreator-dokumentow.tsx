import { createFileRoute } from "@tanstack/react-router";
import { FileSignature, ClipboardList, Scale, FileText } from "lucide-react";
import { UmowaAgentPanel } from "@/components/inwestor/umowa-agent-panel";
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
        <nav aria-label="Rodzaje dokumentów" className="flex flex-wrap gap-2">
          <a href="#pakiet-pozyczki" className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted">Cały pakiet pożyczki</a>
          <a href="#pisma-i-oswiadczenia" className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted">Pisma i oświadczenia</a>
          <a href="#podpisy" className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted">Podpisy</a>
        </nav>
        <section id="pakiet-pozyczki" className="space-y-4 rounded-xl border p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-xl font-bold">Cały pakiet do udzielenia pożyczki</h2>
              <p className="text-sm text-muted-foreground">Jeden DOCX z deterministycznego silnika klauzul, bez ręcznego składania załączników.</p>
            </div>
          </div>
          <ol className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              "Wniosek o udzielenie pożyczki",
              "Umowa pożyczki",
              "Załącznik nr 1 — harmonogram spłat",
              "Załącznik nr 2 — protokół negocjacji",
              "Załącznik nr 3 — tabela opłat windykacyjnych",
              "Załącznik nr 4 — dyspozycja wypłaty (gdy dotyczy)",
            ].map((part, i) => (
              <li key={part} className="rounded-lg bg-muted/40 px-3 py-2">
                <span className="mr-2 text-muted-foreground">{i + 1}.</span>{part}
              </li>
            ))}
          </ol>
          <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 p-3 text-xs leading-relaxed">
            <Scale className="h-4 w-4 shrink-0" />
            <span>Art. 777 k.p.c. i ustanowienie hipoteki wymagają notariusza; oświadczenie poręczyciela wymaga co najmniej formy pisemnej. Pakiet z poręczycielem nie oferuje zwykłego e-podpisu.</span>
          </div>
          <UmowaAgentPanel enableEsign />
        </section>
        <section id="pisma-i-oswiadczenia" className="space-y-3 rounded-xl border p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Pisma, dokumenty zabezpieczeń i załączniki</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Wybierz rzeczywisty wzór z bazy, w tym dokumenty hipoteczne, instrukcje notarialne,
            ugody i wezwania. E-podpis będzie widoczny wyłącznie dla pism,
            które można skutecznie podpisać w formie dokumentowej.
            Przy pozostałych dokumentach pozostaje przygotowanie pliku do właściwej formy.
          </p>
          <DocumentCreatorPage embedded lenderFromProfile enableEsign />
        </section>
        <section id="podpisy" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <div>
            <p className="font-semibold">Podpisy i historia kopert</p>
            <p className="text-sm text-muted-foreground">Podpisane PDF, statusy i potwierdzenia doręczenia.</p>
          </div>
          <a href="/inwestor/podpisy" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Otwórz e-podpis</a>
        </section>
      </StoreDpaGate>
    </div>
  );
}
