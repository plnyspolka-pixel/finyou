// Kolejka spraw screeningu z filtrami: status, priorytet, typ, wiek sprawy.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, PauseCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listScreeningCases } from "@/lib/screening/screening.functions";
import { DECISION_LABELS } from "@/lib/screening/types";
import { CaseTypeBadge, PriorityBadge, ageDays, fmtDate } from "./shared";

const SELECT = "h-9 rounded-md border border-input bg-background px-2 text-sm";

export function CasesTab() {
  const listFn = useServerFn(listScreeningCases);
  const [status, setStatus] = useState<"open" | "decided" | "all">("open");
  const [priority, setPriority] = useState<string>("");
  const [caseType, setCaseType] = useState<string>("");
  const [minAge, setMinAge] = useState<string>("");
  const q = useQuery({
    queryKey: ["screening-cases", status, priority, caseType, minAge],
    queryFn: () =>
      listFn({
        data: {
          status,
          priority: (priority || null) as never,
          caseType: (caseType || null) as never,
          minAgeDays: minAge ? Number(minAge) : null,
          limit: 300,
        },
      }),
  });

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-base">Kolejka spraw do weryfikacji</CardTitle>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Status"
            className={SELECT}
            value={status}
            onChange={(e) => setStatus(e.target.value as never)}
          >
            <option value="open">Otwarte</option>
            <option value="decided">Rozstrzygnięte</option>
            <option value="all">Wszystkie</option>
          </select>
          <select
            aria-label="Priorytet"
            className={SELECT}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">Każdy priorytet</option>
            <option value="critical">Krytyczny</option>
            <option value="high">Wysoki</option>
            <option value="normal">Normalny</option>
          </select>
          <select
            aria-label="Typ"
            className={SELECT}
            value={caseType}
            onChange={(e) => setCaseType(e.target.value)}
          >
            <option value="">Każdy typ</option>
            <option value="pep">PEP</option>
            <option value="sanctions">Sankcje</option>
            <option value="declaration">Oświadczenie</option>
          </select>
          <select
            aria-label="Wiek sprawy"
            className={SELECT}
            value={minAge}
            onChange={(e) => setMinAge(e.target.value)}
          >
            <option value="">Dowolny wiek</option>
            <option value="1">Starsze niż 1 dzień</option>
            <option value="3">Starsze niż 3 dni</option>
            <option value="7">Starsze niż 7 dni</option>
            <option value="30">Starsze niż 30 dni</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {q.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">Brak spraw dla wybranych filtrów.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nr</TableHead>
                <TableHead>Priorytet</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Podmiot</TableHead>
                <TableHead>Wynik</TableHead>
                <TableHead>Wiek</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      to="/admin/screening-sprawa/$caseId"
                      params={{ caseId: c.id }}
                      className="font-medium underline"
                    >
                      {c.case_no}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={c.priority} />
                  </TableCell>
                  <TableCell>
                    <CaseTypeBadge type={c.case_type} />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      {c.application_hold && !c.decision && (
                        <PauseCircle
                          className="h-4 w-4 text-red-600"
                          aria-label="Wniosek wstrzymany"
                        />
                      )}
                      {c.subject?.full_name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono">{c.max_score ?? "—"}</TableCell>
                  <TableCell title={fmtDate(c.created_at)}>{ageDays(c.created_at)} d</TableCell>
                  <TableCell className="text-sm">
                    {c.decision
                      ? `${DECISION_LABELS[c.decision] ?? c.decision} (${fmtDate(c.decided_at, false)})`
                      : c.status === "in_review"
                        ? "w weryfikacji"
                        : "otwarta"}
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
