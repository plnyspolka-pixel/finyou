import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mail, Search, Paperclip, RefreshCw, ExternalLink, Inbox, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

export const Route = createFileRoute("/admin/skrzynka")({
  component: SkrzynkaPage,
});

type Msg = {
  id: string;
  lead_id: string | null;
  email: string | null;
  direction: string;
  subject: string | null;
  content: string | null;
  attachments: any;
  created_at: string;
  metadata: any;
  thread_external_id: string | null;
};

function SkrzynkaPage() {
  const [tab, setTab] = useState<"inbound" | "outbound">("inbound");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-inbox", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_communications")
        .select("id, lead_id, email, direction, subject, content, attachments, created_at, metadata, thread_external_id")
        .eq("channel", "email")
        .eq("direction", tab)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
    refetchInterval: 60_000,
  });

  const filtered = useMemo(() => {
    const items = data ?? [];
    if (!q.trim()) return items;
    const needle = q.toLowerCase();
    return items.filter(
      (m) =>
        (m.subject ?? "").toLowerCase().includes(needle) ||
        (m.email ?? "").toLowerCase().includes(needle) ||
        (m.content ?? "").toLowerCase().includes(needle),
    );
  }, [data, q]);

  const selected = filtered.find((m) => m.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          <h1 className="text-2xl font-semibold">Skrzynka mailowa</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Odśwież
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          variant={tab === "inbound" ? "default" : "outline"}
          size="sm"
          onClick={() => { setTab("inbound"); setSelectedId(null); }}
        >
          <Inbox className="h-4 w-4 mr-2" />
          Odebrane
        </Button>
        <Button
          variant={tab === "outbound" ? "default" : "outline"}
          size="sm"
          onClick={() => { setTab("outbound"); setSelectedId(null); }}
        >
          <Send className="h-4 w-4 mr-2" />
          Wysłane
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        <Card className="p-3">
          <div className="relative mb-3">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj (temat, email, treść)..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
            />
          </div>
          <ScrollArea className="h-[calc(100vh-260px)]">
            <div className="space-y-1">
              {isLoading && <div className="p-4 text-sm text-muted-foreground">Ładuję…</div>}
              {!isLoading && filtered.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">Brak wiadomości.</div>
              )}
              {filtered.map((m) => {
                const isActive = (selected?.id ?? null) === m.id;
                const hasAtt = Array.isArray(m.attachments) && m.attachments.length > 0;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                      isActive ? "bg-muted border-primary" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium truncate">{m.email ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: pl })}
                      </div>
                    </div>
                    <div className="text-sm truncate mt-0.5">{m.subject || "(bez tematu)"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {(m.content ?? "").slice(0, 80)}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {hasAtt && (
                        <Badge variant="secondary" className="text-[10px] h-4">
                          <Paperclip className="h-2.5 w-2.5 mr-1" />
                          {(m.attachments as any[]).length}
                        </Badge>
                      )}
                      {m.lead_id && (
                        <Badge variant="outline" className="text-[10px] h-4">lead</Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        <Card className="p-4">
          {!selected && (
            <div className="text-sm text-muted-foreground">Wybierz wiadomość po lewej.</div>
          )}
          {selected && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 border-b pb-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold break-words">
                    {selected.subject || "(bez tematu)"}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    <span className="font-medium">{tab === "inbound" ? "Od:" : "Do:"}</span>{" "}
                    {selected.email ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(selected.created_at).toLocaleString("pl-PL")}
                  </div>
                </div>
                {selected.lead_id && (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/admin/klienci/$id" params={{ id: selected.lead_id }}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Otwórz lead
                    </Link>
                  </Button>
                )}
              </div>

              {Array.isArray(selected.attachments) && selected.attachments.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Załączniki ({selected.attachments.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(selected.attachments as any[]).map((a, i) => {
                      const url = a?.url ?? a?.public_url ?? a?.signed_url ?? a?.path;
                      const name = a?.name ?? a?.filename ?? `załącznik-${i + 1}`;
                      if (!url) return (
                        <Badge key={i} variant="secondary">
                          <Paperclip className="h-3 w-3 mr-1" />{name}
                        </Badge>
                      );
                      return (
                        <Button key={i} asChild variant="outline" size="sm">
                          <a href={url} target="_blank" rel="noreferrer">
                            <Paperclip className="h-3 w-3 mr-2" />{name}
                          </a>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words text-sm">
                {selected.content || <span className="text-muted-foreground">(brak treści)</span>}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
