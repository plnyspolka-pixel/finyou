import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  sendAdminChat,
  listConversations,
  getConversation,
  deleteConversation,
  transcribeAdminAudio,
  getAiSettings,
  updateAiSettings,
  listAiAuditLog,
} from "@/lib/ai-admin.functions";
import { AI_ADMIN_MODELS, type AiAdminModelId } from "@/lib/ai-admin.models";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bot,
  Send,
  Trash2,
  Plus,
  Loader2,
  Wrench,
  Mic,
  Square,
  Paperclip,
  X,
  FileText,
  Settings2,
  History,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Asystent panelu — tekstowy bot administratora („z wnętrza apki”).
 *
 * Jeden komponent obsługuje dwa miejsca montowania: kartę na pulpicie
 * (`/admin`) i pływający launcher w layoucie panelu, dostępny na każdej
 * podstronie. Konwersacja jest wspólna dla wszystkich instancji — trzymamy jej
 * id w cache React Query (klucz `CURRENT_CONV_KEY`) + localStorage, więc rozmowę
 * zaczętą na pulpicie kontynuujesz w launcherze na innej stronie.
 *
 * Backend: `src/lib/ai-admin.functions.ts` (+ narzędzia w `ai-admin.server.ts`).
 */

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

const CURRENT_CONV_KEY = ["ai-admin-current-conv"] as const;
const CONV_STORAGE_KEY = "fy_admin_bot_conv";

/** Podpowiedzi startowe — najczęstsze rzeczy, które admin robi „z czatu”. */
const STARTERS = [
  "Pokaż 10 najnowszych leadów ze statusem i źródłem.",
  "Ile wniosków czeka na inwestora dłużej niż 7 dni?",
  "Podsumuj kolejkę follow-up: co jest zaległe?",
  "Które wnioski mają braki w dokumentach?",
];

/** Wspólne dla wszystkich instancji id aktywnej rozmowy (cache RQ + localStorage). */
function useCurrentConversation() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: CURRENT_CONV_KEY,
    queryFn: () => {
      if (typeof window === "undefined") return null;
      try {
        return window.localStorage.getItem(CONV_STORAGE_KEY);
      } catch {
        return null;
      }
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const setConv = useCallback(
    (id: string | null) => {
      qc.setQueryData(CURRENT_CONV_KEY, id);
      try {
        if (id) window.localStorage.setItem(CONV_STORAGE_KEY, id);
        else window.localStorage.removeItem(CONV_STORAGE_KEY);
      } catch {
        /* prywatny tryb przeglądarki — działamy tylko w pamięci */
      }
    },
    [qc],
  );

  return [data ?? undefined, setConv] as const;
}

export type AdminBotProps = {
  /** Klasy kontenera — tu ustawia się wysokość (np. `h-[520px]`). */
  className?: string;
  /** Ciaśniejszy layout: bez podpowiedzi startowych i z mniejszym paddingiem. */
  compact?: boolean;
  /** Dodatkowe przyciski w nagłówku (np. maksymalizacja / zamknięcie launchera). */
  headerActions?: ReactNode;
};

