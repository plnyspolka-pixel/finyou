import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  getInvestorAssistantHistory,
  sendInvestorAssistantMessage,
} from "@/lib/investor-assistant.functions";

type ChatMsg = { id?: string; role: "user" | "assistant"; content: string };

const GREETING =
  "Dzień dobry! Jestem asystentem Klubu Inwestorów Hipotecznych. Pomogę odnaleźć się w panelu, wyjaśnię proces inwestycji i pojęcia (KW, hipoteka, LTV). W czym mogę pomóc?";

/**
 * Pływający asystent w panelu /inwestor — osobna logika od bota
 * instytucjonalnego: przewodnik po platformie dla inwestorów prywatnych
 * z wykupionym dostępem. Historia trzymana serwerowo per użytkownik
 * (investor_assistant_messages), rozmowa przez server functions.
 */
const EL_WIDGET_SCRIPT_ID = "elevenlabs-convai-widget-script";
const EL_WIDGET_SCRIPT_SRC = "https://elevenlabs.io/convai-widget/index.js";

export function InvestorAssistantWidget() {
  const loadHistory = useServerFn(getInvestorAssistantHistory);
  const sendMessage = useServerFn(sendInvestorAssistantMessage);
  // Agent ElevenLabs (A3) skonfigurowany → osadzony widget zamiast czatu Gemini.
  const [elAgentId, setElAgentId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/public/agent-config?surface=investor_panel");
        const json: { agentId?: string | null } = await res.json();
        if (!cancelled && json?.agentId) setElAgentId(json.agentId);
      } catch {
        /* fallback: stary silnik */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!elAgentId || document.getElementById(EL_WIDGET_SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = EL_WIDGET_SCRIPT_ID;
    script.src = EL_WIDGET_SCRIPT_SRC;
    script.async = true;
    document.body.appendChild(script);
  }, [elAgentId]);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadedHistory, setLoadedHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loadedHistory) return;
    loadHistory()
      .then((hist) => {
        setMessages(hist.map((m) => ({ id: m.id, role: m.role, content: m.content })));
      })
      .catch(() => {
        /* brak dostępu albo błąd — pokaż samo powitanie */
      })
      .finally(() => setLoadedHistory(true));
  }, [open, loadedHistory, loadHistory]);

  const shown = useMemo<ChatMsg[]>(() => {
    if (messages.length > 0) return messages;
    return [{ role: "assistant", content: GREETING }];
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [shown.length, open, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    try {
      const res = await sendMessage({ data: { message: text } });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: e?.message ?? "Przepraszam, coś poszło nie tak. Spróbuj ponownie za chwilę.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  // Toole agenta deklarują lead_id/email/phone — przekazujemy zawsze (puste,
  // gdy nieznane), inaczej widget odmawia startu rozmowy.
  if (elAgentId) {
    return createElement("elevenlabs-convai", {
      "agent-id": elAgentId,
      "dynamic-variables": JSON.stringify({ lead_id: "", email: "", phone: "" }),
    });
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Otwórz asystenta Klubu"
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] text-accent-foreground shadow-lg shadow-accent/40 transition hover:brightness-110"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[70vh] max-h-[560px] w-[92vw] max-w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] px-4 py-3 text-accent-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <div className="leading-tight">
                <div className="text-sm font-semibold">Asystent Klubu</div>
                <div className="text-[11px] opacity-80">Przewodnik po panelu inwestora</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Zamknij asystenta"
              className="rounded-md p-1 transition hover:bg-black/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {open && !loadedHistory && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Wczytuję rozmowę…
              </div>
            )}
            {shown.map((m, i) => {
              const mine = m.role === "user";
              return (
                <div key={m.id ?? i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
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

          <div className="border-t border-border p-2">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Napisz wiadomość…"
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
              />
              <Button
                type="button"
                size="icon"
                onClick={send}
                disabled={!input.trim() || sending}
                aria-label="Wyślij"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="px-1 pt-1 text-[10px] text-muted-foreground">
              Asystent ma charakter informacyjny — nie udziela porad inwestycyjnych.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
