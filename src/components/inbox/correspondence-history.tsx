import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Inbox, Send, Paperclip, History } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

type HistoryMsg = {
  id: string;
  direction: string;
  subject: string | null;
  content: string | null;
  attachments: unknown;
  created_at: string;
  metadata: unknown;
};

const PREVIEW_LIMIT = 400;

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function msgText(m: HistoryMsg): string {
  const content = (m.content ?? "").trim();
  if (content) return content;
  const html = (m.metadata as Record<string, unknown> | null)?.html;
  if (typeof html === "string" && html.trim()) return htmlToText(html).slice(0, 8000);
  return "";
}

export function CorrespondenceHistoryDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  email: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["correspondence-history", email],
    enabled: open && !!email,
    queryFn: async () => {
      // ilike = niewrażliwe na wielkość liter; escapujemy znaki specjalne wzorca
      const pattern = (email ?? "").replace(/[\\%_]/g, "\\$&");
      const { data, error } = await supabase
        .from("lead_communications")
        .select("id, direction, subject, content, attachments, created_at, metadata")
        .eq("channel", "email")
        .ilike("email", pattern)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as HistoryMsg[];
    },
  });

  const stats = useMemo(() => {
    const items = data ?? [];
    return {
      total: items.length,
      inbound: items.filter((m) => m.direction === "inbound").length,
      outbound: items.filter((m) => m.direction === "outbound").length,
    };
  }, [data]);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 min-w-0">
            <History className="h-5 w-5 shrink-0" />
            <span className="truncate">Historia korespondencji</span>
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="break-all font-medium text-foreground">{email}</span>
            {!isLoading && (
              <span className="whitespace-nowrap">
                {stats.total} wiadomości ({stats.inbound} odebranych, {stats.outbound} wysłanych)
              </span>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="h-[65vh] pr-3">
          {isLoading && <div className="p-4 text-sm text-muted-foreground">Ładuję historię…</div>}
          {!isLoading && (data ?? []).length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              Brak zapisanej korespondencji z tym adresem.
            </div>
          )}
          <div className="space-y-3 py-1">
            {(data ?? []).map((m) => {
              const isInbound = m.direction === "inbound";
              const text = msgText(m);
              const isLong = text.length > PREVIEW_LIMIT;
              const isExpanded = expanded.has(m.id);
              const shown = isLong && !isExpanded ? text.slice(0, PREVIEW_LIMIT) + "…" : text;
              const attCount = Array.isArray(m.attachments) ? m.attachments.length : 0;
              return (
                <div key={m.id} className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${
                      isInbound ? "bg-muted/60" : "bg-primary/10 border-primary/30"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <Badge
                        variant={isInbound ? "secondary" : "default"}
                        className="h-4 px-1.5 text-[10px]"
                      >
                        {isInbound ? (
                          <Inbox className="h-2.5 w-2.5 mr-1" />
                        ) : (
                          <Send className="h-2.5 w-2.5 mr-1" />
                        )}
                        {isInbound ? "Odebrana" : "Wysłana"}
                      </Badge>
                      <span className="whitespace-nowrap">
                        {format(new Date(m.created_at), "d MMM yyyy, HH:mm", { locale: pl })}
                      </span>
                      {attCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                          <Paperclip className="h-2.5 w-2.5" />
                          {attCount}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-medium break-words">
                      {m.subject || "(bez tematu)"}
                    </div>
                    {text ? (
                      <div className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                        {shown}
                      </div>
                    ) : (
                      <div className="mt-1 italic text-muted-foreground">(brak treści)</div>
                    )}
                    {isLong && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 mt-1 text-xs"
                        onClick={() => toggleExpanded(m.id)}
                      >
                        {isExpanded ? "Zwiń" : "Pokaż całość"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
