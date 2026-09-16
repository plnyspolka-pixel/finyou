import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getOperatorActivitySummary } from "@/lib/operator-activity.functions";
import {
  DEFAULT_SUMMARY_DAYS,
  ROLE_LABELS,
  SUMMARY_COLUMNS,
  SUMMARY_PERIODS,
  displayName,
  formatRelativeDay,
  matchesAnyRole,
  sortOperatorRows,
  sumOperatorRows,
  type OperatorActivityRow,
  type RoleFilter,
} from "@/lib/operator-activity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3 } from "lucide-react";

/**
 * Zbiorczy widok „kto ile zrobił" nad feedem zdarzeń. Feed odpowiada na
 * pytanie „co się działo", ta tabela — „ile tego było i u kogo".
 */
export function OperatorActivitySummary({ filter }: { filter: RoleFilter }) {
  const summaryFn = useServerFn(getOperatorActivitySummary);
  const [days, setDays] = useState(DEFAULT_SUMMARY_DAYS);

  const q = useQuery({
    queryKey: ["operator-activity-summary", days],
    queryFn: () => summaryFn({ data: { days } }),
  });

  const all = (q.data ?? []) as OperatorActivityRow[];
  const rows = sortOperatorRows(all.filter((r) => matchesAnyRole(r.roles, filter)));
  const totals = sumOperatorRows(rows);
  const columnTotals = SUMMARY_COLUMNS.map((c) => rows.reduce((sum, r) => sum + c.value(r), 0));

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Podsumowanie aktywności operatorów</CardTitle>
        </div>
        <div className="flex gap-1">
          {SUMMARY_PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                days === p.days
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {q.error ? (
          <p className="text-sm text-destructive">
            Nie udało się pobrać podsumowania: {(q.error as Error).message}
          </p>
        ) : q.isLoading ? (
          <p className="text-sm text-muted-foreground">Ładowanie…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak kont w tej kategorii.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              Ostatnie {days} dni: {totals.total} zdarzeń, pracowało {totals.active_people} z{" "}
              {totals.people} {totals.people === 1 ? "osoby" : "osób"}.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Osoba</TableHead>
                  {SUMMARY_COLUMNS.map((c) => (
                    <TableHead key={c.key} className="text-right whitespace-nowrap" title={c.hint}>
                      {c.label}
                    </TableHead>
                  ))}
                  <TableHead
                    className="text-right"
                    title="Leady, przy których pojawiło się zdarzenie"
                  >
                    Leady
                  </TableHead>
                  <TableHead
                    className="text-right"
                    title="Dni, w których wykonano choć jedno działanie"
                  >
                    Dni
                  </TableHead>
                  <TableHead className="text-right">Razem</TableHead>
                  <TableHead className="whitespace-nowrap">Ostatnie działanie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.user_id}
                    className={r.total === 0 ? "text-muted-foreground" : ""}
                  >
                    <TableCell>
                      <div className="font-medium">{displayName(r)}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.roles.map((role) => (
                          <Badge key={role} variant="outline" className="text-[10px]">
                            {ROLE_LABELS[role] ?? role}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    {SUMMARY_COLUMNS.map((c) => {
                      const v = c.value(r);
                      return (
                        <TableCell
                          key={c.key}
                          className={`text-right tabular-nums ${v === 0 ? "text-muted-foreground" : ""}`}
                        >
                          {v}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right tabular-nums">{r.leads_touched}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.active_days}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{r.total}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatRelativeDay(r.last_action_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Razem ({totals.people})</TableCell>
                  {columnTotals.map((v, i) => (
                    <TableCell key={SUMMARY_COLUMNS[i].key} className="text-right tabular-nums">
                      {v}
                    </TableCell>
                  ))}
                  {/* Leady i dni to liczności zbiorów — sumowanie dałoby liczbę
                      większą niż stan faktyczny, więc zostaje kreska. */}
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.total}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
