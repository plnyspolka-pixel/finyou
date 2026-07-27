import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendChatMessage } from "@/lib/chat.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Props {
  threadId: string;
  senderRole: "klient" | "inwestor";
  title?: string;
}

export function ChatThreadView({ threadId, senderRole, title }: Props) {
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const send = useServerFn(sendChatMessage);

  const load = async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at");
    setMessages(data ?? []);
  };
  useEffect(() => {
    void load();
  }, [threadId]);

  useEffect(() => {
    const ch = supabase
      .channel(`chat:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => setMessages((prev) => [...prev, payload.new as any]),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [threadId]);

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      const r = await send({ data: { threadId, senderRole, body } });
      if (r.flags.length) toast.warning(`Wiadomość zmoderowana: ${r.flags.join(", ")}`);
      setBody("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title ?? "Rozmowa"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 max-h-96 overflow-y-auto p-2 bg-muted/30 rounded-md">
          {messages.map((m) => {
            const mine = m.sender_role === senderRole;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-md px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-card border"}`}
                >
                  <div>{m.body_filtered ?? m.body}</div>
                  {Array.isArray(m.moderation_flags) && m.moderation_flags.length > 0 && (
                    <div className="mt-1 flex gap-1">
                      {m.moderation_flags.map((f: string) => (
                        <Badge key={f} variant="destructive" className="text-[10px]">
                          AI: {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6">
              Brak wiadomości. Napisz pierwszą.
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Napisz wiadomość…"
            rows={2}
          />
          <Button onClick={handleSend} disabled={sending}>
            Wyślij
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          AI moderuje wiadomości — numery, e-maile, linki i nazwy komunikatorów są ukrywane. Cała
          komunikacja odbywa się w platformie.
        </p>
      </CardContent>
    </Card>
  );
}
