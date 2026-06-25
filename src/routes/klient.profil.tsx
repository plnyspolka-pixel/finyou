import { createFileRoute } from "@tanstack/react-router";
import { ClientProfileSections } from "@/components/client/ClientProfileSections";

export const Route = createFileRoute("/klient/profil")({
  component: KlientProfil,
});

function KlientProfil() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Dane osobowe i kontaktowe</h1>
        <p className="text-sm text-muted-foreground">
          Zaktualizuj swoje dane — imię, nazwisko, PESEL, e-mail, telefon i adres.
        </p>
      </div>
      <ClientProfileSections onlyPersonal includePersonal showPasswordCard={false} />
    </div>
  );
}
