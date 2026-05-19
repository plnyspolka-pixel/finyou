import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { loanStatusLabels, formatDateTime } from "@/lib/labels";

export const Route = createFileRoute("/klient/status")({
  component: KlientStatus,
});

const TIMELINE = ["nowy_lead", "w_trakcie_uzupelniania", "wniosek_kompletny", "do_analizy", "rokuje", "wyslany_do_inwestorow", "oferta_przekazana_klientowi", "zaakceptowany_przez_klienta", "do_umowy", "zamkniety"];

function KlientStatus() {
  const { user } = useAuth();
  const [app, setApp] = useState<any | null>(null);
  useEffect(() => { if (!user) return; void (async () => {
    const { data: c } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
    if (!c) return;
    const { data } = await supabase.from("loan_applications").select("*").eq("client_id", c.id).order("created_at", { ascending: false }).maybeSingle();
    setApp(data);
  })(); }, [user]);

  if (!app) return <div className="max-w-2xl"><h1 className="text-2xl font-bold">Status</h1><p className="text-sm text-muted-foreground mt-4">Brak aktywnego wniosku.</p></div>;
  const idx = TIMELINE.indexOf(app.status);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Status wniosku</h1>
        <p className="text-sm text-muted-foreground">Aktualizacja: {formatDateTime(app.updated_at)}</p>
      </div>
      <Card><CardHeader><CardTitle>Obecny status</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Badge className="text-base">{loanStatusLabels[app.status] ?? app.status}</Badge>
          <div className="space-y-1.5"><div className="flex justify-between text-xs text-muted-foreground"><span>Kompletność</span><span>{app.completeness_percent}%</span></div><Progress value={app.completeness_percent} /></div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Etapy</CardTitle></CardHeader>
        <CardContent><ol className="space-y-2 text-sm">
          {TIMELINE.map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${i <= idx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
              <span className={i <= idx ? "font-medium" : "text-muted-foreground"}>{loanStatusLabels[s]}</span>
            </li>
          ))}
        </ol></CardContent>
      </Card>
    </div>
  );
}
