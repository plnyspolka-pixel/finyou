import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useServerFn } from "@tanstack/react-start";
import { enqueueCall } from "@/lib/elevenlabs.functions";
import { toast } from "sonner";
import { Phone, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/admin/voicebot")({
  component: VoicebotAdmin,
});

const STATUS_LABELS: Record<string,string> = {
  oczekuje: "Oczekuje", w_trakcie: "W trakcie", zakonczona: "Zakończona", blad: "Błąd", anulowana: "Anulowana",
};

function VoicebotAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [phone, setPhone] = useState("");
  const [agentId, setAgentId] = useState("");
  const enqueue = useServerFn(enqueueCall);

  const load = async () => {
    const { data } = await supabase.from("call_queue").select("*").order("created_at",{ascending:false}).limit(100);
    setRows(data ?? []);
  };
  useEffect(() => { void load(); }, []);

  const handleAdd = async () => {
    try {
      await enqueue({ data: { phoneNormalized: phone, agentId: agentId || undefined }});
      toast.success("Dodano do kolejki"); setPhone(""); void load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Voicebot — kolejka rozmów</h1>
        <Button variant="outline" onClick={()=>void load()}><RefreshCw className="mr-2 h-4 w-4"/>Odśwież</Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Dodaj numer do kolejki</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="+48..." value={phone} onChange={(e)=>setPhone(e.target.value)} />
          <Input placeholder="Agent ID (opcjonalnie)" value={agentId} onChange={(e)=>setAgentId(e.target.value)} />
          <Button onClick={handleAdd}><Phone className="mr-2 h-4 w-4"/>Dodaj</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Kolejka ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.id} className="flex items-start justify-between border rounded-md p-3 text-sm">
                <div>
                  <div className="font-medium">{r.phone_normalized}</div>
                  <div className="text-muted-foreground">Agent: {r.agent_id ?? "—"} • Próby: {r.attempts}</div>
                  {r.result_summary && <div className="mt-1 text-xs">{r.result_summary}</div>}
                </div>
                <Badge>{STATUS_LABELS[r.status] ?? r.status}</Badge>
              </div>
            ))}
            {rows.length === 0 && <div className="text-muted-foreground">Kolejka pusta.</div>}
          </div>
        </CardContent>
      </Card>
      <div className="text-xs text-muted-foreground">
        Webhook do ElevenLabs: <code>/api/public/elevenlabs-webhook</code>
      </div>
    </div>
  );
}
