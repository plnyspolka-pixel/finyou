import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/klient/kontakt")({
  component: KlientKontakt,
});

function KlientKontakt() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Kontakt</h1>
      <Card><CardHeader><CardTitle>Finance You</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <div><span className="text-muted-foreground">Telefon:</span> +48 000 000 000</div>
          <div><span className="text-muted-foreground">E-mail:</span> kontakt@financeyou.pl</div>
          <div><span className="text-muted-foreground">Godziny:</span> pn–pt 9:00–17:00</div>
        </CardContent>
      </Card>
    </div>
  );
}
