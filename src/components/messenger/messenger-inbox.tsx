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
import { MessageCircle, Send, RefreshCw, Search, Bot, User as UserIcon, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "sonner";
import { sendMessengerReply } from "@/lib/messenger-inbox.functions";
import { generateAgentDraft } from "@/lib/text-agent-draft.functions";

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
  messenger_psid: string | null;
  instagram_igsid: string | null;
};

type MessengerInboxProps = {
  /** Tytuł nagłówka sekcji. */
  title?: string;
  /** Opcjonalny odnośnik do karty leada (różny w panelu admina i operatora). */
  renderLeadLink?: (leadId: string) => ReactNode;
};

/**
 * Współdzielona skrzynka Messenger / Instagram Direct.
 * Używana zarówno w panelu administratora, jak i operatora — operator widzi
 * rozmowy i może odpowiadać jako Strona (przez Meta Graph API).
 */
export function MessengerInbox({ title = "Messenger / Instagram DM", renderLeadLink }: MessengerInboxProps) {
  const qc = useQueryClient();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendFn = useServerFn(sendMessengerReply);
  const draftFn = useServerFn(generateAgentDraft);

  const { data: messages, refetch, isFetching } = useQuery({
    queryKey: ["messenger-inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_communications")
        .select("id, lead_id, direction, content, created_at, metadata, status")
        .eq("channel", "messenger")
        .order("created_at", { ascending: false })
        .limit(500);
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
    queryKey: ["messenger-inbox-leads", leadIds.join(",")],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, first_name, last_name, messenger_psid, instagram_igsid")
        .in("id", leadIds);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const leadMap = useMemo(() => new Map((leads ?? []).map((l) => [l.id, l])), [leads]);

  // Grupuj wiadomości po lead_id, weź najnowszą jako podgląd
  const conversations = useMemo(() => {
    const byLead = new Map<string, { lastAt: string; last: Msg; count: number }>();
    for (const m of messages ?? []) {
      if (!m.lead_id) continue;
      const cur = byLead.get(m.lead_id);
      if (!cur) byLead.set(m.lead_id, { lastAt: m.created_at, last: m, count: 1 });
      else {
        cur.count += 1;
        if (m.created_at > cur.lastAt) {
          cur.lastAt = m.created_at;
          cur.last = m;
        }
      }
    }
    return Array.from(byLead.entries())
      .map(([leadId, v]) => ({ leadId, ...v, lead: leadMap.get(leadId) }))
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
    if (!selectedLeadId && filteredConvs[0]) setSelectedLeadId(filteredConvs[0].leadId);
  }, [filteredConvs, selectedLeadId]);

  const thread = useMemo(() => {
    return (messages ?? [])
      .filter((m) => m.lead_id === selectedLeadId)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  }, [messages, selectedLeadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, selectedLeadId]);

  const selectedLead = selectedLeadId ? leadMap.get(selectedLeadId) : null;
  const canReply = !!(selectedLead && (selectedLead.messenger_psid || selectedLead.instagram_igsid));

  const sendMut = useMutation({
    mutationFn: (body: string) => sendFn({ data: { leadId: selectedLeadId!, body } }),
    onSuccess: () => {
      setReply("");
      toast.success("Wiadomość wysłana");
      qc.invalidateQueries({ queryKey: ["messenger-inbox"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się wysłać"),
  });

  // Ostatnia wiadomość klienta w wątku — na nią odpisze bot.
  const lastInbound = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      if (thread[i].direction === "inbound") return thread[i];
    }
    return null;
  }, [thread]);

  const draftMut = useMutation({
    mutationFn: () =>
      draftFn({
        data: {
          channel: selectedLead?.instagram_igsid ? "instagram" : "messenger",
          mode: "reply",
          leadId: selectedLeadId,
          incomingMessage: lastInbound?.content ?? null,
        },
      }),
    onSuccess: (res: { text: string }) => {
      const text = (res?.text ?? "").trim();
      if (!text) {
        toast.error("Bot nie zwrócił treści");
        return;
      }
      setReply(text);
      toast.success("Szkic wygenerowany");
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się wygenerować"),
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
                const active = c.leadId === selectedLeadId;
                const name = `${c.lead?.first_name ?? ""} ${c.lead?.last_name ?? ""}`.trim() || "Nieznany klient";
                const platform = c.lead?.instagram_igsid ? "Instagram" : "Messenger";
                return (
                  <button
                    key={c.leadId}
                    onClick={() => setSelectedLeadId(c.leadId)}
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
                      <Badge variant="secondary" className="text-[10px] h-4">{platform}</Badge>
                      <Badge variant="outline" className="text-[10px] h-4">{c.count} wiad.</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        <Card className="p-4 flex flex-col">
          {!selectedLeadId && <div className="text-sm text-muted-foreground">Wybierz konwersację po lewej.</div>}
          {selectedLeadId && (
            <>
              <div className="flex items-center justify-between border-b pb-3 mb-3">
                <div>
                  <div className="text-lg font-semibold">
                    {`${selectedLead?.first_name ?? ""} ${selectedLead?.last_name ?? ""}`.trim() || "Nieznany klient"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedLead?.instagram_igsid ? `Instagram IGSID: ${selectedLead.instagram_igsid}` : selectedLead?.messenger_psid ? `Messenger PSID: ${selectedLead.messenger_psid}` : "brak ID"}
                  </div>
                </div>
                {renderLeadLink?.(selectedLeadId)}
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
                {!canReply ? (
                  <div className="text-xs text-muted-foreground">
                    Ten lead nie ma PSID/IGSID — nie można wysłać odpowiedzi bezpośredniej.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Napisz odpowiedź jako Strona…"
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
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => draftMut.mutate()}
                          disabled={draftMut.isPending || sendMut.isPending}
                          title="Wygeneruj odpowiedź botem (Gemini Pro)"
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          {draftMut.isPending ? "Piszę…" : "Odpisz AI"}
                        </Button>
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
