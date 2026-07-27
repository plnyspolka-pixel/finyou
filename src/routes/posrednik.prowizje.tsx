import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
import { Coins } from "lucide-react";
import { formatPLN, formatDate } from "@/lib/labels";
import {
  commissionStatusLabels,
  commissionStatusColors,
  settlementTypeLabels,
  basisTypeLabels,
} from "@/lib/affiliate/labels";
import { ComplianceNotice } from "@/components/affiliate/compliance-notice";
import { getAffiliateCommissions } from "@/lib/affiliate/partner.functions";

export const Route = createFileRoute("/posrednik/prowizje")({
  component: ProwizjePage,
});

function ProwizjePage() {
  const fn = useServerFn(getAffiliateCommissions);
  const q = useQuery({ queryKey: ["affiliate-commissions"], queryFn: () => fn() });
  const items = (q.data as any[]) ?? [];

  const totals = useMemo(() => {
    const sum = (pred: (c: any) => boolean) =>
      items.filter(pred).reduce((s, c) => s + Number(c.gross_amount || 0), 0);
    return {
      doZatwierdzenia: sum((c) =>
        [
          "calculated",
          "pending_admin_approval",
          "requires_invoice",
          "requires_unregistered_activity_statement",
          "requires_business_registration",
        ].includes(c.status),
      ),
      zatwierdzone: sum((c) => ["approved", "payable"].includes(c.status)),
      wyplacone: sum((c) => c.status === "paid"),
    };
  }, [items]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Coins className="h-6 w-6" /> Prowizje sieciowe
        </h1>
        <p className="text-sm text-muted-foreground">
          Prowizje naliczone od realnych zdarzeń gospodarczych w Twojej sieci (do 3 poziomów).
        </p>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Do zatwierdzenia</div>
            <div className="text-xl font-bold text-amber-600">
              {formatPLN(totals.doZatwierdzenia)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Zatwierdzone</div>
            <div className="text-xl font-bold text-blue-600">{formatPLN(totals.zatwierdzone)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Wypłacone</div>
            <div className="text-xl font-bold text-emerald-600">{formatPLN(totals.wyplacone)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Historia prowizji</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? (
            <p className="p-4 text-muted-foreground">Ładowanie…</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-muted-foreground">
              Brak prowizji. Pojawią się tu po realnych zdarzeniach gospodarczych w Twojej sieci.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Poziom</TableHead>
                    <TableHead>Podstawa</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead className="text-right">Kwota</TableHead>
                    <TableHead>Okres</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">{formatDate(c.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">P{c.network_level}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {basisTypeLabels[c.basis_type] ?? c.basis_type}
                      </TableCell>
                      <TableCell className="text-xs">
                        {settlementTypeLabels[c.settlement_type] ?? c.settlement_type}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatPLN(c.gross_amount)}
                      </TableCell>
                      <TableCell className="text-xs">
                        Q{c.tax_quarter} {c.tax_year}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={commissionStatusColors[c.status] ?? "bg-slate-100"}
                          variant="secondary"
                        >
                          {commissionStatusLabels[c.status] ?? c.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ComplianceNotice />
    </div>
  );
}
