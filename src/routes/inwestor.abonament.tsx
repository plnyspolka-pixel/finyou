import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { TpayAccessCheckoutForm } from "@/components/access/TpayAccessCheckoutForm";
import { TpayReturnStatus } from "@/components/access/TpayReturnStatus";
import { AccessPlanCards } from "@/components/access/AccessPlanCards";
import {
  getMyAccessState,
  listAccessProducts,
  type AccessStateResult,
} from "@/lib/access/state.functions";
import { formatWarsawDate, type AccessProduct } from "@/lib/access/core";

export const Route = createFileRoute("/inwestor/abonament")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tpay?: string; payment?: string; product?: string } => ({
    tpay: typeof search.tpay === "string" ? search.tpay : undefined,
    payment: typeof search.payment === "string" ? search.payment : undefined,
    // Deep-link ze strony marketingowej: preselekcja pakietu do zakupu.
    product: typeof search.product === "string" ? search.product : undefined,
  }),
  component: InwestorAbonament,
});

const FEATURES: Record<number, string[]> = {
  30: [
    "Pełne dane wszystkich dostępnych ofert",
    "Dokumenty, KW, analizy i wyceny",
    "Składanie ofert, czat i umowy",
    "Windykacja i Akademia Inwestora",
  ],
  365: [
    "Wszystko z pakietu 30-dniowego",
    "Pełny rok bez przerw w dostępie",
    "Priorytetowe wsparcie",
  ],
};

function InwestorAbonament() {
  const { tpay, payment, product } = useSearch({ from: "/inwestor/abonament" });
  const stateFn = useServerFn(getMyAccessState);
  const productsFn = useServerFn(listAccessProducts);

  const [state, setState] = useState<AccessStateResult | null>(null);
  const [products, setProducts] = useState<AccessProduct[]>([]);
  const [selected, setSelected] = useState<AccessProduct | null>(null);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      stateFn({ data: { audience: "investor" } }),
      productsFn({ data: { audience: "investor" } }),
    ]);
    setState(s);
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

  const hasActive = Boolean(state?.hasPaidAccess);
  const expired = !hasActive && Boolean(state?.activeUntil);

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Dostęp"
        title="Pełny dostęp inwestora"
        subtitle="Jednorazowa płatność przedłuża dostęp o określoną liczbę dni. Bez automatycznych odnowień."
      />

      {tpay && payment && (
        <TpayReturnStatus paymentId={payment} tpayParam={tpay} onPaid={() => void load()} />
      )}

      {state && hasActive && (
        <Card className="border-emerald-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Twój dostęp jest aktywny
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Aktywny do: </span>
              <b>{formatWarsawDate(state.activeUntil, true)}</b>
            </div>
            <div>
              <span className="text-muted-foreground">Pozostało: </span>
              <Badge>{state.daysLeft} dni</Badge>
            </div>
            <p className="text-muted-foreground pt-1">
              Zakup kolejnego pakietu doliczy dni do końca bieżącego okresu — nic nie przepada.
            </p>
          </CardContent>
        </Card>
      )}

      {state && expired && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader>
            <CardTitle>Twój pełny dostęp wygasł</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Poprzedni dostęp wygasł: </span>
              <b>{formatWarsawDate(state.activeUntil, true)}</b>
            </div>
            <p className="text-muted-foreground">
              Dane pozostają bezpiecznie zapisane. Odzyskasz dostęp po opłaceniu kolejnego okresu.
            </p>
          </CardContent>
        </Card>
      )}

      {state && !hasActive && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Konto darmowe — masz je zawsze, bez opłat</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>
              • anonimowe zajawki ofert — po pozytywnej <b>weryfikacji tożsamości (KYC)</b>,
            </p>
            <p>• kalkulator pożyczki oraz 3 darmowe lekcje Akademii Inwestora.</p>
            <p>
              Pełne dane ofert, dokumenty, księga wieczysta i składanie ofert wymagają pełnego
              dostępu.
            </p>
          </CardContent>
        </Card>
      )}

      {!selected && (
        <AccessPlanCards
          products={products}
          hasActiveAccess={hasActive}
          onSelect={setSelected}
          featuresByDuration={FEATURES}
        />
      )}

      {selected && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Płatność</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Anuluj
            </Button>
          </CardHeader>
          <CardContent>
            <TpayAccessCheckoutForm product={selected} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
