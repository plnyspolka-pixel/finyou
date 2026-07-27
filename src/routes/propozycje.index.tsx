import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPLN } from "@/lib/labels";
import { ArrowLeft, Handshake, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/propozycje/")({
  head: () => ({
    meta: [
      { title: "Publiczne propozycje pożyczek — Finance You" },
      {
        name: "description",
        content:
          "Otwarta lista wygenerowanych propozycji pożyczek z harmonogramem spłat. Zobacz parametry, koszty i harmonogram każdej oferty.",
      },
      { property: "og:title", content: "Propozycje pożyczek — Finance You" },
      {
        property: "og:description",
        content: "Otwarta lista propozycji wygenerowanych w kalkulatorze inwestora.",
      },
    ],
  }),
  component: PropozycjeList,
});

function PropozycjeList() {
  const q = useQuery({
    queryKey: ["loan-proposals-public"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_public_loan_proposals");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Strona główna
          </Link>
          <Link to="/negocjuj">
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> Nowa propozycja
            </Button>
          </Link>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Handshake className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Propozycje pożyczek</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Otwarta lista propozycji wygenerowanych w kalkulatorze inwestora — każda zawiera
            parametry pożyczki, koszty i harmonogram spłat.
          </p>
        </div>

        {q.isLoading && <p className="text-sm text-muted-foreground">Wczytuję...</p>}
        {q.error && <p className="text-sm text-destructive">Błąd: {(q.error as Error).message}</p>}

        <div className="grid gap-3">
          {(q.data ?? []).map((p) => (
            <Link key={p.id} to="/propozycje/$id" params={{ id: p.id }} className="block">
              <Card className="transition hover:border-primary">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">Propozycja pożyczki</CardTitle>
                    <Badge variant={p.status === "open" ? "default" : "secondary"}>
                      {p.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">Kwota: </span>
                    <b className="tabular-nums">{formatPLN(Number(p.amount))}</b>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Okres: </span>
                    <b>{p.months} mies.</b>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Oprocentowanie: </span>
                    <b className="tabular-nums">{Number(p.annual_rate).toFixed(2)}%</b>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rata: </span>
                    <b className="tabular-nums">{formatPLN(Number(p.capped_rata))}</b>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Prowizja: </span>
                    <b className="tabular-nums">{Number(p.commission_pct).toFixed(2)}%</b>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Do spłaty: </span>
                    <b className="tabular-nums">{formatPLN(Number(p.total_to_repay))}</b>
                  </div>
                  {p.note && (
                    <div className="sm:col-span-3 text-muted-foreground line-clamp-2">{p.note}</div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
          {q.data && q.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Brak propozycji. Bądź pierwszy —{" "}
              <Link to="/negocjuj" className="underline">
                otwórz kalkulator
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
