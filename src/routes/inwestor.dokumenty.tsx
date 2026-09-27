import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Lock } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UmowaAgentPanel } from "@/components/inwestor/umowa-agent-panel";
import { DocumentCreatorPage } from "@/components/document-creator/DocumentCreatorPage";
import { useAccessState } from "@/hooks/use-access";

/**
 * JEDEN ekran dokumentów inwestora (bez zakładek):
 *  • u góry kreator umowy — agent AI zbiera dane, a tekst umowy pożyczki
 *    składa deterministycznie silnik klauzul (contract-engine). To JEDYNA
 *    ścieżka tworzenia umowy w panelu (w pakiecie Podstawowym i PRO).
 *    „Wyślij do kreatora" z kalkulatora otwiera ten ekran, a harmonogram
 *    spłat jest pierwszą wiadomością rozmowy.
 *  • pod spodem kreator dokumentów — wzory DOCX (bez kategorii „Umowy") —
 *    pakiet PRO.
 * Stare trasy /inwestor/kreator-umowy i /inwestor/kreator-dokumentow
 * przekierowują tutaj.
 */
export const Route = createFileRoute("/inwestor/dokumenty")({
  component: DokumentyIUmowy,
});

function DokumentyIUmowy() {
  const { loading, hasFullAccess } = useAccessState("investor");

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
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Ładowanie…</div>
        ) : hasFullAccess ? (
          // Bez kategorii „Umowy": umowy powstają wyłącznie w kreatorze umowy powyżej.
          <DocumentCreatorPage excludeCategories={["umowa"]} embedded />
        ) : (
          <Card className="mx-auto max-w-2xl">
            <CardHeader className="items-center text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted">
                <Lock className="h-7 w-7 text-muted-foreground" />
              </div>
              <CardTitle>Kreator dokumentów jest w pakiecie PRO</CardTitle>
              <CardDescription>
                Gotowe wzory DOCX (windykacja, oświadczenia, załączniki) z automatycznym
                uzupełnianiem danych firmowych i kwot z kalkulatora. Umowę pożyczki przygotujesz w
                każdym pakiecie w kreatorze umowy powyżej.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button asChild>
                <Link to="/inwestor/abonament" search={{ product: "investor_pro_180d" }}>
                  Przejdź na PRO
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
