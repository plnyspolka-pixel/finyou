import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/klient/")({
  component: KlientHome,
});

function KlientHome() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mój wniosek</h1>
        <p className="text-sm text-muted-foreground">Wypełnij krok po kroku — zapis dzieje się automatycznie.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Rozpocznij wniosek pożyczkowy</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Wieloetapowy formularz (dane kontaktowe, kwota, typ nieruchomości, dokumenty) zostanie aktywowany w kolejnej fazie. Masz zapisane konto i będziesz mógł wrócić do przerwanego wniosku przez indywidualny link powrotu.
          </p>
          <Button disabled>Rozpocznij wniosek (wkrótce)</Button>
        </CardContent>
      </Card>
    </div>
  );
}
