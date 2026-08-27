import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  RefreshCw,
  Copy,
  ShieldAlert,
  PauseCircle,
  CheckCircle2,
  Info,
  ThumbsUp,
  FileText,
  Scale,
  Landmark,
  ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import { formatKwNumber } from "@/lib/kw";
import { runKwLandRegisterAnalysis } from "@/lib/kw-analysis.functions";
import { KwPotentialBadge } from "@/components/location-scoring/kw-potential-badge";
import type {
  FindingStatus,
  KwAnalysisResult,
  KwFinding,
  SourceEvidence,
  FindingCategory,
} from "@/lib/kw-analysis/types";

// Kolory + ikony + etykieta tekstowa — nie polegamy wyłącznie na kolorze (a11y).
const STATUS_META: Record<FindingStatus, { label: string; cls: string; Icon: typeof Info }> = {
  STOP: { label: "STOP", cls: "bg-rose-100 text-rose-800 border-rose-300", Icon: ShieldAlert },
  WSTRZYMANE: {
    label: "Wstrzymane",
    cls: "bg-amber-100 text-amber-900 border-amber-300",
    Icon: PauseCircle,
  },
  WARUNKOWO_DOPUSZCZALNE: {
    label: "Warunkowo dopuszczalne",
    cls: "bg-sky-100 text-sky-900 border-sky-300",
    Icon: Info,
  },
  INFORMACYJNE: {
    label: "Informacyjne",
    cls: "bg-slate-100 text-slate-700 border-slate-300",
    Icon: Info,
  },
  KORZYSTNE: {
    label: "Korzystne",
    cls: "bg-emerald-100 text-emerald-800 border-emerald-300",
    Icon: ThumbsUp,
  },
  BRAK_PROBLEMU: {
    label: "Brak problemu",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Icon: CheckCircle2,
  },
};

function StatusBadge({ status, large = false }: { status: FindingStatus; large?: boolean }) {
  const m = STATUS_META[status];
  const Icon = m.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-medium ${m.cls} ${large ? "text-sm px-3 py-1" : "text-xs"}`}
    >
      <Icon className={large ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
      {m.label}
    </span>
  );
}

// RODO: maskuj ciągi 11 cyfr (PESEL) w prezentowanej treści źródłowej.
function maskPeselInText(s: string): string {
  return s.replace(/\b(\d{2})\d{7}(\d{2})\b/g, "$1*******$2");
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Skopiowano: ${label}`);
  } catch {
    toast.error("Nie udało się skopiować");
  }
}

function SourceRef({ e }: { e: SourceEvidence }) {
  return (
    <div className="text-xs text-muted-foreground border-l-2 border-muted pl-2 py-0.5">
      <span className="font-mono font-medium text-foreground">
        Dział {e.section.replace("_", "-")}
        {e.fieldCode ? ` · ${e.fieldCode}` : ""}
        {e.entryNumber ? ` · wpis ${e.entryNumber}` : ""}
      </span>
      {e.fieldLabel ? <span> — {e.fieldLabel}</span> : null}
      <div className="italic mt-0.5">„{maskPeselInText(e.rawValue)}”</div>
    </div>
  );
}

function MessageBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-muted-foreground">{title}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copy(text, title)}>
          <Copy className="h-3 w-3 mr-1" /> Kopiuj
        </Button>
      </div>
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function FindingCard({ f }: { f: KwFinding }) {
  const [open, setOpen] = useState(f.status === "STOP" || f.status === "WSTRZYMANE");
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={f.status} />
              <CardTitle className="text-base">{f.title}</CardTitle>
            </div>
            <CardDescription className="mt-1">{f.plainLanguageSummary}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Zwiń" : "Rozwiń"}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Wpływ na miejsce: {f.rankImpact}</Badge>
            <Badge variant="outline">Wpływ na egzekucję: {f.enforcementImpact}</Badge>
            <Badge variant="outline">
              Reguła: {f.ruleId}@{f.ruleVersion}
            </Badge>
          </div>

          <div>
            <div className="font-medium text-xs text-muted-foreground mb-1">Źródło w KW</div>
            <div className="space-y-1">
              {f.source.map((e, i) => (
                <SourceRef key={i} e={e} />
              ))}
            </div>
          </div>

          <p>
            <span className="font-medium">Dlaczego to ważne: </span>
            {f.whyItMatters}
          </p>
          <p>
            <span className="font-medium">Oczekiwane od klienta: </span>
            {f.expectedFromClient}
          </p>

          {f.requestedDocuments.length > 0 && (
            <div>
              <div className="font-medium">Wymagane dokumenty:</div>
              <ul className="list-disc pl-5">
                {f.requestedDocuments.map((d) => (
                  <li key={d.code}>
                    {d.label}
                    {d.requiredFields?.length ? (
                      <span className="text-muted-foreground">
                        {" "}
                        — pola: {d.requiredFields.join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p>
            <span className="font-medium">Proponowane rozwiązanie: </span>
            {f.proposedResolution}
          </p>
          {f.agreementCondition && (
            <p>
              <span className="font-medium">Warunek umowy: </span>
              {f.agreementCondition}
            </p>
          )}
          {f.payoutCondition && (
            <p>
              <span className="font-medium">Warunek wypłaty: </span>
              {f.payoutCondition}
            </p>
          )}

          <Separator />
          <div className="grid gap-2 md:grid-cols-3">
            <MessageBlock title="Dla pośrednika" text={f.intermediaryMessage} />
            <MessageBlock title="Do klienta" text={f.clientMessage} />
            <MessageBlock title="Dla inwestora" text={f.investorMessage} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

const TABS: Array<{ key: string; label: string; cats: FindingCategory[] }> = [
  { key: "summary", label: "Podsumowanie", cats: [] },
  {
    key: "ownership",
    label: "Własność i tożsamość",
    cats: ["OWNERSHIP", "IDENTITY", "PROPERTY_SCOPE"],
  },
  { key: "section3", label: "Prawa i ograniczenia (III)", cats: ["ENFORCEMENT", "RIGHT_OR_CLAIM"] },
  {
    key: "section4",
    label: "Hipoteki i pierwszeństwo (IV)",
    cats: ["RANK", "MORTGAGE", "VALUATION"],
  },
  { key: "mentions", label: "Wzmianki", cats: ["MENTION"] },
  { key: "data", label: "Dane / jakość", cats: ["DATA_QUALITY"] },
];

export function KwAnalysisReport({ result }: { result: KwAnalysisResult }) {
  const byCat = (cats: FindingCategory[]) =>
    result.findings.filter((f) => cats.includes(f.category));
  const blockers = result.findings.filter(
    (f) =>
      f.status === "STOP" || f.status === "WSTRZYMANE" || f.status === "WARUNKOWO_DOPUSZCZALNE",
  );

  return (
    <div className="space-y-4">
      {/* Nagłówek raportu */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" /> Analiza KW{" "}
                {formatKwNumber(result.kwNumber) ?? result.kwNumber}
                <KwPotentialBadge kwNumber={result.kwNumber} />
              </CardTitle>
              <CardDescription>
                Pobrano: {new Date(result.fetchedAt).toLocaleString("pl-PL")} · reguły{" "}
                {result.rulesetVersion}
              </CardDescription>
            </div>
            <StatusBadge status={result.overallStatus} large />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Metric
              label="Przewidywane miejsce hipoteki"
              value={
                result.priority.determinable
                  ? `${result.priority.expectedInvestorRank}.`
                  : "niejednoznaczne"
              }
            />
            <Metric
              label="CLTV"
              value={
                result.ltv.determinable && result.ltv.cltv != null
                  ? `${(result.ltv.cltv * 100).toFixed(1)}%`
                  : "brak danych"
              }
            />
            <Metric label="Aktywne wzmianki" value={String(result.activeMentionCount)} />
            <Metric label="Nierozwiązane alerty" value={String(result.unresolvedFindingCount)} />
          </div>
          <Alert className="mt-3">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">{result.disclaimer}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Tabs defaultValue="summary">
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="messages">Komunikacja</TabsTrigger>
          <TabsTrigger value="priority">Miejsce hipoteki</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-3 mt-3">
          {blockers.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Brak nierozwiązanych blokerów ani wstrzymań.</AlertDescription>
            </Alert>
          ) : (
            blockers
              .sort((a, b) => sev(b.status) - sev(a.status))
              .map((f) => <FindingCard key={f.id} f={f} />)
          )}
        </TabsContent>

        {TABS.filter((t) => t.key !== "summary").map((t) => (
          <TabsContent key={t.key} value={t.key} className="space-y-3 mt-3">
            {byCat(t.cats).length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak znalezisk w tej kategorii.</p>
            ) : (
              byCat(t.cats)
                .sort((a, b) => sev(b.status) - sev(a.status))
                .map((f) => <FindingCard key={f.id} f={f} />)
            )}
          </TabsContent>
        ))}

        <TabsContent value="priority" className="space-y-3 mt-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Landmark className="h-4 w-4" /> Docelowe miejsce hipoteki
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>{result.priority.explanation}</p>
              <p className="text-xs text-muted-foreground">{result.ltv.note}</p>
              {result.priority.requiredConditions.length > 0 && (
                <div>
                  <div className="font-medium">Warunki:</div>
                  <ul className="list-disc pl-5">
                    {result.priority.requiredConditions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.priority.effectivePriorEncumbrances.length > 0 && (
                <div>
                  <div className="font-medium">Obciążenia poprzedzające:</div>
                  <ul className="list-disc pl-5">
                    {result.priority.effectivePriorEncumbrances.map((e, i) => (
                      <li key={i}>
                        {e.label}
                        {e.sum != null
                          ? ` — suma ${e.sum.toLocaleString("pl-PL")} ${e.currency ?? "PLN"}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="space-y-3 mt-3">
          {result.findings.map((f) => (
            <Card key={f.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={f.status} />
                  <CardTitle className="text-sm">{f.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-3">
                <MessageBlock title="Dla pośrednika" text={f.intermediaryMessage} />
                <MessageBlock title="Do klienta" text={f.clientMessage} />
                <MessageBlock title="Dla inwestora" text={f.investorMessage} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function sev(s: FindingStatus): number {
  return {
    STOP: 100,
    WSTRZYMANE: 80,
    WARUNKOWO_DOPUSZCZALNE: 60,
    INFORMACYJNE: 30,
    KORZYSTNE: 10,
    BRAK_PROBLEMU: 0,
  }[s];
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

/** Sekcja osadzalna: pobiera numer KW, uruchamia analizę, pokazuje raport. */
export function KwAnalysisSection({
  defaultKwNumber = "",
  loanApplicationId,
  defaultPropertyValue,
  defaultLoanExposure,
}: {
  defaultKwNumber?: string;
  loanApplicationId?: string;
  defaultPropertyValue?: number | null;
  defaultLoanExposure?: number | null;
}) {
  const run = useServerFn(runKwLandRegisterAnalysis);
  const [kwNumber, setKwNumber] = useState(defaultKwNumber);
  const [propertyValue, setPropertyValue] = useState(
    defaultPropertyValue != null && defaultPropertyValue > 0
      ? String(Math.round(defaultPropertyValue))
      : "",
  );
  const [loanExposure, setLoanExposure] = useState(
    defaultLoanExposure != null && defaultLoanExposure > 0
      ? String(Math.round(defaultLoanExposure))
      : "",
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<KwAnalysisResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onRun = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const r = await run({
        data: {
          kwNumber,
          loanApplicationId: loanApplicationId ?? null,
          acceptedPropertyValue: propertyValue ? Number(propertyValue) : null,
          newLoanExposure: loanExposure ? Number(loanExposure) : 0,
          requestedCashAmount: loanExposure ? Number(loanExposure) : 0,
        },
      });
      if (!r.ok) {
        setResult(null);
        setMessage(r.message ?? "Analiza niedostępna.");
      } else {
        setResult(r.result as KwAnalysisResult);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" /> Analiza księgi wieczystej
          </CardTitle>
          <CardDescription>
            Deterministyczna analiza treści KW według polityki ryzyka Finance You (miejsce hipoteki,
            egzekucja, wzmianki, dokumenty).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <input
              className="border rounded-md px-3 py-2 text-sm md:col-span-2"
              placeholder="Numer KW, np. WR1K/00012345/6"
              value={kwNumber}
              onChange={(e) => setKwNumber(e.target.value)}
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Wartość nieruchomości (PLN)"
              value={propertyValue}
              onChange={(e) => setPropertyValue(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Ekspozycja pożyczki (PLN)"
              value={loanExposure}
              onChange={(e) => setLoanExposure(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
            />
          </div>
          <Button onClick={onRun} disabled={running || !kwNumber} size="sm">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Uruchom analizę
          </Button>
          {message && (
            <Alert variant="destructive">
              <FileText className="h-4 w-4" />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {result && <KwAnalysisReport result={result} />}
    </div>
  );
}
