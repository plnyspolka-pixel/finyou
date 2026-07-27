import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
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
import { Share2, Users } from "lucide-react";
import { formatPLN, formatDate } from "@/lib/labels";
import { getAffiliateStructure } from "@/lib/affiliate/partner.functions";

export const Route = createFileRoute("/posrednik/struktura")({
  component: StrukturaPage,
});

const LEVEL_LABELS: Record<number, string> = {
  1: "Poziom 1 — bezpośrednio zaproszeni",
  2: "Poziom 2 — zaproszeni przez poziom 1",
  3: "Poziom 3 — zaproszeni przez poziom 2",
};

function StrukturaPage() {
  const fn = useServerFn(getAffiliateStructure);
  const q = useQuery({ queryKey: ["affiliate-structure"], queryFn: () => fn() });

  const levels = (q.data as any)?.levels ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Share2 className="h-6 w-6" /> Struktura partnerska
        </h1>
        <p className="text-sm text-muted-foreground">
          Twoja sieć do 3 poziomów. Dane partnerów z niższych poziomów są ograniczone (bez danych
          osobowych).
        </p>
      </div>

      {q.isLoading ? (
        <p className="text-muted-foreground">Ładowanie…</p>
      ) : levels.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Brak partnerów w strukturze. Udostępnij swój link polecający, aby zacząć budować sieć.
          </CardContent>
        </Card>
      ) : (
        levels.map((lvl: any) => (
          <Card key={lvl.depth}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" /> {LEVEL_LABELS[lvl.depth]}
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  Aktywni: <b className="text-foreground">{lvl.activeCount}</b>/{lvl.totalCount} ·
                  Prowizja z poziomu:{" "}
                  <b className="text-foreground">{formatPLN(lvl.commissionSum)}</b>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {lvl.members.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  Brak partnerów na tym poziomie.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Dołączył</TableHead>
                      <TableHead className="text-right">Zdarzenia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lvl.members.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.displayName}</TableCell>
                        <TableCell>
                          {m.active ? (
                            <Badge className="bg-emerald-100 text-emerald-800" variant="secondary">
                              Aktywny
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                              Nieaktywny
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(m.joinedAt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.eventsCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
