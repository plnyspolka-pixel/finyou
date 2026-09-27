import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileSignature,
  Send,
  Loader2,
  Eye,
  FileDown,
  RotateCcw,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Wrench,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { Problem } from "@/lib/contract-engine/validator";
import type { KorektaGroszowa } from "@/lib/contract-engine/schedule";
import {
  sendUmowaAgentMessage,
  previewUmowaAgent,
  generateUmowaAgentDocx,
} from "@/lib/contract-engine/umowa-agent.functions";
import {
  buildCalcHandoffMessage,
  onCalcHandoffChange,
  readCalcHandoff,
} from "@/lib/loan-calc-handoff";
import type { LoanCalcPayload } from "@/lib/loan-calc-pdf";

type ChatMsg = { role: "user" | "assistant"; content: string };

const GREETING =
  "Dzień dobry! Przygotuję z Tobą umowę pożyczki. Zbieram dane: strony, kwotę i warunki, " +
  "nieruchomości z KW i zabezpieczenia — tekst umowy złoży silnik klauzul. Od czego zaczynamy? " +
  "Możesz też wkleić wszystkie dane naraz albo wysłać harmonogram z kalkulatora.";

const SUGGESTIONS = [
  "Zacznijmy nową umowę pożyczki",
  "Podam dane pożyczkobiorcy",
  "Kwota, prowizja i harmonogram",
  "Nieruchomość i księga wieczysta",
];

const STORAGE_KEY = "inwestor-umowa-agent-v1";
/** Znacznik czasu ostatniej kalkulacji, która już rozpoczęła rozmowę. */
const CALC_CONSUMED_KEY = "inwestor-umowa-agent-calc-consumed-ts";

function readConsumedCalcTs(): number {
  try {
    return Number(localStorage.getItem(CALC_CONSUMED_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function markCalcConsumed(ts: number): void {
  try {
    localStorage.setItem(CALC_CONSUMED_KEY, String(ts));
  } catch {
    /* pamięć lokalna niedostępna */
  }
}

interface Persisted {
  messages: ChatMsg[];
  umowa: unknown;
}

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.messages)) return { messages: p.messages, umowa: p.umowa ?? {} };
    }
  } catch {
    /* brak dostępu do localStorage — start od zera */
  }
  return { messages: [], umowa: {} };
}

/**
 * AGENT UMOWY (AI) — kreator umowy pożyczki w module „Dokumenty i umowy".
 * Agent czatowy wypełnia dane umowy dla silnika klauzul (contract-engine);
 * kod dolicza harmonogram i kwoty słownie, waliduje, renderuje podgląd i .docx.
 *
 * Start z kalkulatora: „Wyślij do kreatora" zapisuje kalkulację w handoffie;
 * panel po wejściu wykrywa nową kalkulację, zaczyna NOWĄ rozmowę i wysyła
 * harmonogram spłat jako jej pierwszą wiadomość (liczby wchodzą do szkicu
 * deterministycznie po stronie serwera).
 */
