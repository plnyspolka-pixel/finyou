import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatPLN, offerStatusLabels, formatDate } from "@/lib/labels";
import { Check, X, Send, FileSignature } from "lucide-react";
import { createProfileFromOffer } from "@/lib/client-profile.functions";

export const Route = createFileRoute("/admin/oferty")({
  component: AdminOferty,
});

function AdminOferty() {
  const navigate = useNavigate();
  const prefillFn = useServerFn(createProfileFromOffer);
  const [rows, setRows] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("investor_offers")
      .select(
        "*, investor:investors(first_name,last_name,company_name), loan:loan_applications(id, client:clients(first_name,last_name))",
      )
      .order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => {
    void load();
  }, []);

  const update = async (id: string, status: string) => {
    const { error } = await supabase
      .from("investor_offers")
      .update({ offer_status: status as any, admin_verified_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Zaktualizowano");
    void load();
  };

  const goToContract = async (offerId: string) => {
    setBusyId(offerId);
    try {
      const res = await prefillFn({ data: { offerId } });
      toast.success("Profil umowy uzupełniony danymi z wniosku i oferty");
      void navigate({ to: "/admin/kreator-pozyczki", search: { profileId: res.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się przygotować profilu");
    } finally {
      setBusyId(null);
    }
  };

  const filtered =
    statusFilter === "all" ? rows : rows.filter((r) => r.offer_status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Oferty inwestorów</h1>
          <p className="text-sm text-muted-foreground">
            Weryfikacja, zatwierdzanie, wysyłka do klienta.
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            {Object.entries(offerStatusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lista ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Klient</TableHead>
                  <TableHead>Inwestor</TableHead>
                  <TableHead>Kwota</TableHead>
                  <TableHead>Rata</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{formatDate(o.created_at)}</TableCell>
                    <TableCell>
                      {o.loan?.client
                        ? `${o.loan.client.first_name} ${o.loan.client.last_name}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {o.investor?.company_name ??
                        `${o.investor?.first_name ?? ""} ${o.investor?.last_name ?? ""}`.trim()}
                    </TableCell>
                    <TableCell>
                      {formatPLN(o.proposed_amount)} · {o.period_months} mies.
                    </TableCell>
                    <TableCell>{formatPLN(o.estimated_monthly_payment)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{offerStatusLabels[o.offer_status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end flex-wrap">
                        {o.offer_status === "zlozona" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void update(o.id, "zatwierdzona_przez_administratora")}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void update(o.id, "odrzucona_przez_administratora")}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {o.offer_status === "zatwierdzona_przez_administratora" && (
                          <Button size="sm" onClick={() => void update(o.id, "wyslana_do_klienta")}>
                            <Send className="mr-1 h-3 w-3" />
                            Wyślij klientowi
                          </Button>
                        )}
                        {o.offer_status === "zaakceptowana_przez_klienta" && (
                          <Button
                            size="sm"
                            disabled={busyId === o.id}
                            onClick={() => void goToContract(o.id)}
                          >
                            <FileSignature className="mr-1 h-3 w-3" />
                            {busyId === o.id ? "Przygotowuję…" : "Kreator umów"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
