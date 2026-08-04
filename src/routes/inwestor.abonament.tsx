import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Gift, Lock, ShieldCheck } from "lucide-react";
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
        <div
          className="relative overflow-hidden rounded-2xl border border-emerald-300/60 p-5 shadow-sm"
          style={{
            background:
              "linear-gradient(120% 140% at 0% 0%, oklch(0.96 0.05 160) 0%, oklch(0.99 0.01 160) 100%)",
          }}
        >
          <span
            aria-hidden
            className="absolute -right-10 -top-10 h-36 w-36 rounded-full blur-2xl"
            style={{
              background: "radial-gradient(circle, oklch(0.85 0.10 160 / 0.6), transparent 70%)",
            }}
          />
          <div className="relative flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </span>
            <div className="min-w-0 text-sm text-emerald-950">
              <div className="text-base font-bold">Twój dostęp jest aktywny</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  <span className="text-emerald-900/60">Aktywny do: </span>
                  <b>{formatWarsawDate(state.activeUntil, true)}</b>
                </span>
                <Badge className="bg-emerald-600 hover:bg-emerald-600">
                  Pozostało {state.daysLeft} dni
                </Badge>
              </div>
              <p className="mt-1.5 text-emerald-900/60">
                Zakup kolejnego pakietu doliczy dni do końca bieżącego okresu — nic nie przepada.
              </p>
            </div>
          </div>
        </div>
      )}

      {state && expired && (
        <div
          className="relative overflow-hidden rounded-2xl border border-amber-300/60 p-5 shadow-sm"
          style={{
            background:
              "linear-gradient(120% 140% at 0% 0%, oklch(0.96 0.06 85) 0%, oklch(0.99 0.01 85) 100%)",
          }}
        >
          <div className="relative flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15">
              <Clock className="h-5 w-5 text-amber-600" />
            </span>
            <div className="min-w-0 text-sm text-amber-950">
              <div className="text-base font-bold">Twój pełny dostęp wygasł</div>
              <div className="mt-1.5">
                <span className="text-amber-900/60">Poprzedni dostęp wygasł: </span>
                <b>{formatWarsawDate(state.activeUntil, true)}</b>
              </div>
              <p className="mt-1.5 text-amber-900/60">
                Dane pozostają bezpiecznie zapisane. Odzyskasz dostęp po opłaceniu kolejnego okresu.
              </p>
            </div>
          </div>
        </div>
      )}

      {state && !hasActive && (
        <div className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/10">
              <Gift className="h-5 w-5 text-sky-600" />
            </span>
            <div className="min-w-0 text-sm">
              <div className="text-base font-bold">Konto darmowe — masz je zawsze, bez opłat</div>
              <div className="mt-1.5 space-y-1 text-muted-foreground">
                <p>
                  • anonimowe zajawki ofert — po pozytywnej <b>weryfikacji tożsamości (KYC)</b>,
                </p>
                <p>• kalkulator pożyczki oraz 3 darmowe lekcje Akademii Inwestora.</p>
                <p>
                  Pełne dane ofert, dokumenty, księga wieczysta i składanie ofert wymagają pełnego
                  dostępu.
                </p>
              </div>
            </div>
          </div>
        </div>
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
