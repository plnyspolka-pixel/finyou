import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Send, RefreshCw, Search, Bot, User as UserIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "sonner";
import { sendChatReply } from "@/lib/chat-inbox.functions";

type Msg = {
  id: string;
  lead_id: string | null;
  direction: string;
  content: string | null;
  created_at: string;
  metadata: any;
  status: string | null;
};

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type ChatInboxProps = {
  title?: string;
  renderLeadLink?: (leadId: string) => ReactNode;
};

/**
 * Skrzynka czatu na stronie (kanał komunikacji przychodzącej "chat").
 * Bot odpowiada automatycznie 24/7; tu operator/administrator widzi rozmowy
 * i może wejść z ręczną odpowiedzią (klient zobaczy ją w widgecie).
 */
export function ChatInbox({ title = "Czat na stronie", renderLeadLink }: ChatInboxProps) {
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendFn = useServerFn(sendChatReply);

  const { data: messages, refetch, isFetching } = useQuery({
    queryKey: ["chat-inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_communications")
        .select("id, lead_id, direction, content, created_at, metadata, status")
        .eq("channel", "chat")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
    refetchInterval: 15_000,
  });

  const leadIds = useMemo(() => {
    const set = new Set<string>();
    (messages ?? []).forEach((m) => m.lead_id && set.add(m.lead_id));
    return Array.from(set);
  }, [messages]);

  const { data: leads } = useQuery({
    queryKey: ["chat-inbox-leads", leadIds.join(",")],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, first_name, last_name")
        .in("id", leadIds);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const leadMap = useMemo(() => new Map((leads ?? []).map((l) => [l.id, l])), [leads]);

  // Klucz konwersacji: lead_id, a gdy brak — identyfikator sesji czatu.
  const conversations = useMemo(() => {
    const byKey = new Map<
      string,
      { key: string; leadId: string | null; lastAt: string; last: Msg; count: number }
    >();
    for (const m of messages ?? []) {
      const meta = (m.metadata ?? {}) as Record<string, any>;
      const sid = meta.chat_session_id ?? null;
      const key = m.lead_id ?? (sid ? `sid:${sid}` : `orphan:${m.id}`);
      const cur = byKey.get(key);
      if (!cur) byKey.set(key, { key, leadId: m.lead_id, lastAt: m.created_at, last: m, count: 1 });
      else {
        cur.count += 1;
        if (m.created_at > cur.lastAt) {
          cur.lastAt = m.created_at;
          cur.last = m;
        }
      }
    }
    return Array.from(byKey.values())
      .map((v) => ({ ...v, lead: v.leadId ? leadMap.get(v.leadId) : undefined }))
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  }, [messages, leadMap]);

  const filteredConvs = useMemo(() => {
    if (!q.trim()) return conversations;
    const needle = q.toLowerCase();
    return conversations.filter((c) => {
      const name = `${c.lead?.first_name ?? ""} ${c.lead?.last_name ?? ""}`.toLowerCase();
      return name.includes(needle) || (c.last.content ?? "").toLowerCase().includes(needle);
    });
  }, [conversations, q]);

  useEffect(() => {
    if (!selectedKey && filteredConvs[0]) setSelectedKey(filteredConvs[0].key);
  }, [filteredConvs, selectedKey]);

  const selectedConv = useMemo(
    () => filteredConvs.find((c) => c.key === selectedKey) ?? null,
    [filteredConvs, selectedKey],
  );
  const selectedLeadId = selectedConv?.leadId ?? null;

  const thread = useMemo(() => {
    if (!selectedKey) return [];
    return (messages ?? [])
      .filter((m) => {
        const meta = (m.metadata ?? {}) as Record<string, any>;
        const sid = meta.chat_session_id ?? null;
        const key = m.lead_id ?? (sid ? `sid:${sid}` : `orphan:${m.id}`);
        return key === selectedKey;
      })
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  }, [messages, selectedKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, selectedKey]);

  const selectedLead = selectedLeadId ? leadMap.get(selectedLeadId) : null;

  const sendMut = useMutation({
    mutationFn: (body: string) => sendFn({ data: { leadId: selectedLeadId!, body } }),
    onSuccess: () => {
      setReply("");
      toast.success("Odpowiedź wysłana");
      qc.invalidateQueries({ queryKey: ["chat-inbox"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się wysłać"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Odśwież
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        <Card className="p-3">
          <div className="relative mb-3">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Szukaj konwersacji…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-1">
              {filteredConvs.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">Brak konwersacji.</div>
              )}
              {filteredConvs.map((c) => {
                const active = c.key === selectedKey;
                const name = `${c.lead?.first_name ?? ""} ${c.lead?.last_name ?? ""}`.trim() || "Gość ze strony";
                return (
                  <button
                    key={c.key}
                    onClick={() => setSelectedKey(c.key)}
                    className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                      active ? "bg-muted border-primary" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium truncate">{name}</div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(c.lastAt), { addSuffix: true, locale: pl })}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {(c.last.content ?? "").slice(0, 80) || "—"}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge variant="secondary" className="text-[10px] h-4">Czat WWW</Badge>
                      <Badge variant="outline" className="text-[10px] h-4">{c.count} wiad.</Badge>
                      {!c.leadId && <Badge variant="outline" className="text-[10px] h-4">bez leada</Badge>}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        <Card className="p-4 flex flex-col">
          {!selectedKey && <div className="text-sm text-muted-foreground">Wybierz konwersację po lewej.</div>}
          {selectedKey && (
            <>
              <div className="flex items-center justify-between border-b pb-3 mb-3">
                <div className="text-lg font-semibold">
                  {`${selectedLead?.first_name ?? ""} ${selectedLead?.last_name ?? ""}`.trim() || "Gość ze strony"}
                </div>
                {selectedLeadId && renderLeadLink?.(selectedLeadId)}
              </div>

              <ScrollArea className="flex-1 h-[calc(100vh-420px)] pr-3">
                <div className="space-y-3">
                  {thread.map((m) => {
                    const inbound = m.direction === "inbound";
                    const meta = (m.metadata ?? {}) as Record<string, any>;
                    const isBot = !inbound && !meta.sent_by;
                    return (
                      <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                          inbound
                            ? "bg-muted"
                            : isBot
                            ? "bg-blue-500/10 border border-blue-500/30"
                            : "bg-primary text-primary-foreground"
                        }`}>
                          <div className="flex items-center gap-1 text-[10px] opacity-70 mb-1">
                            {inbound ? <UserIcon className="h-3 w-3" /> : isBot ? <Bot className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                            <span>{inbound ? "Klient" : isBot ? "Bot" : "Operator"}</span>
                            <span>·</span>
                            <span>{new Date(m.created_at).toLocaleString("pl-PL")}</span>
                          </div>
                          {m.content || "—"}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              <div className="border-t pt-3 mt-3">
                {!selectedLeadId ? (
                  <div className="text-xs text-muted-foreground">
                    Ta rozmowa nie ma jeszcze podpiętego leada — nie można wysłać odpowiedzi.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Napisz odpowiedź do klienta…"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim()) {
                          e.preventDefault();
                          sendMut.mutate(reply.trim());
                        }
                      }}
                    />
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-muted-foreground">Cmd/Ctrl + Enter — wyślij</div>
                      <Button
                        size="sm"
                        onClick={() => sendMut.mutate(reply.trim())}
                        disabled={!reply.trim() || sendMut.isPending}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {sendMut.isPending ? "Wysyłam…" : "Wyślij"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
