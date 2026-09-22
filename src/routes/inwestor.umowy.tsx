// JEDEN pipeline inwestora (pakiet FY-LEGAL-2026-09-04 + cennik 2026-09):
//   1. Dane pożyczkodawcy (osoba fizyczna / JDG / spółka, wyszukiwarka GUS/KRS)
//   2. Rachunek bankowy do spłaty pożyczki (wymuszony)
//   3. Weryfikacja tożsamości — KYC Didit
//   4. Screening list sankcyjnych i PEP (Dilisense)
//   5. Doręczenie pakietu na trwałym nośniku
//   6. Ramowa umowa pośrednictwa  7. NDA  8. RODO
//   9. Zlecenie poszukiwania okazji
// Kolejność liczy computeInvestorPipeline (ta sama funkcja po stronie serwera),
// § 15 ust. 7: żaden checkbox nie startuje zaznaczony.
import { useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, FileText, Loader2, Mail, ShieldCheck, Sparkles } from "lucide-react";
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
import {
  getMyLegalPackState,
  getLegalDocumentText,
  deliverLegalPack,
  acceptLegalDocument,
  submitInvestorOrder,
  withdrawInvestorOrder,
} from "@/lib/investor-agreements/legal-pack.functions";
import { getInvestorPipelineState } from "@/lib/investor-agreements/pipeline.functions";
import { getMyInvestorPlan } from "@/lib/investor-plan/plan.functions";
import {
  startInvestorSelfVerification,
  getMyInvestorVerification,
} from "@/lib/investor-agreements/didit-self.functions";
import { OrderCycleSection } from "@/components/inwestor/order-cycle";
import { PipelineProgress, PipelineStepCard } from "@/components/inwestor/pipeline-stepper";
import {
  LenderDataStep,
  RepaymentAccountStep,
  SanctionsScreeningStep,
} from "@/components/inwestor/pipeline-steps";
import { TpayReturnStatus } from "@/components/access/TpayReturnStatus";
import { formatGroszPln } from "@/lib/access/core";
import { TIER_PRESENTATION } from "@/lib/investor-plan/plans";
import type { PipelineStep, PipelineStepKey } from "@/lib/investor-plan/pipeline";

export const Route = createFileRoute("/inwestor/umowy")({
  validateSearch: (search: Record<string, unknown>): { tpay?: string; payment?: string } => ({
    tpay: typeof search.tpay === "string" ? search.tpay : undefined,
    payment: typeof search.payment === "string" ? search.payment : undefined,
  }),
  component: PipelinePage,
});

const ORDER_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  zlozone: {
    label: "Złożone — czekamy na decyzję (2 dni robocze)",
    tone: "bg-amber-100 text-amber-800",
  },
  przyjete: { label: "Przyjęte", tone: "bg-emerald-100 text-emerald-800" },
  wykonane: { label: "Wykonane", tone: "bg-blue-100 text-blue-800" },
  wygasle: { label: "Wygasłe", tone: "bg-slate-100 text-slate-600" },
  cofniete: { label: "Cofnięte", tone: "bg-slate-100 text-slate-600" },
  odmowa: { label: "Odmowa", tone: "bg-red-100 text-red-700" },
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

