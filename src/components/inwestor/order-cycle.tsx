// Panel inwestora: internetowe odstąpienie Konsumenta (Zał. 4) i przystąpienie
// spółki do NDA (Zał. 1 NDA). Cykl teaser → Karta Leada → Ujawnienie → rezerwacja
// został usunięty — Projekty z pełnymi danymi są w „Moich zleceniach”.
// § 15 ust. 7: żaden checkbox nie startuje zaznaczony.
import { COMPANY_DATA } from "@/lib/company";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  getMyOrderCycle,
  submitConsumerWithdrawal,
  submitNdaAccession,
} from "@/lib/investor-agreements/order-cycle.functions";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

// `hideMatches` zostaje dla zgodności wywołań — listy Dopasowań już nie ma.
export function OrderCycleSection(_props: { hideMatches?: boolean } = {}) {
  const qc = useQueryClient();
  const fetchCycle = useServerFn(getMyOrderCycle);
  const { data, isLoading } = useQuery({
    queryKey: ["order-cycle"],
    queryFn: () => fetchCycle(),
    refetchInterval: 60_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["order-cycle"] });

  if (isLoading || !data) return null;

  return (
    <>
      {data.isConsumer ? <WithdrawalCard data={data} onDone={refresh} /> : null}
      <NdaAccessionCard accessions={data.accessions} onDone={refresh} />
    </>
  );
}

/** Odstąpienie Konsumenta od Umowy ramowej — widoczne zawsze dla Konsumenta. */
export function WithdrawalCard({ data, onDone }: { data: any; onDone: () => void }) {
  const submit = useServerFn(submitConsumerWithdrawal);
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: () => submit({ data: { confirmed: true as const, reason: reason || undefined } }),
    onSuccess: () => {
      toast.success("Oświadczenie o odstąpieniu przyjęte — potwierdzenie wysłaliśmy e-mailem.");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (data.withdrawal) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Odstąpiłeś/-aś od Umowy ramowej{" "}
          {new Date(data.withdrawal.submitted_at).toLocaleString("pl-PL")}. Zlecenia zostały
          cofnięte.
        </CardContent>
      </Card>
    );
  }
  if (!data.withdrawalWindow?.open) {
    // Karta zostaje widoczna także poza terminem — Konsument musi wiedzieć,
    // jaki jest stan jego prawa odstąpienia (Umowa ramowa, § 15).
    return (
      <Card id="odstapienie">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Undo2 className="h-4 w-4" /> Odstąpienie od Umowy ramowej (Konsument)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {data.withdrawalWindow ? (
            <p>
              Termin na odstąpienie bez podania przyczyny upłynął{" "}
              {new Date(data.withdrawalWindow.deadline).toLocaleString("pl-PL")}. Umowę możesz
              wypowiedzieć na zasadach z § 16 Umowy ramowej.
            </p>
          ) : (
            <p>
              Po akceptacji Umowy ramowej masz 14 dni na odstąpienie od niej bez podania przyczyny
              (wzór: Załącznik nr 4). Formularz pojawi się tutaj po akceptacji.
            </p>
          )}
          <p>
            Pytania:{" "}
            <a href={`mailto:${COMPANY_DATA.email}`} className="text-accent underline">
              {COMPANY_DATA.email}
            </a>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="odstapienie">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Undo2 className="h-4 w-4" /> Odstąpienie od Umowy ramowej (Konsument)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Masz prawo odstąpić bez podania przyczyny do{" "}
          {new Date(data.withdrawalWindow.deadline).toLocaleString("pl-PL")} (wzór: Załącznik nr 4).
        </p>
      </CardHeader>
      <CardContent>
        {!open ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Chcę odstąpić od umowy
          </Button>
        ) : (
          <div className="space-y-3">
            <Textarea
              placeholder="Uwagi (opcjonalnie)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
            <div className="flex items-start gap-2">
              <Checkbox
                id="wd-confirm"
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
              />
              <Label htmlFor="wd-confirm" className="text-xs font-normal leading-snug">
                Oświadczam, że odstępuję od Ramowej umowy pośrednictwa finansowego. Rozumiem, że
                moje aktywne Zlecenia zostaną cofnięte.
              </Label>
            </div>
            <Button
              size="sm"
              variant="destructive"
              disabled={!confirmed || mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Składam oświadczenie o odstąpieniu
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NdaAccessionCard({ accessions, onDone }: { accessions: any[]; onDone: () => void }) {
  const submit = useServerFn(submitNdaAccession);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    registryNo: "",
    nip: "",
    address: "",
    representative: "",
  });
  const [confirmed, setConfirmed] = useState(false);
  const mut = useMutation({
    mutationFn: () =>
      submit({
        data: {
          companyName: form.companyName,
          registryNo: form.registryNo || undefined,
          nip: form.nip || undefined,
          address: form.address || undefined,
          representative: form.representative || undefined,
          projectRefs: [],
          confirmed: true as const,
        },
      }),
    onSuccess: () => {
      toast.success("Przystąpienie zgłoszone — czeka na potwierdzenie Finance You.");
      setOpen(false);
      setConfirmed(false);
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Przystąpienie spółki do NDA (Załącznik nr 1 NDA)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Zanim udostępnisz dane Projektu spółce, SPV lub innemu podmiotowi, podmiot ten musi
          przystąpić do NDA. Do czasu zwolnienia odpowiedzialność jest solidarna.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {accessions.map((a: any) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-md border p-2 text-xs"
          >
            <span>
              {a.company_name} · zgłoszone {new Date(a.accepted_at).toLocaleDateString("pl-PL")}
            </span>
            <Badge
              className={
                a.confirmed_at ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }
            >
              {a.confirmed_at ? "potwierdzone" : "czeka na potwierdzenie"}
            </Badge>
          </div>
        ))}
        {!open ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Zgłoś przystąpienie podmiotu
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Firma (nazwa podmiotu)*</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">KRS / rejestr</Label>
                <Input
                  value={form.registryNo}
                  onChange={(e) => setForm((f) => ({ ...f, registryNo: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">NIP</Label>
                <Input
                  value={form.nip}
                  onChange={(e) => setForm((f) => ({ ...f, nip: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reprezentacja</Label>
                <Input
                  value={form.representative}
                  onChange={(e) => setForm((f) => ({ ...f, representative: e.target.value }))}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Adres / siedziba</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="nda-acc"
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
              />
              <Label htmlFor="nda-acc" className="text-xs font-normal leading-snug">
                Podmiot przystępuje do wszystkich obowiązków Odbiorcy z NDA (wersja z rejestru
                dokumentów), odpowiedzialność jest solidarna, a przystąpienie nie daje
                automatycznego dostępu do konta ani danych — wymaga potwierdzenia Finance You.
              </Label>
            </div>
            <Button
              size="sm"
              disabled={!confirmed || form.companyName.trim().length < 2 || mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Zgłoś przystąpienie
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
