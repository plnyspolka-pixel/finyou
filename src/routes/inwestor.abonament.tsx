import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CreditCard, Receipt } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TpayAccessCheckoutForm } from "@/components/access/TpayAccessCheckoutForm";
import { TpayReturnStatus } from "@/components/access/TpayReturnStatus";
import { AccessPlanCards } from "@/components/access/AccessPlanCards";
import { PaymentsAndInvoices } from "@/components/access/PaymentsAndInvoices";
import {
  getMyAccessState,
  listAccessProducts,
  type AccessStateResult,
} from "@/lib/access/state.functions";
import { formatGroszPln, formatWarsawDate, type AccessProduct } from "@/lib/access/core";
import { TIER_PRESENTATION, PRODUCT_OKAZJA_UNLOCK } from "@/lib/investor-plan/plans";

// JEDEN moduł „Pakiet i płatności": zakładka pakietów (Podstawowy / PRO,
// zakup) oraz zakładka historii płatności z fakturami (dawne /inwestor/platnosci).
export type AbonamentTab = "pakiety" | "platnosci";

export const Route = createFileRoute("/inwestor/abonament")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tpay?: string; payment?: string; product?: string; tab?: AbonamentTab } => ({
    tpay: typeof search.tpay === "string" ? search.tpay : undefined,
    payment: typeof search.payment === "string" ? search.payment : undefined,
    // Deep-link ze strony marketingowej: preselekcja pakietu do zakupu.
    product: typeof search.product === "string" ? search.product : undefined,
    tab:
      search.tab === "platnosci" ? "platnosci" : search.tab === "pakiety" ? "pakiety" : undefined,
  }),
  component: InwestorAbonament,
});

// Zakres pakietu PRO (180 dni) — spójny z lib/investor-plan/plans.ts.
const FEATURES: Record<number, string[]> = {
  180: TIER_PRESENTATION.pro.bullets,
};

function InwestorAbonament() {
  const { tpay, payment, product, tab } = useSearch({ from: "/inwestor/abonament" });
  const navigate = useNavigate();
  const activeTab: AbonamentTab = tab ?? "pakiety";
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
        eyebrow="Pakiet i płatności"
        title="Podstawowy i PRO"
        subtitle="Konto Podstawowe nie ma opłat stałych — płacisz tylko za okazję, którą bierzesz. PRO to ten sam zakres bez opłat jednostkowych plus Analityka, Akademia, compliance, AML, windykacja AI, raporty bez limitu i pierwszeństwo ofert. Historię płatności i faktury znajdziesz w drugiej zakładce."
      />

      {tpay && payment && (
        <TpayReturnStatus paymentId={payment} tpayParam={tpay} onPaid={() => void load()} />
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          void navigate({
            to: "/inwestor/abonament",
            search: { product, tab: v === "platnosci" ? "platnosci" : undefined },
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="pakiety">
            <CreditCard className="mr-2 h-4 w-4" /> Pakiety
          </TabsTrigger>
          <TabsTrigger value="platnosci">
            <Receipt className="mr-2 h-4 w-4" /> Płatności i faktury
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platnosci" className="mt-4">
          <PaymentsAndInvoices />
        </TabsContent>

        <TabsContent value="pakiety" className="mt-4 space-y-6">
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
                  Dane pozostają bezpiecznie zapisane. Odzyskasz dostęp po opłaceniu kolejnego
                  okresu.
                </p>
              </CardContent>
            </Card>
          )}

          {state && !hasActive && (
            <Card className="border-slate-300">
              <CardHeader>
                <CardTitle className="text-base">
                  Pakiet Podstawowy — 0 zł, masz go zawsze
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {TIER_PRESENTATION.podstawowy.bullets.map((b) => (
                  <p key={b}>• {b}</p>
                ))}
                <p className="pt-1">
                  Odblokowanie pojedynczej okazji:{" "}
                  <b>
                    {formatGroszPln(
                      products.find((p) => p.code === PRODUCT_OKAZJA_UNLOCK)?.amount_grosz ??
                        150000,
                    )}
                  </b>{" "}
                  brutto — kupujesz je przy konkretnym projekcie w zakładce „Okazje inwestycyjne".
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