function PipelinePage() {
  const { tpay, payment } = useSearch({ from: "/inwestor/umowy" });
  const qc = useQueryClient();
  const fetchLegal = useServerFn(getMyLegalPackState);
  const fetchPipeline = useServerFn(getInvestorPipelineState);
  const fetchPlan = useServerFn(getMyInvestorPlan);

  const legalQ = useQuery({ queryKey: ["legal-pack-state"], queryFn: () => fetchLegal() });
  const pipeQ = useQuery({ queryKey: ["investor-pipeline"], queryFn: () => fetchPipeline() });
  const planQ = useQuery({ queryKey: ["investor-plan"], queryFn: () => fetchPlan() });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["legal-pack-state"] });
    void qc.invalidateQueries({ queryKey: ["investor-pipeline"] });
    void qc.invalidateQueries({ queryKey: ["investor-plan"] });
  };

  if (legalQ.isLoading || pipeQ.isLoading || !legalQ.data || !pipeQ.data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie pipeline'u…
      </div>
    );
  }

  const legal = legalQ.data as any;
  const pipe = pipeQ.data;
  const plan = planQ.data;
  const steps = pipe.pipeline.steps;
  const step = (key: PipelineStepKey): PipelineStep =>
    steps.find((s) => s.key === key) as PipelineStep;

  const docByCode = (code: string) =>
    (legal.documents ?? []).find((d: any) => d.code === code && d.active) ?? null;

  const tier = TIER_PRESENTATION[pipe.tier];

  return (
    <div className="space-y-5">
      <FancyPageHeader
        eyebrow="Okazje inwestycyjne"
        title="Od danych pożyczkodawcy do Zlecenia"
        subtitle="Dziewięć kroków w jednym miejscu: dane stron, rachunek do spłaty, KYC, screening sankcyjny, komplet umów i Zlecenie poszukiwania okazji."
      />

      {tpay && payment ? (
        <TpayReturnStatus paymentId={payment} tpayParam={tpay} onPaid={refresh} />
      ) : null}

      <PipelineProgress steps={steps} progress={pipe.pipeline.progress} tierLabel={tier.name} />

      <PlanBanner tier={pipe.tier} plan={plan} />

      {!legal.packActive ? (
        <Card className="border-amber-300 bg-amber-50/40">
          <CardContent className="py-4 text-sm text-amber-900">
            Pakiet dokumentów jest w przygotowaniu (przegląd kancelarii). Kroki 5–9 odblokujemy po
            jego aktywacji — damy znać e-mailem. Kroki 1–4 możesz przejść już teraz.
          </CardContent>
        </Card>
      ) : null}

      <PipelineStepCard step={step("dane_pozyczkodawcy")}>
        <LenderDataStep investor={pipe.investor} onDone={refresh} />
      </PipelineStepCard>

      <PipelineStepCard step={step("rachunek_splaty")}>
        <RepaymentAccountStep bank={pipe.bank} onDone={refresh} />
      </PipelineStepCard>

      <PipelineStepCard step={step("kyc")}>
        <KycStep pipe={pipe} onDone={refresh} />
      </PipelineStepCard>

      <PipelineStepCard step={step("screening")}>
        <SanctionsScreeningStep
          screening={pipe.screening}
          kycApproved={pipe.input.kycStatus === "approved"}
          onDone={refresh}
        />
      </PipelineStepCard>

      <PipelineStepCard step={step("doreczenie")}>
        <DeliveryStep state={legal} onDone={refresh} />
      </PipelineStepCard>

      {(["umowa_ramowa", "nda", "rodo"] as const).map((code) => {
        const doc = docByCode(code);
        const s = step(code);
        if (!doc) {
          return (
            <PipelineStepCard key={code} step={s}>
              <p className="text-sm text-muted-foreground">
                Dokument nie jest jeszcze aktywny w rejestrze.
              </p>
            </PipelineStepCard>
          );
        }
        return (
          <PipelineStepCard key={code} step={s}>
            <DocumentStep
              doc={doc}
              locked={s.state === "zablokowany"}
              investor={pipe.investor}
              onDone={refresh}
            />
          </PipelineStepCard>
        );
      })}

      <PipelineStepCard step={step("zlecenie")}>
        <OrderForm
          canSubmit={pipe.pipeline.canSubmitOrder}
          isConsumer={pipe.input.isConsumer}
          onDone={refresh}
        />
      </PipelineStepCard>

      <OrdersList state={legal} onDone={refresh} />

      {/* Cykl Zlecenie–Projekt: teaser → Karta Leada → Ujawnienie → rezerwacja. */}
      {legal.packActive ? <OrderCycleSection /> : null}

      <SuccessFeesList plan={plan} />
    </div>
  );
}

// ── Opłaty sukcesu PRO widoczne dla inwestora ────────────────────────────────

const FEE_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  wstrzymana: {
    label: "Wstrzymana — nie do zapłaty",
    tone: "bg-amber-100 text-amber-900",
  },
  naliczona: { label: "Naliczona", tone: "bg-blue-100 text-blue-900" },
  zafakturowana: { label: "Zafakturowana", tone: "bg-indigo-100 text-indigo-900" },
  oplacona: { label: "Opłacona", tone: "bg-emerald-100 text-emerald-900" },
  anulowana: { label: "Anulowana", tone: "bg-slate-100 text-slate-600" },
};

