import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, Clock, CheckCircle2, BanknoteIcon, XCircle } from "lucide-react";

export const Route = createFileRoute("/posrednik/rozliczenia")({
  component: SettlementsPage,
});

type Settlement = {
  id: string;
  loan_application_id: string | null;
  client_name: string | null;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "paid" | "cancelled";
  period_label: string | null;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
};

const STATUS_META: Record<Settlement["status"], { label: string; color: string }> = {
  pending: { label: "Oczekuje", color: "bg-amber-100 text-amber-800" },
  approved: { label: "Zatwierdzone", color: "bg-blue-100 text-blue-800" },
  paid: { label: "Wypłacone", color: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Anulowane", color: "bg-rose-100 text-rose-800" },
};

function fmtPLN(n: number, c: string) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: c || "PLN" }).format(n);
}

function SettlementsPage() {
  const [items, setItems] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("broker_settlements")
        .select("*")
        .eq("broker_user_id", u.user.id)
        .order("created_at", { ascending: false });
      if (!error) setItems((data ?? []) as Settlement[]);
      setLoading(false);
    })();
  }, []);

  const totals = useMemo(() => {
    const sum = (s: Settlement["status"]) =>
      items.filter((x) => x.status === s).reduce((acc, x) => acc + Number(x.amount || 0), 0);
    return {
      pending: sum("pending"),
      approved: sum("approved"),
      paid: sum("paid"),
      cancelled: sum("cancelled"),
    };
  }, [items]);

  const tiles = [
    { label: "Oczekuje", value: totals.pending, icon: Clock, color: "text-amber-600" },
    { label: "Zatwierdzone", value: totals.approved, icon: CheckCircle2, color: "text-blue-600" },
    { label: "Wypłacone (suma)", value: totals.paid, icon: BanknoteIcon, color: "text-emerald-600" },
    { label: "Anulowane", value: totals.cancelled, icon: XCircle, color: "text-rose-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" /> Rozliczenia
        </h1>
        <p className="text-sm text-muted-foreground">
          Twoje prowizje za polecone wnioski. Status aktualizowany przez administratora po wypłacie pożyczki.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t.label}</span>
                <t.icon className={`h-4 w-4 ${t.color}`} />
              </div>
              <div className={`text-xl font-bold mt-1 ${t.color}`}>{fmtPLN(t.value, "PLN")}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historia</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-muted-foreground">Ładowanie...</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-muted-foreground">
              Brak rozliczeń. Pojawią się tu, gdy administrator naliczy prowizję za Twoich klientów.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Klient / wniosek</TableHead>
                  <TableHead>Okres</TableHead>
                  <TableHead className="text-right">Kwota</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Wypłata</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => {
                  const meta = STATUS_META[s.status];
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">{new Date(s.created_at).toLocaleDateString("pl-PL")}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{s.client_name || "—"}</div>
                        {s.notes && <div className="text-xs text-muted-foreground">{s.notes}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{s.period_label || "—"}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {fmtPLN(Number(s.amount), s.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge className={meta.color} variant="secondary">{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.paid_at ? new Date(s.paid_at).toLocaleDateString("pl-PL") : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
