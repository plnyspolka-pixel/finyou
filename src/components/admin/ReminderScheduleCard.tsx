import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getReminderSchedule, updateReminderSchedule } from "@/lib/reminder-schedule.functions";

const PRESETS: Array<{ label: string; expr: string }> = [
  { label: "2× dziennie (8:00 i 20:00, pn–sob)", expr: "0 8,20 * * 1-6" },
  { label: "1× rano (9:00 codziennie)", expr: "0 9 * * *" },
  { label: "Co godzinę (test)", expr: "0 * * * *" },
  { label: "Co 5 minut (debug)", expr: "*/5 * * * *" },
];

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

export function ReminderScheduleCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getReminderSchedule);
  const updateFn = useServerFn(updateReminderSchedule);

  const q = useQuery({
    queryKey: ["reminder-schedule"],
    queryFn: () => getFn(),
    refetchInterval: 15_000,
  });

  const [cron, setCron] = useState("");
  useEffect(() => {
    if (q.data?.schedule?.cron_expression) setCron(q.data.schedule.cron_expression);
  }, [q.data?.schedule?.cron_expression]);

  const mut = useMutation({
    mutationFn: (input: { enabled?: boolean; cron_expression?: string }) =>
      updateFn({ data: input }),
    onSuccess: () => {
      toast.success("Zapisano");
      qc.invalidateQueries({ queryKey: ["reminder-schedule"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Błąd zapisu"),
  });

  const enabled = q.data?.schedule?.enabled ?? false;
  const lastTick = q.data?.schedule?.last_tick_at;
  const lastRun = q.data?.schedule?.last_run_at;
  const lastResult: any = q.data?.schedule?.last_result;
  const nextRuns = q.data?.nextRuns ?? [];
  const sentToday = q.data?.sentToday ?? 0;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Autopilot maili przypominających</h2>
          <p className="text-sm text-muted-foreground">
            Sterowanie harmonogramem wysyłki sekwencji przypomnień. Cron uderza co minutę; tu decydujesz, kiedy faktycznie się wysyła.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => mut.mutate({ enabled: v })}
            disabled={mut.isPending}
          />
          <span className="text-sm">{enabled ? "Włączony" : "Wyłączony"}</span>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="cron">Wyrażenie cron (czas Warszawa)</Label>
        <div className="flex gap-2">
          <Input
            id="cron"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="0 8,20 * * 1-6"
            className="font-mono"
          />
          <Button
            onClick={() => mut.mutate({ cron_expression: cron.trim() })}
            disabled={mut.isPending || !cron.trim() || cron === q.data?.schedule?.cron_expression}
          >
            Zapisz
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {PRESETS.map((p) => (
            <Button
              key={p.expr}
              size="sm"
              variant="outline"
              onClick={() => {
                setCron(p.expr);
                mut.mutate({ cron_expression: p.expr });
              }}
              disabled={mut.isPending}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">Ostatni tick (cron żyje)</div>
          <div className="font-medium">{fmt(lastTick)}</div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">Ostatnia wysyłka batcha</div>
          <div className="font-medium">{fmt(lastRun)}</div>
          {lastResult && (
            <div className="text-xs text-muted-foreground mt-1">
              {typeof lastResult.sent === "number" ? `wysłano ${lastResult.sent}` : ""}
              {typeof lastResult.errors === "number" ? `, błędy ${lastResult.errors}` : ""}
            </div>
          )}
        </div>
        <div className="rounded border p-3 sm:col-span-2">
          <div className="text-xs text-muted-foreground">Najbliższe planowane wysyłki</div>
          <div className="flex flex-wrap gap-2 mt-1">
            {nextRuns.length === 0 ? (
              <span className="text-muted-foreground">— (sprawdź wyrażenie cron)</span>
            ) : (
              nextRuns.map((r) => (
                <Badge key={r} variant="secondary">{fmt(r)}</Badge>
              ))
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Maili wysłanych dzisiaj: <strong>{sentToday}</strong>
          </div>
        </div>
      </div>
    </Card>
  );
}
