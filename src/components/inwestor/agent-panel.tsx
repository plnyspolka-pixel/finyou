import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Loader2, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  getInvestorAssistantHistory,
  sendInvestorAssistantMessage,
} from "@/lib/investor-assistant.functions";

type ChatMsg = { id?: string; role: "user" | "assistant"; content: string };

const GREETING =
  "Dzień dobry! Jestem agentem AI panelu inwestora. Zapytaj o dostępne wnioski, proces inwestycji, kalkulator, oferty i pojęcia (KW, hipoteka, LTV, MPKK) — poprowadzę Cię krok po kroku.";

const SUGGESTIONS = [
  "Jak złożyć ofertę do wniosku?",
  "Jak działa rata balonowa?",
  "Co oznacza LTV i limit MPKK?",
  "Jak pobrać PDF oferty z harmonogramem?",
];

/**
 * Agent czatowy AI — GŁÓWNY EKRAN panelu /inwestor. Pełnowymiarowy panel
 * rozmowy (nie pływający dymek): historia per użytkownik trzymana serwerowo
 * (investor_assistant_messages), rozmowa przez te same server functions co
 * widget asystenta.
 */
export function InvestorAgentPanel() {
  const loadHistory = useServerFn(getInvestorAssistantHistory);
  const sendMessage = useServerFn(sendInvestorAssistantMessage);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadedHistory, setLoadedHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadHistory()
      .then((hist) => {
        setMessages(hist.map((m) => ({ id: m.id, role: m.role, content: m.content })));
      })
      .catch(() => {
        /* brak dostępu albo błąd — pokaż samo powitanie */
      })
      .finally(() => setLoadedHistory(true));
  }, [loadHistory]);

  const shown = useMemo<ChatMsg[]>(() => {
    if (messages.length > 0) return messages;
    return [{ role: "assistant", content: GREETING }];
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [shown.length, sending]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    try {
      const res = await sendMessage({ data: { message: text } });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : null;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: msg ?? "Przepraszam, coś poszło nie tak. Spróbuj ponownie za chwilę.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
      <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] px-5 py-4 text-accent-foreground">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15">
          <Bot className="h-6 w-6" />
        </div>
        <div className="leading-tight">
          <div className="text-base font-bold">Agent AI panelu inwestora</div>
          <div className="text-xs opacity-85">
            Główny ekran — zapytaj o wnioski, oferty, kalkulator i proces inwestycji
          </div>
        </div>
        <Sparkles className="ml-auto h-5 w-5 opacity-80" />
      </div>

      <div ref={scrollRef} className="h-[380px] space-y-3 overflow-y-auto px-4 py-4">
        {!loadedHistory && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Wczytuję rozmowę…
          </div>
        )}
        {shown.map((m, i) => {
          const mine = m.role === "user";
          return (
            <div key={m.id ?? i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
                  mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
            </div>
          </div>
        )}
      </div>

      {messages.length === 0 && loadedHistory && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-accent hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Napisz wiadomość do agenta…"
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          <Button
            type="button"
            size="icon"
            onClick={() => void send()}
            disabled={!input.trim() || sending}
            aria-label="Wyślij"
            className="h-11 w-11"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="px-1 pt-1.5 text-[10px] text-muted-foreground">
          Agent ma charakter informacyjny — nie udziela porad inwestycyjnych.
        </div>
      </div>
    </div>
  );
}
