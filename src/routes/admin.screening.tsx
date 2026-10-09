// Panel compliance: screening PEP i list sankcyjnych. Zakładki: kolejka spraw,
// źródła (importy, alerty), pokrycie krajowego wykazu PEP, ustawienia, dziennik
// audytu. Dostęp: personel wewnętrzny (bramka serwerowa w każdej funkcji);
// ustawienia, importy na żądanie i akceptacja zarządu — administrator.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CasesTab } from "@/components/screening/cases-tab";
import { AuditTab, CoverageTab, SettingsTab, SourcesTab } from "@/components/screening/ops-tabs";

const TABS = ["sprawy", "zrodla", "pokrycie", "ustawienia", "audyt"] as const;

export const Route = createFileRoute("/admin/screening")({
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ tab: z.enum(TABS).optional() }).parse(s),
  component: AdminScreening,
});

function AdminScreening() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/screening" });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Screening PEP i sankcji</h1>
        <p className="text-sm text-muted-foreground">
          Automat zamyka sam wyłącznie „brak trafień”. Każde trafienie od progu i każde oświadczenie
          „tak” czeka na decyzję człowieka z uzasadnieniem.
        </p>
      </div>
      <Tabs
        value={tab ?? "sprawy"}
        onValueChange={(v) => void navigate({ search: { tab: v as (typeof TABS)[number] } })}
      >
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="sprawy">Kolejka spraw</TabsTrigger>
          <TabsTrigger value="zrodla">Źródła</TabsTrigger>
          <TabsTrigger value="pokrycie">Pokrycie wykazu PEP</TabsTrigger>
          <TabsTrigger value="ustawienia">Ustawienia</TabsTrigger>
          <TabsTrigger value="audyt">Dziennik audytu</TabsTrigger>
        </TabsList>
        <TabsContent value="sprawy" className="mt-4">
          <CasesTab />
        </TabsContent>
        <TabsContent value="zrodla" className="mt-4">
          <SourcesTab />
        </TabsContent>
        <TabsContent value="pokrycie" className="mt-4">
          <CoverageTab />
        </TabsContent>
        <TabsContent value="ustawienia" className="mt-4">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="audyt" className="mt-4">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
