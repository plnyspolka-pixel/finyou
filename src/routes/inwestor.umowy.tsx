// Kreator pakietu umów inwestora (FY-LEGAL-2026-09-04) — Etap U1.
// Sekwencja z paczki prawnika: identyfikacja → doręczenie na trwałym nośniku
// → Umowa ramowa v5 → NDA v5 → RODO v4 → Formularz Zlecenia (Zał. 7).
// § 15 ust. 7: żaden checkbox nie startuje zaznaczony.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getMyLegalPackState,
  getLegalDocumentText,
  saveLegalIdentification,
  deliverLegalPack,
  acceptLegalDocument,
  submitInvestorOrder,
  withdrawInvestorOrder,
} from "@/lib/investor-agreements/legal-pack.functions";
import {
  startInvestorSelfVerification,
  getMyInvestorVerification,
} from "@/lib/investor-agreements/didit-self.functions";

export const Route = createFileRoute("/inwestor/umowy")({
  component: UmowyPage,
});

const ORDER_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  zlozone: { label: "Złożone — czekamy na decyzję (2 dni robocze)", tone: "bg-amber-100 text-amber-800" },
  przyjete: { label: "Przyjęte", tone: "bg-emerald-100 text-emerald-800" },
  wykonane: { label: "Wykonane", tone: "bg-blue-100 text-blue-800" },
  wygasle: { label: "Wygasłe", tone: "bg-slate-100 text-slate-600" },
  cofniete: { label: "Cofnięte", tone: "bg-slate-100 text-slate-600" },
  odmowa: { label: "Odmowa", tone: "bg-red-100 text-red-700" },
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

function UmowyPage() {
  const qc = useQueryClient();
  const fetchState = useServerFn(getMyLegalPackState);
  const { data: state, isLoading } = useQuery({
    queryKey: ["legal-pack-state"],
    queryFn: () => fetchState(),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["legal-pack-state"] });

  if (isLoading || !state) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie pakietu…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Dokumenty"
        title="Umowy inwestora"
        subtitle="Pakiet FY-LEGAL-2026-09-04: Umowa ramowa, NDA i umowa danych osobowych — akceptacja w formie dokumentowej, potem Formularz Zlecenia."
      />

      {!state.packActive ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Lock className="h-5 w-5 shrink-0" />
            Pakiet dokumentów jest w przygotowaniu (przegląd kancelarii). Akceptacja i składanie
            Zleceń będą możliwe po jego aktywacji — damy znać e-mailem.
          </CardContent>
        </Card>
      ) : null}

      <IdentificationStep state={state} onDone={refresh} />
      {state.packActive ? (
        <>
          <DeliveryStep state={state} onDone={refresh} />
          <AcceptanceSteps state={state} onDone={refresh} />
          <OrderForm state={state} onDone={refresh} />
        </>
      ) : null}
      <OrdersList state={state} onDone={refresh} />
    </div>
  );
}

// ── Krok 1: identyfikacja ────────────────────────────────────────────────────

