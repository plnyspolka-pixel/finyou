import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wand2, Users, FileText, Phone, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/posrednik/")({
  component: OperatorIndex,
});

function OperatorIndex() {
  const [stats, setStats] = useState({ total: 0, nowy: 0, w_kontakcie: 0, dzisiaj: 0, voicebot24h: 0 });

  useEffect(() => {
    (async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [all, nowy, kontakt, dzisiaj, voicebot] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "nowy"),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "w_kontakcie"),
        supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString()),
        supabase.from("lead_communications").select("id", { count: "exact", head: true }).eq("channel", "voicebot_call").gte("created_at", since24),
      ]);
      setStats({
        total: all.count ?? 0,
        nowy: nowy.count ?? 0,
        w_kontakcie: kontakt.count ?? 0,
        dzisiaj: dzisiaj.count ?? 0,
        voicebot24h: voicebot.count ?? 0,
      });
    })();
  }, []);

  const tiles = [
    { label: "Wszystkie leady", value: stats.total, icon: Users, color: "text-foreground" },
    { label: "Nowe", value: stats.nowy, icon: AlertCircle, color: "text-orange-600" },
    { label: "W kontakcie", value: stats.w_kontakcie, icon: CheckCircle2, color: "text-blue-600" },
    { label: "Nowe dzisiaj", value: stats.dzisiaj, icon: Users, color: "text-emerald-600" },
    { label: "Voicebot (24h)", value: stats.voicebot24h, icon: Phone, color: "text-purple-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pulpit operatora</h1>
        <p className="text-sm text-muted-foreground">Szybki podgląd leadów, kontaktów i generowanie dokumentów.</p>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t.label}</span>
                <t.icon className={`h-4 w-4 ${t.color}`} />
              </div>
              <div className={`text-2xl font-bold mt-1 ${t.color}`}>{t.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/posrednik/leady">
          <Card className="hover:bg-accent/40 transition h-full">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Leady (wszystkie)</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Pełna lista leadów z transkryptami voicebota, historią followupów, oceną jakości CAPI i przyciskiem „Zadzwoń" z mobila.</CardContent>
          </Card>
        </Link>
        <Link to="/posrednik/kreator-dokumentow">
          <Card className="hover:bg-accent/40 transition h-full">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wand2 className="h-4 w-4" /> Kreator dokumentów</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">31 wzorów B2B: umowy, windykacja, oświadczenia, pisma sądowe. Generuj DOCX, doliczaj prowizję pośrednika.</CardContent>
          </Card>
        </Link>
        <Link to="/admin/kreator-pozyczki">
          <Card className="hover:bg-accent/40 transition h-full">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Ręczny wniosek</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Dodaj wniosek w imieniu klienta z dedupem po PESEL/NIP/email/telefon. (Otwiera kreator pożyczki.)</CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
