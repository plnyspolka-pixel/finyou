import { createFileRoute } from "@tanstack/react-router";
import { formatDateTime } from "@/lib/labels";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { syncMetaAdAccounts, syncMetaCampaigns, listMetaOverview } from "@/lib/meta-ads.functions";
import { listMetaLeadForms, setMetaLeadFormAssignee } from "@/lib/meta-lead-forms.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Facebook } from "lucide-react";

export const Route = createFileRoute("/admin/meta")({
  component: MetaPage,
});

function MetaPage() {
  const fetchOverview = useServerFn(listMetaOverview);
  const syncAccountsFn = useServerFn(syncMetaAdAccounts);
  const syncCampaignsFn = useServerFn(syncMetaCampaigns);
  const qc = useQueryClient();
  const [busyAcc, setBusyAcc] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["meta-overview"],
    queryFn: () => fetchOverview(),
  });

  const syncAccounts = useMutation({
    mutationFn: () => syncAccountsFn(),
    onSuccess: (r) => { toast.success(`Zsynchronizowano ${r.count} kont`); qc.invalidateQueries({ queryKey: ["meta-overview"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const syncCamps = async (accountId: string) => {
    setBusyAcc(accountId);
    try {
      const r = await syncCampaignsFn({ data: { accountId } });
      toast.success(`Pobrano ${r.count} kampanii`);
      qc.invalidateQueries({ queryKey: ["meta-overview"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyAcc(null); }
  };

  const fetchForms = useServerFn(listMetaLeadForms);
  const setAssigneeFn = useServerFn(setMetaLeadFormAssignee);
  const { data: formsData } = useQuery({
    queryKey: ["meta-lead-forms"],
    queryFn: () => fetchForms(),
  });
  const setAssignee = useMutation({
    mutationFn: (vars: { formId: string; userId: string | null }) => setAssigneeFn({ data: vars }),
    onSuccess: () => { toast.success("Zapisano przypisanie"); qc.invalidateQueries({ queryKey: ["meta-lead-forms"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Facebook className="h-6 w-6" /> Meta Ads</h1>
          <p className="text-sm text-muted-foreground">Konta reklamowe Facebook/Instagram, kampanie i leady.</p>
        </div>
        <Button onClick={() => syncAccounts.mutate()} disabled={syncAccounts.isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncAccounts.isPending ? "animate-spin" : ""}`} />
          Pobierz konta
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Konta reklamowe</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="text-muted-foreground text-sm">Ładowanie…</div> :
           !data?.accounts.length ? <div className="text-sm text-muted-foreground">Brak kont. Kliknij „Pobierz konta".</div> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nazwa</TableHead><TableHead>Waluta</TableHead>
                <TableHead>Wydatki</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.accounts.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}<div className="text-xs text-muted-foreground">{a.business_name}</div></TableCell>
                    <TableCell>{a.currency}</TableCell>
                    <TableCell>{Number(a.amount_spent ?? 0).toFixed(2)}</TableCell>
                    <TableCell><Badge variant={a.account_status === 1 ? "default" : "secondary"}>{a.account_status === 1 ? "Aktywne" : `#${a.account_status}`}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={busyAcc === a.id} onClick={() => syncCamps(a.id)}>
                        <RefreshCw className={`h-3 w-3 mr-1 ${busyAcc === a.id ? "animate-spin" : ""}`} />
                        Kampanie
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Kampanie (Top 50 wg wydatków)</CardTitle></CardHeader>
        <CardContent>
          {!data?.campaigns.length ? <div className="text-sm text-muted-foreground">Brak danych. Najpierw pobierz kampanie dla konta.</div> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nazwa</TableHead><TableHead>Status</TableHead>
                <TableHead>Wydatki</TableHead><TableHead>Wyśw.</TableHead><TableHead>CTR</TableHead>
                <TableHead>Leady</TableHead><TableHead>CPL</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.campaigns.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}<div className="text-xs text-muted-foreground">{c.objective}</div></TableCell>
                    <TableCell><Badge variant={c.status === "ACTIVE" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                    <TableCell>{Number(c.spend ?? 0).toFixed(2)}</TableCell>
                    <TableCell>{Number(c.impressions ?? 0).toLocaleString("pl-PL")}</TableCell>
                    <TableCell>{Number(c.ctr ?? 0).toFixed(2)}%</TableCell>
                    <TableCell>{c.leads_count ?? 0}</TableCell>
                    <TableCell>{Number(c.cost_per_lead ?? 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historia synchronizacji</CardTitle></CardHeader>
        <CardContent>
          {!data?.logs.length ? <div className="text-sm text-muted-foreground">Brak wpisów.</div> : (
            <div className="space-y-2 text-sm">
              {data.logs.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between border-b pb-1">
                  <div>
                    <Badge variant={l.status === "success" ? "default" : l.status === "error" ? "destructive" : "secondary"} className="mr-2">{l.status}</Badge>
                    {l.sync_type} — {l.items_synced ?? 0} szt.
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(l.started_at)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
