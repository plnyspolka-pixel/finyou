// Panel screeningu AML w kreatorze pożyczki: CRBR (spółki) + PEP/sankcje (wszyscy).
// Wynik jest materiałem do decyzji operatora — oświadczenie PEP klienta jest w dokumentach.

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";
import { runAmlScreening, getLatestAmlScreening } from "@/lib/aml-screening.functions";
import {
  amlOverallStatusLabels,
  screenedPersonSourceLabels,
  type AmlScreeningReport,
  type AmlStage,
  type CrbrDiscrepancy,
  type PersonScreeningResult,
} from "@/lib/aml-screening-types";

function stageColor(status: AmlStage["status"]): string {
  switch (status) {
    case "sukces": return "text-green-700";
    case "błąd": return "text-red-700";
    case "brak danych": return "text-amber-700";
    case "trwa": return "text-blue-700";
    default: return "text-muted-foreground";
  }
}

function OverallBadge({ status }: { status: AmlScreeningReport["overallStatus"] }) {
  const variant =
    status === "hits" ? "destructive"
    : status === "clear" ? "default"
    : "secondary";
  return <Badge variant={variant as any}>{amlOverallStatusLabels[status]}</Badge>;
}

function DiscrepancyList({ items }: { items: CrbrDiscrepancy[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      {items.map((d, i) => (
        <div
          key={i}
          className={
            d.level === "critical"
              ? "text-xs rounded border border-red-200 bg-red-50 text-red-800 p-2"
              : d.level === "warning"
                ? "text-xs rounded border border-amber-200 bg-amber-50 text-amber-800 p-2"
                : "text-xs rounded border bg-muted/40 text-muted-foreground p-2"
          }
        >
          {d.message}
        </div>
      ))}
    </div>
  );
}

function PersonRow({ p }: { p: PersonScreeningResult }) {
  const top = p.candidates[0];
  const flags: string[] = [];
  if (p.candidates.some((c) => c.isSanctioned)) flags.push("Sankcje");
  if (p.candidates.some((c) => c.isPep)) flags.push("PEP");
  if (p.candidates.some((c) => c.isRca)) flags.push("Powiązanie z PEP");
  return (
    <TableRow>
      <TableCell className="font-medium">
        {p.name}
        {p.birthDate && <span className="text-muted-foreground font-normal"> · ur. {p.birthDate}</span>}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {p.sources.map((s) => screenedPersonSourceLabels[s] ?? s).join(", ")}
      </TableCell>
      <TableCell>
        {p.status === "hit" && <Badge variant="destructive">Trafienie</Badge>}
        {p.status === "review" && <Badge variant="secondary">Do weryfikacji</Badge>}
        {p.status === "clear" && <Badge variant="outline">Brak trafień</Badge>}
        {p.status === "error" && <Badge variant="secondary">Błąd</Badge>}
      </TableCell>
      <TableCell className="text-xs">
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {flags.map((f) => (
              <Badge key={f} variant={f === "Sankcje" ? "destructive" : "secondary"}>{f}</Badge>
            ))}
          </div>
        )}
        {top ? (
          <span className="text-muted-foreground">
            Najbliższe dopasowanie: {top.caption} ({Math.round(top.score * 100)}%)
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export function AmlScreeningPanel({ profileId, isCompany }: { profileId?: string; isCompany: boolean }) {
  const qc = useQueryClient();
  const runFn = useServerFn(runAmlScreening);
  const latestFn = useServerFn(getLatestAmlScreening);
  const [stages, setStages] = useState<AmlStage[]>([]);

  const { data: latest } = useQuery({
    queryKey: ["aml-screening", profileId],
    queryFn: () => latestFn({ data: { profileId: profileId! } }),
    enabled: !!profileId,
  });

  const runMut = useMutation({
    mutationFn: async () => runFn({ data: { profileId: profileId! } }),
    onSuccess: (report) => {
      setStages(report.stages);
      qc.invalidateQueries({ queryKey: ["aml-screening", profileId] });
      if (report.overallStatus === "hits") {
        toast.warning("Screening AML: są trafienia wymagające decyzji operatora.");
      } else if (report.overallStatus === "clear") {
        toast.success("Screening AML: brak trafień.");
      } else {
        toast.info(`Screening AML: ${amlOverallStatusLabels[report.overallStatus].toLowerCase()}.`);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się uruchomić screeningu AML"),
  });

  const report = latest?.report ?? null;
  const hasIssues = report && (report.overallStatus === "hits" || report.overallStatus === "review");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            {hasIssues ? <ShieldAlert className="h-4 w-4 text-red-600" /> : <ShieldCheck className="h-4 w-4" />}
            Screening AML (CRBR + PEP/sankcje)
            {report && <OverallBadge status={report.overallStatus} />}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runMut.mutate()}
            disabled={!profileId || runMut.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${runMut.isPending ? "animate-spin" : ""}`} />
            {runMut.isPending ? "Sprawdzam…" : report ? "Uruchom ponownie" : "Uruchom screening"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {isCompany
            ? "Pobiera beneficjentów rzeczywistych z CRBR, porównuje z KRS i sprawdza osoby z profilu w bazach PEP/sankcyjnych (OpenSanctions)."
            : "JDG nie podlega CRBR — sprawdzane są osoby z profilu w bazach PEP/sankcyjnych (OpenSanctions)."}{" "}
          Wynik wymaga oceny operatora; oświadczenie PEP klienta znajduje się w dokumentach.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!profileId && (
          <p className="text-sm text-muted-foreground">Zapisz profil, aby uruchomić screening.</p>
        )}

        {stages.length > 0 && (
          <div className="rounded border bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-semibold text-foreground">Przebieg screeningu</div>
            <ol className="space-y-1">
              {stages.map((s) => (
                <li key={s.name} className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{s.name}:</span>
                  <span className={stageColor(s.status)}>{s.status}</span>
                  {s.message && <span className="text-muted-foreground">— {s.message}</span>}
                </li>
              ))}
            </ol>
          </div>
        )}

        {report && (
          <>
            {report.warnings.length > 0 && (
              <div className="text-xs rounded border border-amber-200 bg-amber-50 text-amber-800 p-2">
                <div className="font-medium">Ostrzeżenia:</div>
                <ul className="list-disc ml-5">
                  {report.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {isCompany && (
              <div className="space-y-2">
                <div className="text-sm font-semibold">Beneficjenci rzeczywiści (CRBR)</div>
                {report.crbr.status === "found" && report.crbr.beneficiaries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Beneficjent</TableHead>
                        <TableHead>PESEL / data ur.</TableHead>
                        <TableHead>Obywatelstwo</TableHead>
                        <TableHead>Udział / uprawnienia</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.crbr.beneficiaries.map((b, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">
                            {b.groupName ?? [b.firstName, b.middleNames, b.lastName].filter(Boolean).join(" ")}
                          </TableCell>
                          <TableCell>{b.pesel ?? b.birthDate ?? "—"}</TableCell>
                          <TableCell>{b.citizenship ?? "—"}</TableCell>
                          <TableCell className="text-xs">{b.rights ?? b.trustRights ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">{report.crbr.message ?? "Brak danych z CRBR."}</p>
                )}
                <DiscrepancyList items={report.crbrDiscrepancies} />
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm font-semibold">Screening PEP / sankcje</div>
              {report.screening.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Osoba / podmiot</TableHead>
                      <TableHead>Rola</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Szczegóły</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.screening.map((p, i) => <PersonRow key={i} p={p} />)}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">Brak wyników screeningu.</p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Ostatni screening: {report.createdAt ? new Date(report.createdAt).toLocaleString("pl-PL") : "—"}
              {report.screeningProvider ? ` · źródło: ${report.screeningProvider}` : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
