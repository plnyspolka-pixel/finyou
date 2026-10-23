// Krok 5 pipeline'u inwestora: oświadczenie o źródle pochodzenia środków (AML).
// Formularz i podsumowanie złożonego oświadczenia; logika (katalog źródeł,
// walidacja, ocena ryzyka) w lib/investor-plan/source-of-funds.ts, zapis
// i decyzje compliance w lib/investor-agreements/source-of-funds.functions.ts.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  getMySourceOfFundsDeclaration,
  submitMySourceOfFundsDeclaration,
} from "@/lib/investor-agreements/source-of-funds.functions";
import {
  PLANNED_SCALE_BANDS,
  SOF_STATEMENTS,
  SOF_STATUS_LABELS,
  SOF_TRUTH_CLAUSE,
  categoriesForVariant,
  emptySourceOfFunds,
  plannedScaleLabel,
  sourceOfFundsError,
  sourceOfFundsLabel,
  type SofStatementCode,
  type SourceOfFundsCode,
  type SourceOfFundsDraft,
  type SourceOfFundsStatus,
} from "@/lib/investor-plan/source-of-funds";

const COUNTRIES: { code: string; label: string }[] = [
  { code: "PL", label: "Polska" },
  { code: "DE", label: "Niemcy" },
  { code: "GB", label: "Wielka Brytania" },
  { code: "CZ", label: "Czechy" },
  { code: "SK", label: "Słowacja" },
  { code: "LT", label: "Litwa" },
  { code: "NL", label: "Niderlandy" },
  { code: "FR", label: "Francja" },
  { code: "IE", label: "Irlandia" },
  { code: "ES", label: "Hiszpania" },
  { code: "IT", label: "Włochy" },
  { code: "AT", label: "Austria" },
  { code: "BE", label: "Belgia" },
  { code: "SE", label: "Szwecja" },
  { code: "DK", label: "Dania" },
  { code: "NO", label: "Norwegia" },
  { code: "CH", label: "Szwajcaria" },
  { code: "US", label: "Stany Zjednoczone" },
  { code: "UA", label: "Ukraina" },
];
const OTHER_COUNTRY = "__inny__";

const STATUS_TONE: Record<SourceOfFundsStatus, string> = {
  zlozone: "bg-emerald-100 text-emerald-800",
  zaakceptowane: "bg-emerald-100 text-emerald-800",
  odrzucone: "bg-red-100 text-red-800",
};

