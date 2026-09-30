// Przegląd AML — liczniki, ostrzeżenia o brakach w profilu (bez blokowania)
// i szybkie wejścia do pozostałych ekranów.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getAmlOverview,
  getAmlSettings,
  type AmlOverview,
  type AmlSettingsView,
} from "@/lib/aml/aml-settings.functions";
import { GiifReadinessGuide } from "@/components/aml/giif-readiness";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/inwestor/aml/")({
  component: AmlOverviewScreen,
});

function AmlOverviewScreen() {
  const fetchOverview = useServerFn(getAmlOverview);
  const fetchSettings = useServerFn(getAmlSettings);
  const [overview, setOverview] = useState<AmlOverview | null>(null);
  const [settings, setSettings] = useState<AmlSettingsView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Pierwsze wejście: ustawienia tworzą się automatycznie z profilu
        // inwestora (osoba odpowiedzialna, organizacja, NIP, adres).
        setSettings(await fetchSettings());
        setOverview(await fetchOverview());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się wczytać przeglądu AML");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie modułu AML…
      </div>
    );
  }

  const tiles: { label: string; value: number | string; to: string; warn?: boolean }[] = overview
    ? [
        { label: "Klienci AML", value: overview.customers, to: "/inwestor/aml/klienci" },
        {
          label: "Screeningi do oceny",
          value: overview.screeningsToReview,
          to: "/inwestor/aml/klienci",
          warn: overview.screeningsToReview > 0,
        },
        {
          label: "Transakcje w rejestrze",
          value: overview.transactions,
          to: "/inwestor/aml/transakcje",
        },
        {
          label: "Ponadprogowe bez decyzji",
          value: overview.thresholdPending,
          to: "/inwestor/aml/transakcje",
          warn: overview.thresholdPending > 0,
        },
        {
          label: "Po terminie 7 dni",
          value: overview.thresholdOverdue,
          to: "/inwestor/aml/transakcje",
          warn: overview.thresholdOverdue > 0,
        },
        { label: "Otwarte sprawy AML", value: overview.openCases, to: "/inwestor/aml/sprawy" },
        {
          label: "Zgłoszenia w przygotowaniu",
          value: overview.reportsInPreparation,
          to: "/inwestor/aml/zgloszenia",
        },
        {
          label: "Wysłane bez potwierdzenia",
          value: overview.reportsSubmitted,
          to: "/inwestor/aml/zgloszenia",
          warn: overview.reportsSubmitted > 0,
        },
        {
          label: "Potwierdzone (UPO / ZPO)",
          value: overview.upoReceived,
          to: "/inwestor/aml/zgloszenia",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="AML"
        title="Przeciwdziałanie praniu pieniędzy"
        subtitle="Weryfikacja klientów, oceny ryzyka, rejestr transakcji i zgłoszenia GIIF. Podpis kwalifikowany jest potrzebny tylko do wysyłki przez SI*GIIF — awaryjnie zgłoszenie można wysłać papierowo."
      />

      {overview && !overview.profileGaps.ready && (
        <Card className="border-amber-300 dark:border-amber-700">
          <CardContent className="pt-4 flex gap-3 items-start">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Uzupełnij dane przed pierwszym zgłoszeniem do GIIF</p>
              <p className="text-muted-foreground">
                Możesz korzystać z całego modułu. Poniższe braki trzeba będzie uzupełnić dopiero
                przed wygenerowaniem finalnego zgłoszenia:
              </p>
              <ul className="list-disc ml-5 mt-1 text-muted-foreground">
                {overview.profileGaps.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <Link to="/inwestor/aml/ustawienia" className="text-primary underline text-sm">
                Przejdź do ustawień AML
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {settings && (
        <GiifReadinessGuide
          compactWhenReady
          readiness={settings.giifReadiness}
          institution={settings.institution}
          responsiblePerson={settings.responsiblePerson}
          onChange={(r) => setSettings({ ...settings, giifReadiness: r })}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {tiles.map((t) => (
          <Link key={t.label + t.to} to={t.to}>
            <Card className={t.warn ? "border-amber-300 dark:border-amber-700" : undefined}>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-semibold">{t.value}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
