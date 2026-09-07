// Panel administratora cyklu Zlecenie–Projekt (Etap U2): sugestie Dopasowań
// (kwota ± 15%, wyłączność sekwencyjna), stany obiegu, Karta Transferu Danych,
// decyzje (transakcja / przekazanie / odrzucenie), Zał. 6 przy wypłacie,
// przystąpienia NDA, odstąpienia Konsumentów i dziennik zdarzeń.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Link2, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getOrderCycleAdminState,
  createMatch,
  releaseTeaser,
  approveTransferCard,
  adminDecideMatch,
  confirmZal6,
  confirmNdaAccession,
  acknowledgeWithdrawal,
} from "@/lib/investor-agreements/order-cycle.functions";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

const STATUS_TONES: Record<string, string> = {
  dopasowane: "bg-slate-100 text-slate-700",
  teaser: "bg-amber-100 text-amber-800",
  karta_leada: "bg-blue-100 text-blue-800",
  rezerwacja: "bg-emerald-100 text-emerald-800",
  transakcja: "bg-emerald-100 text-emerald-800",
  odrzucone: "bg-slate-100 text-slate-600",
  przekazane: "bg-slate-100 text-slate-600",
  wygasle: "bg-slate-100 text-slate-600",
};

export function OrderCycleAdminSection() {
  const qc = useQueryClient();
  const fetchState = useServerFn(getOrderCycleAdminState);
  const { data, isLoading } = useQuery({
    queryKey: ["order-cycle-admin"],
    queryFn: () => fetchState(),
    refetchInterval: 60_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["order-cycle-admin"] });

  if (isLoading || !data) return null;

  return (
    <>
      <SuggestionsCard data={data} onDone={refresh} />
      <MatchesCard data={data} onDone={refresh} />
      <NdaAccessionsCard accessions={data.accessions} onDone={refresh} />
      <WithdrawalsCard withdrawals={data.withdrawals} onDone={refresh} />
      <EventsCard events={data.events} />
    </>
  );
}

