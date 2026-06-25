import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/klient/profil")({
  component: KlientProfil,
});

function KlientProfil() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Mój profil</h1>
      <p className="text-muted-foreground">
        Dane firmy, weryfikacja konta, telefonu, BIK oraz dokumenty znajdziesz teraz na pulpicie klienta pod kalkulatorem.
      </p>
      <Link
        to="/klient"
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
      >
        Przejdź do pulpitu
      </Link>
    </div>
  );
}
