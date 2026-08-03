import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ChatMsg = { id?: string; role: "user" | "assistant" | "staff"; content: string };

const STORAGE_KEY = "fy_chat_session_id";
const GREETING =
  "Cześć! 👋 Jestem asystentem Finance You. Napisz w czym mogę pomóc — pożyczka pod zastaw nieruchomości, kwota, dokumenty? Odpowiem od ręki.";

function getSessionId(storageKey: string): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(storageKey);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(storageKey, id);
  }
  return id;
}

/**
 * Pływający czat na stronie (landing). Rozmawia z tym samym agentem
 * (runAgentTurn) co Messenger / Instagram / e-mail, przez publiczny
 * endpoint /api/public/chat-widget. Kanał komunikacji przychodzącej "chat".
 *
 * Przez propsy (endpoint/greeting/storageKey/nagłówek) obsługuje też wariant
 * dla inwestorów instytucjonalnych (/api/public/investor-chat-widget) — osobna
 * sesja w localStorage, żeby rozmowy klienta i inwestora się nie mieszały.
 */
export function ChatWidget({
  source = "landing",
  endpoint = "/api/public/chat-widget",
  greeting = GREETING,
  storageKey = STORAGE_KEY,
  title = "Asystent Finance You",
  subtitle = "Odpowiadamy od ręki, 24/7",
}: {
  source?: string;
  endpoint?: string;
  greeting?: string;
  storageKey?: string;
  title?: string;
  subtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadedHistory, setLoadedHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionId(getSessionId(storageKey));
  }, [storageKey]);

  // Historia rozmowy: pobierana przy otwarciu i odświeżana co 10 s,
  // gdy okno jest otwarte — dzięki temu widać też odpowiedzi operatora.
  useEffect(() => {
    if (!open || !sessionId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${endpoint}?sessionId=${encodeURIComponent(sessionId)}`);
        const json = await res.json();
        if (cancelled) return;
        const hist: ChatMsg[] = Array.isArray(json?.messages)
          ? json.messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content }))
          : [];
        setMessages(hist);
        setLoadedHistory(true);
      } catch {
        if (!cancelled) setLoadedHistory(true);
      }
    };
    load();
    const iv = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [open, sessionId, endpoint]);

  const shown = useMemo<ChatMsg[]>(() => {
    if (messages.length > 0) return messages;
    return [{ role: "assistant", content: greeting }];
  }, [messages, greeting]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [shown.length, open, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending || !sessionId) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text, source }),
      });
      const json = await res.json();
      if (json?.ok && json.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: String(json.reply) }]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Przepraszam, coś poszło nie tak. Spróbuj ponownie za chwilę.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Brak połączenia. Sprawdź internet i spróbuj ponownie.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Przycisk otwierający */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Otwórz czat z asystentem"
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] text-accent-foreground shadow-lg shadow-accent/40 transition hover:brightness-110"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Okno czatu */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[70vh] max-h-[560px] w-[92vw] max-w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] px-4 py-3 text-accent-foreground">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              <div className="leading-tight">
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-[11px] opacity-80">{subtitle}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Zamknij czat"
              className="rounded-md p-1 transition hover:bg-black/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {open && sessionId && !loadedHistory && messages.length === 0 && (
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
                      mine
                        ? "bg-primary text-primary-foreground"
                        : m.role === "staff"
                          ? "border border-accent/40 bg-accent/10 text-foreground"
                          : "bg-muted text-foreground"
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
              Wysyłając wiadomość akceptujesz{" "}
              <a href="/polityka-prywatnosci" className="underline hover:text-foreground">
                politykę prywatności
              </a>
              .
            </div>
          </div>
        </div>
      )}
    </>
  );
}
