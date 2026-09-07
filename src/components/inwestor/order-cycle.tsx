// Cykl Zlecenie–Projekt w panelu inwestora (Etap U2): teaser → Karta Leada
// → Ujawnienie (rezerwacja 24 h + 12 h) → decyzja. Do tego internetowe
// odstąpienie Konsumenta (Zał. 4) i przystąpienie spółki do NDA (Zał. 1 NDA).
// § 15 ust. 7: żaden checkbox nie startuje zaznaczony.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Clock, Eye, FileSignature, Loader2, Undo2 } from "lucide-react";
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
  acceptKartaLeada,
  requestDisclosure,
  extendReservation,
  declineMatch,
  submitConsumerWithdrawal,
  submitNdaAccession,
} from "@/lib/investor-agreements/order-cycle.functions";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

const MATCH_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  teaser: { label: "Teaser — czeka na Twoją Kartę Leada", tone: "bg-amber-100 text-amber-800" },
  karta_leada: { label: "Karta Leada zaakceptowana", tone: "bg-blue-100 text-blue-800" },
  rezerwacja: { label: "Ujawnione — rezerwacja aktywna", tone: "bg-emerald-100 text-emerald-800" },
  transakcja: { label: "Transakcja", tone: "bg-emerald-100 text-emerald-800" },
  odrzucone: { label: "Odrzucone", tone: "bg-slate-100 text-slate-600" },
  przekazane: { label: "Przekazane dalej", tone: "bg-slate-100 text-slate-600" },
  wygasle: { label: "Rezerwacja wygasła", tone: "bg-slate-100 text-slate-600" },
};

export function OrderCycleSection() {
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
      {data.matches.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Projekty w wykonaniu Twoich Zleceń{" "}
              <span className="text-sm font-normal text-muted-foreground">
                (teaser → Karta Leada → Ujawnienie → rezerwacja 24 h)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.matches.map((m: any) => (
              <MatchCard key={m.id} match={m} isConsumer={data.isConsumer} onDone={refresh} />
            ))}
          </CardContent>
        </Card>
      ) : null}
      {data.isConsumer ? <WithdrawalCard data={data} onDone={refresh} /> : null}
      <NdaAccessionCard accessions={data.accessions} onDone={refresh} />
    </>
  );
}

function TeaserGrid({ teaser }: { teaser: any }) {
  const rows: Array<[string, string | null]> = [
    ["Kwota", teaser?.loan_amount ? `${Number(teaser.loan_amount).toLocaleString("pl-PL")} zł` : null],
    ["Okres", teaser?.period_months ? `${teaser.period_months} mies.` : null],
    ["Oprocentowanie", teaser?.annual_rate ? `${teaser.annual_rate}% rocznie` : null],
    ["LTV", teaser?.ltv ? `${Math.round(Number(teaser.ltv) * 100) / 100}` : null],
    ["Zabezpieczenie", teaser?.property_type ?? null],
    ["Lokalizacja", [teaser?.city, teaser?.voivodeship].filter(Boolean).join(", ") || null],
    [
      "Wartość szacunkowa",
      teaser?.estimated_value ? `${Number(teaser.estimated_value).toLocaleString("pl-PL")} zł` : null,
    ],
    ["Powierzchnia", teaser?.area_sqm ? `${teaser.area_sqm} m²` : null],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k}>
            <span className="text-muted-foreground">{k}: </span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
    </div>
  );
}

