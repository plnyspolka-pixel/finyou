import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mail,
  Search,
  Paperclip,
  RefreshCw,
  ExternalLink,
  Inbox,
  Send,
  Download,
  Reply,
  PenSquare,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";
import { refetchInboundEmailBody } from "@/lib/inbox.functions";
import { toast } from "sonner";
import { ComposeEmailDialog, type ComposeEmailInitial } from "@/components/inbox/compose-email";
import { AttachmentPreview } from "@/components/inbox/attachment-preview";

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
  const [viewMode, setViewMode] = useState<"html" | "text">("html");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitial, setComposeInitial] = useState<ComposeEmailInitial | undefined>(undefined);
  const qc = useQueryClient();
  const refetchBodyFn = useServerFn(refetchInboundEmailBody);
  const refetchBody = useMutation({
    mutationFn: (id: string) => refetchBodyFn({ data: { id } }),
    onSuccess: (res) => {
      toast.success(`Pobrano treść (${res.contentLength} znaków${res.hasHtml ? ", HTML" : ""}).`);
      qc.invalidateQueries({ queryKey: ["admin-inbox"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się pobrać treści"),
  });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-inbox", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_communications")
        .select(
          "id, lead_id, email, direction, subject, content, attachments, created_at, metadata, thread_external_id",
        )
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

  // Auto-pobieranie treści dla inbound wiadomości bez html (tła + na żądanie przy zaznaczeniu).
  const autoFetched = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (tab !== "inbound" || !data) return;
    const needsFetch = data.filter((m) => {
      if (autoFetched.current.has(m.id)) return false;
      const meta = (m.metadata ?? {}) as Record<string, any>;
      if (!meta?.email_id) return false;
      if (meta?.html) return false;
      if ((m.content ?? "").trim().length > 200) return false;
      return true;
    });
    if (!needsFetch.length) return;
    // Priorytet: aktualnie zaznaczona, potem do 5 najnowszych w tle.
    const prioritized =
      selected && needsFetch.some((m) => m.id === selected.id)
        ? [selected, ...needsFetch.filter((m) => m.id !== selected.id)]
        : needsFetch;
    const batch = prioritized.slice(0, 5);
    for (const m of batch) {
      autoFetched.current.add(m.id);
      refetchBody.mutate(m.id);
    }
  }, [data, tab, selected, refetchBody]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          <h1 className="text-2xl font-semibold">Skrzynka mailowa</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setComposeInitial(undefined);
              setComposeOpen(true);
            }}
          >
            <PenSquare className="h-4 w-4 mr-2" />
            Nowa wiadomość
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Odśwież
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant={tab === "inbound" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setTab("inbound");
            setSelectedId(null);
          }}
        >
          <Inbox className="h-4 w-4 mr-2" />
          Odebrane
        </Button>
        <Button
          variant={tab === "outbound" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setTab("outbound");
            setSelectedId(null);
          }}
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
                        {formatDistanceToNow(new Date(m.created_at), {
                          addSuffix: true,
                          locale: pl,
                        })}
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
                        <Badge variant="outline" className="text-[10px] h-4">
                          lead
                        </Badge>
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
                <div className="flex items-center gap-2 shrink-0">
                  {tab === "inbound" && selected.email && (
                    <Button
                      size="sm"
                      onClick={() => {
                        const subj = selected.subject ?? "";
                        setComposeInitial({
                          to: selected.email ?? "",
                          subject: subj.toLowerCase().startsWith("re:") ? subj : `Re: ${subj}`,
                          body: `\n\n---\nW dniu ${new Date(selected.created_at).toLocaleString("pl-PL")} ${selected.email} napisał:\n${(
                            selected.content ?? ""
                          )
                            .split("\n")
                            .map((l) => "> " + l)
                            .join("\n")}`,
                          replyToCommunicationId: selected.id,
                        });
                        setComposeOpen(true);
                      }}
                    >
                      <Reply className="h-4 w-4 mr-2" />
                      Odpowiedz
                    </Button>
                  )}
                  {selected.lead_id && (
                    <Button asChild variant="outline" size="sm">
                      <Link to="/admin/klienci/$id" params={{ id: selected.lead_id }}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Otwórz lead
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              {Array.isArray(selected.attachments) && selected.attachments.length > 0 && (
                <AttachmentPreview attachments={selected.attachments as any[]} />
              )}

              {(() => {
                const meta = (selected.metadata ?? {}) as Record<string, any>;
                const html: string | null = typeof meta.html === "string" ? meta.html : null;
                const hasContent = !!(selected.content && selected.content.trim().length > 0);
                const canRefetch = tab === "inbound" && !!meta.email_id;
                return (
                  <div className="space-y-3">
                    {html && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={viewMode === "html" ? "default" : "outline"}
                          onClick={() => setViewMode("html")}
                        >
                          HTML
                        </Button>
                        <Button
                          size="sm"
                          variant={viewMode === "text" ? "default" : "outline"}
                          onClick={() => setViewMode("text")}
                        >
                          Tekst
                        </Button>
                      </div>
                    )}
                    {html && viewMode === "html" ? (
                      <iframe
                        title="email-body"
                        sandbox=""
                        srcDoc={html}
                        className="w-full min-h-[500px] rounded-md border bg-white"
                      />
                    ) : hasContent ? (
                      <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words text-sm">
                        {selected.content}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm text-muted-foreground">
                          (brak treści — wiadomość zapisana bez body)
                        </div>
                        {canRefetch ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => refetchBody.mutate(selected.id)}
                            disabled={refetchBody.isPending}
                          >
                            <Download
                              className={`h-4 w-4 mr-2 ${refetchBody.isPending ? "animate-pulse" : ""}`}
                            />
                            Pobierz treść z Resend
                          </Button>
                        ) : tab === "inbound" ? (
                          <div className="text-xs text-muted-foreground">
                            Stara wiadomość bez <code>email_id</code> — nie da się pobrać treści z
                            Resend. Nowe wiadomości będą zapisywane z pełną treścią.
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </Card>
      </div>

      <ComposeEmailDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        initial={composeInitial}
        onSent={() => {
          setTab("outbound");
          refetch();
        }}
      />
    </div>
  );
}
