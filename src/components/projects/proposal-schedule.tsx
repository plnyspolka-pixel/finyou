// Czytelny harmonogram spłat propozycji finansowania — wspólny dla kalkulatora
// (podgląd + podsumowanie), widoku złożonej propozycji inwestora i panelu
// administratora. Rozbicie każdej raty na kapitał / odsetki / prowizję
// inwestora. Prowizja Finance You NIE jest wykazywana osobno — zgodnie
// z modelem silnika jest wliczona (wszyta) w kapitał pożyczki.
import { formatPLN } from "@/lib/labels";

export interface ProposalScheduleRow {
  nr: number;
  termin: string;
  kapital: number;
  odsetki: number;
  prowizja: number;
  rata_razem: number;
  saldo: number;
  isBalloon: boolean;
}

export function ProposalScheduleTable({
  schedule,
  showCommission = true,
}: {
  schedule: ProposalScheduleRow[];
  /** Ukrywa kolumnę prowizji, gdy propozycja nie przewiduje prowizji inwestora. */
  showCommission?: boolean;
}) {
  if (!schedule.length) return null;

  const totals = schedule.reduce(
    (a, r) => ({
      kapital: a.kapital + r.kapital,
      odsetki: a.odsetki + r.odsetki,
      prowizja: a.prowizja + r.prowizja,
      rata_razem: a.rata_razem + r.rata_razem,
    }),
    { kapital: 0, odsetki: 0, prowizja: 0, rata_razem: 0 },
  );
  const hasCommission = showCommission && totals.prowizja > 0;
  const hasDates = schedule.some((r) => r.termin);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[560px] text-xs sm:text-sm">
          <thead>
            <tr className="border-b bg-muted/60 text-left text-muted-foreground">
              <th className="px-2 py-1.5 font-medium">Rata</th>
              {hasDates && <th className="px-2 py-1.5 font-medium">Termin</th>}
              <th className="px-2 py-1.5 text-right font-medium">Kapitał</th>
              <th className="px-2 py-1.5 text-right font-medium">Odsetki</th>
              {hasCommission && (
                <th className="px-2 py-1.5 text-right font-medium">Prowizja inwestora</th>
              )}
              <th className="px-2 py-1.5 text-right font-medium">Rata razem</th>
              <th className="px-2 py-1.5 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((r) => (
              <tr
                key={r.nr}
                className={`border-b last:border-b-0 ${r.isBalloon ? "bg-amber-500/10" : ""}`}
              >
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {r.nr}
                  {r.isBalloon && (
                    <span className="ml-1.5 rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      balon
                    </span>
                  )}
                </td>
                {hasDates && <td className="px-2 py-1.5 whitespace-nowrap">{r.termin || "—"}</td>}
                <td className="px-2 py-1.5 text-right tabular-nums">{formatPLN(r.kapital)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatPLN(r.odsetki)}</td>
                {hasCommission && (
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatPLN(r.prowizja)}</td>
                )}
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                  {formatPLN(r.rata_razem)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {formatPLN(r.saldo)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/60 font-semibold">
              <td className="px-2 py-1.5">Razem</td>
              {hasDates && <td className="px-2 py-1.5" />}
              <td className="px-2 py-1.5 text-right tabular-nums">{formatPLN(totals.kapital)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatPLN(totals.odsetki)}</td>
              {hasCommission && (
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {formatPLN(totals.prowizja)}
                </td>
              )}
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatPLN(totals.rata_razem)}
              </td>
              <td className="px-2 py-1.5" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Prowizja Finance You nie jest wykazywana w harmonogramie osobno — jest wliczona w kapitał
        pożyczki.
      </p>
    </div>
  );
}