function SuccessFeesList({ plan }: { plan: any }) {
  const fees = (plan?.successFees ?? []) as any[];
  if (fees.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Opłaty sukcesu ({(plan?.successFeeBps ?? 500) / 100}% kwoty udzielonej pożyczki)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {fees.map((f) => {
          const st = FEE_STATUS_LABELS[f.status] ?? { label: f.status, tone: "bg-slate-100" };
          return (
            <div
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <div>
                <div className="font-medium">
                  {formatGroszPln(f.feeGrosz)} od {f.loanAmountPln.toLocaleString("pl-PL")} zł
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(f.createdAt).toLocaleDateString("pl-PL")}
                </div>
              </div>
              <Badge className={st.tone}>{st.label}</Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Baner pakietu ────────────────────────────────────────────────────────────

function PlanBanner({ tier, plan }: { tier: "podstawowy" | "pro"; plan: any }) {
  const p = TIER_PRESENTATION[tier];
  const isPro = tier === "pro";
  return (
    <Card
      className="overflow-hidden border-0 text-white"
      style={{
        background: isPro
          ? "linear-gradient(115deg, oklch(0.36 0.16 285), oklch(0.48 0.18 250) 55%, oklch(0.62 0.15 205))"
          : "linear-gradient(115deg, oklch(0.30 0.08 265), oklch(0.38 0.10 250))",
      }}
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] opacity-85">
            <Sparkles className="h-3.5 w-3.5" /> Pakiet {p.name}
          </div>
          <p className="max-w-2xl text-sm opacity-90">{p.tagline}</p>
          {isPro && plan?.activeUntil ? (
            <p className="text-xs opacity-75">
              Aktywny do {new Date(plan.activeUntil).toLocaleDateString("pl-PL")} · {plan.daysLeft}{" "}
              dni · opłata sukcesu {(plan.successFeeBps ?? 500) / 100}% od udzielonej pożyczki
            </p>
          ) : (
            <p className="text-xs opacity-75">
              Odblokowanie pojedynczej okazji: {formatGroszPln(plan?.unlockPriceGrosz ?? 150000)} ·
              pakiet PRO: 3 000 zł / 6 miesięcy + 5% od udzielonej pożyczki
            </p>
          )}
        </div>
        {!isPro ? (
          <Button
            variant="secondary"
            className="bg-white text-slate-900 hover:bg-white/90"
            onClick={() => {
              window.location.href = "/inwestor/abonament?product=investor_pro_180d";
            }}
          >
            Przejdź na PRO
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Krok 3: KYC Didit ────────────────────────────────────────────────────────

function KycStep({ pipe, onDone }: { pipe: any; onDone: () => void }) {
  const startDidit = useServerFn(startInvestorSelfVerification);
  const fetchDidit = useServerFn(getMyInvestorVerification);
  const variant = pipe.investor?.entity_variant as string | undefined;

  const startMut = useMutation({
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
    onError: (e) => toast.error(errMsg(e)),
  });

  const approved = pipe.input.kycStatus === "approved";

  return (
    <div className="space-y-3">
      {approved ? (
        <Badge className="bg-emerald-100 text-emerald-800">
          <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Tożsamość potwierdzona
          {pipe.kyc?.fullName ? ` — ${pipe.kyc.fullName}` : ""}
        </Badge>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!pipe.input.lenderDataCompleted || startMut.isPending}
            onClick={() => startMut.mutate()}
          >
            {startMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            Potwierdź tożsamość (Didit)
          </Button>
          {pipe.kyc ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={checkMut.isPending}
              onClick={() => checkMut.mutate()}
            >
              Odśwież status weryfikacji
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Krok 5: doręczenie na trwałym nośniku ────────────────────────────────────

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
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {isConsumer
          ? "Jako Konsument musisz otrzymać informacje przedumowne (Załączniki nr 3 i 4) e-mailem PRZED akceptacją Umowy ramowej."
          : "Wysyłamy komplet dokumentów (DOCX) na Twój e-mail — kopia do zachowania."}
      </p>
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
    </div>
  );
}

// ── Kroki 6–8: akceptacja dokumentów ─────────────────────────────────────────

const DOC_STATEMENTS: Record<string, Array<{ key: string; label: string }>> = {
  umowa_ramowa: [
    {
      key: "nieodplatnosc_uslugi",
      label:
        "Przyjmuję do wiadomości zasady rozliczenia opisane w Umowie ramowej (Prowizja Klientowska obciąża Klienta).",
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

function DocumentStep({
  doc,
  locked,
  investor,
  onDone,
}: {
  doc: any;
  locked: boolean;
  investor: Record<string, any> | null;
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

  const mut = useMutation({
    mutationFn: () => accept({ data: { code: doc.code, confirmed: true as const, statements } }),
    onSuccess: () => {
      toast.success(`Zaakceptowano: ${doc.title}`);
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (doc.accepted) {
    return (
      <div className="space-y-1 text-sm">
        <p className="text-emerald-700">
          Zaakceptowano {doc.accepted_at ? new Date(doc.accepted_at).toLocaleString("pl-PL") : ""}.
          Potwierdzenie wysłaliśmy e-mailem, protokół akceptacji jest przypisany do Twojego konta.
        </p>
        <p className="text-xs text-muted-foreground">
          Wersja {doc.version} · SHA-256: {String(doc.sha256).slice(0, 16)}…
        </p>
      </div>
    );
  }

  if (locked) {
    return (
      <p className="text-sm text-muted-foreground">
        Dokument odblokuje się po ukończeniu wcześniejszych kroków pipeline'u.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ComparisonPreview investor={investor} />
      {!open ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <FileText className="mr-2 h-4 w-4" /> Wyświetl pełną treść ({doc.version})
        </Button>
      ) : (
        <>
          <div className="max-h-96 overflow-y-auto rounded-xl border bg-muted/30 p-4 text-xs leading-relaxed whitespace-pre-wrap">
            {(text as any)?.content_text ?? "Wczytywanie treści…"}
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
              <Label htmlFor={`${doc.code}-confirm`} className="text-xs font-normal leading-snug">
                Zapoznałem/-am się z pełną treścią dokumentu i podpisuję go w formie dokumentowej.
              </Label>
            </div>
          </div>
          <Button
            size="sm"
            disabled={!confirmed || !allStatements || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Podpisuję i akceptuję
          </Button>
        </>
      )}
    </div>
  );
}

/** Komparycja wypełniona danymi z kroku 1 — inwestor widzi, co podpisuje. */
function ComparisonPreview({ investor }: { investor: Record<string, any> | null }) {
  if (!investor) return null;
  const isCompany = investor.entity_variant !== "osoba_fizyczna";
  const rows: [string, string | null][] = [
    [
      isCompany ? "Firma" : "Imię i nazwisko",
      isCompany
        ? investor.company_name
        : [investor.first_name, investor.last_name].filter(Boolean).join(" ") || null,
    ],
    [
      isCompany ? "NIP / KRS" : "PESEL",
      isCompany ? [investor.nip, investor.krs].filter(Boolean).join(" / ") || null : investor.pesel,
    ],
    [
      "Adres",
      [investor.street, [investor.postal_code, investor.city].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ") || null,
    ],
    ["Rachunek do spłaty", investor.bank_account ?? null],
    [
      "Reprezentacja",
      [
        investor.representative_first_name,
        investor.representative_last_name,
        investor.representative_role,
      ]
        .filter(Boolean)
        .join(" ") || null,
    ],
  ];
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="text-[0.68rem] font-bold uppercase tracking-wide text-muted-foreground">
        Komparycja wypełniona przez system
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        {rows
          .filter(([, v]) => Boolean(v))
          .map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="text-muted-foreground">{k}:</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

// ── Krok 9: Formularz Zlecenia ───────────────────────────────────────────────

function OrderForm({
  canSubmit,
  isConsumer,
  onDone,
}: {
  canSubmit: boolean;
  isConsumer: boolean;
  onDone: () => void;
}) {
  const submit = useServerFn(submitInvestorOrder);
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState("");
  const [yieldMin, setYieldMin] = useState("");
  const [validity, setValidity] = useState<string>("60");
  const [consumerChoice, setConsumerChoice] = useState<string>("");
  const [s1, setS1] = useState(false);
  const [s2, setS2] = useState(false);
  const [s3, setS3] = useState(false);

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

  if (!canSubmit) {
    return (
      <p className="text-sm text-muted-foreground">
        Formularz Zlecenia odblokuje się, gdy wszystkie wcześniejsze kroki będą zielone.
      </p>
    );
  }

  const valid =
    Number(amount) > 0 &&
    Number(period) > 0 &&
    Number(yieldMin) >= 0 &&
    s1 &&
    s2 &&
    s3 &&
    (!isConsumer || consumerChoice !== "");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Kwota inwestycji (zł, ± 15%)</Label>
          <Input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="np. 200000"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Maks. okres (miesiące)</Label>
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
          <Label className="text-xs">Min. zysk roczny (%)</Label>
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
          <Label className="text-xs">Termin ważności</Label>
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
              "Składam Zlecenie na podstawie Ramowej umowy pośrednictwa (pakiet FY-LEGAL-2026-09-04).",
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
          <Label className="text-xs">Wybór Konsumenta (§ 15 ust. 3 — dotyczy tego Zlecenia)</Label>
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
