// Zakładki panelu screeningu: źródła (stan importów, alerty), pokrycie
// stanowisk z krajowego wykazu, ustawienia (progi, adresy), dziennik audytu.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  enqueuePortfolioNow,
  getScreeningCoverage,
  getScreeningSettingsFn,
  getScreeningSources,
  listScreeningAudit,
  runScreeningImportNow,
  updateScreeningSettings,
  verifyScreeningAuditChain,
} from "@/lib/screening/screening.functions";
import { SOURCE_NAMES, fmtDate } from "./shared";

export function SourcesTab() {
  const qc = useQueryClient();
  const getFn = useServerFn(getScreeningSources);
  const importFn = useServerFn(runScreeningImportNow);
  const portfolioFn = useServerFn(enqueuePortfolioNow);
  const q = useQuery({ queryKey: ["screening-sources"], queryFn: () => getFn() });
  const imp = useMutation({
    mutationFn: (source: string) => importFn({ data: { source: source as never, force: false } }),
    onSuccess: (r) => {
      toast.message(`Import ${r.source}: ${r.status}${r.error ? ` — ${r.error}` : ""}`);
      void qc.invalidateQueries({ queryKey: ["screening-sources"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const portfolio = useMutation({
    mutationFn: (scope: "all" | "pep" | "sanctions") => portfolioFn({ data: { scope } }),
    onSuccess: (r) => toast.success(`Do kolejki trafiło ${r.enqueued} pozycji portfela.`),
    onError: (e) => toast.error((e as Error).message),
  });
  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  return (
    <div className="space-y-5">
      {d.health.some((h) => h.alert) && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Alert: import nie powiódł się dłużej niż przez
            dozwoloną liczbę cykli
          </p>
          <ul className="mt-1 list-disc pl-5">
            {d.health
              .filter((h) => h.alert)
              .map((h) => (
                <li key={h.source}>
                  {h.label}: {h.alertReason}
                </li>
              ))}
          </ul>
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Źródła referencyjne</CardTitle>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="text-muted-foreground">Kolejka screeningu: {d.queuePending}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => portfolio.mutate("all")}
              disabled={portfolio.isPending}
            >
              Rescreening portfela (PEP + sankcje)
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Źródło</TableHead>
                <TableHead>Włączone</TableHead>
                <TableHead>Częstotliwość</TableHead>
                <TableHead>Ostatni udany import</TableHead>
                <TableHead>Rekordy</TableHead>
                <TableHead>Ostatni status / błąd</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.health.map((h) => (
                <TableRow key={h.source} className={h.alert ? "bg-red-50" : ""}>
                  <TableCell className="font-medium">{h.label}</TableCell>
                  <TableCell>{h.enabled ? "tak" : "nie"}</TableCell>
                  <TableCell>{h.frequency}</TableCell>
                  <TableCell>{fmtDate(h.lastSuccessAt)}</TableCell>
                  <TableCell className="font-mono">{h.recordCount}</TableCell>
                  <TableCell className="max-w-[28rem] text-xs">
                    {h.lastStatus ?? "—"}
                    {h.consecutiveFailures > 0 ? ` · ${h.consecutiveFailures}× błąd` : ""}
                    {h.lastError ? (
                      <span className="block text-red-700">{h.lastError.slice(0, 240)}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => imp.mutate(h.source)}
                      disabled={imp.isPending || !h.enabled}
                      title="Uruchom import teraz"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ostatnie importy</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Start</TableHead>
                <TableHead>Źródło</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rekordy</TableHead>
                <TableHead>Zmienione</TableHead>
                <TableHead>Wycofane</TableHead>
                <TableHead>Suma kontrolna</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.imports.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="whitespace-nowrap">{fmtDate(i.started_at)}</TableCell>
                  <TableCell>{SOURCE_NAMES[i.source] ?? i.source}</TableCell>
                  <TableCell>{i.status}</TableCell>
                  <TableCell className="font-mono">{i.record_count ?? "—"}</TableCell>
                  <TableCell className="font-mono">{i.upserted_count ?? "—"}</TableCell>
                  <TableCell className="font-mono">{i.deactivated_count ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {i.file_checksum?.slice(0, 12) ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function CoverageTab() {
  const getFn = useServerFn(getScreeningCoverage);
  const q = useQuery({ queryKey: ["screening-coverage"], queryFn: () => getFn() });
  const [onlyGaps, setOnlyGaps] = useState(false);
  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const rows = q.data!.filter((r) => r.is_active);
  const gaps = rows.filter((r) => r.coverage !== "covered");
  const shown = onlyGaps ? gaps : rows;
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">Pokrycie stanowisk z krajowego wykazu PEP</CardTitle>
        <p className="text-sm text-muted-foreground">
          {rows.length - gaps.length} z {rows.length} pozycji ma źródło z osobami. Pozycje oznaczone
          jako luka są pokryte wyłącznie oświadczeniem klienta.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyGaps} onCheckedChange={setOnlyGaps} /> Pokaż tylko luki (
          {gaps.length})
        </label>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kod</TableHead>
              <TableHead>Stanowisko</TableHead>
              <TableHead>Źródła</TableHead>
              <TableHead>Osoby (bieżące)</TableHead>
              <TableHead>Ostatnia aktualizacja</TableHead>
              <TableHead>Pokrycie</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow
                key={r.code}
                className={
                  r.coverage === "gap"
                    ? "bg-amber-50"
                    : r.coverage === "source_empty"
                      ? "bg-orange-50"
                      : ""
                }
              >
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell className="max-w-[26rem]">
                  {r.position_name}
                  {r.gap_notes && (
                    <span className="block text-xs text-muted-foreground">{r.gap_notes}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {r.data_sources.map((s) => SOURCE_NAMES[s] ?? s).join(", ") || "—"}
                </TableCell>
                <TableCell className="font-mono">
                  {r.persons} ({r.currentPersons})
                </TableCell>
                <TableCell>{fmtDate(r.lastFetchedAt)}</TableCell>
                <TableCell>
                  {r.coverage === "covered" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> źródło
                    </span>
                  ) : r.coverage === "source_empty" ? (
                    <span className="text-orange-700">źródło bez osób</span>
                  ) : (
                    <span className="font-medium text-amber-800">LUKA — tylko oświadczenie</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

type SettingsForm = Awaited<ReturnType<typeof getScreeningSettingsFn>>;

export function SettingsTab() {
  const qc = useQueryClient();
  const getFn = useServerFn(getScreeningSettingsFn);
  const saveFn = useServerFn(updateScreeningSettings);
  const q = useQuery({ queryKey: ["screening-settings"], queryFn: () => getFn() });
  const [f, setF] = useState<SettingsForm | null>(null);
  useEffect(() => {
    if (q.data) setF(q.data);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          possible_match_threshold: f!.possible_match_threshold,
          strong_match_threshold: f!.strong_match_threshold,
          dob_exact_bonus: f!.dob_exact_bonus,
          dob_year_bonus: f!.dob_year_bonus,
          dob_mismatch_penalty: f!.dob_mismatch_penalty,
          nationality_bonus: f!.nationality_bonus,
          pep_grace_months: f!.pep_grace_months,
          wikidata_min_end_year: f!.wikidata_min_end_year,
          candidate_min_similarity: Number(f!.candidate_min_similarity),
          candidate_limit: f!.candidate_limit,
          aml_officer_emails: f!.aml_officer_emails,
          board_emails: f!.board_emails,
          import_alert_failed_cycles: f!.import_alert_failed_cycles,
          sources: f!.sources as never,
          frequencies: f!.frequencies,
        },
      }),
    onSuccess: () => {
      toast.success("Ustawienia zapisane (zmiana w dzienniku audytu).");
      void qc.invalidateQueries({ queryKey: ["screening-settings"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!f) return <Loader2 className="h-5 w-5 animate-spin" />;
  const num = (k: keyof SettingsForm, label: string, step = 1) => (
    <div className="space-y-1">
      <Label htmlFor={`s-${String(k)}`}>{label}</Label>
      <Input
        id={`s-${String(k)}`}
        type="number"
        step={step}
        value={String(f[k] ?? "")}
        onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })}
      />
    </div>
  );
  const emails = (k: "aml_officer_emails" | "board_emails", label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`s-${k}`}>{label}</Label>
      <Input
        id={`s-${k}`}
        value={f[k].join(", ")}
        onChange={(e) => setF({ ...f, [k]: e.target.value.split(/[,\s]+/).filter(Boolean) })}
        placeholder="adres@firma.pl, ..."
      />
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ustawienia screeningu</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          {num("possible_match_threshold", "Próg „możliwe trafienie” (do weryfikacji)")}
          {num("strong_match_threshold", "Próg „silne trafienie” (wstrzymanie wniosku)")}
          {num("dob_exact_bonus", "Premia: zgodna data urodzenia")}
          {num("dob_year_bonus", "Premia: zgodny rok (źródło zna tylko rok)")}
          {num("dob_mismatch_penalty", "Kara: niezgodna data urodzenia")}
          {num("nationality_bonus", "Premia: zgodne obywatelstwo / kraj")}
          {num("pep_grace_months", "Status PEP po zakończeniu funkcji (mies.)")}
          {num("wikidata_min_end_year", "Wikidata: pomijaj funkcje zakończone przed rokiem")}
          {num("candidate_min_similarity", "Wstępna selekcja: min. podobieństwo trigramów", 0.01)}
          {num("candidate_limit", "Wstępna selekcja: maks. kandydatów")}
          {num("import_alert_failed_cycles", "Alert po N nieudanych cyklach importu")}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {emails("aml_officer_emails", "E-mail osoby odpowiedzialnej za AML")}
          {emails("board_emails", "E-maile członków zarządu (trafienia sankcyjne)")}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Źródła</p>
          <div className="grid gap-2 md:grid-cols-3">
            {Object.entries(f.sources).map(([key, cfg]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Switch
                  checked={!!cfg?.enabled}
                  onCheckedChange={(v) =>
                    setF({ ...f, sources: { ...f.sources, [key]: { ...cfg!, enabled: v } } })
                  }
                />
                {SOURCE_NAMES[key] ?? key}{" "}
                <span className="text-xs text-muted-foreground">({f.frequencies[key] ?? "—"})</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Harmonogramy uruchomień są w pg_cron (migracja modułu). Token listy UE ustawia się w
            zmiennej środowiskowej EU_FSF_TOKEN.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Zapisz ustawienia
        </Button>
      </CardContent>
    </Card>
  );
}

export function AuditTab() {
  const listFn = useServerFn(listScreeningAudit);
  const verifyFn = useServerFn(verifyScreeningAuditChain);
  const q = useQuery({
    queryKey: ["screening-audit"],
    queryFn: () => listFn({ data: { limit: 300 } }),
  });
  const verify = useMutation({
    mutationFn: () => verifyFn(),
    onSuccess: (r) =>
      r.ok
        ? toast.success(`Łańcuch skrótów poprawny (${r.checked} wpisów).`)
        : toast.error(`Naruszony łańcuch skrótów: wpisy ${r.brokenIds.slice(0, 10).join(", ")}`),
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Dziennik audytu (tylko zapis)</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => verify.mutate()}
          disabled={verify.isPending}
        >
          {verify.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Zweryfikuj łańcuch skrótów
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {q.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Czas</TableHead>
                <TableHead>Zdarzenie</TableHead>
                <TableHead>Obiekt</TableHead>
                <TableHead>Autor</TableHead>
                <TableHead>Szczegóły</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.id}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {fmtDate(a.created_at)}
                  </TableCell>
                  <TableCell className="text-xs">{a.event_type}</TableCell>
                  <TableCell className="text-xs">
                    {a.entity_type} {a.entity_id?.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.actor_kind === "user" ? a.actor_id?.slice(0, 8) : "automat"}
                  </TableCell>
                  <TableCell
                    className="max-w-[32rem] truncate font-mono text-xs"
                    title={JSON.stringify(a.details)}
                  >
                    {JSON.stringify(a.details)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
