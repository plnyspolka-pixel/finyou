import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Bot,
  X,
  Send,
  Trash2,
  Plus,
  Loader2,
  Wrench,
  Mic,
  Square,
  Paperclip,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
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

type AttachmentKind = "text" | "image" | "pdf" | "other";
type Attachment = {
  name: string;
  size: number;
  mediaType: string;
  kind: AttachmentKind;
  text?: string; // dla plików tekstowych
  data?: string; // base64 dla binarek (obrazy, PDF, inne)
};

const TEXT_EXT =
  /\.(txt|md|markdown|csv|tsv|json|jsonl|log|yml|yaml|xml|html|htm|css|scss|js|jsx|ts|tsx|sql|sh|env|ini|toml|conf|py|rb|go|rs|java|kt|swift|php|vue|svelte)$/i;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB / plik (limit Anthropica dla dokumentów)
const ANTHROPIC_IMAGE_MIME = /^image\/(jpeg|png|gif|webp)$/i;

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
    mutationFn: (payload: { text: string; attachments: Attachment[] }) =>
      sendFn({
        data: {
          conversation_id: convId,
          message: payload.text,
          attachments: payload.attachments.map((a) => ({
            name: a.name,
            mediaType: a.mediaType,
            kind: a.kind,
            size: a.size,
            text: a.text,
            data: a.data,
          })),
        },
      }),
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

  const fileToBase64 = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result ?? "");
        const i = s.indexOf(",");
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = () => reject(r.error ?? new Error("read error"));
      r.readAsDataURL(f);
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`${f.name}: plik > 25 MB, pominięty`);
        continue;
      }
      const isText =
        TEXT_EXT.test(f.name) || f.type.startsWith("text/") || f.type === "application/json";
      const isImage = ANTHROPIC_IMAGE_MIME.test(f.type);
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      try {
        if (isText) {
          const text = await f.text();
          next.push({
            name: f.name,
            size: f.size,
            mediaType: f.type || "text/plain",
            kind: "text",
            text,
          });
        } else if (isImage) {
          const data = await fileToBase64(f);
          next.push({ name: f.name, size: f.size, mediaType: f.type, kind: "image", data });
        } else if (isPdf) {
          const data = await fileToBase64(f);
          next.push({
            name: f.name,
            size: f.size,
            mediaType: "application/pdf",
            kind: "pdf",
            data,
          });
        } else {
          const data = await fileToBase64(f);
          next.push({
            name: f.name,
            size: f.size,
            mediaType: f.type || "application/octet-stream",
            kind: "other",
            data,
          });
          toast.info(
            `${f.name}: typ ${f.type || "binarny"} — przekażę jako załącznik, ale model może go nie odczytać.`,
          );
        }
      } catch (e) {
        toast.error(`${f.name}: nie udało się odczytać (${(e as Error).message})`);
      }
    }
    setAttachments((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || send.isPending) return;
    const labelParts = attachments.map(
      (a) => `${a.name} (${(a.size / 1024).toFixed(0)} KB, ${a.kind})`,
    );
    const userVisible =
      text + (labelParts.length ? `\n\n📎 Załączniki: ${labelParts.join(", ")}` : "");
    qc.setQueryData(["ai-admin-msgs", convId], (old: { messages: Message[] } | undefined) => ({
      messages: [
        ...(old?.messages ?? []),
        {
          id: `tmp-${Date.now()}`,
          role: "user" as const,
          content: userVisible || "(załączniki)",
          tool_calls: null,
          tool_results: null,
          created_at: new Date().toISOString(),
        },
      ],
    }));
    send.mutate({ text: text || "(załączniki)", attachments });
    setAttachments([]);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 right-3 z-50 hidden md:flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-lg ring-2 ring-primary/30 transition-transform hover:scale-105"
        aria-label="AI Administrator"
      >
        <Bot className="h-4 w-4" />
        AI Administrator
        <ChevronDown className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="fixed top-3 right-3 z-50 flex h-[640px] max-h-[85vh] w-[460px] max-w-[95vw] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-primary">
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">AI Administrator</div>
          <div className="text-[11px] text-muted-foreground">
            Claude · pełny dostęp do bazy i kodu
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setView(view === "chat" ? "list" : "chat")}
        >
          {view === "chat" ? "Historia" : "Czat"}
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Zwiń">
          <ChevronUp className="h-4 w-4" />
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
                  <li>
                    Przeczytać pliki w <code>src/</code>
                  </li>
                  <li>Przyjąć dowolne załączniki (tekst, PDF, obrazy, binarki) do 25 MB / plik</li>
                </ul>
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} />
            ))}
            {send.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Claude myśli (może wywołać narzędzia)…
              </div>
            )}
          </div>

          <div className="border-t p-2 space-y-2">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-[11px]"
                    title={`${a.mediaType} · ${(a.size / 1024).toFixed(0)} KB`}
                  >
                    <FileText className="h-3 w-3" />
                    <span className="max-w-[150px] truncate">{a.name}</span>
                    <span className="text-muted-foreground">[{a.kind}]</span>
                    <button
                      onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                      className="ml-1 text-muted-foreground hover:text-destructive"
                      aria-label="Usuń załącznik"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
              <div className="flex flex-col gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={send.isPending}
                  aria-label="Dołącz pliki"
                  title="Dołącz dowolne pliki (tekst, PDF, obrazy, binarki — do 25 MB)"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
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
              </div>
              <Button
                size="icon"
                onClick={submit}
                disabled={
                  send.isPending ||
                  (!input.trim() && attachments.filter((a) => a.text).length === 0)
                }
              >
                {send.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
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
          <details
            key={i}
            className="rounded-md border border-dashed bg-muted/40 px-2 py-1 text-xs"
          >
            <summary className="cursor-pointer text-muted-foreground">
              {r.is_error ? "❌ wynik narzędzia (błąd)" : "✓ wynik narzędzia"}
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px]">
              {r.content}
            </pre>
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
