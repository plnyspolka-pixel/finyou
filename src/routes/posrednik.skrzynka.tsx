import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
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
import { ComposeEmailDialog, type ComposeEmailInitial } from "@/components/inbox/compose-email";
import { AttachmentPreview } from "@/components/inbox/attachment-preview";
import { refetchInboundEmailBody } from "@/lib/inbox.functions";
import { toast } from "sonner";
import { FancyShell } from "@/components/landing/fancy-shell";
import { usePanelBase } from "@/lib/panel-base";

export const Route = createFileRoute("/posrednik/skrzynka")({
  validateSearch: (s: Record<string, unknown>) => ({ compose: s.compose ? 1 : undefined }),
  component: SkrzynkaPosrednika,
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

export function SkrzynkaPosrednika() {
  const base = usePanelBase();
  const search = useSearch({ strict: false }) as { compose?: number };
  const navigate = useNavigate();
  const [tab, setTab] = useState<"inbound" | "outbound">("inbound");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"html" | "text">("html");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitial, setComposeInitial] = useState<ComposeEmailInitial | undefined>(undefined);
  const qc = useQueryClient();

  useEffect(() => {
    if (!search.compose) return;
    try {
      const raw = sessionStorage.getItem("inbox:draft");
      if (raw) {
        const d = JSON.parse(raw);
        setComposeInitial({
          to: d.to ?? "",
          subject: d.subject ?? "",
          body: d.body ?? "",
          attachments: Array.isArray(d.attachments) ? d.attachments : [],
        });
        setComposeOpen(true);
        sessionStorage.removeItem("inbox:draft");
      }
    } catch {}
    navigate({ search: {} as any, replace: true });
  }, [search.compose, navigate]);

  const refetchBodyFn = useServerFn(refetchInboundEmailBody);
  const refetchBody = useMutation({
    mutationFn: (id: string) => refetchBodyFn({ data: { id } }),
    onSuccess: (res) => {
      toast.success(`Pobrano treść (${res.contentLength} znaków${res.hasHtml ? ", HTML" : ""}).`);
      qc.invalidateQueries({ queryKey: ["posrednik-inbox"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się pobrać treści"),
  });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["posrednik-inbox", tab],
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

  const selected = selectedId ? (filtered.find((m) => m.id === selectedId) ?? null) : null;

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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Mail className="h-4 w-4 shrink-0 text-primary" />
          <h1 className="text-base font-semibold truncate">Skrzynka mailowa</h1>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            className="h-8 px-2.5"
            onClick={() => {
              setComposeInitial(undefined);
              setComposeOpen(true);
            }}
          >
            <PenSquare className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Nowa</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex gap-1.5">
        <Button
          variant={tab === "inbound" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            setTab("inbound");
            setSelectedId(null);
          }}
        >
          <Inbox className="h-3.5 w-3.5 mr-1.5" />
          Odebrane
        </Button>
        <Button
          variant={tab === "outbound" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            setTab("outbound");
            setSelectedId(null);
          }}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          Wysłane
        </Button>
      </div>

      <div className="grid grid-rows-[44vh_1fr] gap-3 lg:grid-cols-[380px_1fr] lg:grid-rows-1 lg:gap-4">
        <FancyShell motion={false} innerClassName="!p-2 h-full flex flex-col">
          <div className="relative mb-3 shrink-0">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-white/60" />
            <Input
              placeholder="Szukaj (temat, email, treść)..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/40"
            />
          </div>
          <ScrollArea className="flex-1 min-h-0 lg:h-[calc(100vh-260px)]">
            <div className="space-y-1 pr-1">
              {isLoading && <div className="p-4 text-sm text-white/70">Ładuję…</div>}
              {!isLoading && filtered.length === 0 && (
                <div className="p-4 text-sm text-white/70">Brak wiadomości.</div>
              )}
              {filtered.map((m) => {
                const isActive = (selected?.id ?? null) === m.id;
                const hasAtt = Array.isArray(m.attachments) && m.attachments.length > 0;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={`group relative w-full text-left rounded-lg border pl-3 pr-2.5 py-2 transition-all overflow-hidden ${
                      isActive
                        ? "border-white/40 bg-white/15 shadow-sm"
                        : "border-white/10 bg-white/[0.04] hover:bg-white/10 hover:border-white/25"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`absolute left-0 top-0 h-full w-[3px] rounded-r ${
                        isActive
                          ? "bg-gradient-to-b from-indigo-400 via-sky-400 to-emerald-400"
                          : "bg-transparent group-hover:bg-white/40"
                      }`}
                    />
                    <div className="flex items-center gap-2">
                      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-sky-400 text-[10px] font-bold text-white shadow-sm">
                        {(m.email ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                          <div className="text-[11px] font-semibold truncate min-w-0 text-white">
                            {m.email ?? "—"}
                          </div>
                          <div className="text-[10px] text-white/60 whitespace-nowrap shrink-0">
                            {formatDistanceToNow(new Date(m.created_at), {
                              addSuffix: true,
                              locale: pl,
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-[13px] font-medium truncate mt-1 text-white/95">
                      {m.subject || "(bez tematu)"}
                    </div>
                    <div className="text-[11px] text-white/60 truncate">
                      {(m.content ?? "").slice(0, 80)}
                    </div>
                    {(hasAtt || m.lead_id) && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {hasAtt && (
                          <Badge className="text-[10px] h-4 bg-violet-500/25 text-violet-100 border-violet-300/30">
                            <Paperclip className="h-2.5 w-2.5 mr-1" />
                            {(m.attachments as any[]).length}
                          </Badge>
                        )}
                        {m.lead_id && (
                          <Badge className="text-[10px] h-4 border-emerald-300/40 bg-emerald-500/20 text-emerald-100">
                            lead
                          </Badge>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </FancyShell>

        <FancyShell motion={false} innerClassName="!p-3 sm:!p-4 h-full flex flex-col min-w-0">
          {!selected && (
            <div className="flex-1 flex items-center justify-center text-center text-sm text-white/70 p-6">
              <div>
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-60" />
                Wybierz wiadomość z listy powyżej.
              </div>
            </div>
          )}
          {selected && (
            <div className="space-y-4 min-w-0 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-3 border-b border-white/15 pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-base sm:text-lg font-semibold break-words text-white">
                    {selected.subject || "(bez tematu)"}
                  </div>
                  <div className="text-sm text-white/70 mt-1 break-all">
                    <span className="font-medium text-white/90">
                      {tab === "inbound" ? "Od:" : "Do:"}
                    </span>{" "}
                    {selected.email ?? "—"}
                  </div>
                  <div className="text-xs text-white/60">
                    {new Date(selected.created_at).toLocaleString("pl-PL")}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
                  {tab === "inbound" && selected.email && (
                    <Button
                      size="sm"
                      className="bg-white text-slate-900 hover:bg-white/90"
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
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                    >
                      <Link to={`${base}/leady/${selected.lead_id}` as any}>
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
                  <div className="space-y-3 min-w-0">
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
                      <div className="w-full overflow-x-auto rounded-md border border-white/20 bg-white">
                        <iframe
                          title="email-body"
                          sandbox=""
                          srcDoc={html}
                          className="w-full min-h-[500px] bg-white"
                        />
                      </div>
                    ) : hasContent ? (
                      <div className="rounded-md bg-white/95 text-slate-900 p-3 prose prose-sm max-w-none whitespace-pre-wrap break-words text-sm">
                        {selected.content}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm text-white/70">
                          (brak treści — wiadomość zapisana bez body)
                        </div>
                        {canRefetch ? (
                          <Button
                            size="sm"
                            className="bg-white text-slate-900 hover:bg-white/90"
                            onClick={() => refetchBody.mutate(selected.id)}
                            disabled={refetchBody.isPending}
                          >
                            <Download
                              className={`h-4 w-4 mr-2 ${refetchBody.isPending ? "animate-pulse" : ""}`}
                            />
                            Pobierz treść
                          </Button>
                        ) : tab === "inbound" ? (
                          <div className="text-xs text-white/60">
                            Stara wiadomość bez identyfikatora — nie da się pobrać treści. Nowe
                            wiadomości będą zapisywane z pełną treścią.
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </FancyShell>
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
