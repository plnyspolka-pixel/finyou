// Panel administratora: oświadczenia inwestora o źródle pochodzenia środków
// (AML) — historia, sygnały ryzyka i decyzja compliance dla najnowszego.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  decideInvestorSourceOfFunds,
  listInvestorSourceOfFunds,
  type SofDecision,
  type SourceOfFundsDeclarationView,
} from "@/lib/investor-agreements/source-of-funds.functions";
import {
  SOF_RISK_FLAG_LABELS,
  SOF_STATUS_LABELS,
  plannedScaleLabel,
  sourceOfFundsLabel,
  type SourceOfFundsStatus,
} from "@/lib/investor-plan/source-of-funds";

const STATUS_TONE: Record<SourceOfFundsStatus, string> = {
  zlozone: "bg-emerald-100 text-emerald-800",
  zaakceptowane: "bg-emerald-100 text-emerald-800",
  do_weryfikacji: "bg-amber-100 text-amber-800",
  do_uzupelnienia: "bg-amber-100 text-amber-800",
  odrzucone: "bg-red-100 text-red-800",
};

const DECISIONS: { code: SofDecision; label: string; hint: string }[] = [
  {
    code: "zaakceptowane",
    label: "Zaakceptuj",
    hint: "Źródło środków wyjaśnione — pipeline inwestora odblokowany.",
  },
  {
    code: "do_uzupelnienia",
    label: "Poproś o dokumenty / uzupełnienie",
    hint: "Treść uzasadnienia zobaczy inwestor w panelu; umowy i Zlecenie pozostają wstrzymane do nowego oświadczenia.",
  },
  {
    code: "odrzucone",
    label: "Odrzuć",
    hint: "Brak możliwości zastosowania środka bezpieczeństwa (art. 41) — inwestor nie złoży nowego oświadczenia bez kontaktu z compliance.",
  },
];

function fmt(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString("pl-PL") : "—";
}

function DeclarationDetails({ d }: { d: SourceOfFundsDeclarationView }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs text-muted-foreground">Źródła</dt>
        <dd>
          <ul className="list-disc pl-4">
            {d.sources.map((s) => (
              <li key={s}>
                {sourceOfFundsLabel(s)}
                {s === "inne" && d.other_description ? `: ${d.other_description}` : ""}
              </li>
            ))}
          </ul>
        </dd>
      </div>
      <div className="space-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">Kraj / skala (12 mies.)</dt>
          <dd>
            {d.funds_country} · {plannedScaleLabel(d.planned_scale)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Złożone</dt>
          <dd>
            {fmt(d.signed_at)} · wersja {d.declaration_text_version} · kanał {d.channel}
          </dd>
        </div>
      </div>
      {d.description ? (
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Opis inwestora</dt>
          <dd className="whitespace-pre-wrap">{d.description}</dd>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <dt className="text-xs text-muted-foreground">Sygnały ryzyka</dt>
        <dd>
          {d.risk_flags.length ? (
            <ul className="list-disc pl-4 text-amber-800">
              {d.risk_flags.map((f) => (
                <li key={f}>{SOF_RISK_FLAG_LABELS[f] ?? f}</li>
              ))}
            </ul>
          ) : (
            <span className="text-emerald-700">brak — krok zamknięty automatycznie</span>
          )}
        </dd>
      </div>
      {d.reviewed_at ? (
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">
            Decyzja compliance ({fmt(d.reviewed_at)})
          </dt>
          <dd className="whitespace-pre-wrap">{d.review_note ?? "—"}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export function InvestorSourceOfFundsCard({ investorId }: { investorId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listInvestorSourceOfFunds);
  const decideFn = useServerFn(decideInvestorSourceOfFunds);
  const q = useQuery({
    queryKey: ["investor-sof", investorId],
    queryFn: () => listFn({ data: { investorId } }),
    retry: false,
  });
  const [decision, setDecision] = useState<SofDecision>("zaakceptowane");
  const [note, setNote] = useState("");
  const [showOlder, setShowOlder] = useState(false);

  const mut = useMutation({
    mutationFn: (declarationId: string) => decideFn({ data: { declarationId, decision, note } }),
    onSuccess: (res) => {
      toast.success(
        res.unlocksPipeline
          ? "Decyzja zapisana — pipeline inwestora odblokowany."
          : "Decyzja zapisana — inwestor zobaczy ją w panelu.",
      );
      setNote("");
      void qc.invalidateQueries({ queryKey: ["investor-sof", investorId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie oświadczeń o źródle środków…
        </CardContent>
      </Card>
    );
  }
  if (q.error || !q.data) return null;

  const latest = q.data.declarations[0] ?? null;
  const older = q.data.declarations.slice(1);
  const status = q.data.investor?.sof_status ?? null;
  const needsDecision = status === "do_weryfikacji";

  return (
    <Card className={cn(needsDecision && "border-amber-300")}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {needsDecision ? (
            <ShieldAlert className="h-4 w-4 text-amber-600" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          )}
          Źródło pochodzenia środków (AML)
          {status ? (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                STATUS_TONE[status],
              )}
            >
              {SOF_STATUS_LABELS[status]}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              brak oświadczenia
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!latest ? (
          <p className="text-muted-foreground">
            Inwestor nie złożył jeszcze oświadczenia (krok 5 pipeline'u). Bez niego nie podpisze
            umów ani nie złoży Zlecenia.
          </p>
        ) : (
          <>
            <DeclarationDetails d={latest} />

            <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Decyzja compliance dla najnowszego oświadczenia
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_1fr]">
                <div className="space-y-1.5">
                  <Label className="text-xs">Decyzja</Label>
                  <Select value={decision} onValueChange={(v) => setDecision(v as SofDecision)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DECISIONS.map((d) => (
                        <SelectItem key={d.code} value={d.code}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {DECISIONS.find((d) => d.code === decision)?.hint}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sof-note" className="text-xs">
                    Uzasadnienie (obowiązkowe, min. 10 znaków)
                  </Label>
                  <Textarea
                    id="sof-note"
                    rows={4}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      decision === "do_uzupelnienia"
                        ? "Co inwestor ma dostarczyć, np. PIT-37 za 2025 r. i akt notarialny sprzedaży mieszkania."
                        : "Co sprawdzono i na jakiej podstawie podjęto decyzję."
                    }
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant={decision === "odrzucone" ? "destructive" : "default"}
                disabled={mut.isPending || note.trim().length < 10}
                onClick={() => mut.mutate(latest.id)}
              >
                {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Zapisz decyzję
              </Button>
            </div>

            {older.length > 0 ? (
              <div className="space-y-3">
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => setShowOlder((v) => !v)}
                >
                  {showOlder ? "Ukryj" : "Pokaż"} wcześniejsze oświadczenia ({older.length})
                </button>
                {showOlder
                  ? older.map((d) => (
                      <div key={d.id} className="rounded-xl border p-3 opacity-80">
                        <div className="mb-2 flex items-center gap-2 text-xs">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 font-semibold",
                              STATUS_TONE[d.review_status],
                            )}
                          >
                            {SOF_STATUS_LABELS[d.review_status]}
                          </span>
                        </div>
                        <DeclarationDetails d={d} />
                      </div>
                    ))
                  : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
