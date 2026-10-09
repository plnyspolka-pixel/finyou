// Karta screeningu klienta / inwestora: aktualny status PEP i sankcji każdego
// podmiotu, historia wszystkich sprawdzeń i spraw, oświadczenia, eksport PDF.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  exportScreeningHistoryPdf,
  getScreeningOwnerCard,
  runScreeningNow,
} from "@/lib/screening/screening.functions";
import { DECISION_LABELS, SUBJECT_TYPE_LABELS } from "@/lib/screening/types";
import { CaseTypeBadge, PepStatusBadge, SanctionsStatusBadge, fmtDate } from "./shared";
import { SubjectEddPanel } from "./subject-edd-panel";

const RESULT_LABELS: Record<string, string> = {
  no_hits: "brak trafień",
  possible_match: "możliwe trafienie",
  strong_match: "silne trafienie",
  declaration_yes: "oświadczenie „tak”",
  error: "błąd",
};

export function ScreeningOwnerCard({ kind, id }: { kind: "client" | "investor"; id: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getScreeningOwnerCard);
  const runFn = useServerFn(runScreeningNow);
  const pdfFn = useServerFn(exportScreeningHistoryPdf);
  const q = useQuery({
    queryKey: ["screening-owner", kind, id],
    queryFn: () => getFn({ data: { kind, id } }),
  });
  const run = useMutation({
    mutationFn: () => runFn({ data: { kind, id } }),
    onSuccess: (r) => {
      toast.success(`Screening wykonany (${r.results.length} podmiotów).`);
      void qc.invalidateQueries({ queryKey: ["screening-owner", kind, id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const pdf = useMutation({
    mutationFn: () => pdfFn({ data: { kind, id } }),
    onSuccess: (r) => {
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  const statusOf = (sid: string) => d.statuses.find((s) => s.subject_id === sid);
  const nameOf = (sid: string) =>
    d.subjects.find((s) => s.id === sid)?.full_name ?? sid.slice(0, 8);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sprawdź teraz
        </Button>
        <Button variant="outline" onClick={() => pdf.mutate()} disabled={pdf.isPending}>
          {pdf.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Eksport PDF historii (kontrola GIIF)
        </Button>
      </div>

      {d.subjects.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ten {kind === "client" ? "klient" : "inwestor"} nie był jeszcze sprawdzany — kliknij
          „Sprawdź teraz”.
        </p>
      )}

      {d.subjects.map((s) => {
        const st = statusOf(s.id);
        return (
          <Card key={s.id} className={s.is_active ? "" : "opacity-60"}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">
                {s.full_name}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  · {SUBJECT_TYPE_LABELS[s.subject_type] ?? s.subject_type}
                </span>
                {!s.is_active && <span className="text-sm font-normal"> · nieaktywny</span>}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                {s.kind === "person" && <PepStatusBadge status={st?.pep_status ?? "unknown"} />}
                <SanctionsStatusBadge status={st?.sanctions_status ?? "unknown"} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Data ur.: {s.birth_date ?? "—"} · kraj: {s.nationality.join(", ") || "—"} · ostatnie
                sprawdzenie: {fmtDate(st?.last_screened_at)}
              </p>
              {st?.operations_hold && (
                <p className="font-medium text-red-700">Operacje wstrzymane: {st.hold_reason}</p>
              )}
              {st && (st.board_approval_required || st.enhanced_monitoring) && (
                <SubjectEddPanel
                  subjectId={s.id}
                  status={st}
                  onChanged={() =>
                    void qc.invalidateQueries({ queryKey: ["screening-owner", kind, id] })
                  }
                />
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sprawy</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {d.cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak spraw.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nr</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Podmiot</TableHead>
                  <TableHead>Utworzona</TableHead>
                  <TableHead>Decyzja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.cases.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        to="/admin/screening-sprawa/$caseId"
                        params={{ caseId: c.id }}
                        className="underline"
                      >
                        {c.case_no}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CaseTypeBadge type={c.case_type} />
                    </TableCell>
                    <TableCell>{nameOf(c.subject_id)}</TableCell>
                    <TableCell>{fmtDate(c.created_at)}</TableCell>
                    <TableCell>
                      {c.decision
                        ? `${DECISION_LABELS[c.decision] ?? c.decision} · ${fmtDate(c.decided_at)}`
                        : "otwarta"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historia sprawdzeń ({d.runs.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Podmiot</TableHead>
                <TableHead>Wyzwalacz</TableHead>
                <TableHead>Zakres</TableHead>
                <TableHead>Wynik</TableHead>
                <TableHead>Maks.</TableHead>
                <TableHead>Wersje źródeł</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{fmtDate(r.started_at)}</TableCell>
                  <TableCell>{nameOf(r.subject_id)}</TableCell>
                  <TableCell>{r.trigger}</TableCell>
                  <TableCell>{r.scope}</TableCell>
                  <TableCell>
                    {r.result ? (RESULT_LABELS[r.result] ?? r.result) : "w toku"}
                  </TableCell>
                  <TableCell className="font-mono">{r.max_score ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {Object.entries(r.sources_versions ?? {})
                      .map(([k, v]) => `${k}: ${String(v).slice(0, 10)}`)
                      .join(", ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Oświadczenia PEP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {d.declarations.length === 0 && (
            <p className="text-amber-700">
              Brak oświadczenia PEP — poproś klienta o jego złożenie w panelu.
            </p>
          )}
          {d.declarations.map((x) => (
            <p key={x.id}>
              {fmtDate(x.signed_at)} ·{" "}
              {x.any_yes ? (
                <b className="text-amber-700">co najmniej jedna odpowiedź „tak”</b>
              ) : (
                "wszystkie odpowiedzi „nie”"
              )}{" "}
              · wersja {x.declaration_text_version} · IP {x.ip ?? "—"}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
