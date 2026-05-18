import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/inwestor/")({
  component: InwestorHome,
});

function InwestorHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dostępne wnioski</h1>
        <p className="text-sm text-muted-foreground">Wnioski dopuszczone do inwestorów.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Aktywuj abonament</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Aby zobaczyć dostępne wnioski, aktywuj abonament. Lista wniosków, kalkulator oferty i składanie ofert zostaną włączone w kolejnej fazie.
        </CardContent>
      </Card>
    </div>
  );
}