export function UmowaAgentPanel() {
  const sendFn = useServerFn(sendUmowaAgentMessage);
  const previewFn = useServerFn(previewUmowaAgent);
  const docxFn = useServerFn(generateUmowaAgentDocx);

  const [{ messages, umowa }, setState] = useState<Persisted>(() => loadPersisted());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<"" | "preview" | "docx">("");
  const [problemy, setProblemy] = useState<Problem[]>([]);
  const [autokorekty, setAutokorekty] = useState<KorektaGroszowa[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [preview, setPreview] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, umowa }));
    } catch {
      /* pamięć lokalna niedostępna — rozmowa nie przetrwa odświeżenia */
    }
  }, [messages, umowa]);

  const shown = useMemo<ChatMsg[]>(() => {
    if (messages.length > 0) return messages;
    return [{ role: "assistant", content: GREETING }];
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [shown.length, sending]);

  const bledy = problemy.filter((p) => p.poziom === "BLAD");
  const ostrzezenia = problemy.filter((p) => p.poziom === "OSTRZEZENIE");
  const maDane = !!umowa && typeof umowa === "object" && Object.keys(umowa as object).length > 0;

  async function send(textOverride?: string, opts?: { calc?: LoanCalcPayload; fresh?: boolean }) {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    // Rozmowa od nowa (np. harmonogram z kalkulatora jako pierwsza wiadomość).
    const baseMessages = opts?.fresh ? [] : messages;
    const baseUmowa = opts?.fresh ? {} : umowa;
    const nextMessages: ChatMsg[] = [...baseMessages, { role: "user", content: text }];
    setState({ messages: nextMessages, umowa: baseUmowa });
    try {
      const res = await sendFn({
        data: { messages: nextMessages, umowa: baseUmowa, calc: opts?.calc ?? null },
      });
      setState({
        messages: [...nextMessages, { role: "assistant", content: res.reply }],
        umowa: res.umowa,
      });
      setProblemy(res.problemy ?? []);
      setAutokorekty(res.autokorekty ?? []);
      setMissing(res.missing ?? []);
      setPreview("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : null;
      setState((s) => ({
        ...s,
        messages: [
          ...nextMessages,
          {
            role: "assistant",
            content: msg ?? "Przepraszam, coś poszło nie tak. Spróbuj ponownie za chwilę.",
          },
        ],
      }));
    } finally {
      setSending(false);
    }
  }

  async function runPreview() {
    setBusy("preview");
    try {
      const res = await previewFn({ data: { umowa } });
      setProblemy(res.problemy ?? []);
      setAutokorekty(res.autokorekty ?? []);
      setPreview(res.previewText ?? "");
      if (res.blocked) toast.warning("Podgląd niedostępny — są jeszcze braki blokujące.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Błąd podglądu");
    } finally {
      setBusy("");
    }
  }

  async function runDocx() {
    setBusy("docx");
    try {
      const res = await docxFn({ data: { umowa } });
      setProblemy(res.problemy ?? []);
      setAutokorekty(res.autokorekty ?? []);
      if (res.blocked) {
        toast.error(
          "Umowy nie wygenerowano — uzupełnij braki blokujące (zapytaj agenta, czego brakuje).",
        );
      } else if (res.signedUrl) {
        window.open(res.signedUrl, "_blank");
        toast.success("Komplet umowy wygenerowany (.docx): wniosek, umowa, Zał. 1–3.");
      } else {
        toast.error("Nie otrzymano pliku — spróbuj ponownie.");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Błąd generacji");
    } finally {
      setBusy("");
    }
  }

  function resetConversation() {
    setState({ messages: [], umowa: {} });
    setProblemy([]);
    setAutokorekty([]);
    setMissing([]);
    setPreview("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  // Harmonogram z kalkulatora („Wyślij do kreatora") → nowa rozmowa, której
  // pierwszą wiadomością jest harmonogram spłat. Każdą kalkulację zużywamy raz.
  const startedFromCalcRef = useRef(false);
  useEffect(() => {
    const tryStart = () => {
      if (sending || startedFromCalcRef.current) return;
      const h = readCalcHandoff();
      if (!h || h.ts <= readConsumedCalcTs()) return;
      startedFromCalcRef.current = true;
      markCalcConsumed(h.ts);
      setProblemy([]);
      setAutokorekty([]);
      setMissing([]);
      setPreview("");
      void send(buildCalcHandoffMessage(h.payload), { calc: h.payload, fresh: true }).finally(
        () => {
          startedFromCalcRef.current = false;
        },
      );
    };
    tryStart();
    return onCalcHandoffChange(tryStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start tylko przy wejściu / nowym handoffie
  }, []);

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
      <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-accent to-[oklch(0.65_0.13_235)] px-5 py-4 text-accent-foreground">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15">
          <FileSignature className="h-6 w-6" />
        </div>
        <div className="leading-tight">
          <div className="text-base font-bold">Kreator umowy (agent AI)</div>
          <div className="text-xs opacity-85">
            Dane zbiera agent w rozmowie, tekst umowy składa silnik klauzul
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {maDane ? (
            bledy.length > 0 ? (
              <Badge className="border-white/25 bg-white/15 text-white">
                <XCircle className="mr-1 h-3 w-3" />
                {bledy.length} braków
              </Badge>
            ) : (
              <Badge className="border-white/25 bg-emerald-500/30 text-white">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                dane kompletne
              </Badge>
            )
          ) : null}
          <button
            type="button"
            onClick={resetConversation}
            title="Zacznij nową umowę (czyści rozmowę i dane)"
            aria-label="Nowa umowa"
            className="rounded-md p-1.5 transition hover:bg-black/10"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="h-[380px] space-y-3 overflow-y-auto px-4 py-4">
        {shown.map((m, i) => {
          const mine = m.role === "user";
          return (
            <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
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

      {messages.length === 0 && (
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

      {/* Stan danych umowy: braki blokujące, ostrzeżenia, autokorekty groszowe. */}
      {maDane && (bledy.length > 0 || ostrzezenia.length > 0 || autokorekty.length > 0) && (
        <div className="max-h-36 space-y-1 overflow-y-auto border-t border-border bg-muted/30 px-4 py-2 text-xs">
          {missing.length > 0 && (
            <div className="text-muted-foreground">
              <b>Do uzupełnienia:</b> {missing.join(" · ")}
            </div>
          )}
          {bledy.slice(0, 6).map((p, i) => (
            <div key={`b-${i}`} className="flex items-start gap-1.5 text-destructive">
              <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                <code className="opacity-70">{p.sciezka}</code> {p.komunikat}
              </span>
            </div>
          ))}
          {bledy.length > 6 && (
            <div className="text-muted-foreground">… i {bledy.length - 6} kolejnych braków.</div>
          )}
          {ostrzezenia.slice(0, 3).map((p, i) => (
            <div
              key={`o-${i}`}
              className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{p.komunikat}</span>
            </div>
          ))}
          {autokorekty.map((k, i) => (
            <div key={`k-${i}`} className="flex items-start gap-1.5 text-muted-foreground">
              <Wrench className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{k.komunikat}</span>
            </div>
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
            placeholder="Podaj dane do umowy (strony, kwota, nieruchomość, zabezpieczenia)…"
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!maDane || busy !== "" || sending}
            onClick={() => void runPreview()}
          >
            {busy === "preview" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="mr-1.5 h-3.5 w-3.5" />
            )}
            Podgląd umowy
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!maDane || busy !== "" || sending}
            onClick={() => void runDocx()}
          >
            {busy === "docx" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generuj .docx
          </Button>
        </div>
      </div>

      {preview && (
        <div className="border-t border-border p-3">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Podgląd umowy
          </div>
          <Textarea
            readOnly
            value={preview}
            className="min-h-[280px] font-mono text-xs leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}
