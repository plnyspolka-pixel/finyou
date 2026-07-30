import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listReminderDashboard,
  triggerReminderCall,
  setReminderPaused,
  getLoanLeadProgress,
} from "@/lib/loan-reminders.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhoneCall, Pause, Play, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ReminderScheduleCard } from "@/components/admin/ReminderScheduleCard";

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

export function RemindersPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReminderDashboard);
  const triggerFn = useServerFn(triggerReminderCall);
  const pauseFn = useServerFn(setReminderPaused);
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["reminders-dashboard"],
    queryFn: () => listFn({ data: { onlyActive: true, limit: 100 } }),
    refetchInterval: 30_000,
  });

  const mCall = useMutation({
    mutationFn: (id: string) => triggerFn({ data: { loanApplicationId: id } }),
    onSuccess: (res: any) => {
      if (res?.ok) toast.success("Połączenie zainicjowane");
      else if (res?.skipped) toast.info("Pominięto — wniosek kompletny");
      else toast.error(res?.error ?? "Błąd połączenia");
      qc.invalidateQueries({ queryKey: ["reminders-dashboard"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Błąd"),
  });

  const mPause = useMutation({
    mutationFn: (v: { id: string; paused: boolean }) =>
      pauseFn({ data: { loanApplicationId: v.id, paused: v.paused } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reminders-dashboard"] }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Przypomnienia voicebota</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Voicebot dzwoni automatycznie: po 2h, 24h, 72h, potem co 5 dni — maks. 30 dni od
          pierwszego przypomnienia. Możesz w każdej chwili zadzwonić ręcznie lub wstrzymać.
        </p>
      </div>

      <ReminderScheduleCard />

      {q.isLoading && <Card className="p-6 text-muted-foreground">Ładowanie…</Card>}
      {q.error && <Card className="p-6 text-destructive">Błąd: {(q.error as Error).message}</Card>}

      <div className="grid gap-3">
        {(q.data ?? []).map((r: any) => {
          const name = [r.client?.first_name, r.client?.last_name].filter(Boolean).join(" ") || "—";
          const phone = r.client?.phone_normalized ?? r.client?.phone ?? "—";
          const missing: string[] = Array.isArray(r.missing_documents_snapshot)
            ? r.missing_documents_snapshot
            : [];
          return (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {r.status}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      Krok {r.current_form_step}/5
                    </Badge>
                    {r.property?.property_type && (
                      <Badge variant="outline" className="text-[10px]">
                        {r.property.property_type}
                      </Badge>
                    )}
                    {r.reminder_paused && (
                      <Badge variant="destructive" className="text-[10px]">
                        WSTRZYMANE
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    📞 {phone} {r.property?.city ? `· ${r.property.city}` : ""}
                    {r.loan_amount ? ` · ${Number(r.loan_amount).toLocaleString("pl-PL")} zł` : ""}
                  </div>
                </div>
                <div className="text-xs text-right space-y-0.5 min-w-[180px]">
                  <div>
                    Prób: <b>{r.reminder_attempts ?? 0}</b>
                  </div>
                  <div className="text-muted-foreground">Ost.: {fmtDate(r.last_reminder_at)}</div>
                  <div className="text-muted-foreground">
                    Następne: {fmtDate(r.next_reminder_at)}
                  </div>
                </div>
              </div>

              {missing.length > 0 ? (
                <div className="mt-3 flex items-start gap-2 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold">Brakuje:</span>{" "}
                    <span className="text-muted-foreground">{missing.join(", ")}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Snapshot: nic nie brakuje (zaktualizuje
                  się przy kolejnym przypomnieniu)
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => mCall.mutate(r.id)} disabled={mCall.isPending}>
                  <PhoneCall className="h-3.5 w-3.5 mr-1" /> Zadzwoń teraz
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => mPause.mutate({ id: r.id, paused: !r.reminder_paused })}
                >
                  {r.reminder_paused ? (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1" /> Wznów
                    </>
                  ) : (
                    <>
                      <Pause className="h-3.5 w-3.5 mr-1" /> Wstrzymaj
                    </>
                  )}
                </Button>
                <Link to="/admin/klienci/$id" params={{ id: r.id }}>
                  <Button size="sm" variant="ghost">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Szczegóły leada
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpenId(openId === r.id ? null : r.id)}
                >
                  {openId === r.id ? "Ukryj zmienne" : "Pokaż zmienne dla ElevenLabs"}
                </Button>
              </div>

              {openId === r.id && <VariablesPreview loanId={r.id} />}
            </Card>
          );
        })}
        {q.data && q.data.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">
            Brak aktywnych leadów do przypomnienia.
          </Card>
        )}
      </div>
    </div>
  );
}

function VariablesPreview({ loanId }: { loanId: string }) {
  const fn = useServerFn(getLoanLeadProgress);
  const q = useQuery({
    queryKey: ["loan-progress", loanId],
    queryFn: () => fn({ data: { loanApplicationId: loanId } }),
  });
  if (q.isLoading) return <div className="mt-3 text-xs text-muted-foreground">Ładowanie…</div>;
  if (!q.data) return null;
  return (
    <div className="mt-3 rounded border bg-muted/40 p-3">
      <div className="text-xs font-semibold mb-2">
        Zmienne dynamiczne wysyłane do agenta ElevenLabs:
      </div>
      <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap">
        {JSON.stringify(q.data.variables, null, 2)}
      </pre>
    </div>
  );
}
