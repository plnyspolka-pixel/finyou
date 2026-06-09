import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  sendAdminChat,
  listConversations,
  getConversation,
  deleteConversation,
  transcribeAdminAudio,
} from "@/lib/ai-admin.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, X, Send, Trash2, Plus, Settings, Loader2, Wrench, Mic, Square, Paperclip, ChevronDown, ChevronUp, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

type Message = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls: Array<{ id: string; name: string; input: Record<string, unknown> }> | null;
  tool_results: Array<{ tool_use_id: string; content: string; is_error?: boolean }> | null;
  created_at: string;
};

type Attachment = { name: string; size: number; type: string; text?: string; skipped?: boolean };

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|log|yml|yaml|xml|html|htm|css|scss|js|jsx|ts|tsx|sql|sh|env|ini|toml|conf|py|rb|go|rs|java|kt|swift|php|vue|svelte)$/i;
const MAX_INLINE = 200_000;

export function AiAdminChat() {
  const [open, setOpen] = useState(true);
  const [convId, setConvId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [view, setView] = useState<"chat" | "list">("chat");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const sendFn = useServerFn(sendAdminChat);
  const listFn = useServerFn(listConversations);
  const getFn = useServerFn(getConversation);
  const delFn = useServerFn(deleteConversation);
  const transcribeFn = useServerFn(transcribeAdminAudio);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const convs = useQuery({
    queryKey: ["ai-admin-convs"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const messagesQ = useQuery({
    queryKey: ["ai-admin-msgs", convId],
    queryFn: () => (convId ? getFn({ data: { id: convId } }) : Promise.resolve({ messages: [] })),
    enabled: open && !!convId,
    refetchInterval: false,
  });

  const messages = useMemo(() => (messagesQ.data?.messages ?? []) as Message[], [messagesQ.data]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, open]);

  const send = useMutation({
    mutationFn: (text: string) => sendFn({ data: { conversation_id: convId, message: text } }),
    onSuccess: async (r) => {
      setConvId(r.conversation_id);
      setInput("");
      await qc.invalidateQueries({ queryKey: ["ai-admin-msgs", r.conversation_id] });
      await qc.invalidateQueries({ queryKey: ["ai-admin-convs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: async () => {
      setConvId(undefined);
      await qc.invalidateQueries({ queryKey: ["ai-admin-convs"] });
    },
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recChunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 500) {
          toast.error("Nagranie zbyt krótkie");
          return;
        }
        setTranscribing(true);
        try {
          const ext = (mr.mimeType || "audio/webm").includes("mp4") ? "mp4" : "webm";
          const file = new File([blob], `voice.${ext}`, { type: mr.mimeType || "audio/webm" });
          const fd = new FormData();
          fd.append("audio", file);
          const res = await transcribeFn({ data: fd });
          if (res.text) {
            setInput((prev) => (prev ? `${prev} ${res.text}` : res.text));
          } else {
            toast.error("Nie udało się rozpoznać mowy");
          }
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (e) {
      toast.error("Brak dostępu do mikrofonu", { description: (e as Error).message });
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  const submit = () => {
    const text = input.trim();
    if (!text || send.isPending) return;
    // Optimistic: render user message immediately
    qc.setQueryData(["ai-admin-msgs", convId], (old: { messages: Message[] } | undefined) => ({
      messages: [
        ...(old?.messages ?? []),
        {
          id: `tmp-${Date.now()}`,
          role: "user" as const,
          content: text,
          tool_calls: null,
          tool_results: null,
          created_at: new Date().toISOString(),
        },
      ],
    }));
    send.mutate(text);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/30 transition-transform hover:scale-105"
        aria-label="AI Administrator"
      >
        <Bot className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[640px] max-h-[90vh] w-[440px] max-w-[95vw] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-primary">
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">AI Administrator</div>
          <div className="text-[11px] text-muted-foreground">Claude · pełny dostęp do bazy i kodu</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setView(view === "chat" ? "list" : "chat")}>
          {view === "chat" ? "Historia" : "Czat"}
        </Button>
        <Button size="icon" variant="ghost" asChild>
          <Link to="/admin/ai-administrator"><Settings className="h-4 w-4" /></Link>
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {view === "list" ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => {
              setConvId(undefined);
              setView("chat");
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Nowa rozmowa
          </Button>
          {(convs.data?.conversations ?? []).map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted ${
                convId === c.id ? "border-primary" : ""
              }`}
            >
              <button
                className="flex-1 truncate text-left"
                onClick={() => {
                  setConvId(c.id);
                  setView("chat");
                }}
              >
                {c.title}
              </button>
              <button
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => {
                  if (confirm("Usunąć rozmowę?")) remove.mutate(c.id);
                }}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 p-3">
            {messages.length === 0 && !send.isPending && (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Cześć! Jestem AI Administratorem. Mogę:
                <ul className="ml-4 mt-2 list-disc space-y-1 text-xs">
                  <li>Odpytać bazę (np. „pokaż 10 ostatnich leadów")</li>
                  <li>Wprowadzić zmiany w danych po Twoim potwierdzeniu</li>
                  <li>Przeczytać pliki w <code>src/</code></li>
                  <li>Analizować, debugować, sugerować zmiany</li>
                </ul>
              </div>
            )}
            {messages.map((m) => <MessageBubble key={m.id} m={m} />)}
            {send.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Claude myśli (może wywołać narzędzia)…
              </div>
            )}
          </div>

          <div className="border-t p-2">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Zapytaj o cokolwiek… (⌘/Ctrl+Enter = wyślij)"
                rows={2}
                className="resize-none text-sm"
              />
              <Button
                size="icon"
                variant={recording ? "destructive" : "outline"}
                onClick={recording ? stopRecording : startRecording}
                disabled={transcribing || send.isPending}
                aria-label={recording ? "Zatrzymaj nagrywanie" : "Nagraj głosówkę"}
                title={recording ? "Zatrzymaj nagrywanie" : "Nagraj głosówkę"}
              >
                {transcribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : recording ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              <Button size="icon" onClick={submit} disabled={send.isPending || !input.trim()}>
                {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MessageBubble({ m }: { m: Message }) {
  if (m.role === "tool") {
    return (
      <div className="space-y-1">
        {(m.tool_results ?? []).map((r, i) => (
          <details key={i} className="rounded-md border border-dashed bg-muted/40 px-2 py-1 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {r.is_error ? "❌ wynik narzędzia (błąd)" : "✓ wynik narzędzia"}
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px]">{r.content}</pre>
          </details>
        ))}
      </div>
    );
  }

  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {m.content && (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-background/60 prose-pre:text-xs">
            <ReactMarkdown>{m.content}</ReactMarkdown>
          </div>
        )}
        {m.tool_calls && m.tool_calls.length > 0 && (
          <div className="mt-2 space-y-1">
            {m.tool_calls.map((tc) => (
              <Badge key={tc.id} variant="outline" className="gap-1 text-[10px]">
                <Wrench className="h-3 w-3" /> {tc.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
