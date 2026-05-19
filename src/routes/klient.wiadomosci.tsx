import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { ChatThreadView } from "@/components/chat-thread-view";

export const Route = createFileRoute("/klient/wiadomosci")({
  component: ClientMessages,
});

function ClientMessages() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: c } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
      if (!c) return;
      const { data } = await supabase.from("chat_threads").select("*").eq("client_id", c.id).order("updated_at",{ascending:false});
      setThreads(data ?? []);
      if (data?.[0]) setActive(data[0].id);
    })();
  }, [user]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Wiadomości od inwestorów</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1"><CardContent className="p-2 space-y-1">
          {threads.map(t => (
            <button key={t.id} onClick={()=>setActive(t.id)}
              className={`w-full text-left p-2 rounded text-sm hover:bg-accent ${active===t.id ? "bg-accent" : ""}`}>
              Inwestor <code className="text-xs">{t.investor_id.slice(0,8)}</code>
            </button>
          ))}
          {threads.length === 0 && <div className="text-sm text-muted-foreground p-2">Brak wiadomości.</div>}
        </CardContent></Card>
        <div className="md:col-span-2">
          {active && <ChatThreadView threadId={active} senderRole="klient"/>}
        </div>
      </div>
    </div>
  );
}
