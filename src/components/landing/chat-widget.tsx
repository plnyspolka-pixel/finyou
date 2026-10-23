import { useEffect, useRef, useState } from "react";
import { MessageCircle, Mic, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import mark from "@/assets/financeyou-mark.png.asset.json";
import { createAniaSession, publicAniaSurface, type AniaMode } from "@/lib/public-ania-session";
import type { VoiceState } from "@/lib/voice-conversation";

type Message = { role: "user" | "assistant"; content: string };

/** Compatibility props preserve existing public-page callers. Only one Ania
 * window owns the live socket; old per-message HTTP chat is not used here. */
export function ChatWidget({ source = "landing", endpoint, subtitle = "asystentka Finance You" }: {
  source?: string; endpoint?: string; greeting?: string; storageKey?: string;
  title?: string; subtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AniaMode>("voice");
  const [state, setState] = useState<VoiceState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [conversationId, setConversationId] = useState("");
  const session = useRef<ReturnType<typeof createAniaSession> | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const responseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => { session.current?.stop(); clearTimeout(responseTimer.current); }, []);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [messages, sending]);

  function ensureSession() {
    if (session.current) return session.current;
    const surface = endpoint?.includes("investor-chat-widget") ? "investor_info" : publicAniaSurface(window.location.pathname);
    session.current = createAniaSession({
      surface,
      dynamicVariables: {
        channel: surface === "investor_info" ? "chat_inwestor" : "voice_web",
        channel_label: "rozmowa głosowa i tekstowa na stronie", source,
        session_id: crypto.randomUUID(), lead_id: "", first_name: "", last_name: "", email: "", phone: "",
      },
      onState: setState,
      onConversationId: setConversationId,
      onNotice: (text) => { setNotice(text); setSending(false); clearTimeout(responseTimer.current); },
      onMessage: (role, content) => {
        setMessages((prev) => [...prev, { role, content }]);
        if (role === "assistant") { setSending(false); clearTimeout(responseTimer.current); }
      },
    });
    return session.current;
  }

  async function switchMode(next: AniaMode) {
    setMode(next);
    setNotice("");
    try {
      // Text starts without microphone permission. A voice request is explicit.
      await ensureSession().setMode(next);
      if (next === "text") await ensureSession().start();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Nie udało się połączyć."); }
  }

  async function startVoice() {
    setNotice("");
    try { await ensureSession().setMode("voice"); await ensureSession().start(); }
    catch { setNotice("Nie udało się włączyć mikrofonu. Zezwól na mikrofon lub wybierz tekst."); }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setNotice("");
    try {
      await ensureSession().setMode("text");
      await ensureSession().send(text);
      setInput("");
      setSending(true);
      responseTimer.current = setTimeout(() => {
        setSending(false);
        setNotice("Odpowiedź trwa dłużej niż zwykle. Nie wysyłaj ponownie, jeśli Ania jeszcze odpowiada.");
      }, 45000);
    } catch (e) { setSending(false); setNotice(e instanceof Error ? e.message : "Nie udało się wysłać wiadomości."); }
  }

  function close() {
    session.current?.stop(); session.current = null;
    clearTimeout(responseTimer.current);
    setOpen(false); setSending(false); setState("idle"); setMessages([]); setConversationId(""); setNotice("");
  }

  return (
    <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-3 z-50 sm:right-5">
      {!open ? (
        <Button onClick={() => setOpen(true)} aria-label="Otwórz rozmowę z Anią" className="h-12 gap-2 rounded-full px-4 shadow-lg">
          <MessageCircle className="h-5 w-5" /> Ania
        </Button>
      ) : (
        <section aria-label="Rozmowa z Anią" data-conversation-id={conversationId} className="flex h-[min(560px,calc(100dvh-9rem))] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-2xl">
          <header className="flex shrink-0 items-center gap-3 border-b border-border p-3">
            <img src={mark.url} alt="Finance You" className="h-10 w-10 object-contain" />
            <div className="min-w-0 flex-1"><h2 className="font-semibold">Ania</h2><p className="text-xs text-muted-foreground">{subtitle}</p></div>
            <Button variant="ghost" size="icon" onClick={close} aria-label="Zamknij rozmowę"><X className="h-5 w-5" /></Button>
          </header>
          <div className="flex shrink-0 gap-2 border-b border-border p-2" role="group" aria-label="Tryb rozmowy">
            <Button className="flex-1" variant={mode === "voice" ? "default" : "outline"} aria-pressed={mode === "voice"} onClick={() => void switchMode("voice")}><Mic className="mr-2 h-4 w-4" />Głos</Button>
            <Button className="flex-1" variant={mode === "text" ? "default" : "outline"} aria-pressed={mode === "text"} onClick={() => void switchMode("text")}><MessageCircle className="mr-2 h-4 w-4" />Tekst</Button>
          </div>
          <div className="shrink-0 px-3 pt-2 text-xs text-muted-foreground" role="status">
            {state === "connecting" ? "Łączę z Anią…" : state === "speaking" ? "Ania mówi…" : state === "listening" ? "Ania jest połączona" : "Gotowa do rozmowy"}
          </div>
          <div ref={scroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" role="log" aria-live="polite">
            {messages.map((m, i) => <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}><p className={`max-w-[90%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>{m.content}</p></div>)}
            {sending && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Ania odpowiada…</p>}
          </div>
          {notice && <p role="alert" className="shrink-0 px-3 pb-2 text-xs text-destructive">{notice}</p>}
          <div className="shrink-0 border-t border-border p-3">
            {mode === "text" ? <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2">
              <textarea aria-label="Wiadomość do Ani" placeholder="Napisz wiadomość…" value={input} maxLength={4000} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} rows={2} className="min-w-0 flex-1 resize-none rounded-md border border-input bg-background p-2 text-sm text-foreground focus-visible:outline-ring" />
              <Button type="submit" size="icon" disabled={!input.trim() || sending} aria-label="Wyślij"><Send className="h-4 w-4" /></Button>
            </form> : <><p className="mb-2 text-xs text-muted-foreground">Mikrofon pozwoli Ani usłyszeć Twoje pytanie.</p><Button className="w-full" onClick={() => void startVoice()} disabled={state === "connecting"}><Mic className="mr-2 h-4 w-4" />{state === "listening" || state === "speaking" ? "Włącz głos" : "Porozmawiaj z Anią"}</Button></>}
            <p className="mt-2 text-[10px] text-muted-foreground">Rozmowa z AI · <a href="/polityka-prywatnosci" className="underline">Polityka prywatności</a></p>
          </div>
        </section>
      )}
    </div>
  );
}