function SuggestionsCard({ data, onDone }: { data: any; onDone: () => void }) {
  const create = useServerFn(createMatch);
  const mut = useMutation({
    mutationFn: (input: { orderId: string; applicationId: string }) =>
      create({ data: { ...input, releaseTeaser: true } }),
    onSuccess: (res: any) => {
      toast.success(`Dopasowanie ${res.projectRef} utworzone, teaser udostępniony.`);
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const nonEmpty = (data.suggestions ?? []).filter((s: any) => s.applications.length > 0);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Sugestie Dopasowań{" "}
          <span className="text-sm font-normal text-muted-foreground">
            (przyjęte Zlecenia × kompletne wnioski w kwocie ± 15%; jeden aktywny obieg Projektu)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {nonEmpty.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak sugestii — brak przyjętych Zleceń albo pasujących wniosków.
          </p>
        ) : (
          nonEmpty.map((s: any) => (
            <div key={s.orderId} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="font-medium">Zlecenie FY-Z-{s.orderSeq}</div>
              {s.applications.map((a: any) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>
                    Wniosek {String(a.id).slice(0, 8)}… ·{" "}
                    {a.loan_amount ? `${Number(a.loan_amount).toLocaleString("pl-PL")} zł` : "—"} ·{" "}
                    {a.status}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mut.isPending}
                    onClick={() => mut.mutate({ orderId: s.orderId, applicationId: a.id })}
                  >
                    <Link2 className="mr-2 h-3.5 w-3.5" /> Dopasuj + teaser
                  </Button>
                </div>
              ))}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MatchesCard({ data, onDone }: { data: any; onDone: () => void }) {
  const release = useServerFn(releaseTeaser);
  const approve = useServerFn(approveTransferCard);
  const decide = useServerFn(adminDecideMatch);
  const zal6 = useServerFn(confirmZal6);
  const [payouts, setPayouts] = useState<Record<string, string>>({});

  const releaseMut = useMutation({
    mutationFn: (matchId: string) => release({ data: { matchId } }),
    onSuccess: () => {
      toast.success("Teaser udostępniony");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const approveMut = useMutation({
    mutationFn: (matchId: string) => approve({ data: { matchId } }),
    onSuccess: () => {
      toast.success("Karta Transferu Danych zatwierdzona");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const decideMut = useMutation({
    mutationFn: (input: { matchId: string; decision: "transakcja" | "przekazane" | "odrzucone" }) =>
      decide({ data: input }),
    onSuccess: () => {
      toast.success("Decyzja zapisana");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const zal6Mut = useMutation({
    mutationFn: (input: { matchId: string; payoutAmountPln: number }) => zal6({ data: input }),
    onSuccess: (res: any) => {
      toast.success(
        `Zał. 6 potwierdzony — Prowizja Klientowska ${Number(res.provisionAmountPln).toLocaleString("pl-PL")} zł`,
      );
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const matches = (data.matches ?? []).filter((m: any) =>
    ["dopasowane", "teaser", "karta_leada", "rezerwacja", "transakcja"].includes(m.status),
  );
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Aktywne obiegi Projekt–Zlecenie</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak aktywnych obiegów.</p>
        ) : (
          matches.map((m: any) => (
            <div key={m.id} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{m.project_ref}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    · Zlecenie {m.karta_leada?.nr_zlecenia ?? "—"} · wniosek{" "}
                    {String(m.application_id).slice(0, 8)}…
                    {m.reservation_expires_at
                      ? ` · rezerwacja do ${new Date(m.reservation_expires_at).toLocaleString("pl-PL")}`
                      : ""}
                  </span>
                </div>
                <Badge className={STATUS_TONES[m.status] ?? "bg-slate-100"}>{m.status}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {m.status === "dopasowane" ? (
                  <Button size="sm" variant="outline" disabled={releaseMut.isPending} onClick={() => releaseMut.mutate(m.id)}>
                    Udostępnij teaser
                  </Button>
                ) : null}
                {!m.transfer_card_approved_at && ["teaser", "karta_leada"].includes(m.status) ? (
                  <Button size="sm" variant="outline" disabled={approveMut.isPending} onClick={() => approveMut.mutate(m.id)}>
                    <ShieldCheck className="mr-2 h-3.5 w-3.5" /> Zatwierdź Kartę Transferu
                  </Button>
                ) : null}
                {m.status === "rezerwacja" ? (
                  <Button
                    size="sm"
                    disabled={decideMut.isPending}
                    onClick={() => decideMut.mutate({ matchId: m.id, decision: "transakcja" })}
                  >
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Transakcja
                  </Button>
                ) : null}
                {["dopasowane", "teaser", "karta_leada", "rezerwacja"].includes(m.status) ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decideMut.isPending}
                      onClick={() => decideMut.mutate({ matchId: m.id, decision: "przekazane" })}
                    >
                      Przekaż dalej
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={decideMut.isPending}
                      onClick={() => decideMut.mutate({ matchId: m.id, decision: "odrzucone" })}
                    >
                      Odrzuć
                    </Button>
                  </>
                ) : null}
                {m.status === "transakcja" && !m.zal6_confirmed_at ? (
                  <span className="flex items-center gap-2">
                    <Input
                      className="h-8 w-40 text-xs"
                      type="number"
                      placeholder="Kwota wypłaty (zł)"
                      value={payouts[m.id] ?? ""}
                      onChange={(e) => setPayouts((p) => ({ ...p, [m.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!Number(payouts[m.id]) || zal6Mut.isPending}
                      onClick={() => zal6Mut.mutate({ matchId: m.id, payoutAmountPln: Number(payouts[m.id]) })}
                    >
                      Potwierdź Zał. 6 (7% / min 5000 zł)
                    </Button>
                  </span>
                ) : null}
                {m.zal6_confirmed_at ? (
                  <span className="text-xs text-emerald-700">
                    Zał. 6: prowizja {Number(m.provision_amount_pln).toLocaleString("pl-PL")} zł
                  </span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function NdaAccessionsCard({ accessions, onDone }: { accessions: any[]; onDone: () => void }) {
  const confirm = useServerFn(confirmNdaAccession);
  const mut = useMutation({
    mutationFn: (accessionId: string) => confirm({ data: { accessionId } }),
    onSuccess: () => {
      toast.success("Przystąpienie potwierdzone");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  if (!accessions?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Przystąpienia do NDA (Zał. 1 NDA)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {accessions.map((a: any) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
            <span>
              {a.company_name} {a.nip ? `· NIP ${a.nip}` : ""} · inwestor {String(a.user_id).slice(0, 8)}… ·
              NDA {a.nda_version}
            </span>
            {a.confirmed_at ? (
              <Badge className="bg-emerald-100 text-emerald-800">potwierdzone</Badge>
            ) : (
              <Button size="sm" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate(a.id)}>
                Potwierdź przystąpienie
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function WithdrawalsCard({ withdrawals, onDone }: { withdrawals: any[]; onDone: () => void }) {
  const ack = useServerFn(acknowledgeWithdrawal);
  const mut = useMutation({
    mutationFn: (withdrawalId: string) => ack({ data: { withdrawalId } }),
    onSuccess: () => {
      toast.success("Odstąpienie odnotowane");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  if (!withdrawals?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Odstąpienia Konsumentów (Zał. 4)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {withdrawals.map((w: any) => (
          <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
            <span>
              {new Date(w.submitted_at).toLocaleString("pl-PL")} · użytkownik {String(w.user_id).slice(0, 8)}… ·{" "}
              {w.document_code} {w.document_version ?? ""}
            </span>
            {w.acknowledged_at ? (
              <Badge className="bg-slate-100 text-slate-600">odnotowane</Badge>
            ) : (
              <Button size="sm" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate(w.id)}>
                Odnotuj
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EventsCard({ events }: { events: any[] }) {
  if (!events?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Dziennik cyklu{" "}
          <span className="text-sm font-normal text-muted-foreground">
            (każde zdarzenie z datą i wersjami dokumentów — uwaga wdrożeniowa nr 3)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-72 space-y-1 overflow-y-auto text-xs">
          {events.map((e: any) => (
            <div key={e.id} className="flex flex-wrap gap-2 border-b py-1 last:border-0">
              <span className="whitespace-nowrap text-muted-foreground">
                {new Date(e.created_at).toISOString().replace("T", " ").slice(0, 19)} UTC
              </span>
              <span className="font-medium">{e.event_type}</span>
              <span className="text-muted-foreground">{e.actor_kind}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
