import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPLN } from "@/lib/labels";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/propozycje/$id")({
  head: () => ({
    meta: [
      { title: "Propozycja pożyczki — Finance You" },
      {
        name: "description",
        content: "Szczegóły propozycji pożyczki z parametrami i harmonogramem spłat.",
      },
    ],
  }),
  component: PropozycjaDetail,
});

type ScheduleRow = {
  idx: number;
  date: string;
  rata: number;
  kap: number;
  ods: number;
  saldo: number;
};

function PropozycjaDetail() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["loan-proposal", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_loan_proposal", { _id: id });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <Link
          to="/propozycje"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Wszystkie propozycje
        </Link>

        {q.isLoading && <p className="text-sm text-muted-foreground">Wczytuję...</p>}
        {q.error && <p className="text-sm text-destructive">Błąd: {(q.error as Error).message}</p>}
        {q.data === null && (
          <p className="text-sm text-muted-foreground">
            Propozycja nie istnieje lub nie jest publiczna.
          </p>
        )}

        {q.data && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">Propozycja pożyczki</h1>
                <p className="text-sm text-muted-foreground">
                  Utworzono: {new Date(q.data.created_at).toLocaleString("pl-PL")}
                </p>
              </div>
              <Badge variant={q.data.status === "open" ? "default" : "secondary"}>
                {q.data.status}
              </Badge>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Parametry pożyczki</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between">
                  <span>Kwota nominalna</span>
                  <b className="tabular-nums">{formatPLN(Number(q.data.amount))}</b>
                </div>
                <div className="flex justify-between">
                  <span>Okres</span>
                  <b>{q.data.months} mies.</b>
                </div>
                <div className="flex justify-between">
                  <span>Oprocentowanie</span>
                  <b className="tabular-nums">{Number(q.data.annual_rate).toFixed(2)}%</b>
                </div>
                <div className="flex justify-between">
                  <span>Prowizja</span>
                  <b className="tabular-nums">
                    {Number(q.data.commission_pct).toFixed(2)}% (
                    {formatPLN(Number(q.data.commission_pln))})
                  </b>
                </div>
                <div className="flex justify-between">
                  <span>Rata miesięczna</span>
                  <b className="tabular-nums">{formatPLN(Number(q.data.capped_rata))}</b>
                </div>
                <div className="flex justify-between">
                  <span>Rata balonowa</span>
                  <b className="tabular-nums">{formatPLN(Number(q.data.balloon))}</b>
                </div>
                <div className="flex justify-between">
                  <span>Odsetki łącznie</span>
                  <b className="tabular-nums">{formatPLN(Number(q.data.total_interest))}</b>
                </div>
                <div className="flex justify-between sm:col-span-2 border-t pt-2">
                  <span>Łączna kwota do spłaty</span>
                  <b className="tabular-nums">{formatPLN(Number(q.data.total_to_repay))}</b>
                </div>
              </CardContent>
            </Card>

            {q.data.note && (
              <Card>
                <CardHeader>
                  <CardTitle>Notatka</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div className="whitespace-pre-wrap">{q.data.note}</div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Harmonogram spłat</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[480px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Termin</TableHead>
                        <TableHead>Rata</TableHead>
                        <TableHead>Kapitał</TableHead>
                        <TableHead>Odsetki</TableHead>
                        <TableHead>Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(Array.isArray(q.data.schedule)
                        ? (q.data.schedule as unknown as ScheduleRow[])
                        : []
                      ).map((r) => (
                        <TableRow key={r.idx}>
                          <TableCell>{r.idx}</TableCell>
                          <TableCell>{r.date}</TableCell>
                          <TableCell className="tabular-nums">{formatPLN(r.rata)}</TableCell>
                          <TableCell className="tabular-nums">{formatPLN(r.kap)}</TableCell>
                          <TableCell className="tabular-nums">{formatPLN(r.ods)}</TableCell>
                          <TableCell className="tabular-nums">{formatPLN(r.saldo)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
