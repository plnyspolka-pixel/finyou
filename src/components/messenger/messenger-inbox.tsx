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
import {
  MessageCircle,
  Send,
  RefreshCw,
  Search,
  Bot,
  User as UserIcon,
  Paperclip,
  Download,
  FileText,
  Loader2,
  Wand2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "sonner";
import { sendMessengerReply, backfillMessengerData } from "@/lib/messenger-inbox.functions";
import { getCommAttachmentUrl } from "@/lib/inbox.functions";

type Attachment = {
  name?: string | null;
  mime?: string | null;
  size?: number | null;
  path: string;
  source_type?: string | null;
};

type Msg = {
  id: string;
  lead_id: string | null;
  direction: string;
  content: string | null;
  created_at: string;
  metadata: any;
  status: string | null;
  attachments: Attachment[] | null;
};

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  messenger_psid: string | null;
  instagram_igsid: string | null;
};

function isImageAtt(att: Attachment): boolean {
  const name = att.name ?? att.path;
  return (
    (att.mime ?? "").startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|bmp|avif)$/i.test(name)
  );
}

/**
 * Pojedynczy załącznik wiadomości — zdjęcia jako miniatura (klik = pełny
 * rozmiar w nowej karcie), pozostałe pliki jako wiersz z nazwą. Zawsze
 * z przyciskiem pobrania. Podpisany URL pochodzi z server fn (bucket
 * `documents` jest prywatny).
 */
