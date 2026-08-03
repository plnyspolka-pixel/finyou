import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listLoanLenders,
  runLoanDocWizard,
  type LenderOption,
} from "@/lib/loan-doc-wizard.functions";
import {
  listDocxTemplates,
  generateDocxFromTemplate,
  getGeneratedDocSignedUrl,
  getDocxTemplatePreview,
  type DocTemplate,
} from "@/lib/document-generator.functions";
import { previewSegments, extractOrderedFields, splitTrailingSection } from "@/lib/document-fields";
import type { LoanCalcPayload } from "@/lib/loan-calc-pdf";
import { readCalcHandoff, onCalcHandoffChange } from "@/lib/loan-calc-handoff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Send,
  Sparkles,
  Building2,
  UserRound,
  FileText,
  Download,
  Eye,
  Bot,
  CheckCircle2,
  Calculator,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

type ChatMsg = { role: "user" | "assistant"; content: string };

const FINANCE_YOU_ID = "finance_you";

/** Nagłówek sekcji końcowej wzoru pokazywanej obok podglądu (nie w dokumencie). */
const UWAGI_HEADING = "Uwagi praktyczne";

export type LoanDocWizardVariant = "operator" | "investor";

/** Domyślny wzór: umowa pożyczki, jeśli jest na liście. */
function pickDefaultTemplate(templates: DocTemplate[]): DocTemplate | null {
  const loan = templates.find((t) => {
    const s = `${t.slug} ${t.name}`.toLowerCase();
    return (
      s.includes("umowa-pozyczki") || s.includes("umowa pożyczki") || s.includes("umowa pozyczki")
    );
  });
  return loan ?? templates[0] ?? null;
}