function MatchCard({
  match,
  isConsumer,
  onDone,
}: {
  match: any;
  isConsumer: boolean;
  onDone: () => void;
}) {
  const accept = useServerFn(acceptKartaLeada);
  const disclose = useServerFn(requestDisclosure);
  const extend = useServerFn(extendReservation);
  const decline = useServerFn(declineMatch);
  const [confirmed, setConfirmed] = useState(false); // startuje PUSTY (§ 15 ust. 7)
  const [karaConfirmed, setKaraConfirmed] = useState(false);
  const [kartaOpen, setKartaOpen] = useState(false);

  const acceptMut = useMutation({
    mutationFn: () =>
      accept({ data: { matchId: match.id, confirmed: true as const, karaConfirmed } }),
    onSuccess: () => {
      toast.success("Karta Leada zaakceptowana");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const discloseMut = useMutation({
    mutationFn: () => disclose({ data: { matchId: match.id } }),
    onSuccess: () => {
      toast.success("Dane Projektu odsłonięte — rezerwacja 24 h wystartowała");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const extendMut = useMutation({
    mutationFn: () => extend({ data: { matchId: match.id } }),
    onSuccess: () => {
      toast.success("Rezerwacja przedłużona o 12 h");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const declineMut = useMutation({
    mutationFn: () => decline({ data: { matchId: match.id } }),
    onSuccess: () => {
      toast.success("Projekt odrzucony");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const st = MATCH_STATUS_LABELS[match.status] ?? { label: match.status, tone: "bg-slate-100" };
  const karta = match.karta_leada;

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Projekt {match.project_ref}
          <span className="text-xs font-normal text-muted-foreground">
            (Zlecenie {karta?.nr_zlecenia ?? "—"})
          </span>
        </div>
        <Badge className={st.tone}>{st.label}</Badge>
      </div>

      <TeaserGrid teaser={match.teaser} />

      {match.status === "teaser" ? (
        <div className="space-y-3 border-t pt-3">
          {!kartaOpen ? (
            <Button size="sm" variant="outline" onClick={() => setKartaOpen(true)}>
              <FileSignature className="mr-2 h-4 w-4" /> Wyświetl Kartę Leada (Załącznik nr 1)
            </Button>
          ) : (
            <>
              <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
                <p className="font-medium">Karta Leada — {karta?.projekt_ref}</p>
                <p>Nr Zlecenia: {karta?.nr_zlecenia}</p>
                <p>Data Dopasowania: {karta?.dopasowanie?.data ? new Date(karta.dopasowanie.data).toLocaleString("pl-PL") : "—"}</p>
                <p className="mt-2 font-medium">Parametry Projektu</p>
                <p>
                  Kwota: {karta?.parametry?.kwota_pln ? `${Number(karta.parametry.kwota_pln).toLocaleString("pl-PL")} zł` : "—"} · okres:{" "}
                  {karta?.parametry?.okres_miesiecy ?? "—"} mies. · oprocentowanie:{" "}
                  {karta?.parametry?.oprocentowanie_roczne ?? "—"}% · zabezpieczenie:{" "}
                  {karta?.parametry?.typ_zabezpieczenia ?? "—"} · lokalizacja: {karta?.parametry?.lokalizacja ?? "—"}
                </p>
                <p className="mt-2">
                  Okres Ochronny: {karta?.okres_ochronny}. Kara Obejściowa: {karta?.kara_obejsciowa} —
                  za doprowadzenie do Transakcji Chronionej z pominięciem Mechanizmu Zabezpieczenia
                  Prowizji. Ujawnienie Identyfikujące nastąpi po akceptacji tej Karty i zatwierdzeniu
                  Karty Transferu Danych.
                </p>
                <p className="mt-2 text-muted-foreground">
                  Wersje dokumentów:{" "}
                  {(karta?.wersje_dokumentow ?? [])
                    .map((d: any) => `${d.code} ${d.version} (${String(d.sha256).slice(0, 8)}…)`)
                    .join(", ")}
                </p>
              </div>
              <div className="space-y-2">
                {isConsumer ? (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id={`kara-${match.id}`}
                      checked={karaConfirmed}
                      onCheckedChange={(v) => setKaraConfirmed(v === true)}
                    />
                    <Label htmlFor={`kara-${match.id}`} className="text-xs font-normal leading-snug">
                      Jako Konsument indywidualnie uzgadniam Karę Obejściową: 5% Sumy Hipotecznej
                      (sposób obliczenia i przykład kwotowy otrzymam w potwierdzeniu akceptacji).
                    </Label>
                  </div>
                ) : null}
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={`karta-${match.id}`}
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                  />
                  <Label htmlFor={`karta-${match.id}`} className="text-xs font-normal leading-snug">
                    Akceptuję Kartę Leada dla pary {karta?.projekt_ref} / {karta?.nr_zlecenia} w
                    formie dokumentowej.
                  </Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!confirmed || (isConsumer && !karaConfirmed) || acceptMut.isPending}
                  onClick={() => acceptMut.mutate()}
                >
                  {acceptMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Akceptuję Kartę Leada
                </Button>
                <Button size="sm" variant="ghost" disabled={declineMut.isPending} onClick={() => declineMut.mutate()}>
                  Nie jestem zainteresowany/-a
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {match.status === "karta_leada" ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button size="sm" disabled={discloseMut.isPending} onClick={() => discloseMut.mutate()}>
            {discloseMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-2 h-4 w-4" />
            )}
            Odsłoń dane Projektu (start rezerwacji 24 h)
          </Button>
          {!match.transfer_card_approved_at ? (
            <span className="text-xs text-amber-700">
              Karta Transferu Danych czeka na zatwierdzenie przez Finance You.
            </span>
          ) : null}
          <Button size="sm" variant="ghost" disabled={declineMut.isPending} onClick={() => declineMut.mutate()}>
            Rezygnuję
          </Button>
        </div>
      ) : null}

      {match.status === "rezerwacja" ? (
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <Button asChild size="sm">
            <Link to="/inwestor/wniosek/$id" params={{ id: match.application_id }}>
              <Eye className="mr-2 h-4 w-4" /> Pełne dane Projektu
            </Link>
          </Button>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Rezerwacja do {new Date(match.reservation_expires_at).toLocaleString("pl-PL")}
          </span>
          {!match.reservation_extended ? (
            <Button size="sm" variant="outline" disabled={extendMut.isPending} onClick={() => extendMut.mutate()}>
              Przedłuż o 12 h
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={declineMut.isPending} onClick={() => declineMut.mutate()}>
            Odrzucam Projekt
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function WithdrawalCard({ data, onDone }: { data: any; onDone: () => void }) {
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
  if (!data.withdrawalWindow?.open) return null;

  return (
    <Card>
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
              <Checkbox id="wd-confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
              <Label htmlFor="wd-confirm" className="text-xs font-normal leading-snug">
                Oświadczam, że odstępuję od Ramowej umowy pośrednictwa finansowego. Rozumiem, że
                moje aktywne Zlecenia zostaną cofnięte.
              </Label>
            </div>
            <Button size="sm" variant="destructive" disabled={!confirmed || mut.isPending} onClick={() => mut.mutate()}>
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
  const [form, setForm] = useState({ companyName: "", registryNo: "", nip: "", address: "", representative: "" });
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
        <CardTitle className="text-base">Przystąpienie spółki do NDA (Załącznik nr 1 NDA)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Zanim udostępnisz dane Projektu spółce, SPV lub innemu podmiotowi, podmiot ten musi
          przystąpić do NDA. Do czasu zwolnienia odpowiedzialność jest solidarna.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {accessions.map((a: any) => (
          <div key={a.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
            <span>
              {a.company_name} · zgłoszone {new Date(a.accepted_at).toLocaleDateString("pl-PL")}
            </span>
            <Badge className={a.confirmed_at ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
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
                <Input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">KRS / rejestr</Label>
                <Input value={form.registryNo} onChange={(e) => setForm((f) => ({ ...f, registryNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">NIP</Label>
                <Input value={form.nip} onChange={(e) => setForm((f) => ({ ...f, nip: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reprezentacja</Label>
                <Input value={form.representative} onChange={(e) => setForm((f) => ({ ...f, representative: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Adres / siedziba</Label>
                <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="nda-acc" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
              <Label htmlFor="nda-acc" className="text-xs font-normal leading-snug">
                Podmiot przystępuje do wszystkich obowiązków Odbiorcy z NDA (wersja z rejestru
                dokumentów), odpowiedzialność jest solidarna, a przystąpienie nie daje
                automatycznego dostępu do konta ani danych — wymaga potwierdzenia Finance You.
              </Label>
            </div>
            <Button size="sm" disabled={!confirmed || form.companyName.trim().length < 2 || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Zgłoś przystąpienie
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
