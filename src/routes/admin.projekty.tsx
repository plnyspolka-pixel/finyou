// Panel administratora zamkniętego modułu projektów inwestycyjnych.
// Zakładki: użytkownicy/aplikacje, projekty (pula), przypisania, propozycje,
// pytania, log audytowy, ustawienia. Dostęp: personel wewnętrzny (bramka
// serwerowa is_internal_staff w każdej server function).
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersTab } from "@/components/projects/admin/users-tab";
import { ProjectsTab } from "@/components/projects/admin/projects-tab";
import {
  AssignmentsTab,
  ProposalsTab,
  InfoRequestsTab,
  AuditTab,
  SettingsTab,
} from "@/components/projects/admin/ops-tabs";

export const Route = createFileRoute("/admin/projekty")({
  component: AdminProjects,
});

function AdminProjects() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Projekty inwestycyjne</h1>
        <p className="text-sm text-muted-foreground">
          Zamknięty moduł: aplikacje, weryfikacja, pula projektów, przypisania i propozycje.
        </p>
      </div>
      <Tabs defaultValue="users">
        <TabsList className="flex-wrap">
          <TabsTrigger value="users">Użytkownicy</TabsTrigger>
          <TabsTrigger value="projects">Projekty</TabsTrigger>
          <TabsTrigger value="assignments">Przypisania</TabsTrigger>
          <TabsTrigger value="proposals">Propozycje</TabsTrigger>
          <TabsTrigger value="info">Pytania</TabsTrigger>
          <TabsTrigger value="audit">Logi</TabsTrigger>
          <TabsTrigger value="settings">Ustawienia</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="projects" className="mt-4">
          <ProjectsTab />
        </TabsContent>
        <TabsContent value="assignments" className="mt-4">
          <AssignmentsTab />
        </TabsContent>
        <TabsContent value="proposals" className="mt-4">
          <ProposalsTab />
        </TabsContent>
        <TabsContent value="info" className="mt-4">
          <InfoRequestsTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
