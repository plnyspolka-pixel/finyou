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
import {
  getReminderSchedule,
  updateReminderSchedule,
  triggerReminderEmailsNow,
  sendFollowupSample,
} from "@/lib/reminder-schedule.functions";

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
  const triggerFn = useServerFn(triggerReminderEmailsNow);
  const [manualResult, setManualResult] = useState<any>(null);

  const trigger = useMutation({
    mutationFn: () => triggerFn(),
    onSuccess: (res: any) => {
      setManualResult(res);
      const r = res?.result ?? {};
      if ((res?.activeVariants ?? 0) === 0) {
        toast.error(
          "W bazie NIE ma aktywnych szablonów (sekwencja pusta) — migracja seedująca nie weszła. Maile nie wyjdą.",
        );
      } else if (r.ok === false) {
        toast.warning(
          `Batch pominięty: ${r.skipped ?? "poza oknem"} (użyto force, więc to nie okno).`,
        );
      } else {
        toast.success(
          `Tick wykonany: kandydaci ${r.candidates ?? 0}, wysłano ${r.sent ?? 0}, błędy ${r.errors ?? 0}.`,
        );
      }
      qc.invalidateQueries({ queryKey: ["reminder-schedule"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Błąd ticka"),
  });

  const sampleFn = useServerFn(sendFollowupSample);
  const [sampleTo, setSampleTo] = useState("plnyspolka@gmail.com");
  const sample = useMutation({
    mutationFn: () => sampleFn({ data: { to: sampleTo.trim(), count: 10 } }),
    onSuccess: (res: any) => {
      const errs = (res?.results ?? []).filter((x: any) => !x.ok);
      if (res?.sent > 0 && errs.length === 0) {
        toast.success(`Wysłano ${res.sent}/${res.total} szablonów na ${res.to}.`);
      } else if (res?.sent > 0) {
        toast.warning(
          `Wysłano ${res.sent}/${res.total}. Błędy: ${errs
            .map((e: any) => e.error)
            .join("; ")
            .slice(0, 200)}`,
        );
      } else {
        toast.error(
          `Nie wysłano nic. Błąd: ${errs[0]?.error ?? "nieznany"} (najczęściej brak kluczy Resend na środowisku).`,
        );
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Błąd wysyłki próbki"),
  });

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
            Sterowanie harmonogramem wysyłki sekwencji przypomnień. Cron uderza co minutę; tu
            decydujesz, kiedy faktycznie się wysyła.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => trigger.mutate()}
            disabled={trigger.isPending}
          >
            {trigger.isPending ? "Wysyłam…" : "Wyślij teraz (test)"}
          </Button>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => mut.mutate({ enabled: v })}
            disabled={mut.isPending}
          />
          <span className="text-sm">{enabled ? "Włączony" : "Wyłączony"}</span>
        </div>
      </div>

      <div className="rounded border p-3 space-y-2 bg-muted/20">
        <div className="text-xs text-muted-foreground">
          Podgląd na e-mail — wyślij pierwsze 10 szablonów z bazy przypomnień na wskazany adres
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input
            type="email"
            value={sampleTo}
            onChange={(e) => setSampleTo(e.target.value)}
            placeholder="adres@e-mail.pl"
            className="max-w-xs"
          />
          <Button onClick={() => sample.mutate()} disabled={sample.isPending || !sampleTo.trim()}>
            {sample.isPending ? "Wysyłam…" : "Wyślij 10 szablonów"}
          </Button>
        </div>
      </div>

      {manualResult && (
        <div className="rounded border p-3 text-sm bg-muted/30">
          <div className="text-xs text-muted-foreground mb-1">Wynik ręcznego ticka (force)</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              Aktywne szablony w bazie:{" "}
              <strong
                className={(manualResult.activeVariants ?? 0) === 0 ? "text-destructive" : ""}
              >
                {manualResult.activeVariants ?? 0}
              </strong>
              {(manualResult.activeVariants ?? 0) === 0 ? " (seed nie wszedł!)" : " / 120"}
            </span>
            <span>
              Kandydaci: <strong>{manualResult.result?.candidates ?? 0}</strong>
            </span>
            <span>
              Wysłano: <strong>{manualResult.result?.sent ?? 0}</strong>
            </span>
            <span>
              Błędy: <strong>{manualResult.result?.errors ?? 0}</strong>
            </span>
          </div>
        </div>
      )}

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
                <Badge key={r} variant="secondary">
                  {fmt(r)}
                </Badge>
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
