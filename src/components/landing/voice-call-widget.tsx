// Widget rozmowy głosowej z Anią — w całości nasz interfejs (polskie napisy,
// kolory Finance You), bez osadzonego widgetu ElevenLabs. Silnikiem rozmowy
// nadal jest agent ElevenLabs, ale rozmawiamy z nim po swojemu:
// lib/voice-conversation.ts (WebSocket + mikrofon), a podpisany URL
// sesji wydaje /api/public/voice-session.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Mic, MicOff, Phone, PhoneOff, X, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  startVoiceConversation,
  type VoiceConversation,
  type VoiceState,
} from "@/lib/voice-conversation";

const STATUS_TEXT: Record<VoiceState, string> = {
  idle: "Gotowa do rozmowy",
  connecting: "Łączę…",
  listening: "Słucham Cię",
  speaking: "Ania mówi…",
  ended: "Rozmowa zakończona",
  error: "Rozmowa przerwana",
};

export interface VoiceCallWidgetProps {
  /** Powierzchnia agenta: przyjęcie wniosku albo uzupełnianie braków. */
  surface?: "intake" | "missing_info";
  /** Zmienne przekazywane agentowi na starcie rozmowy. */
  dynamicVariables?: Record<string, string | number | boolean>;
  /** „floating" — pływający przycisk na stronie; „inline" — karta w treści. */
  placement?: "floating" | "inline";
  title?: string;
  subtitle?: string;
  /** Zdanie zachęty widoczne przed rozpoczęciem rozmowy. */
  intro?: string;
  /** Selektor sekcji z wnioskiem — przycisk „Złóż wniosek" przewija do niej. */
  applyTargetSelector?: string | null;
  /** Gdy podane, w panelu pojawia się odnośnik „Wolę napisać". */
  onSwitchToChat?: () => void;
  className?: string;
  /** Dodatkowa treść pod zachętą (np. lista braków we wniosku). */
  children?: ReactNode;
}

export function VoiceCallWidget({
  surface = "intake",
  dynamicVariables,
  placement = "floating",
  title = "Ania",
  subtitle = "asystentka Finance You",
  intro = "Opowiedz, czego potrzebujesz — Ania odpowie na pytania o pożyczkę pod zastaw nieruchomości i podpowie, co dalej.",
  applyTargetSelector = "#landing-wizard-top",
  onSwitchToChat,
  className,
  children,
}: VoiceCallWidgetProps) {
  const [available, setAvailable] = useState(surface === "missing_info");
  const [open, setOpen] = useState(placement === "inline");
  const [state, setState] = useState<VoiceState>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAgent, setLastAgent] = useState<string | null>(null);
  const [lastUser, setLastUser] = useState<string | null>(null);
  const sessionRef = useRef<VoiceConversation | null>(null);

  // Rozmowa głosowa ma sens tylko wtedy, gdy agent dla tej powierzchni istnieje.
  useEffect(() => {
    if (surface !== "intake") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/public/agent-config?surface=intake");
        const json: { agentId?: string | null } = await res.json();
        if (!cancelled) setAvailable(Boolean(json?.agentId));
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surface]);

  const hangUp = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setMuted(false);
  }, []);

  // Zwolnij mikrofon, gdy komponent znika (np. zmiana podstrony).
  useEffect(() => () => sessionRef.current?.stop(), []);

  const call = useCallback(async () => {
    if (sessionRef.current) return;
    setError(null);
    setLastAgent(null);
    setLastUser(null);
    try {
      sessionRef.current = await startVoiceConversation(
        { surface, dynamicVariables },
        {
          onState: setState,
          onAgentMessage: setLastAgent,
          onUserMessage: setLastUser,
          onError: (message) => setError(message),
        },
      );
    } catch (e) {
      sessionRef.current = null;
      setState("idle");
      setError(e instanceof Error ? e.message : "Nie udało się rozpocząć rozmowy.");
    }
  }, [surface, dynamicVariables]);

  const inCall = state === "connecting" || state === "listening" || state === "speaking";

  const goToApplication = useCallback(() => {
    if (!applyTargetSelector) return;
    const el = document.querySelector(applyTargetSelector);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.location.assign("/klient");
  }, [applyTargetSelector]);

  const orb = useMemo(
    () => (
      <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[oklch(0.65_0.13_235)] text-base font-semibold text-accent-foreground">
        A
        {inCall && (
          <span
            className={`absolute inset-0 rounded-full border-2 border-accent/70 ${
              state === "speaking" ? "animate-ping" : "animate-pulse"
            }`}
          />
        )}
      </span>
    ),
    [inCall, state],
  );

  if (!available) return null;

  const panel = (
    <div
      className={
        placement === "floating"
          ? "w-[92vw] max-w-[340px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          : "overflow-hidden rounded-2xl border border-border bg-card"
      }
    >
      <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] px-4 py-3 text-accent-foreground">
        {orb}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px] opacity-80">{subtitle}</div>
        </div>
        {placement === "floating" && (
          <button
            type="button"
            onClick={() => {
              hangUp();
              setOpen(false);
            }}
            aria-label="Zamknij rozmowę"
            className="rounded-md p-1 transition hover:bg-black/10"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              inCall
                ? "bg-emerald-500"
                : state === "error"
                  ? "bg-destructive"
                  : "bg-muted-foreground/40"
            }`}
          />
          <span className="font-medium">{STATUS_TEXT[state]}</span>
          {state === "connecting" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </div>

        {!inCall && !error && <p className="text-sm text-muted-foreground">{intro}</p>}

        {children}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {lastUser && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Ty:</span> {lastUser}
          </p>
        )}
        {lastAgent && (
          <p className="rounded-xl bg-muted px-3 py-2 text-sm text-foreground">{lastAgent}</p>
        )}

        <div className="flex items-center gap-2">
          {inCall ? (
            <>
              <Button type="button" variant="destructive" className="flex-1" onClick={hangUp}>
                <PhoneOff className="mr-2 h-4 w-4" /> Zakończ
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={muted ? "Włącz mikrofon" : "Wycisz mikrofon"}
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  sessionRef.current?.setMuted(next);
                }}
              >
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </>
          ) : (
            <Button type="button" className="flex-1" onClick={() => void call()}>
              <Phone className="mr-2 h-4 w-4" /> Porozmawiaj z Anią
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {applyTargetSelector && (
            <button
              type="button"
              onClick={goToApplication}
              className="underline hover:text-foreground"
            >
              Złóż wniosek
            </button>
          )}
          {onSwitchToChat && (
            <button
              type="button"
              onClick={() => {
                hangUp();
                setOpen(false);
                onSwitchToChat();
              }}
              className="inline-flex items-center gap-1 underline hover:text-foreground"
            >
              <MessageCircle className="h-3 w-3" /> Wolę napisać
            </button>
          )}
          <span>Rozmowa z asystentem AI. Dokumentów nie prześlesz głosem.</span>
        </div>
      </div>
    </div>
  );

  if (placement === "inline") return <div className={className}>{panel}</div>;

  return (
    <div
      className={`fixed bottom-24 right-5 z-50 flex flex-col items-end gap-2 ${className ?? ""}`}
    >
      {open && panel}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Porozmawiaj głosowo z Anią"
          className="flex h-14 items-center gap-2 rounded-full bg-card px-4 text-sm font-medium text-foreground shadow-lg ring-1 ring-border transition hover:bg-muted"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-accent to-[oklch(0.65_0.13_235)] text-accent-foreground">
            <Phone className="h-4 w-4" />
          </span>
          Porozmawiaj z Anią
        </button>
      )}
    </div>
  );
}
