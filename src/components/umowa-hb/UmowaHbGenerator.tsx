import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Sparkles,
  Bot,
  Send,
  Loader2,
  FileDown,
  Eye,
  Calculator,
  CheckCircle2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import {
  previewUmowaHb,
  generateUmowaHb,
  umowaHbAssistant,
} from "@/lib/umowa-hb.functions";
import { GRUPY_POL, FLAGI, type WzorData } from "@/lib/umowa-hb/render";
import { readCalcHandoff, onCalcHandoffChange } from "@/lib/loan-calc-handoff";
import type { LoanCalcPayload } from "@/lib/loan-calc-pdf";

type ChatMsg = { role: "user" | "assistant"; content: string };

const pln = (n: number) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    n || 0,
  );

/** LoanCalcPayload → wiersze harmonogramu + kilka pól warunków. */
function zKalkulatora(p: LoanCalcPayload): { pola: Record<string, string>; raty: WzorData["raty"] } {
  const raty = (p.schedule ?? []).map((r) => ({
    nr: String(r.idx),
    data: r.date,
    kapital: pln(r.kap),
    odsetki: pln(r.ods),
    rata_prowizji: pln(r.prow ?? 0),
    rata_laczna: pln(r.rata),
    saldo: pln(r.saldo),
  }));
  const pola: Record<string, string> = {
    kwota_pozyczki: `${pln(p.nominal || p.onHand)} zł`,
    okres_miesiace: String(p.months ?? ""),
    oprocentowanie: String(p.annualRate ?? ""),
    prowizja_kwota: `${pln(p.commissionPln)} zł`,
    hipoteka_kwota: `${pln(p.mortgageAmount)} zł`,
    liczba_rat_rownych: String(Math.max(0, (p.schedule?.length ?? 0) - (p.balloon ? 1 : 0))),
  };
  if (p.schedule?.[0]?.date) pola.data_pierwszej_raty = p.schedule[0].date;
  if (p.agreementDate) pola.data_umowy = p.agreementDate;
  return { pola, raty };
}

