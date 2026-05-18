import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

const kpis = [
  "Nowe leady", "Wnioski niekompletne", "Wnioski w follow-upie", "Wnioski kompletne",
  "Wnioski do analizy", "Wnioski rokujące", "Wysłane do inwestorów",
  "Oferty od inwestorów", "Oferty przekazane klientom", "Sprawy zamknięte",
];

function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pulpit</h1>
        <p className="text-sm text-muted-foreground">Przegląd kluczowych wskaźników i aktywności.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k}><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{k}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-foreground">0</div></CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Statystyki konwersji</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Wykresy konwersji, źródeł leadów i statusów będą uzupełnione w kolejnej fazie.
        </CardContent>
      </Card>
    </div>
  );
}