function CommAttachment({ att }: { att: Attachment }) {
  const signFn = useServerFn(getCommAttachmentUrl);
  const { data: url, isLoading } = useQuery({
    queryKey: ["comm-att-url", att.path],
    queryFn: async () => (await signFn({ data: { path: att.path } })).url,
    staleTime: 45 * 60 * 1000, // podpisany URL żyje godzinę
    retry: 1,
  });
  const name = att.name ?? att.path.split("/").pop() ?? "plik";
  const sizeLabel = att.size ? `${Math.max(1, Math.round(att.size / 1024))} KB` : null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-70">
        <Loader2 className="h-3 w-3 animate-spin" /> Wczytuję załącznik…
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-70">
        <Paperclip className="h-3 w-3" /> {name} (niedostępny)
      </div>
    );
  }
  const downloadUrl = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`;

  if (isImageAtt(att)) {
    return (
      <div className="group/att relative w-fit">
        <a href={url} target="_blank" rel="noreferrer" title={name}>
          <img
            src={url}
            alt={name}
            className="max-h-56 max-w-full rounded-lg border object-cover"
            loading="lazy"
          />
        </a>
        <a
          href={downloadUrl}
          className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover/att:opacity-100"
          title={`Pobierz ${name}`}
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background/60 px-2.5 py-1.5">
      <FileText className="h-4 w-4 shrink-0 opacity-70" />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 truncate text-xs font-medium hover:underline"
        title={name}
      >
        {name}
      </a>
      {sizeLabel && <span className="whitespace-nowrap text-[10px] opacity-60">{sizeLabel}</span>}
      <a
        href={downloadUrl}
        title={`Pobierz ${name}`}
        className="shrink-0 opacity-70 hover:opacity-100"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

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
export function MessengerInbox({
  title = "Messenger / Instagram DM",
  renderLeadLink,
}: MessengerInboxProps) {
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendFn = useServerFn(sendMessengerReply);
  const backfillFn = useServerFn(backfillMessengerData);

  const backfillMut = useMutation({
    mutationFn: () => backfillFn(),
    onSuccess: (r) => {
      toast.success(
        `Odzyskano ${r.messagesNew} wiadomości z Meta (${r.leadsCreated} nowych rozmów). ` +
          `Pobrano ${r.attachmentsDownloaded} plików z rozmów, OCR przetworzył ${r.ocrProcessed} dok. (KW: ${r.kwFound}). ` +
          `Uzupełniono: ${r.namesFromMeta + r.namesFromText + r.namesFromOcr + r.namesFromKw} nazwisk (Meta: ${r.namesFromMeta}, OCR: ${r.namesFromOcr}, KW: ${r.namesFromKw}, z treści: ${r.namesFromText}), ${r.attachmentsLinked} załączników` +
          (r.filesSkipped ? `, pominięto ${r.filesSkipped} plików bez dopasowania` : ""),
      );
      if (r.errors?.length) {
        toast.error(
          `Meta zgłosiła ${r.errors.length} błąd(ów) przy pobieraniu rozmów: ${r.errors[0]}`,
        );
      }
      qc.invalidateQueries({ queryKey: ["messenger-inbox"] });
      qc.invalidateQueries({ queryKey: ["messenger-inbox-leads"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Backfill nie powiódł się"),
  });

  const {
    data: messages,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["messenger-inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_communications")
        .select(
          "id, lead_id, direction, content, created_at, metadata, status, attachments, thread_external_id",
        )
        .eq("channel", "messenger")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as (Msg & { thread_external_id: string | null })[];
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

  // Klucz konwersacji: lead_id jeśli jest, w przeciwnym razie PSID/IGSID
  // z metadata / thread_external_id — pokazujemy też rozmowy bez podpiętego leada.
  const conversations = useMemo(() => {
    const byKey = new Map<
      string,
      {
        key: string;
        leadId: string | null;
        lastAt: string;
        last: Msg;
        count: number;
        platform: string;
        extId: string | null;
      }
    >();
    for (const m of (messages ?? []) as (Msg & { thread_external_id: string | null })[]) {
      const meta = (m.metadata ?? {}) as Record<string, any>;
      const psid = meta.psid ?? meta.sender_id ?? meta.recipient_id ?? null;
      const igsid = meta.igsid ?? null;
      const extId = m.thread_external_id ?? null;
      const key =
        m.lead_id ??
        (igsid ? `ig:${igsid}` : psid ? `msg:${psid}` : extId ? `ext:${extId}` : `orphan:${m.id}`);
      const platform = igsid || meta.platform === "instagram" ? "Instagram" : "Messenger";
      const cur = byKey.get(key);
      if (!cur)
        byKey.set(key, {
          key,
          leadId: m.lead_id,
          lastAt: m.created_at,
          last: m,
          count: 1,
          platform,
          extId,
        });
      else {
        cur.count += 1;
        if (m.created_at > cur.lastAt) {
          cur.lastAt = m.created_at;
          cur.last = m;
        }
      }
    }
    return Array.from(byKey.values())
      .map((v) => ({
        leadId: v.leadId,
        key: v.key,
        lastAt: v.lastAt,
        last: v.last,
        count: v.count,
        platform: v.platform,
        lead: v.leadId ? leadMap.get(v.leadId) : undefined,
      }))
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
    return ((messages ?? []) as (Msg & { thread_external_id: string | null })[])
      .filter((m) => {
        const meta = (m.metadata ?? {}) as Record<string, any>;
        const psid = meta.psid ?? meta.sender_id ?? meta.recipient_id ?? null;
        const igsid = meta.igsid ?? null;
        const extId = m.thread_external_id ?? null;
        const key =
          m.lead_id ??
          (igsid
            ? `ig:${igsid}`
            : psid
              ? `msg:${psid}`
              : extId
                ? `ext:${extId}`
                : `orphan:${m.id}`);
        return key === selectedKey;
      })
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  }, [messages, selectedKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, selectedKey]);

  const selectedLead = selectedLeadId ? leadMap.get(selectedLeadId) : null;
  const canReply = !!(
    selectedLeadId &&
    selectedLead &&
    (selectedLead.messenger_psid || selectedLead.instagram_igsid)
  );

  const sendMut = useMutation({
    mutationFn: (body: string) => sendFn({ data: { leadId: selectedLeadId!, body } }),
    onSuccess: () => {
      setReply("");
      toast.success("Wiadomość wysłana");
      qc.invalidateQueries({ queryKey: ["messenger-inbox"] });
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => backfillMut.mutate()}
            disabled={backfillMut.isPending}
            title="Pobiera z Meta brakujące rozmowy (sprzed podłączenia webhooka), uzupełnia imiona/nazwiska klientów i dopina stare załączniki do wiadomości"
          >
            <Wand2 className={`h-4 w-4 mr-2 ${backfillMut.isPending ? "animate-pulse" : ""}`} />
            {backfillMut.isPending ? "Uzupełniam…" : "Uzupełnij historię"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Odśwież
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        <Card className="p-3">
          <div className="relative mb-3">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj konwersacji…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
            />
          </div>
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-1">
              {filteredConvs.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">Brak konwersacji.</div>
              )}
              {filteredConvs.map((c) => {
                const active = c.key === selectedKey;
                const name =
                  `${c.lead?.first_name ?? ""} ${c.lead?.last_name ?? ""}`.trim() ||
                  "Nieznany klient";
                const platform = c.platform;
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
                    <div className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                      {Array.isArray(c.last.attachments) && c.last.attachments.length > 0 && (
                        <Paperclip className="h-3 w-3 shrink-0" />
                      )}
                      <span className="truncate">{(c.last.content ?? "").slice(0, 80) || "—"}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge variant="secondary" className="text-[10px] h-4">
                        {platform}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-4">
                        {c.count} wiad.
                      </Badge>
                      {!c.leadId && (
                        <Badge variant="outline" className="text-[10px] h-4">
                          bez leada
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        <Card className="p-4 flex flex-col">
          {!selectedKey && (
            <div className="text-sm text-muted-foreground">Wybierz konwersację po lewej.</div>
          )}
          {selectedKey && (
            <>
              <div className="flex items-center justify-between border-b pb-3 mb-3">
                <div>
                  <div className="text-lg font-semibold">
                    {`${selectedLead?.first_name ?? ""} ${selectedLead?.last_name ?? ""}`.trim() ||
                      "Nieznany klient"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedLead?.instagram_igsid
                      ? `Instagram IGSID: ${selectedLead.instagram_igsid}`
                      : selectedLead?.messenger_psid
                        ? `Messenger PSID: ${selectedLead.messenger_psid}`
                        : "brak ID"}
                  </div>
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
                      <div
                        key={m.id}
                        className={`flex ${inbound ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                            inbound
                              ? "bg-muted"
                              : isBot
                                ? "bg-blue-500/10 border border-blue-500/30"
                                : "bg-primary text-primary-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-1 text-[10px] opacity-70 mb-1">
                            {inbound ? (
                              <UserIcon className="h-3 w-3" />
                            ) : isBot ? (
                              <Bot className="h-3 w-3" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            <span>{inbound ? "Klient" : isBot ? "Bot" : "Operator"}</span>
                            <span>·</span>
                            <span>{new Date(m.created_at).toLocaleString("pl-PL")}</span>
                          </div>
                          {m.content || "—"}
                          {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {m.attachments.map((a, i) => (
                                <CommAttachment key={`${m.id}-${i}`} att={a} />
                              ))}
                            </div>
                          )}
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
                      <div className="text-[10px] text-muted-foreground">
                        Cmd/Ctrl + Enter — wyślij
                      </div>
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