export function AdminBot({ className, compact = false, headerActions }: AdminBotProps) {
  const [convId, setConvId] = useCurrentConversation();
  const [input, setInput] = useState("");
  const [view, setView] = useState<"chat" | "list">("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  });

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
      setConvId(r.conversation_id ?? null);
      setInput("");
      await qc.invalidateQueries({ queryKey: ["ai-admin-msgs", r.conversation_id] });
      await qc.invalidateQueries({ queryKey: ["ai-admin-convs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Podczas tury bot dopisuje wiadomości i wyniki narzędzi do bazy na bieżąco,
  // więc odpytujemy historię co 2 s — widać kolejne kroki, nie tylko efekt końcowy.
  const messagesQ = useQuery({
    queryKey: ["ai-admin-msgs", convId],
    queryFn: () => (convId ? getFn({ data: { id: convId } }) : Promise.resolve({ messages: [] })),
    enabled: !!convId,
    refetchInterval: send.isPending && convId ? 2000 : false,
  });

  const messages = useMemo(() => (messagesQ.data?.messages ?? []) as Message[], [messagesQ.data]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, send.isPending, view]);

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: async (_r, id) => {
      if (id === convId) setConvId(null);
      await qc.invalidateQueries({ queryKey: ["ai-admin-convs"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
          if (res.text) setInput((prev) => (prev ? `${prev} ${res.text}` : res.text));
          else toast.error("Nie udało się rozpoznać mowy");
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

  const submit = (override?: string) => {
    const text = (override ?? input).trim();
    if ((!text && attachments.length === 0) || send.isPending) return;
    const labelParts = attachments.map(
      (a) => `${a.name} (${(a.size / 1024).toFixed(0)} KB, ${a.kind})`,
    );
    const userVisible =
      text + (labelParts.length ? `\n\n📎 Załączniki: ${labelParts.join(", ")}` : "");
    // Optymistyczna wiadomość — serwer i tak zapisuje ją od razu, ale czat nie
    // może wyglądać na „pusty” w czasie tury (bywa długa, bo bot używa narzędzi).
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
    setInput("");
    setAttachments([]);
    setView("chat");
  };

  const activeTitle = convs.data?.conversations?.find((c) => c.id === convId)?.title;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background",
        className,
      )}
    >
      {/* Nagłówek */}
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">Asystent panelu</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {send.isPending
              ? "Pracuję…"
              : (activeTitle ?? "Baza, pliki projektu i nawigacja po panelu")}
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => {
            setConvId(null);
            setView("chat");
          }}
          aria-label="Nowa rozmowa"
          title="Nowa rozmowa"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setView(view === "chat" ? "list" : "chat")}
          aria-label={view === "chat" ? "Historia rozmów" : "Wróć do czatu"}
          title={view === "chat" ? "Historia rozmów" : "Wróć do czatu"}
        >
          {view === "chat" ? (
            <History className="h-4 w-4" />
          ) : (
            <MessageSquare className="h-4 w-4" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setSettingsOpen(true)}
          aria-label="Ustawienia asystenta"
          title="Ustawienia asystenta"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
        {headerActions}
      </div>

      {view === "list" ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {(convs.data?.conversations ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Brak zapisanych rozmów.</p>
          )}
          {(convs.data?.conversations ?? []).map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted",
                convId === c.id && "border-primary",
              )}
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
                aria-label="Usuń rozmowę"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto", compact ? "p-2" : "p-3")}
          >
            {messages.length === 0 && !send.isPending && (
              <div className="space-y-3">
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Napisz, co mam zrobić. Mogę odpytać bazę, policzyć, poprawić dane po Twoim
                  potwierdzeniu, zajrzeć w pliki projektu i wskazać właściwą stronę panelu.
                </div>
                {!compact && (
                  <div className="flex flex-wrap gap-1.5">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        onClick={() => submit(s)}
                        className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} />
            ))}
            {send.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Myślę i wywołuję narzędzia…
              </div>
            )}
          </div>

          <div className="shrink-0 space-y-2 border-t p-2">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((a, i) => (
                  <div
                    key={`${a.name}-${i}`}
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
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Napisz wiadomość… (Enter = wyślij, Shift+Enter = nowa linia)"
                rows={compact ? 1 : 2}
                className="max-h-40 resize-none text-sm"
              />
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
                className="shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={send.isPending}
                aria-label="Dołącz pliki"
                title="Dołącz pliki (tekst, PDF, obrazy — do 25 MB)"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant={recording ? "destructive" : "outline"}
                className="shrink-0"
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
              <Button
                size="icon"
                className="shrink-0"
                onClick={() => submit()}
                disabled={send.isPending || (!input.trim() && attachments.length === 0)}
                aria-label="Wyślij"
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

      <AdminBotSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

/** Link z odpowiedzi bota: wewnętrzne ścieżki nawigują bez przeładowania strony. */
function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const navigate = useNavigate();
  if (href && href.startsWith("/")) {
    return (
      <a
        href={href}
        className="underline decoration-dotted"
        onClick={(e) => {
          e.preventDefault();
          void navigate({ to: href as never });
        }}
      >
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="underline">
      {children}
    </a>
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
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-lg px-3 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {m.content && (
          <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-pre:bg-background/60 prose-pre:text-xs prose-table:text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
              {m.content}
            </ReactMarkdown>
          </div>
        )}
        {m.tool_calls && m.tool_calls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
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

type AiSettings = {
  model: AiAdminModelId;
  system_prompt: string;
  enable_db_read: boolean;
  enable_db_write: boolean;
  enable_file_read: boolean;
  enable_file_write: boolean;
  max_tokens: number;
  temperature: number;
};

/** Ustawienia bota: model, uprawnienia narzędzi, prompt + log wywołań narzędzi. */
function AdminBotSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const getFn = useServerFn(getAiSettings);
  const saveFn = useServerFn(updateAiSettings);
  const auditFn = useServerFn(listAiAuditLog);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AiSettings | null>(null);

  const settingsQ = useQuery({
    queryKey: ["ai-admin-settings"],
    queryFn: () => getFn(),
    enabled: open,
  });

  const auditQ = useQuery({
    queryKey: ["ai-admin-audit"],
    queryFn: () => auditFn(),
    enabled: open,
  });

  useEffect(() => {
    // W bazie `model` to zwykły text — zawężamy do listy obsługiwanych modeli,
    // żeby select i walidacja serwerowa operowały na tym samym zbiorze.
    const s = settingsQ.data?.settings as
      | (Omit<AiSettings, "model"> & { model: string })
      | null
      | undefined;
    if (s && !draft) {
      setDraft({
        model: s.model as AiAdminModelId,
        system_prompt: s.system_prompt,
        enable_db_read: s.enable_db_read,
        enable_db_write: s.enable_db_write,
        enable_file_read: s.enable_file_read,
        enable_file_write: s.enable_file_write,
        max_tokens: Number(s.max_tokens),
        temperature: Number(s.temperature),
      });
    }
  }, [settingsQ.data, draft]);

  // Po zamknięciu zapominamy szkic, żeby przy kolejnym otwarciu wczytać stan z bazy.
  useEffect(() => {
    if (!open) setDraft(null);
  }, [open]);

  const save = useMutation({
    mutationFn: (d: AiSettings) => saveFn({ data: d }),
    onSuccess: async () => {
      toast.success("Ustawienia asystenta zapisane");
      await qc.invalidateQueries({ queryKey: ["ai-admin-settings"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = (p: Partial<AiSettings>) => setDraft((d) => (d ? { ...d, ...p } : d));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ustawienia asystenta</DialogTitle>
          <DialogDescription>
            Model, uprawnienia narzędzi i prompt systemowy. Zmiany dotyczą wszystkich miejsc, w
            których asystent jest osadzony.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="model">
          <TabsList>
            <TabsTrigger value="model">Model i uprawnienia</TabsTrigger>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="audit">Log narzędzi</TabsTrigger>
          </TabsList>

          <TabsContent value="model" className="mt-4 space-y-4">
            {!draft ? (
              <p className="text-sm text-muted-foreground">Ładowanie…</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select
                    value={draft.model}
                    onValueChange={(v) => patch({ model: v as AiAdminModelId })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_ADMIN_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Limit tokenów odpowiedzi</Label>
                    <Input
                      type="number"
                      min={500}
                      max={16000}
                      value={draft.max_tokens}
                      onChange={(e) => patch({ max_tokens: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Temperatura (0–1)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={1}
                      value={draft.temperature}
                      onChange={(e) => patch({ temperature: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-3 rounded-md border p-3">
                  <ToggleRow
                    label="Odczyt bazy danych"
                    hint="SELECT-y, podglądanie schematu i liczników."
                    checked={draft.enable_db_read}
                    onChange={(v) => patch({ enable_db_read: v })}
                  />
                  <ToggleRow
                    label="Zapis do bazy danych"
                    hint="INSERT/UPDATE/DELETE oraz DDL. Każde wywołanie ląduje w logu narzędzi."
                    checked={draft.enable_db_write}
                    onChange={(v) => patch({ enable_db_write: v })}
                  />
                  <ToggleRow
                    label="Odczyt plików projektu"
                    hint="Podglądanie i przeszukiwanie kodu (bez plików z sekretami)."
                    checked={draft.enable_file_read}
                    onChange={(v) => patch({ enable_file_read: v })}
                  />
                  <ToggleRow
                    label="Zapis plików projektu"
                    hint="Tworzenie i nadpisywanie plików w repo działającej instancji."
                    checked={draft.enable_file_write}
                    onChange={(v) => patch({ enable_file_write: v })}
                  />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="prompt" className="mt-4">
            {!draft ? (
              <p className="text-sm text-muted-foreground">Ładowanie…</p>
            ) : (
              <div className="space-y-2">
                <Label>Prompt systemowy</Label>
                <Textarea
                  rows={14}
                  value={draft.system_prompt}
                  onChange={(e) => patch({ system_prompt: e.target.value })}
                  className="text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  {draft.system_prompt.length} / 8000 znaków (minimum 20).
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <div className="space-y-1.5">
              {(auditQ.data?.entries ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {auditQ.isLoading ? "Ładowanie…" : "Brak wywołań narzędzi."}
                </p>
              )}
              {(auditQ.data?.entries ?? []).map((e) => (
                <div
                  key={e.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={e.success ? "outline" : "destructive"}
                        className="text-[10px]"
                      >
                        {e.tool_name}
                      </Badge>
                      <span className="text-muted-foreground">
                        {new Date(e.created_at).toLocaleString("pl-PL")}
                      </span>
                    </div>
                    {e.error && <p className="mt-1 break-words text-destructive">{e.error}</p>}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zamknij
          </Button>
          <Button
            onClick={() => draft && save.mutate(draft)}
            disabled={!draft || save.isPending || draft.system_prompt.trim().length < 20}
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Zapisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
