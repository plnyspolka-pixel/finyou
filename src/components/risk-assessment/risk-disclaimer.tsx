import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

/**
 * Widoczne zastrzeżenie prawne — materiał ma charakter wyłącznie informacyjny/
 * analityczny i NIE stanowi rekomendacji, porady inwestycyjnej ani prawnej.
 * Wyświetlane w analizie ryzyka oraz w kalkulatorze inwestora.
 */
export function RiskDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription className={compact ? "text-[11px] leading-snug" : "text-xs leading-snug"}>
        <b>Materiał informacyjny — nie stanowi rekomendacji ani porady.</b> Prezentowane wyceny,
        oceny, klasyfikacje ryzyka i wyliczenia są automatyczne i mają charakter wyłącznie
        poglądowy. Nie jesteśmy doradcą inwestycyjnym ani prawnym i nie świadczymy doradztwa
        inwestycyjnego, prawnego ani podatkowego; materiał nie stanowi rekomendacji, porady
        inwestycyjnej/prawnej, oferty ani zaproszenia do zawarcia transakcji w rozumieniu przepisów
        prawa. Decyzje podejmujesz samodzielnie i na własne ryzyko — zalecana weryfikacja u
        rzeczoznawcy majątkowego oraz radcy prawnego/adwokata.
      </AlertDescription>
    </Alert>
  );
}
