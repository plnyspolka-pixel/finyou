import { createFileRoute } from "@tanstack/react-router";
import { ClientProfileSections } from "@/components/client/ClientProfileSections";

export const Route = createFileRoute("/klient/profil")({
  component: KlientProfil,
});

function KlientProfil() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Mój profil</h1>
      <ClientProfileSections />
    </div>
  );
}