function countryLabel(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.label ?? code;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

export function SourceOfFundsStep({ locked, onDone }: { locked: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getMySourceOfFundsDeclaration);
  const submitFn = useServerFn(submitMySourceOfFundsDeclaration);
  const q = useQuery({ queryKey: ["my-sof-declaration"], queryFn: () => getFn() });

  const [draft, setDraft] = useState<SourceOfFundsDraft>(emptySourceOfFunds);
  const [editing, setEditing] = useState(false);
  const [otherCountry, setOtherCountry] = useState(false);

  const mut = useMutation({
    mutationFn: () => submitFn({ data: draft as never }),
    onSuccess: (res) => {
      toast.success(
        res.flags.length
          ? "Oświadczenie zapisane — krok zamknięty. Compliance Finance You ma je do wglądu."
          : "Oświadczenie zapisane — krok zamknięty.",
      );
      setEditing(false);
      setDraft(emptySourceOfFunds());
      void qc.invalidateQueries({ queryKey: ["my-sof-declaration"] });
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (q.isLoading || !q.data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie oświadczenia…
      </p>
    );
  }
  if (!q.data.hasInvestor) {
    return (
      <p className="text-sm text-muted-foreground">
        Najpierw zapisz dane pożyczkodawcy (krok 1) — oświadczenie składa strona umowy.
      </p>
    );
  }

  const latest = q.data.latest;
  const status = q.data.status;
  const categories = categoriesForVariant(q.data.entityVariant);
  const set = (patch: Partial<SourceOfFundsDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleSource = (code: SourceOfFundsCode, on: boolean) =>
    set({ sources: on ? [...draft.sources, code] : draft.sources.filter((s) => s !== code) });
  const toggleStatement = (code: SofStatementCode, on: boolean) =>
    set({ statements: { ...draft.statements, [code]: on } });

  // ── Podsumowanie złożonego oświadczenia ──────────────────────────────────
  if (latest && !editing) {
    const tone = STATUS_TONE[latest.review_status];
    const canRenew = status !== "odrzucone";
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm">
            {latest.review_status === "odrzucone" ? (
              <ShieldAlert className="h-4 w-4 text-amber-600" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            )}
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", tone)}>
              {SOF_STATUS_LABELS[latest.review_status]}
            </span>
            <span className="text-muted-foreground">
              złożone {new Date(latest.signed_at).toLocaleString("pl-PL")}
            </span>
          </p>
          {canRenew ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Zmieniły się okoliczności — złóż nowe
            </Button>
          ) : null}
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Źródła środków</dt>
            <dd>
              <ul className="list-disc pl-4">
                {latest.sources.map((s) => (
                  <li key={s}>
                    {sourceOfFundsLabel(s)}
                    {s === "inne" && latest.other_description
                      ? `: ${latest.other_description}`
                      : ""}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="space-y-2">
            <div>
              <dt className="text-xs text-muted-foreground">Kraj pochodzenia środków</dt>
              <dd>{countryLabel(latest.funds_country)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Planowana skala (12 miesięcy)</dt>
              <dd>{plannedScaleLabel(latest.planned_scale)}</dd>
            </div>
          </div>
          {latest.description ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Opis</dt>
              <dd className="whitespace-pre-wrap">{latest.description}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    );
  }

  // ── Formularz ────────────────────────────────────────────────────────────
  const disabled = locked || !q.data.kycApproved || mut.isPending;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Jako instytucja obowiązana musimy ustalić, skąd pochodzą środki, które zamierzasz pożyczać
        (art. 34 ust. 1 pkt 4 lit. b ustawy o przeciwdziałaniu praniu pieniędzy oraz finansowaniu
        terroryzmu). Wystarczy Twoje oświadczenie — zamyka ten krok od razu.
      </p>

      <div className="space-y-2">
        <Label className="text-xs">
          Źródła środków przeznaczonych na pożyczki (zaznacz wszystkie właściwe)
        </Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.map((c) => {
            const on = draft.sources.includes(c.code);
            return (
              <label
                key={c.code}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition",
                  on ? "border-primary/60 bg-primary/5" : "bg-muted/20 hover:bg-muted/40",
                )}
              >
                <Checkbox
                  checked={on}
                  onCheckedChange={(v) => toggleSource(c.code, v === true)}
                  className="mt-0.5"
                />
                <span className="leading-snug">{c.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {draft.sources.includes("inne") ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Opisz inne źródło</Label>
          <Input
            value={draft.other_description ?? ""}
            onChange={(e) => set({ other_description: e.target.value })}
            placeholder="np. odszkodowanie, wygrana, zwrot nadpłaconego podatku"
            maxLength={500}
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-xs">
          Opis źródła{" "}
          {draft.sources.includes("kredyt_pozyczka")
            ? "(obowiązkowy dla środków obcych: kto, kiedy, na jakich warunkach)"
            : "(zalecany: np. sprzedaż mieszkania w 2025 r., oszczędności z wynagrodzenia)"}
        </Label>
        <Textarea
          rows={3}
          value={draft.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
          maxLength={1500}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Kraj pochodzenia środków</Label>
          <Select
            value={otherCountry ? OTHER_COUNTRY : draft.funds_country}
            onValueChange={(v) => {
              if (v === OTHER_COUNTRY) {
                setOtherCountry(true);
                set({ funds_country: "" });
              } else {
                setOtherCountry(false);
                set({ funds_country: v });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Wybierz kraj…" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
              <SelectItem value={OTHER_COUNTRY}>Inny kraj (wpisz kod)</SelectItem>
            </SelectContent>
          </Select>
          {otherCountry ? (
            <Input
              value={draft.funds_country}
              onChange={(e) => set({ funds_country: e.target.value.toUpperCase().slice(0, 2) })}
              placeholder="Kod ISO, np. AE"
              maxLength={2}
            />
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            Planowana skala finansowania przez Finance You (12 miesięcy)
          </Label>
          <Select
            value={draft.planned_scale}
            onValueChange={(v) => set({ planned_scale: v as SourceOfFundsDraft["planned_scale"] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLANNED_SCALE_BANDS.map((b) => (
                <SelectItem key={b.code} value={b.code}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border bg-muted/30 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Oświadczam, że
        </div>
        {SOF_STATEMENTS.map((s) => (
          <label key={s.code} className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={draft.statements[s.code]}
              onCheckedChange={(v) => toggleStatement(s.code, v === true)}
              className="mt-0.5"
            />
            <span className="leading-snug">{s.label}</span>
          </label>
        ))}
        <label className="flex items-start gap-2 border-t pt-2 text-sm">
          <Checkbox
            checked={draft.truth_confirmed}
            onCheckedChange={(v) => set({ truth_confirmed: v === true })}
            className="mt-0.5"
          />
          <span className="leading-snug">{SOF_TRUTH_CLAUSE}</span>
        </label>
        <details className="pt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">
            Pełna treść oświadczenia (zapisywana razem z wersją)
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans">{q.data.declarationText}</pre>
        </details>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={disabled}
          onClick={() => {
            const err = sourceOfFundsError(draft);
            if (err) return toast.error(err);
            mut.mutate();
          }}
        >
          {mut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileSignature className="mr-2 h-4 w-4" />
          )}
          Złóż oświadczenie
        </Button>
        {latest ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Anuluj
          </Button>
        ) : null}
        {!q.data.kycApproved ? (
          <p className="text-xs text-muted-foreground">
            Oświadczenie składasz po pozytywnej weryfikacji tożsamości (krok 3).
          </p>
        ) : locked ? (
          <p className="text-xs text-muted-foreground">Najpierw zakończ screening (krok 4).</p>
        ) : null}
      </div>
    </div>
  );
}
