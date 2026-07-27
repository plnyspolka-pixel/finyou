import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { formatPLN, distributionStatusLabels, loanStatusLabels } from "@/lib/labels";

export const Route = createFileRoute("/admin/dystrybucja")({
  component: DystrybucjaPage,
});

function DystrybucjaPage() {
  const [apps, setApps] = useState<any[]>([]);
  const [investors, setInvestors] = useState<any[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [selectedInv, setSelectedInv] = useState<Set<string>>(new Set());
  const [existing, setExisting] = useState<any[]>([]);

  useEffect(() => {
    void (async () => {
      const { data: a } = await supabase
        .from("loan_applications")
        .select("id, status, loan_amount, client:clients(first_name,last_name)")
        .eq("available_to_investors", true);
      setApps(a ?? []);
      const { data: i } = await supabase
        .from("investors")
        .select("id, first_name, last_name, company_name, subscription_status, investor_type")
        .eq("is_active", true);
      setInvestors(i ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!selectedApp) {
      setExisting([]);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("offer_distributions")
        .select("*, investor:investors(first_name,last_name,company_name)")
        .eq("loan_application_id", selectedApp);
      setExisting(data ?? []);
    })();
  }, [selectedApp]);

  const distribute = async (status: "szkic" | "gotowe_do_wysylki" | "wyslane") => {
    if (!selectedApp || selectedInv.size === 0) {
      toast.error("Wybierz wniosek i inwestorów");
      return;
    }
    const rows = Array.from(selectedInv).map((investor_id) => ({
      loan_application_id: selectedApp,
      investor_id,
      distribution_status: status as any,
      sent_at: status === "wyslane" ? new Date().toISOString() : null,
    }));
    const { error } = await supabase.from("offer_distributions").insert(rows);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (status === "wyslane") {
      await supabase
        .from("loan_applications")
        .update({ status: "szukamy_inwestora" as any })
        .eq("id", selectedApp);
      await supabase.from("automation_events").insert({
        automation_type: "offer_distribution_make",
        loan_application_id: selectedApp,
        status: "queued",
      });
    }
    toast.success(
      `Utworzono ${rows.length} wpis(ów) — status: ${distributionStatusLabels[status]}`,
    );
    setSelectedInv(new Set());
    if (selectedApp) {
      const { data } = await supabase
        .from("offer_distributions")
        .select("*, investor:investors(first_name,last_name,company_name)")
        .eq("loan_application_id", selectedApp);
      setExisting(data ?? []);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dystrybucja ofert</h1>
        <p className="text-sm text-muted-foreground">
          Tylko wnioski oznaczone jako „Rokuje" są dostępne.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. Wybierz wniosek</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {apps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak wniosków rokujących.</p>
            ) : (
              apps.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedApp(a.id)}
                  className={`w-full text-left border rounded-md p-3 hover:bg-accent transition ${selectedApp === a.id ? "border-primary bg-accent" : ""}`}
                >
                  <div className="font-medium">
                    {a.client ? `${a.client.first_name} ${a.client.last_name}` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatPLN(a.loan_amount)} · {loanStatusLabels[a.status]}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Wybierz inwestorów ({selectedInv.size})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {investors.map((i) => {
              const checked = selectedInv.has(i.id);
              return (
                <label
                  key={i.id}
                  className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      setSelectedInv((s) => {
                        const n = new Set(s);
                        if (v) n.add(i.id);
                        else n.delete(i.id);
                        return n;
                      });
                    }}
                  />
                  <span className="flex-1">
                    {i.company_name || `${i.first_name ?? ""} ${i.last_name ?? ""}`.trim()}
                  </span>
                  <Badge variant={i.subscription_status === "aktywny" ? "default" : "secondary"}>
                    {i.subscription_status}
                  </Badge>
                </label>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>3. Akcja</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!selectedApp || selectedInv.size === 0}
            onClick={() => void distribute("szkic")}
          >
            Zapisz jako szkic
          </Button>
          <Button
            variant="outline"
            disabled={!selectedApp || selectedInv.size === 0}
            onClick={() => void distribute("gotowe_do_wysylki")}
          >
            Oznacz jako gotowe do wysyłki
          </Button>
          <Button
            disabled={!selectedApp || selectedInv.size === 0}
            onClick={() => void distribute("wyslane")}
          >
            <Send className="mr-2 h-4 w-4" />
            Wyślij (webhook Make)
          </Button>
        </CardContent>
      </Card>

      {existing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dotychczasowe dystrybucje wybranego wniosku</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {existing.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between text-sm border rounded-md px-3 py-2"
              >
                <span>
                  {d.investor?.company_name ??
                    `${d.investor?.first_name ?? ""} ${d.investor?.last_name ?? ""}`.trim()}
                </span>
                <Badge variant="secondary">{distributionStatusLabels[d.distribution_status]}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
