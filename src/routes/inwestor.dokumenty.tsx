import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { FileSignature, FileText, Lock } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UmowaAgentPanel } from "@/components/inwestor/umowa-agent-panel";
import { DocumentCreatorPage } from "@/components/document-creator/DocumentCreatorPage";
import { useAccessState } from "@/hooks/use-access";

/**
 * JEDEN moduł dokumentów inwestora — dwie zakładki:
 *  • „Tworzenie umowy": agent AI zbiera dane, a tekst umowy pożyczki składa
 *    deterministycznie silnik klauzul (contract-engine). To JEDYNA ścieżka
 *    tworzenia umowy w panelu (w pakiecie Podstawowym i PRO).
 *  • „Kreator dokumentów": wzory DOCX (bez kategorii „Umowy") — pakiet PRO.
 * Stare trasy /inwestor/kreator-umowy i /inwestor/kreator-dokumentow
 * przekierowują tutaj.
 */
export type DokumentyTab = "umowa" | "kreator";

export const Route = createFileRoute("/inwestor/dokumenty")({
  validateSearch: (search: Record<string, unknown>): { tab?: DokumentyTab } => ({
    tab: search.tab === "kreator" ? "kreator" : search.tab === "umowa" ? "umowa" : undefined,
  }),
  component: DokumentyIUmowy,
});

function DokumentyIUmowy() {
  const { tab } = useSearch({ from: "/inwestor/dokumenty" });
  const navigate = useNavigate();
  const { loading, hasFullAccess } = useAccessState("investor");
  const active: DokumentyTab = tab ?? "umowa";

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Panel inwestora"
        title="Dokumenty i umowy"
        subtitle="Jedno miejsce na dokumenty: agent czatowy przygotowuje umowę pożyczki (strony, kwota i warunki, nieruchomość z KW, zabezpieczenia) i składa ją silnikiem klauzul, a kreator dokumentów uzupełnia gotowe wzory DOCX danymi z GUS, KRS i kalkulatora."
      />

      <Tabs
        value={active}
        onValueChange={(v) =>
          void navigate({
            to: "/inwestor/dokumenty",
            search: { tab: v === "kreator" ? "kreator" : undefined },
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="umowa">
            <FileSignature className="mr-2 h-4 w-4" /> Tworzenie umowy
          </TabsTrigger>
          <TabsTrigger value="kreator">
            <FileText className="mr-2 h-4 w-4" /> Kreator dokumentów
          </TabsTrigger>
        </TabsList>

        <TabsContent value="umowa" className="mt-4">
          <UmowaAgentPanel />
        </TabsContent>

        <TabsContent value="kreator" className="mt-4">
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">Ładowanie…</div>
          ) : hasFullAccess ? (
            // Bez kategorii „Umowy": umowy powstają wyłącznie w zakładce „Tworzenie umowy".
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
                  każdym pakiecie w zakładce „Tworzenie umowy".
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
