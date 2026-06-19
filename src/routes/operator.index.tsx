import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wand2, Users, FileText } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/operator/")({
  component: OperatorIndex,
});

function OperatorIndex() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pulpit operatora</h1>
      <p className="text-sm text-muted-foreground">Witaj. Pełny widok leadów, transkryptów rozmów i ręczne dodawanie wniosków pojawi się w kolejnej iteracji.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/operator/kreator-dokumentow">
          <Card className="hover:bg-accent/40 transition">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wand2 className="h-4 w-4" /> Kreator dokumentów</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">31 wzorów B2B: umowy, windykacja, oświadczenia, pisma sądowe.</CardContent>
          </Card>
        </Link>
        <Card className="opacity-60">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Leady — wkrótce</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Lista wszystkich leadów z transkryptami voicebota i historią followupów.</CardContent>
        </Card>
        <Card className="opacity-60">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Ręczny wniosek — wkrótce</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Dodawanie wniosku z auto-dedupem po PESEL/NIP/email/telefon.</CardContent>
        </Card>
      </div>
    </div>
  );
}