function IdentificationStep({ state, onDone }: { state: any; onDone: () => void }) {
  const investor = state.investor;
  const save = useServerFn(saveLegalIdentification);
  const startDidit = useServerFn(startInvestorSelfVerification);
  const fetchDidit = useServerFn(getMyInvestorVerification);
  const [variant, setVariant] = useState<string>(investor?.entity_variant ?? "");
  const [consumer, setConsumer] = useState<boolean>(Boolean(investor?.is_consumer));

  const saveMut = useMutation({
    mutationFn: () =>
      save({ data: { entityVariant: variant as any, isConsumer: consumer } }),
    onSuccess: () => {
      toast.success("Zapisano identyfikację");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const diditMut = useMutation({
    mutationFn: () =>
      startDidit({
        data: {
          entityType: variant === "osoba_prawna" ? "firma" : "osoba",
          callbackBase: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      }),
    onSuccess: (res: any) => {
      if (res.status === "not_configured") {
        toast.error("Weryfikacja Didit nie jest jeszcze skonfigurowana.");
      } else if (res.status === "already_approved") {
        toast.success("Twoja tożsamość jest już potwierdzona.");
        onDone();
      } else if (res.url) {
        window.open(res.url, "_blank", "noopener");
      }
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const checkMut = useMutation({
    mutationFn: () => fetchDidit(),
    onSuccess: (res: any) => {
      if (res.found && res.status === "Approved") toast.success("Tożsamość potwierdzona.");
      else toast.info("Weryfikacja jeszcze nie zakończona.");
      onDone();
    },
  });

  const done = Boolean(investor?.entity_variant) && investor?.is_consumer != null;
  const diditApproved = state.didit?.status === "Approved";

  return (
    <StepCard
      index={1}
      title="Identyfikacja strony"
      done={done}
      subtitle="Wariant strony umowy i status Konsumenta; opcjonalnie potwierdzenie tożsamości (Didit)."
    >
      {!investor ? (
        <p className="text-sm text-muted-foreground">
          Najpierw uzupełnij profil inwestora (zakładka Profil) — imię i nazwisko / firma, adres,
          PESEL / NIP, e-mail i telefon.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Wariant strony</Label>
              <Select value={variant} onValueChange={setVariant}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="osoba_fizyczna">Osoba fizyczna</SelectItem>
                  <SelectItem value="jdg">Jednoosobowa działalność gospodarcza</SelectItem>
                  <SelectItem value="osoba_prawna">Osoba prawna (spółka)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Checkbox
                id="is-consumer"
                checked={consumer}
                disabled={variant === "osoba_prawna"}
                onCheckedChange={(v) => setConsumer(v === true)}
              />
              <Label htmlFor="is-consumer" className="text-sm font-normal leading-snug">
                Jestem Konsumentem (zawieram umowę bez bezpośredniego związku z działalnością
                gospodarczą lub zawodową)
              </Label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!variant || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Zapisz identyfikację
            </Button>
            {diditApproved ? (
              <Badge className="bg-emerald-100 text-emerald-800">
                <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Tożsamość potwierdzona (Didit)
              </Badge>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!variant || diditMut.isPending}
                  onClick={() => diditMut.mutate()}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" /> Potwierdź tożsamość (Didit)
                </Button>
                {state.didit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={checkMut.isPending}
                    onClick={() => checkMut.mutate()}
                  >
                    Odśwież status weryfikacji
                  </Button>
                ) : null}
              </>
            )}
          </div>
          {state.didit?.personal?.fullName ? (
            <p className="text-xs text-muted-foreground">
              Dane potwierdzone: {state.didit.personal.fullName}
              {state.didit.personal.documentNumber
                ? ` · dokument ${state.didit.personal.documentNumber}`
                : ""}
            </p>
          ) : null}
        </div>
      )}
    </StepCard>
  );
}

// ── Krok 2: doręczenie na trwałym nośniku ────────────────────────────────────

function DeliveryStep({ state, onDone }: { state: any; onDone: () => void }) {
  const deliver = useServerFn(deliverLegalPack);
  const mut = useMutation({
    mutationFn: () => deliver(),
    onSuccess: (res: any) => {
      toast.success(`Pakiet wysłany na ${res.email}`);
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const isConsumer = Boolean(state.investor?.is_consumer);
  return (
    <StepCard
      index={2}
      title="Doręczenie pakietu na trwałym nośniku"
      done={state.hasDelivery}
      subtitle={
        isConsumer
          ? "Jako Konsument musisz otrzymać informacje przedumowne (Załącznik nr 3 i 4) e-mailem PRZED akceptacją Umowy ramowej."
          : "Wysyłamy komplet dokumentów (DOCX) na Twój e-mail — kopia do zachowania."
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}
          Wyślij pakiet na e-mail
        </Button>
        {state.hasDelivery ? (
          <span className="text-xs text-muted-foreground">
            Ostatnie doręczenie:{" "}
            {new Date(state.deliveries[0]?.delivered_at).toLocaleString("pl-PL")} (
            {state.deliveries[0]?.email})
          </span>
        ) : null}
      </div>
    </StepCard>
  );
}

// ── Kroki 3–5: akceptacje dokumentów ─────────────────────────────────────────

const DOC_STEP_INDEX: Record<string, number> = { umowa_ramowa: 3, nda: 4, rodo: 5 };
const DOC_STATEMENTS: Record<string, Array<{ key: string; label: string }>> = {
  umowa_ramowa: [
    {
      key: "nieodplatnosc_uslugi",
      label: "Przyjmuję do wiadomości, że usługa pośrednictwa jest dla mnie nieodpłatna (prowizję płaci Klient).",
    },
    {
      key: "mechanizm_zabezpieczenia_prowizji",
      label: "Akceptuję Mechanizm Zabezpieczenia Prowizji (§ 6 Umowy ramowej).",
    },
    {
      key: "kara_obejsciowa_i_okres_ochronny",
      label: "Akceptuję Karę Obejściową 5% Sumy Hipotecznej i Okres Ochronny 5 lat.",
    },
  ],
  nda: [
    {
      key: "zakaz_obchodzenia",
      label: "Zobowiązuję się do zachowania poufności i zakazu obchodzenia (pełna treść NDA).",
    },
  ],
  rodo: [
    {
      key: "modul_a_odrebni_administratorzy",
      label: "Akceptuję Moduł A (odrębni administratorzy); Moduł B nieaktywny bez Karty Polecenia.",
    },
  ],
};

function AcceptanceSteps({ state, onDone }: { state: any; onDone: () => void }) {
  const docs = (state.documents ?? []).filter((d: any) => d.active);
  const identified = Boolean(state.investor?.entity_variant);
  return (
    <>
      {docs.map((doc: any, i: number) => {
        const prevAccepted = docs.slice(0, i).every((d: any) => d.accepted);
        return (
          <DocumentStep
            key={doc.code}
            doc={doc}
            locked={!identified || !prevAccepted}
            isConsumer={Boolean(state.investor?.is_consumer)}
            hasDelivery={state.hasDelivery}
            onDone={onDone}
          />
        );
      })}
    </>
  );
}

function DocumentStep({
  doc,
  locked,
  isConsumer,
  hasDelivery,
  onDone,
}: {
  doc: any;
  locked: boolean;
  isConsumer: boolean;
  hasDelivery: boolean;
  onDone: () => void;
}) {
  const fetchText = useServerFn(getLegalDocumentText);
  const accept = useServerFn(acceptLegalDocument);
  const [open, setOpen] = useState(false);
  // § 15 ust. 7: wszystkie pola startują PUSTE.
  const [confirmed, setConfirmed] = useState(false);
  const [statements, setStatements] = useState<Record<string, boolean>>({});

  const { data: text } = useQuery({
    queryKey: ["legal-doc-text", doc.code, doc.version],
    queryFn: () => fetchText({ data: { code: doc.code } }),
    enabled: open,
    staleTime: Infinity,
  });

  const stmts = DOC_STATEMENTS[doc.code] ?? [];
  const allStatements = stmts.every((s) => statements[s.key]);
  const consumerBlocked = doc.code === "umowa_ramowa" && isConsumer && !hasDelivery;

  const mut = useMutation({
    mutationFn: () =>
      accept({ data: { code: doc.code, confirmed: true as const, statements } }),
    onSuccess: () => {
      toast.success(`Zaakceptowano: ${doc.title}`);
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <StepCard
      index={DOC_STEP_INDEX[doc.code] ?? 0}
      title={`${doc.title} (${doc.version})`}
      done={doc.accepted}
      subtitle={`SHA-256: ${String(doc.sha256).slice(0, 16)}… · forma dokumentowa z pełnym śladem audytowym`}
    >
      {doc.accepted ? (
        <p className="text-sm text-emerald-700">
          Zaakceptowano {doc.accepted_at ? new Date(doc.accepted_at).toLocaleString("pl-PL") : ""}.
          Potwierdzenie wysłaliśmy e-mailem.
        </p>
      ) : locked ? (
        <p className="text-sm text-muted-foreground">
          Najpierw ukończ poprzednie kroki (identyfikacja i wcześniejsze dokumenty — kolejność:
          Umowa ramowa → NDA → RODO).
        </p>
      ) : (
        <div className="space-y-3">
          {consumerBlocked ? (
            <p className="text-sm text-amber-700">
              Jako Konsument najpierw użyj kroku 2 („Wyślij pakiet na e-mail") — informacje
              przedumowne muszą być doręczone przed akceptacją.
            </p>
          ) : null}
          {!open ? (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <FileText className="mr-2 h-4 w-4" /> Wyświetl pełną treść
            </Button>
          ) : (
            <>
              <div className="max-h-96 overflow-y-auto rounded-md border bg-muted/30 p-4 text-xs whitespace-pre-wrap leading-relaxed">
                {text?.content_text ?? "Wczytywanie treści…"}
              </div>
              <div className="space-y-2">
                {stmts.map((s) => (
                  <div key={s.key} className="flex items-start gap-2">
                    <Checkbox
                      id={`${doc.code}-${s.key}`}
                      checked={Boolean(statements[s.key])}
                      onCheckedChange={(v) =>
                        setStatements((prev) => ({ ...prev, [s.key]: v === true }))
                      }
                    />
                    <Label
                      htmlFor={`${doc.code}-${s.key}`}
                      className="text-xs font-normal leading-snug"
                    >
                      {s.label}
                    </Label>
                  </div>
                ))}
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={`${doc.code}-confirm`}
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                  />
                  <Label
                    htmlFor={`${doc.code}-confirm`}
                    className="text-xs font-normal leading-snug"
                  >
                    Zapoznałem/-am się z pełną treścią dokumentu i akceptuję ją w formie
                    dokumentowej.
                  </Label>
                </div>
              </div>
              <Button
                size="sm"
                disabled={!confirmed || !allStatements || consumerBlocked || mut.isPending}
                onClick={() => mut.mutate()}
              >
                {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Akceptuję dokument
              </Button>
            </>
          )}
        </div>
      )}
    </StepCard>
  );
}

// ── Krok 7: Formularz Zlecenia ───────────────────────────────────────────────

function OrderForm({ state, onDone }: { state: any; onDone: () => void }) {
  const submit = useServerFn(submitInvestorOrder);
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState("");
  const [yieldMin, setYieldMin] = useState("");
  const [validity, setValidity] = useState<string>("60");
  const [consumerChoice, setConsumerChoice] = useState<string>("");
  // Oświadczenia — startują puste (§ 15 ust. 7).
  const [s1, setS1] = useState(false);
  const [s2, setS2] = useState(false);
  const [s3, setS3] = useState(false);

  const isConsumer = Boolean(state.investor?.is_consumer);
  const ready = state.packComplete;

  const mut = useMutation({
    mutationFn: () =>
      submit({
        data: {
          amountPln: Number(amount),
          maxPeriodMonths: Number(period),
          minAnnualYield: Number(yieldMin),
          validityDays: Number(validity) as 30 | 60 | 90,
          statements: {
            zlecenie_na_podstawie_umowy: true as const,
            samodzielna_weryfikacja_przedsiebiorcy_i_celu: true as const,
            projekty_tylko_w_wykonaniu_zlecenia: true as const,
          },
          consumerChoice: (isConsumer ? consumerChoice : "nie_dotyczy") as any,
        },
      }),
    onSuccess: (res: any) => {
      toast.success(`Zlecenie ${res.orderNo} złożone — decyzja w 2 dni robocze.`);
      setAmount("");
      setPeriod("");
      setYieldMin("");
      setS1(false);
      setS2(false);
      setS3(false);
      setConsumerChoice("");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const valid =
    Number(amount) > 0 &&
    Number(period) > 0 &&
    Number(yieldMin) >= 0 &&
    s1 &&
    s2 &&
    s3 &&
    (!isConsumer || consumerChoice !== "");

  return (
    <StepCard
      index={7}
      title="Formularz Zlecenia (Załącznik nr 7)"
      done={false}
      subtitle="Kwota ± 15%, maksymalny okres, minimalny zysk roczny i termin ważności. Finance You przyjmuje lub odmawia w 2 dni robocze; jednocześnie mogą być przyjęte maksymalnie 3 Zlecenia."
    >
      {!ready ? (
        <p className="text-sm text-muted-foreground">
          Formularz Zlecenia jest nieaktywny — najpierw zaakceptuj komplet dokumentów pakietu
          (kroki 1–5).
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Kwota inwestycji (zł, ± 15%)</Label>
              <Input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="np. 200000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Maks. okres (miesiące)</Label>
              <Input
                type="number"
                min={1}
                max={360}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="np. 24"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Min. zysk roczny (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={yieldMin}
                onChange={(e) => setYieldMin(e.target.value)}
                placeholder="np. 12"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Termin ważności</Label>
              <Select value={validity} onValueChange={setValidity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 dni</SelectItem>
                  <SelectItem value="60">60 dni</SelectItem>
                  <SelectItem value="90">90 dni</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            {[
              {
                v: s1,
                set: setS1,
                id: "o1",
                label:
                  "Składam Zlecenie na podstawie Ramowej umowy pośrednictwa finansowego (pakiet FY-LEGAL-2026-09-04).",
              },
              {
                v: s2,
                set: setS2,
                id: "o2",
                label:
                  "Zobowiązuję się samodzielnie zweryfikować status przedsiębiorcy Klienta i Cel Gospodarczy Finansowania (§ 6 ust. 1 pkt 9).",
              },
              {
                v: s3,
                set: setS3,
                id: "o3",
                label:
                  "Przyjmuję do wiadomości, że Projekty przedstawiane są wyłącznie w wykonaniu przyjętego Zlecenia.",
              },
            ].map((o) => (
              <div key={o.id} className="flex items-start gap-2">
                <Checkbox id={o.id} checked={o.v} onCheckedChange={(v) => o.set(v === true)} />
                <Label htmlFor={o.id} className="text-xs font-normal leading-snug">
                  {o.label}
                </Label>
              </div>
            ))}
          </div>

          {isConsumer ? (
            <div className="space-y-1.5">
              <Label>Wybór Konsumenta (§ 15 ust. 3 — dotyczy tego Zlecenia)</Label>
              <Select value={consumerChoice} onValueChange={setConsumerChoice}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start_po_14_dniach">
                    Rozpoczęcie wykonywania po upływie 14-dniowego terminu odstąpienia
                  </SelectItem>
                  <SelectItem value="zadanie_startu_przed_14">
                    Żądam rozpoczęcia wykonywania przed upływem terminu odstąpienia
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <Button disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Złóż Zlecenie
          </Button>
        </div>
      )}
    </StepCard>
  );
}

// ── Lista Zleceń ─────────────────────────────────────────────────────────────

function OrdersList({ state, onDone }: { state: any; onDone: () => void }) {
  const withdraw = useServerFn(withdrawInvestorOrder);
  const mut = useMutation({
    mutationFn: (orderId: string) => withdraw({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Zlecenie cofnięte");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const orders = state.orders ?? [];
  if (orders.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Moje Zlecenia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.map((o: any) => {
          const st = ORDER_STATUS_LABELS[o.status] ?? { label: o.status, tone: "bg-slate-100" };
          return (
            <div
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <div className="space-y-0.5">
                <div className="font-medium">
                  FY-Z-{o.order_seq} · {Number(o.amount_pln).toLocaleString("pl-PL")} zł ± 15%
                </div>
                <div className="text-xs text-muted-foreground">
                  maks. {o.max_period_months} mies. · min. {o.min_annual_yield}% rocznie · ważne{" "}
                  {o.validity_days} dni
                  {o.expires_at
                    ? ` · do ${new Date(o.expires_at).toLocaleDateString("pl-PL")}`
                    : ""}
                  {o.rejection_reason ? ` · powód: ${o.rejection_reason}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={st.tone}>{st.label}</Badge>
                {["zlozone", "przyjete"].includes(o.status) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mut.isPending}
                    onClick={() => mut.mutate(o.id)}
                  >
                    Cofnij
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Wspólna karta kroku ──────────────────────────────────────────────────────

function StepCard({
  index,
  title,
  subtitle,
  done,
  children,
}: {
  index: number;
  title: string;
  subtitle?: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(done && "border-emerald-200")}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {done ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="text-muted-foreground">Krok {index}.</span> {title}
        </CardTitle>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
