import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, ArrowLeft, Lock } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { TpayAccessCheckoutForm } from "@/components/access/TpayAccessCheckoutForm";
import { TpayReturnStatus } from "@/components/access/TpayReturnStatus";
import { AccessPlanCards } from "@/components/access/AccessPlanCards";
import {
  getMyAccessState,
  getMyBrokerOfferUsage,
  listAccessProducts,
  type AccessStateResult,
  type BrokerOfferUsage,
} from "@/lib/access/state.functions";
import { formatWarsawDate, type AccessProduct } from "@/lib/access/core";

export const Route = createFileRoute("/posrednik/abonament")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tpay?: string; payment?: string; product?: string } => ({
    tpay: typeof search.tpay === "string" ? search.tpay : undefined,
    payment: typeof search.payment === "string" ? search.payment : undefined,
    // Deep-link ze strony marketingowej: preselekcja pakietu do zakupu.
    product: typeof search.product === "string" ? search.product : undefined,
  }),
  component: PosrednikAbonament,
});

const FEATURES: Record<number, string[]> = {
  30: [
    "Bez limitu liczby ofert",
    "Leady Finance You i pełny CRM",
    "Skrzynka, kampanie i automatyzacje",
    "Akademia Pośrednika i program partnerski",
  ],
  365: [
    "Wszystko z pakietu 30-dniowego",
    "Pełny rok bez przerw w dostępie",
    "Priorytetowe wsparcie",
  ],
};

function PosrednikAbonament() {
  const { tpay, payment, product } = useSearch({ from: "/posrednik/abonament" });
  const stateFn = useServerFn(getMyAccessState);
  const usageFn = useServerFn(getMyBrokerOfferUsage);
  const productsFn = useServerFn(listAccessProducts);

  const [state, setState] = useState<AccessStateResult | null>(null);
  const [usage, setUsage] = useState<BrokerOfferUsage | null>(null);
  const [products, setProducts] = useState<AccessProduct[]>([]);
  const [selected, setSelected] = useState<AccessProduct | null>(null);

  const load = useCallback(async () => {
    const [s, u, p] = await Promise.all([
      stateFn({ data: { audience: "broker" } }),
      usageFn(),
      productsFn({ data: { audience: "broker" } }),
    ]);
    setState(s);
    setUsage(u);
    setProducts(p);
    // Deep-link ?product=<code> ze strony marketingowej → od razu otwórz płatność.
    if (product) {
      const match = p.find((x) => x.code === product && x.active);
      if (match) setSelected(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const paid = Boolean(state?.hasPaidAccess) || Boolean(state?.isBypass);
  const atLimit =
    usage && !usage.hasPaidAccess && !usage.isBypass && usage.activeCount >= usage.freeLimit;
  const nearLimit =
    usage && !usage.hasPaidAccess && !usage.isBypass && usage.activeCount === usage.freeLimit - 1;

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Konto"
        title="Pakiet pośrednika"
        subtitle="Darmowe konto bez terminu ważności albo pełny dostęp na 30 lub 365 dni. Płatność jednorazowa, bez automatycznych odnowień."
      />

      {tpay && payment && (
        <TpayReturnStatus paymentId={payment} tpayParam={tpay} onPaid={() => void load()} />
      )}

      <Card className={paid ? "border-emerald-300" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {paid && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            Aktualny poziom: {paid ? "Pełny dostęp" : "Konto darmowe"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {state?.hasPaidAccess && (
            <>
              <div>
                <span className="text-muted-foreground">Płatny dostęp aktywny do: </span>
                <b>{formatWarsawDate(state.activeUntil, true)}</b>{" "}
                <Badge>{state.daysLeft} dni</Badge>
              </div>
              <p className="text-muted-foreground">
                Po wygaśnięciu konto automatycznie wróci do wersji darmowej — Twoje oferty i dane
                pozostaną zapisane.
              </p>
            </>
          )}
          {!state?.hasPaidAccess && state?.activeUntil && (
            <div className="text-muted-foreground">
              Poprzedni płatny dostęp wygasł:{" "}
              <b className="text-foreground">{formatWarsawDate(state.activeUntil, true)}</b>. Konto
              działa w wersji darmowej.
            </div>
          )}
          {!paid && (
            <p className="text-muted-foreground">
              Darmowe konto pozwala posiadać maksymalnie 5 ofert jednocześnie oraz korzystać z bazy
              inwestorów.
            </p>
          )}
          {usage && !paid && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Wykorzystanie limitu ofert:</span>
              <Badge variant={atLimit ? "destructive" : nearLimit ? "secondary" : "outline"}>
                {usage.activeCount}/{usage.freeLimit}
              </Badge>
            </div>
          )}
          {nearLimit && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Zbliżasz się do limitu 5 ofert na koncie darmowym.</span>
            </div>
          )}
          {atLimit && (
            <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Wykorzystujesz {usage!.activeCount}/{usage!.freeLimit} ofert. Aby dodać kolejną,{" "}
                <Link to="/posrednik/wnioski" className="underline">
                  usuń jedną z istniejących
                </Link>{" "}
                albo wykup pełny dostęp poniżej.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {!selected && (
        <AccessPlanCards
          products={products}
          hasActiveAccess={Boolean(state?.hasPaidAccess)}
          onSelect={setSelected}
          featuresByDuration={FEATURES}
        />
      )}

      {selected && (
        <Card className="overflow-hidden rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/40">
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" /> Bezpieczna płatność
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Wróć do pakietów
            </Button>
          </CardHeader>
          <CardContent className="pt-6">
            <TpayAccessCheckoutForm product={selected} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
