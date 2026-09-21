// Rejestr opłat sukcesu PRO (5% Kwoty Udzielonej) w panelu administratora.
// Kluczowa informacja na górze karty: czy AKTYWNA wersja Umowy ramowej
// dopuszcza wynagrodzenie Finance You od Inwestora. Dopóki nie dopuszcza,
// opłaty są wyłącznie rejestrowane ze statusem „wstrzymana" i nie można ich
// zafakturować — bramka jest egzekwowana także serwerowo.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatGroszPln } from "@/lib/access/core";
import { getSuccessFeesAdminState, setSuccessFeeStatus } from "@/lib/investor-plan/plan.functions";

const STATUS_TONE: Record<string, string> = {
  wstrzymana: "bg-amber-100 text-amber-900",
  naliczona: "bg-blue-100 text-blue-900",
  zafakturowana: "bg-indigo-100 text-indigo-900",
  oplacona: "bg-emerald-100 text-emerald-900",
  anulowana: "bg-slate-100 text-slate-600",
};

export function SuccessFeesCard() {
  const qc = useQueryClient();
  const fetchState = useServerFn(getSuccessFeesAdminState);
  const setStatus = useServerFn(setSuccessFeeStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["success-fees-admin"],
    queryFn: () => fetchState(),
  });
  const mut = useMutation({
    mutationFn: (v: { feeId: string; status: string }) =>
      setStatus({ data: { feeId: v.feeId, status: v.status as never } }),
    onSuccess: () => {
      toast.success("Status opłaty zaktualizowany");
      void qc.invalidateQueries({ queryKey: ["success-fees-admin"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Wystąpił błąd"),
  });

  if (isLoading || !data) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Opłaty sukcesu PRO (5% kwoty udzielonej pożyczki)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.feesAllowed ? (
          <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Aktywna Umowa ramowa ({data.contractVersion}) dopuszcza wynagrodzenie Finance You od
            Inwestora — opłaty sukcesu można naliczać i fakturować.
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b>Opłaty sukcesu są wstrzymane.</b> Aktywna wersja Umowy ramowej (
              {data.contractVersion ?? "brak"}
              {data.contractActive ? "" : ", pakiet uśpiony"}) nie dopuszcza wynagrodzenia od
              Inwestora — § 7 w wersji v5 stanowi, że usługa jest dla Inwestora nieodpłatna. System
              rejestruje należności, ale ich nie fakturuje. Aby je odmrozić, aktywuj wersję v6 z
              Cennikiem Pakietów (Załącznik nr 8) po przeglądzie kancelarii.
            </span>
          </p>
        )}

        {data.fees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak zarejestrowanych opłat sukcesu.</p>
        ) : (
          data.fees.map((f) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <div className="space-y-0.5">
                <div className="font-medium">
                  {f.projectRef ?? f.matchId.slice(0, 8)} · {formatGroszPln(f.feeGrosz)} (
                  {f.feeBps / 100}% z {f.loanAmountPln.toLocaleString("pl-PL")} zł)
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(f.createdAt).toLocaleString("pl-PL")}
                  {f.legalBasis ? ` · ${f.legalBasis}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={STATUS_TONE[f.status] ?? "bg-slate-100"}>{f.status}</Badge>
                {f.status === "wstrzymana" && data.feesAllowed ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mut.isPending}
                    onClick={() => mut.mutate({ feeId: f.id, status: "naliczona" })}
                  >
                    {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Nalicz
                  </Button>
                ) : null}
                {f.status !== "anulowana" && f.status !== "oplacona" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mut.isPending}
                    onClick={() => mut.mutate({ feeId: f.id, status: "anulowana" })}
                  >
                    Anuluj
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
