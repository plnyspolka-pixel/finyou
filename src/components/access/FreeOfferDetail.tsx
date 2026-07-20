// Szczegół oferty dla DARMOWEGO konta inwestora: zdjęcia nieruchomości,
// zanonimizowana treść księgi wieczystej (działy I-Sp/III/IV bez adresu i
// właścicieli) oraz składanie oferty w ramach limitów darmowego konta.
// Kalkulator w trybie freeTierMode: oprocentowanie stałe = odsetki maksymalne
// (NBP), prowizja inwestora 0, prowizja Finance You 2× planu pełnego.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Lock,
  MapPin,
  Ruler,
  Wallet,
  Percent,
  BookOpen,
  Send,
  TrendingUp,
} from "lucide-react";
import { LoanCalculator, type LoanCalculatorState } from "@/components/loan-calculator";
import { formatPLN, propertyTypeLabels } from "@/lib/labels";
import { sanitizeHtml } from "@/lib/sanitize-html";
import {
  getFreeInvestorState,
  getFreeOfferDetail,
  submitFreeInvestorOffer,
  type FreeInvestorStateResult as FreeState,
  type FreeOfferDetailResult as FreeDetail,
} from "@/lib/access/free-investor.functions";

export function FreeOfferDetail({ applicationId }: { applicationId: string }) {
  const navigate = useNavigate();
  const detailFn = useServerFn(getFreeOfferDetail);
  const stateFn = useServerFn(getFreeInvestorState);
  const submitFn = useServerFn(submitFreeInvestorOffer);

  const detailQ = useQuery<FreeDetail>({
    queryKey: ["free-offer-detail", applicationId],
    queryFn: () => detailFn({ data: { applicationId } }) as Promise<FreeDetail>,
    retry: false,
  });
  const stateQ = useQuery<FreeState>({
    queryKey: ["free-investor-state"],
    queryFn: () => stateFn() as Promise<FreeState>,
    staleTime: 60_000,
  });

  const [calc, setCalc] = useState<LoanCalculatorState | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);

  const d = detailQ.data;
  const s = stateQ.data;
  useEffect(() => {
    setPhotoIdx(0);
  }, [applicationId]);

  const offersLeft = s ? Math.max(0, s.offerLimit - s.offersLast365) : null;
  const proposedAmount = calc?.amount ?? d?.loanAmount ?? 0;
  const aboveThreshold = s ? proposedAmount > s.thresholdPln : false;

  const kwSections = useMemo(
    () =>
      d?.kw
        ? ([
            ["Dział I-Sp — spis praw związanych z własnością", d.kw.dzial1s],
            ["Dział III — prawa, roszczenia i ograniczenia", d.kw.dzial3],
            ["Dział IV — hipoteki", d.kw.dzial4],
          ] as const)
        : [],
    [d?.kw],
  );

  const submit = async () => {
    if (!calc) return toast.error("Ustaw parametry oferty w kalkulatorze");
    setSubmitting(true);
    try {
      const res = (await submitFn({
        data: {
          applicationId,
          proposedAmount: Math.round(calc.amount),
          periodMonths: calc.months,
          annualRate: calc.annualRate,
          repaymentType: calc.balloon > 0 ? "mieszana" : "miesieczna",
          estimatedMonthlyPayment: Math.round(calc.cappedRata) || null,
          estimatedTotalCost: Math.round(calc.totalCost) || null,
          investorNote: note.trim() || null,
        },
      })) as import("@/lib/access/free-investor.functions").SubmitFreeOfferResult;
      if (!res.ok) {
        setLimitMessage(res.message ?? "Nie udało się złożyć oferty");
        return;
      }
      toast.success("Oferta została złożona");
      void navigate({ to: "/inwestor/oferty" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się złożyć oferty");
    } finally {
      setSubmitting(false);
    }
  };

  if (detailQ.isLoading) {
    return <div className="py-10 text-center text-muted-foreground">Ładowanie oferty…</div>;
  }
  if (detailQ.error || !d) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          {(detailQ.error as Error)?.message ?? "Oferta jest niedostępna."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pasek konta darmowego z licznikami limitów */}
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Lock className="h-5 w-5 text-primary" />
            <span>
              <b>Konto darmowe.</b>{" "}
              {s && (
                <>
                  Oferty (kwoty do {formatPLN(s.thresholdPln)}):{" "}
                  <Badge variant={offersLeft === 0 ? "destructive" : "secondary"}>
                    {s.offersLast365}/{s.offerLimit} w tym roku
                  </Badge>{" "}
                  · Zawarte pożyczki:{" "}
                  <Badge variant={s.loansLast365 >= s.loanLimit ? "destructive" : "secondary"}>
                    {s.loansLast365}/{s.loanLimit}
                  </Badge>{" "}
                  · Kwoty powyżej progu — bez limitu.
                </>
              )}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void navigate({ to: "/inwestor/abonament" })}
          >
            Pełny dostęp bez limitów
          </Button>
        </CardContent>
      </Card>

      {/* Galeria zdjęć */}
      {d.photoUrls.length > 0 && (
        <Card className="overflow-hidden">
          <div className="relative aspect-[16/9] w-full bg-muted">
            <img src={d.photoUrls[photoIdx]} alt="" className="h-full w-full object-cover" />
          </div>
          {d.photoUrls.length > 1 && (
            <CardContent className="flex gap-2 overflow-x-auto py-3">
              {d.photoUrls.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setPhotoIdx(i)}
                  className={`h-16 w-24 shrink-0 overflow-hidden rounded-md border-2 ${i === photoIdx ? "border-primary" : "border-transparent"}`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Parametry oferty */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {d.propertyType && (
              <Badge variant="secondary">
                {propertyTypeLabels[d.propertyType as keyof typeof propertyTypeLabels] ??
                  d.propertyType}
              </Badge>
            )}
            <span className="flex items-center gap-1 text-base font-normal text-muted-foreground">
              <MapPin className="h-4 w-4" />{" "}
              {[d.city, d.voivodeship].filter(Boolean).join(", ") || "Polska"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {d.loanAmount != null && (
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span>
                Poszukiwane finansowanie: <b>{formatPLN(d.loanAmount)}</b>
              </span>
            </div>
          )}
          {d.periodMonths != null && (
            <div>
              Preferowany okres: <b>{d.periodMonths} mies.</b>
            </div>
          )}
          {d.annualRate != null && (
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4" /> Publikowane oprocentowanie: <b>{d.annualRate}%</b>
            </div>
          )}
          {d.ltv != null && (
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> LTV: <b>{d.ltv}%</b>
            </div>
          )}
          {d.estimatedValue != null && (
            <div>
              Szacunkowa wartość nieruchomości: <b>{formatPLN(d.estimatedValue)}</b>
            </div>
          )}
          {d.areaSqm != null && (
            <div className="flex items-center gap-2">
              <Ruler className="h-4 w-4" /> Powierzchnia: <b>{d.areaSqm} m²</b>
            </div>
          )}
          {d.description && (
            <p className="sm:col-span-2 lg:col-span-4 text-muted-foreground">{d.description}</p>
          )}
        </CardContent>
      </Card>

      {/* Zanonimizowana treść księgi wieczystej */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Księga wieczysta (treść zanonimizowana)
            {d.kw && <Badge variant="outline">{d.kw.kwNumberMasked}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!d.kw ? (
            <p className="text-muted-foreground">
              Treść księgi wieczystej dla tej oferty nie została jeszcze pobrana.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Konto darmowe: numer księgi, adres nieruchomości (dział I-O) oraz dane właścicieli
                (dział II) są ukryte. Pełną treść KW odblokujesz w pełnym dostępie.
              </p>
              {d.kw.legalRiskScore != null && (
                <div>
                  Ocena ryzyka prawnego: <b>{d.kw.legalRiskScore}/100</b>
                </div>
              )}
              {d.kw.investorSummary && (
                <p className="rounded-md bg-muted/40 p-3">{d.kw.investorSummary}</p>
              )}
              {kwSections.map(([title, html]) =>
                html ? (
                  <details key={title} className="rounded-md border p-3">
                    <summary className="cursor-pointer font-medium">{title}</summary>
                    <div
                      className="kw-html prose prose-sm mt-2 max-w-none overflow-x-auto dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
                    />
                  </details>
                ) : null,
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Kalkulator + złożenie oferty (tryb darmowy) */}
      <Card>
        <CardHeader>
          <CardTitle>Złóż ofertę (konto darmowe)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {s && offersLeft === 0 && !aboveThreshold ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Wykorzystano limit {s.offerLimit} ofert w tym roku dla kwot do{" "}
              {formatPLN(s.thresholdPln)}. Możesz nadal składać oferty na kwoty{" "}
              <b>powyżej {formatPLN(s.thresholdPln)}</b> albo{" "}
              <Link to="/inwestor/abonament" className="underline">
                wykupić pełny dostęp
              </Link>
              .
            </div>
          ) : null}

          <LoanCalculator
            freeTierMode
            investorGuidance
            initialOnHand={d.loanAmount ?? 100_000}
            initialMonths={d.periodMonths ?? 12}
            initialMaxPayment={d.maxMonthlyPayment ?? 5000}
            onChange={setCalc}
          />

          <div className="space-y-2">
            <Label htmlFor="free-offer-note">Wiadomość do zespołu Finance You (opcjonalnie)</Label>
            <Textarea
              id="free-offer-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder="Np. preferowany termin uruchomienia, pytania do zabezpieczenia…"
            />
          </div>

          <Button className="w-full" size="lg" onClick={() => void submit()} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Składanie oferty…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" /> Złóż ofertę
              </>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Oprocentowanie oferty jest stałe i równe odsetkom maksymalnym
            {s
              ? ` (obecnie ${s.statutoryMaxRate.toFixed(2)}% rocznie, stopa ref. NBP ${s.nbpReferenceRate.toFixed(2)}%)`
              : ""}
            . Inwestor na koncie darmowym nie pobiera prowizji.
          </p>
        </CardContent>
      </Card>

      {/* Modal limitu ofert */}
      <Dialog open={Boolean(limitMessage)} onOpenChange={(o) => !o && setLimitMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Limit darmowego konta</DialogTitle>
            <DialogDescription>{limitMessage}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setLimitMessage(null);
                void navigate({ to: "/inwestor/oferty" });
              }}
            >
              Zobacz moje oferty
            </Button>
            <Button
              onClick={() => {
                setLimitMessage(null);
                void navigate({ to: "/inwestor/abonament" });
              }}
            >
              Wykup pełny dostęp
            </Button>
            <Button variant="ghost" onClick={() => setLimitMessage(null)}>
              Anuluj
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
