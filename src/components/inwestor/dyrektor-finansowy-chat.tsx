import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  sendDfChat,
  listDfConversations,
  getDfConversation,
  deleteDfConversation,
} from "@/lib/dyrektor-finansowy.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Bot, Send, Trash2, Plus, Loader2, Wrench, Download, History, MessageSquarePlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import type { LoanCalculatorState } from "@/components/loan-calculator";

/** Kompaktowy zrzut stanu kalkulatora wysyłany do AI (bez pełnego harmonogramu). */
function snapshotCalculator(s: LoanCalculatorState | null | undefined) {
  if (!s) return undefined;
  return {
    amount: s.amount,
    months: s.months,
    annualRate: s.annualRate,
    commissionPct: s.commissionPct,
    commissionPln: s.commissionPln,
    financeYouFeePct: s.financeYouFeePct,
    financeYouFeePln: s.financeYouFeePln,
    grossPrincipal: s.grossPrincipal,
    maxPayment: s.maxPayment,
    nominalRata: s.nominalRata,
    cappedRata: s.cappedRata,
    balloon: s.balloon,
    totalCost: s.totalCost,
    totalToRepay: s.totalToRepay,
    scheduleLength: s.schedule?.length,
  };
}

type Message = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls: Array<{ id: string; name: string; input: Record<string, unknown> }> | null;
  tool_results: Array<{ tool_use_id: string; content: string; is_error?: boolean }> | null;
  created_at: string;
};

const SUGGESTIONS = [
  "Oceń parametry, które ustawiłem w kalkulatorze",
  "Pokaż moje oferty i ich statusy",
  "Którzy klienci zaakceptowali moją ofertę?",
  "Wygeneruj CSV oferty dla wybranego wniosku",
  "Poprowadź procedurę zawarcia pożyczki dla zaakceptowanej oferty",
  "Jakie wzory dokumentów mam dostępne?",
];

/** Wyłuskuje bloki ```csv ... ``` z treści, aby umożliwić pobranie pliku. */
function extractCsvBlocks(content: string): { name: string; csv: string }[] {
  const out: { name: string; csv: string }[] = [];
  const re = /```csv\s*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  let i = 1;
  while ((m = re.exec(content))) {
    out.push({ name: `oferta_${i}.csv`, csv: m[1].trim() });
    i++;
  }
  return out;
}

function downloadCsv(name: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function DyrektorFinansowyChat({ calculatorState }: { calculatorState?: LoanCalculatorState | null }) {
  const [convId, setConvId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  // Najświeższy stan kalkulatora — przez ref, by uniknąć nieaktualnych domknięć przy wysyłce.
  const calcRef = useRef<LoanCalculatorState | null | undefined>(calculatorState);
  useEffect(() => {
    calcRef.current = calculatorState;
  }, [calculatorState]);

  const sendFn = useServerFn(sendDfChat);
  const listFn = useServerFn(listDfConversations);
  const getFn = useServerFn(getDfConversation);
  const delFn = useServerFn(deleteDfConversation);

  const convs = useQuery({ queryKey: ["df-convs"], queryFn: () => listFn() });

  const messagesQ = useQuery({
    queryKey: ["df-msgs", convId],
    queryFn: () => (convId ? getFn({ data: { id: convId } }) : Promise.resolve({ messages: [] })),
    enabled: !!convId,
  });

  const messages = useMemo(() => (messagesQ.data?.messages ?? []) as Message[], [messagesQ.data]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (text: string) =>
      sendFn({ data: { conversation_id: convId, message: text, calculator: snapshotCalculator(calcRef.current) } }),
    onSuccess: async (r) => {
      setConvId(r.conversation_id);
      setInput("");
      await qc.invalidateQueries({ queryKey: ["df-msgs", r.conversation_id] });
      await qc.invalidateQueries({ queryKey: ["df-convs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: async () => {
      setConvId(undefined);
      await qc.invalidateQueries({ queryKey: ["df-convs"] });
    },
  });

  const submit = (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || send.isPending) return;
    qc.setQueryData(["df-msgs", convId], (old: { messages: Message[] } | undefined) => ({
      messages: [
        ...(old?.messages ?? []),
        {
          id: `tmp-${Date.now()}`,
          role: "user" as const,
          content: value,
          tool_calls: null,
          tool_results: null,
          created_at: new Date().toISOString(),
        },
      ],
    }));
    send.mutate(value);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary">
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Dyrektor finansowy · AI</div>
          <div className="text-[11px] text-muted-foreground">
            Claude · widzi ustawienia kalkulatora, Twoje dane, oferty, dane klientów i wzory dokumentów
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
          <History className="mr-1 h-4 w-4" />
          Historia
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setConvId(undefined);
            setShowHistory(false);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Nowa
        </Button>
      </div>

      {showHistory && (
        <div className="max-h-48 overflow-y-auto border-b p-3 space-y-1.5">
          {(convs.data?.conversations ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">Brak wcześniejszych rozmów.</p>
          )}
          {(convs.data?.conversations ?? []).map((c: { id: string; title: string }) => (
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
                  setShowHistory(false);
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
      )}

      <CardContent className="p-0">
        <div ref={scrollRef} className="h-[420px] overflow-y-auto space-y-3 p-4">
          {messages.length === 0 && !send.isPending && (
            <div className="space-y-3">
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Cześć! Jestem Twoim Dyrektorem finansowym. Pomogę Ci:
                <ul className="ml-4 mt-2 list-disc space-y-1 text-xs">
                  <li>przeanalizować Twoje oferty i dane klientów, którzy je zaakceptowali,</li>
                  <li>wygenerować plik CSV z parametrami oferty do wgrania pod ofertę klienta,</li>
                  <li>złożyć ofertę dla klienta,</li>
                  <li>poprowadzić procedurę zawarcia pożyczki i przygotować umowę do podpisu,</li>
                  <li>skorzystać z wzorów dokumentów dostępnych dla inwestorów.</li>
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                  >
                    <MessageSquarePlus className="mr-1 inline h-3 w-3" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} m={m} />
          ))}
          {send.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Dyrektor finansowy analizuje (może korzystać z narzędzi)…
            </div>
          )}
        </div>

        <div className="border-t p-3">
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
              placeholder="Zapytaj Dyrektora finansowego… (⌘/Ctrl+Enter = wyślij)"
              rows={2}
              className="resize-none text-sm"
            />
            <Button onClick={() => submit()} disabled={send.isPending || !input.trim()} size="icon">
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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
  const csvBlocks = !isUser ? extractCsvBlocks(m.content) : [];
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        {m.content && (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-background/60 prose-pre:text-xs">
            <ReactMarkdown>{m.content}</ReactMarkdown>
          </div>
        )}
        {csvBlocks.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {csvBlocks.map((b, i) => (
              <Button key={i} size="sm" variant="outline" onClick={() => downloadCsv(b.name, b.csv)}>
                <Download className="mr-1 h-3.5 w-3.5" />
                Pobierz {b.name}
              </Button>
            ))}
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