export function UmowaHbGenerator() {
  const previewFn = useServerFn(previewUmowaHb);
  const generateFn = useServerFn(generateUmowaHb);
  const assistantFn = useServerFn(umowaHbAssistant);

  const [pola, setPola] = useState<Record<string, string>>({});
  const [flagi, setFlagi] = useState<Record<string, boolean>>({});
  const [raty, setRaty] = useState<WzorData["raty"]>([]);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Cześć! Pomogę zbudować **umowę pożyczki**. Opisz pożyczkobiorcę i warunki (kwota, okres, " +
        "zabezpieczenie, KW), a uzupełnię pola i klauzule. Możesz też wpisać dane ręcznie w zakładce " +
        "„Dane umowy” albo wczytać harmonogram z kalkulatora.",
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);

  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState<"" | "preview" | "docx">("");
  const [handoffReady, setHandoffReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setHandoffReady(!!readCalcHandoff());
    sync();
    return onCalcHandoffChange(sync);
  }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, thinking]);

  const data: WzorData = useMemo(() => ({ pola, flagi, raty }), [pola, flagi, raty]);
  const setPole = (k: string, v: string) => setPola((p) => ({ ...p, [k]: v }));
  const setFlaga = (k: string, v: boolean) => setFlagi((f) => ({ ...f, [k]: v }));

  async function send() {
    const text = input.trim();
    if (!text || thinking) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setThinking(true);
    try {
      const res: any = await assistantFn({ data: { messages: next, data } });
      if (res.pola && Object.keys(res.pola).length) setPola((p) => ({ ...p, ...res.pola }));
      if (res.flagi && Object.keys(res.flagi).length) setFlagi((f) => ({ ...f, ...res.flagi }));
      setMissing(res.missing ?? []);
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd asystenta");
      setMessages([...next, { role: "assistant", content: "Przepraszam, wystąpił błąd. Spróbuj ponownie." }]);
    } finally {
      setThinking(false);
    }
  }

  function loadFromCalculator() {
    const h = readCalcHandoff();
    if (!h) {
      toast.error("Brak kalkulacji. W kalkulatorze kliknij „Wyślij do kreatora”.");
      return;
    }
    const { pola: p, raty: r } = zKalkulatora(h.payload);
    setPola((prev) => ({ ...prev, ...p }));
    setRaty(r);
    toast.success(`Wczytano harmonogram z kalkulatora (${r.length} rat).`);
  }

  async function runPreview() {
    setBusy("preview");
    try {
      const res: any = await previewFn({ data: { data } });
      setPreview(res.text ?? "");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd podglądu");
    } finally {
      setBusy("");
    }
  }

  async function runDocx() {
    setBusy("docx");
    try {
      const nazwa = pola.pozyczkobiorca_nazwa || pola.wnioskodawca_nazwa || "umowa-pozyczki";
      const res: any = await generateFn({ data: { data, nazwa } });
      if (res.signedUrl) {
        window.open(res.signedUrl, "_blank");
        toast.success("Umowa wygenerowana (.docx).");
      } else {
        toast.error("Nie otrzymano pliku — spróbuj ponownie.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd generacji");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <FancyPageHeader
        eyebrow="Kreator umów"
        title="Umowa pożyczki"
        subtitle="Wzór DOCX zasilany danymi — pola i klauzule uzupełnia asystent Gemini Pro lub Ty ręcznie. Prowizja rozliczana w ratach (bez kwoty brutto)."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={runPreview} disabled={busy !== ""}>
              {busy === "preview" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Podgląd
            </Button>
            <Button onClick={runDocx} disabled={busy !== ""}>
              {busy === "docx" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              Generuj .docx
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="ai" className="w-full">
        <TabsList>
          <TabsTrigger value="ai">
            <Bot className="mr-2 h-4 w-4" /> Asystent AI
          </TabsTrigger>
          <TabsTrigger value="dane">Dane umowy</TabsTrigger>
          <TabsTrigger value="podglad">
            <Eye className="mr-2 h-4 w-4" /> Podgląd
          </TabsTrigger>
        </TabsList>

        {/* ── Asystent AI ── */}
        <TabsContent value="ai">
          <Card className="flex h-[620px] flex-col">
            <CardHeader className="border-b py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> Asystent umowy
                <Badge variant="secondary" className="text-[10px] font-normal">
                  Gemini Pro
                </Badge>
              </CardTitle>
            </CardHeader>
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
              {messages.map((m, i) => (
                <Bubble key={i} msg={m} />
              ))}
              {thinking && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Gemini Pro analizuje…
                </div>
              )}
            </div>
            <div className="space-y-2 border-t p-2">
              {missing.length > 0 && (
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
                  disabled={thinking}
                />
                <Button size="icon" onClick={() => void send()} disabled={thinking || !input.trim()} aria-label="Wyślij">
                  {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ── Dane umowy (formularz) ── */}
        <TabsContent value="dane" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Klauzule opcjonalne</CardTitle>
              <Button variant="outline" size="sm" onClick={loadFromCalculator} disabled={!handoffReady}>
                <Calculator className="mr-2 h-4 w-4" />
                {raty.length ? `Harmonogram: ${raty.length} rat` : "Wczytaj z kalkulatora"}
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {FLAGI.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <span className="text-sm">{f.label}</span>
                  <Switch checked={!!flagi[f.key]} onCheckedChange={(v) => setFlaga(f.key, v)} />
                </label>
              ))}
            </CardContent>
          </Card>

          {GRUPY_POL.filter((g) => !g.flaga || flagi[g.flaga]).map((g) => (
            <Card key={g.grupa}>
              <CardHeader className="py-3">
                <CardTitle className="text-base">{g.grupa}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {g.pola.map((p) => (
                  <div key={p.key} className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">{p.label}</Label>
                    {p.typ === "long" ? (
                      <Textarea
                        value={pola[p.key] ?? ""}
                        onChange={(e) => setPole(p.key, e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                    ) : (
                      <Input
                        type={p.typ === "date" ? "text" : "text"}
                        value={pola[p.key] ?? ""}
                        onChange={(e) => setPole(p.key, e.target.value)}
                        placeholder={p.typ === "date" ? "DD.MM.RRRR" : ""}
                        className="text-sm"
                      />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── Podgląd ── */}
        <TabsContent value="podglad">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5 text-primary" /> Podgląd umowy
              </CardTitle>
              <Button variant="outline" size="sm" onClick={runPreview} disabled={busy !== ""}>
                {busy === "preview" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                Odśwież
              </Button>
            </CardHeader>
            <CardContent>
              {preview ? (
                <Textarea readOnly value={preview} className="min-h-[520px] font-mono text-xs leading-relaxed" />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Kliknij „Podgląd”, aby zobaczyć złożoną umowę. Niewypełnione pola pozostają jako {"{{"}
                  pole{"}}"}.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