export function LoanDocWizardPage({
  variant = "operator",
}: { variant?: LoanDocWizardVariant } = {}) {
  const isInvestor = variant === "investor";
  const _lenders = useServerFn(listLoanLenders);
  const _templates = useServerFn(listDocxTemplates);
  const _wizard = useServerFn(runLoanDocWizard);
  const _preview = useServerFn(getDocxTemplatePreview);
  const _generate = useServerFn(generateDocxFromTemplate);
  const _signedUrl = useServerFn(getGeneratedDocSignedUrl);

  const [lenders, setLenders] = useState<LenderOption[]>([]);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [lenderId, setLenderId] = useState<string>(FINANCE_YOU_ID);
  const [template, setTemplate] = useState<DocTemplate | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  const [previewText, setPreviewText] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  // Nazwa finansującego (dla wersji inwestora — pokazujemy „Ty jako pożyczkodawca").
  const [lenderName, setLenderName] = useState("");

  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Kalkulacja przekazana z kalkulatora (dane finansowe + harmonogram, bez AI).
  const [calc, setCalc] = useState<LoanCalcPayload | null>(null);
  const [handoffReady, setHandoffReady] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setHandoffReady(!!readCalcHandoff());
    sync();
    return onCalcHandoffChange(sync);
  }, []);

  const financeYou = useMemo(() => lenders.find((l) => l.id === FINANCE_YOU_ID), [lenders]);
  const investors = useMemo(() => lenders.filter((l) => l.kind === "investor"), [lenders]);
  const selectedLender = useMemo(() => lenders.find((l) => l.id === lenderId), [lenders, lenderId]);

  const fields = useMemo(
    () => (previewText ? extractOrderedFields(previewText) : []),
    [previewText],
  );
  const fillableCount = useMemo(
    () => fields.filter((f) => f.semantic !== "instruction").length,
    [fields],
  );
  const filledCount = useMemo(
    () => fields.filter((f) => (values[f.id] ?? "").trim().length > 0).length,
    [fields, values],
  );

  // ── Boot: wczytaj finansujących i wzory
  useEffect(() => {
    let alive = true;
    (async () => {
      setBootLoading(true);
      try {
        // Inwestor nie wybiera finansującego (jest nim on sam) — nie pobieramy listy.
        const [ls, ts] = await Promise.all([
          isInvestor ? Promise.resolve<LenderOption[]>([]) : _lenders(),
          _templates(),
        ]);
        if (!alive) return;
        setLenders(ls);
        setTemplates(ts);
        setTemplate(pickDefaultTemplate(ts));
      } catch (e: any) {
        toast.error(e?.message ?? "Błąd ładowania");
      } finally {
        if (alive) setBootLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Autoscroll czatu
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, thinking]);

  // ── (Re)start rozmowy po zmianie finansującego lub wzoru
  useEffect(() => {
    if (!template) return;
    let alive = true;
    setMessages([]);
    setValues({});
    setMissing([]);
    setDone(false);
    setPreviewText("");
    setThinking(true);
    (async () => {
      try {
        const [prev, res] = await Promise.all([
          _preview({ data: { templateId: template.id } }),
          _wizard({
            data: {
              templateId: template.id,
              ...(isInvestor ? { useSelfAsLender: true } : { lenderId }),
              messages: [],
              calc,
            },
          }),
        ]);
        if (!alive) return;
        setPreviewText(prev.text);
        setValues(res.values);
        setMissing(res.missing);
        setLenderName(res.lenderName ?? "");
        setMessages([{ role: "assistant", content: res.reply }]);
      } catch (e: any) {
        if (alive) toast.error(e?.message ?? "Błąd inicjalizacji kreatora");
      } finally {
        if (alive) setThinking(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, lenderId]);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking || !template) return;
    const nextMessages: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setThinking(true);
    try {
      const res = await _wizard({
        data: {
          templateId: template.id,
          ...(isInvestor ? { useSelfAsLender: true } : { lenderId }),
          messages: nextMessages,
          calc,
        },
      });
      setValues(res.values);
      setMissing(res.missing);
      setDone(res.done);
      setLenderName(res.lenderName ?? "");
      setMessages([...nextMessages, { role: "assistant", content: res.reply }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd kreatora");
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "Przepraszam, wystąpił błąd. Spróbuj ponownie." },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const generate = async () => {
    if (!template) return;
    setGenerating(true);
    try {
      const res = await _generate({
        data: {
          templateId: template.id,
          values,
          schedule: calc?.schedule ?? undefined,
          // U inwestora sekcja „Uwagi praktyczne" nie trafia do pliku.
          ...(isInvestor ? { stripSectionFromHeading: UWAGI_HEADING } : {}),
        },
      });
      const url = await _signedUrl({ data: { path: res.docxPath } });
      window.open(url.url, "_blank");
      toast.success("Dokument wygenerowany");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd generowania");
    } finally {
      setGenerating(false);
    }
  };

  // Wczytanie kalkulacji z kalkulatora (w aplikacji) — dane finansowe bez AI.
  const loadFromCalculator = async () => {
    if (!template) return;
    const h = readCalcHandoff();
    if (!h) {
      toast.error("Brak kalkulacji. W kalkulatorze inwestora kliknij „Wyślij do kreatora”.");
      return;
    }
    setCalc(h.payload);
    const hasUserTurn = messages.some((m) => m.role === "user");
    setThinking(true);
    try {
      const res = await _wizard({
        data: {
          templateId: template.id,
          ...(isInvestor ? { useSelfAsLender: true } : { lenderId }),
          messages: hasUserTurn ? messages : [],
          calc: h.payload,
        },
      });
      setValues(res.values);
      setMissing(res.missing);
      setDone(res.done);
      setLenderName(res.lenderName ?? "");
      if (!hasUserTurn) setMessages([{ role: "assistant", content: res.reply }]);
      toast.success(`Wczytano dane z kalkulatora (${h.payload.schedule.length} rat).`);
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd wczytywania kalkulacji");
    } finally {
      setThinking(false);
    }
  };

  const progressPct = fillableCount > 0 ? Math.round((filledCount / fillableCount) * 100) : 0;

  // Wersja inwestora: sekcja „Uwagi praktyczne" wychodzi z treści dokumentu do
  // osobnego okienka (i nie trafia do generowanego .docx — patrz generate()).
  const { body: previewBody, notes: practicalNotes } = useMemo(() => {
    if (isInvestor && previewText) return splitTrailingSection(previewText, UWAGI_HEADING);
    return { body: previewText, notes: "" };
  }, [isInvestor, previewText]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Kreator udzielenia pożyczki
        </h1>
        <p className="text-sm text-muted-foreground">
          Asystent napędzany <span className="font-medium">Gemini Pro</span> pomoże Ci w oknie czatu
          przygotować wypełniony komplet do udzielenia pożyczki.{" "}
          {isInvestor
            ? "Twoje dane jako pożyczkodawcy pobieram z Twojego profilu inwestora — wybierz wzór, a resztę opisz w rozmowie."
            : "Wybierz finansującego i wzór, a resztę opisz w rozmowie."}
        </p>
      </div>

      {/* Wybór finansującego i wzoru */}
      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Finansujący (pożyczkodawca)
            </Label>
            {isInvestor ? (
              // Inwestor jest pożyczkodawcą — bez listy, dane z jego profilu.
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <UserRound className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {lenderName || (bootLoading ? "Wczytywanie…" : "Ty (z profilu inwestora)")}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Pożyczkodawcą jesteś Ty — dane wpisane z Twojego profilu.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <Select value={lenderId} onValueChange={setLenderId} disabled={bootLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz finansującego…" />
                  </SelectTrigger>
                  <SelectContent>
                    {financeYou && (
                      <SelectGroup>
                        <SelectLabel>Finance You</SelectLabel>
                        <SelectItem value={financeYou.id}>{financeYou.label}</SelectItem>
                      </SelectGroup>
                    )}
                    {investors.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Inwestorzy prywatni</SelectLabel>
                        {investors.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.label}
                            {l.sublabel ? ` — ${l.sublabel}` : ""}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                {selectedLender && (
                  <p className="text-[11px] text-muted-foreground">
                    {selectedLender.kind === "finance_you" ? (
                      <Building2 className="inline h-3 w-3 mr-1" />
                    ) : (
                      <UserRound className="inline h-3 w-3 mr-1" />
                    )}
                    Dane finansującego zostaną wpisane po stronie pożyczkodawcy.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Wzór dokumentu
            </Label>
            <Select
              value={template?.id ?? ""}
              onValueChange={(id) => setTemplate(templates.find((t) => t.id === id) ?? null)}
              disabled={bootLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Wybierz wzór…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="min-w-0 text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Calculator className="h-3.5 w-3.5 text-primary" />
              {calc ? (
                <span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Wczytano kalkulację ({calc.schedule.length}{" "}
                  rat) — dane finansowe i harmonogram uzupełniane bez AI.
                </span>
              ) : handoffReady ? (
                <span className="text-primary">
                  Wykryto kalkulację z kalkulatora — wczytaj dane finansowe i harmonogram.
                </span>
              ) : (
                <span>
                  W kalkulatorze inwestora kliknij „Wyślij do kreatora”, aby zaciągnąć dane
                  finansowe.
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant={calc ? "outline" : "default"}
              onClick={() => void loadFromCalculator()}
              disabled={!handoffReady || thinking || bootLoading}
            >
              <Calculator className="mr-2 h-4 w-4" />{" "}
              {calc ? "Wczytaj ponownie" : "Wczytaj z kalkulatora"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Czat */}
        <Card className="flex flex-col h-[640px] max-h-[80vh]">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> Asystent kreatora
              <Badge variant="secondary" className="text-[10px] font-normal">
                Gemini Pro
              </Badge>
            </CardTitle>
          </CardHeader>
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 p-3">
            {bootLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              messages.map((m, i) => <Bubble key={i} msg={m} />)
            )}
            {thinking && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Gemini Pro analizuje…
              </div>
            )}
          </div>
          <div className="border-t p-2 space-y-2">
            {missing.length > 0 && !done && (
              <div className="flex flex-wrap gap-1 px-1">
                <span className="text-[10px] text-muted-foreground">Brakuje:</span>
                {missing.map((m, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] font-normal">
                    {m}
                  </Badge>
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
                    void send();
                  }
                }}
                placeholder="Opisz pożyczkobiorcę i warunki… (⌘/Ctrl+Enter = wyślij)"
                rows={2}
                className="resize-none text-sm"
                disabled={thinking || bootLoading}
              />
              <Button
                size="icon"
                onClick={() => void send()}
                disabled={thinking || bootLoading || !input.trim()}
                aria-label="Wyślij"
              >
                {thinking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Podgląd dokumentu */}
        <Card className="flex flex-col h-[640px] max-h-[80vh]">
          <CardHeader className="border-b py-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Podgląd dokumentu
              </CardTitle>
              <div className="flex items-center gap-2">
                {done && (
                  <Badge className="gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                    <CheckCircle2 className="h-3 w-3" /> Gotowe
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fillableCount > 0 ? `${filledCount}/${fillableCount} pól` : ""}
                </span>
              </div>
            </div>
            {fillableCount > 0 && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </CardHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {thinking && !previewText ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Wczytuję wzór…
              </div>
            ) : previewText ? (
              <PreviewRenderer text={previewBody} values={values} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Wybierz wzór, aby zobaczyć podgląd.
              </p>
            )}
          </div>
          <div className="border-t p-2">
            <Button
              className="w-full"
              size="lg"
              onClick={() => void generate()}
              disabled={generating || !previewText}
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Generuj DOCX
            </Button>
          </div>
        </Card>
      </div>

      {/* Uwagi praktyczne — osobne okienko (nie trafiają do dokumentu inwestora) */}
      {isInvestor && practicalNotes && (
        <Card className="border-amber-400/50 bg-amber-50/40 dark:bg-amber-950/10">
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-600" /> Uwagi praktyczne
              <Badge variant="outline" className="text-[10px] font-normal">
                nie trafiają do dokumentu
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-muted-foreground">
              {practicalNotes}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

/** Renderuje wzór z podświetlonymi wartościami (occ → wartość). */
function PreviewRenderer({ text, values }: { text: string; values: Record<string, string> }) {
  const segments = previewSegments(text);
  return (
    <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed font-sans text-foreground">
      {segments.map((seg, i) => {
        if (!seg.isToken) return <span key={i}>{seg.text}</span>;
        const val = (values[String(seg.occ)] ?? "").trim();
        if (val) {
          return (
            <span
              key={i}
              className="rounded bg-emerald-100 dark:bg-emerald-900/40 px-1 font-semibold text-emerald-900 dark:text-emerald-100"
              title={`Wypełnione: ${seg.key}`}
            >
              {val}
            </span>
          );
        }
        return (
          <span
            key={i}
            className="rounded bg-amber-100 dark:bg-amber-900/40 px-1 font-mono text-[12px] text-amber-900 dark:text-amber-100 border border-amber-300/60 dark:border-amber-700/60"
            title="Pole do uzupełnienia"
          >
            {seg.text}
          </span>
        );
      })}
    </pre>
  );
}
