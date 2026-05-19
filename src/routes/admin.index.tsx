import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loanStatusLabels } from "@/lib/labels";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

const kpiStatuses: Array<{ key: string; label: string }> = [
  { key: "nowy_lead", label: "Nowe leady" },
  { key: "w_trakcie_uzupelniania", label: "Wnioski niekompletne" },
  { key: "w_follow_upie", label: "W follow-upie" },
  { key: "wniosek_kompletny", label: "Wnioski kompletne" },
  { key: "do_analizy", label: "Do analizy" },
  { key: "rokuje", label: "Rokujące" },
  { key: "wyslany_do_inwestorow", label: "Wysłane" },
  { key: "oferta_od_inwestora", label: "Oferty od inwestorów" },
  { key: "oferta_przekazana_klientowi", label: "Oferty u klientów" },
  { key: "zamkniety", label: "Sprawy zamknięte" },
];

function AdminDashboard() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [bySource, setBySource] = useState<Record<string, number>>({});
  const [byChannel, setByChannel] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [{ data: apps }, { data: contacts }] = await Promise.all([
        supabase.from("loan_applications").select("status, source"),
        supabase.from("contact_events").select("channel"),
      ]);
      const c: Record<string, number> = {};
      const s: Record<string, number> = {};
      const src: Record<string, number> = {};
      (apps ?? []).forEach((a) => {
        c[a.status] = (c[a.status] ?? 0) + 1;
        s[a.status] = (s[a.status] ?? 0) + 1;
        const k = a.source ?? "brak";
        src[k] = (src[k] ?? 0) + 1;
      });
      const ch: Record<string, number> = {};
      (contacts ?? []).forEach((e) => { ch[e.channel] = (ch[e.channel] ?? 0) + 1; });
      setCounts(c); setByStatus(s); setBySource(src); setByChannel(ch);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pulpit</h1>
        <p className="text-sm text-muted-foreground">Przegląd kluczowych wskaźników operacyjnych.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {kpiStatuses.map((k) => (
          <Card key={k.key}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-foreground">{loading ? "…" : (counts[k.key] ?? 0)}</div></CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Wnioski wg statusu</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {Object.keys(loanStatusLabels).map((k) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-muted-foreground">{loanStatusLabels[k]}</span>
                <span className="font-medium text-foreground">{byStatus[k] ?? 0}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Leady wg źródła</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {Object.entries(bySource).length === 0 ? <p className="text-muted-foreground">Brak danych.</p> : Object.entries(bySource).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Kontakty wg kanału</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {Object.entries(byChannel).length === 0 ? <p className="text-muted-foreground">Brak danych.</p> : Object.entries(byChannel).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between"><span className="text-muted-foreground capitalize">{k}</span><span className="font-medium">{v}</span></div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
