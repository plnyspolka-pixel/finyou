import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { prepareContractForParties } from "@/lib/contract-prep.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatPLN, offerStatusLabels } from "@/lib/labels";
import { Check, X, ChevronDown, ChevronUp, FileSignature } from "lucide-react";

export const Route = createFileRoute("/klient/oferta")({
  component: KlientOferta,
});

function KlientOferta() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const load = async () => {
    if (!user) return;
    const { data: c } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
    if (!c) return;
    const { data: ls } = await supabase.from("loan_applications").select("id").eq("client_id", c.id);
    const ids = (ls ?? []).map((l) => l.id);
    if (ids.length === 0) return;
    const { data } = await supabase.from("investor_offers").select("*").in("loan_application_id", ids).in("offer_status", ["zlozona", "wyslana_do_klienta", "zaakceptowana_przez_klienta", "odrzucona_przez_klienta"]).order("created_at", { ascending: false });
    setOffers(data ?? []);
  };
  useEffect(() => { void load(); }, [user]);

  const decide = async (id: string, status: "zaakceptowana_przez_klienta" | "odrzucona_przez_klienta") => {
    const { error } = await supabase.from("investor_offers").update({ offer_status: status as any, client_decision_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Zapisano decyzję"); void load();
  };

  const toggleSchedule = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Oferty inwestorów</h1>
      {offers.length === 0 ? <p className="text-sm text-muted-foreground">Brak ofert do wyświetlenia.</p> :
        offers.map((o) => {
          const sched: Array<{ idx: number; date: string; rata: number }> = o.schedule ?? [];
          const isOpen = !!expanded[o.id];
          return (
            <Card key={o.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Oferta {formatPLN(o.proposed_amount)}</CardTitle>
                <Badge>{offerStatusLabels[o.offer_status]}</Badge>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="grid gap-1 md:grid-cols-2">
                  <div><span className="text-muted-foreground">Okres:</span> <b>{o.period_months} mies.</b></div>
                  <div><span className="text-muted-foreground">Zysk roczny:</span> <b>{o.expected_yearly_yield ?? "—"}%</b></div>
                  <div><span className="text-muted-foreground">Rata miesięczna:</span> <b>{formatPLN(o.estimated_monthly_payment)}</b></div>
                  <div><span className="text-muted-foreground">Całkowity koszt:</span> <b>{formatPLN(o.estimated_total_cost)}</b></div>
                  <div><span className="text-muted-foreground">Spłata:</span> {o.repayment_type}</div>
                  {o.has_balloon && <div><span className="text-muted-foreground">Balon:</span> {formatPLN(o.balloon_amount)}</div>}
                </div>

                {sched.length > 0 && (
                  <div className="pt-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleSchedule(o.id)} className="h-8 px-2 text-xs">
                      {isOpen ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
                      {isOpen ? "Ukryj harmonogram" : "Pokaż harmonogram"}
                    </Button>
                    {isOpen && (
                      <div className="mt-2 rounded-lg border bg-card max-h-72 overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 sticky top-0">
                            <tr className="text-left">
                              <th className="px-3 py-2 font-medium">#</th>
                              <th className="px-3 py-2 font-medium">Data</th>
                              <th className="px-3 py-2 font-medium text-right">Rata</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sched.map((r) => (
                              <tr key={r.idx} className="border-t">
                                <td className="px-3 py-2 tabular-nums">{r.idx}</td>
                                <td className="px-3 py-2 tabular-nums">{r.date}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatPLN(r.rata)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {(o.offer_status === "wyslana_do_klienta" || o.offer_status === "zlozona") && (
                  <div className="flex gap-2 pt-2">
                    <Button onClick={() => void decide(o.id, "zaakceptowana_przez_klienta")} className="bg-emerald-600 hover:bg-emerald-600/90"><Check className="mr-2 h-4 w-4" />Akceptuję</Button>
                    <Button variant="destructive" onClick={() => void decide(o.id, "odrzucona_przez_klienta")}><X className="mr-2 h-4 w-4" />Odrzucam</Button>
                  </div>
                )}
                {o.offer_status === "zaakceptowana_przez_klienta" && (
                  <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
                    <p className="font-medium text-emerald-700 dark:text-emerald-300">Oferta zaakceptowana — przechodzimy do umowy.</p>
                    <p className="text-muted-foreground mt-1">
                      Operator Finance You przygotuje umowę pożyczki w kreatorze umów. Dane z Twojego wniosku oraz z profilu inwestora zostaną zaciągnięte automatycznie. Skontaktujemy się aby uzgodnić termin podpisania.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
