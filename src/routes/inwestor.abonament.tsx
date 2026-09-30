import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, CreditCard, Receipt } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TpayReturnStatus } from "@/components/access/TpayReturnStatus";
import { TpayAccessCheckoutForm } from "@/components/access/TpayAccessCheckoutForm";
import { AccessPlanCards } from "@/components/access/AccessPlanCards";
import { PaymentsAndInvoices } from "@/components/access/PaymentsAndInvoices";
import { getMyAccessState, listAccessProducts } from "@/lib/access/state.functions";
import { getInvestorPipelineState } from "@/lib/investor-agreements/pipeline.functions";
import { formatWarsawDate, type AccessProduct } from "@/lib/access/core";
import {
  ACCESS_PRESENTATION,
  SUBSCRIPTION_OPTIONS,
  SUBSCRIPTION_PAYMENT_SENTENCE,
  SUBSCRIPTION_PRICE_SENTENCE,
  SUBSCRIPTION_YEARLY_DISCOUNT_PCT,
  SUBSCRIPTION_YEARLY_PER_MONTH_PLN,
  plnLabel,
} from "@/lib/investor-plan/plans";

// Moduł „Dostęp i płatności": stan abonamentu, zakup (30 albo 365 dni —
// jednorazowa płatność Tpay, bez karty kredytowej i bez automatycznego
// odnowienia) oraz historia płatności z fakturami. Ceny z katalogu
// access_products (serwer) — te same co w lib/investor-plan/plans.ts.
// Kolejność inwestora: abonament (to pierwsza bramka panelu) → akceptacja
// pakietu umów (Zlecenia i Projekty) → moduł ofert.
export type AbonamentTab = "pakiety" | "platnosci";

const SUBSCRIPTION_CODES = new Set<string>(
  Object.values(SUBSCRIPTION_OPTIONS).map((o) => o.productCode),
);

const FEATURES: Record<number, string[]> = {
  30: [
    "Zlecenia i Projekty dopasowane do Zlecenia",
    "Raporty, analityka i generator umowy",
    "Akademia, kalkulator compliance, AML i windykacja AI",
  ],
  365: [
    "Wszystko z abonamentu 30-dniowego",
    `Rok dostępu za ok. ${plnLabel(SUBSCRIPTION_YEARLY_PER_MONTH_PLN)} miesięcznie — ${SUBSCRIPTION_YEARLY_DISCOUNT_PCT}% taniej`,
    "Bez przerw w dostępie przez 365 dni",
  ],
};

export const Route = createFileRoute("/inwestor/abonament")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tpay?: string; payment?: string; product?: string; tab?: AbonamentTab } => ({
    tpay: typeof search.tpay === "string" ? search.tpay : undefined,
    payment: typeof search.payment === "string" ? search.payment : undefined,
    // Deep-link ?product=<kod>: od razu otwiera płatność za wskazany okres.
    product: typeof search.product === "string" ? search.product : undefined,
    tab:
      search.tab === "platnosci" ? "platnosci" : search.tab === "pakiety" ? "pakiety" : undefined,
  }),
  component: InwestorAbonament,
});

function InwestorAbonament() {
  const { tpay, payment, product, tab } = useSearch({ from: "/inwestor/abonament" });
  const navigate = useNavigate();
  const activeTab: AbonamentTab = tab ?? "pakiety";
  const t = ACCESS_PRESENTATION;

  const stateFn = useServerFn(getMyAccessState);
  const productsFn = useServerFn(listAccessProducts);
  const pipelineFn = useServerFn(getInvestorPipelineState);

  const stateQ = useQuery({
    queryKey: ["access-state", "investor"],
    queryFn: () => stateFn({ data: { audience: "investor" } }),
  });
  const productsQ = useQuery({
    queryKey: ["access-products", "investor"],
    queryFn: () => productsFn({ data: { audience: "investor" } }),
  });
  const pipelineQ = useQuery({
    queryKey: ["investor-pipeline-state"],
    queryFn: () => pipelineFn(),
  });

  // Wyłącznie abonament 30 / 365 dni — nawet gdyby katalog miał inne aktywne
  // pozycje inwestora, nie trafiają do sprzedaży.
  const products: AccessProduct[] = (productsQ.data ?? []).filter((p) =>
    SUBSCRIPTION_CODES.has(p.code),
  );
  const [selected, setSelected] = useState<AccessProduct | null>(null);
  useEffect(() => {
    if (!product || selected) return;
    const match = products.find((p) => p.code === product);
    if (match) setSelected(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, productsQ.data]);

  const state = stateQ.data ?? null;
  const active = Boolean(state?.hasPaidAccess || state?.isBypass || state?.hasModuleAccess);
  const packageAccepted = Boolean(
    pipelineQ.data &&
    ["umowa_ramowa", "nda", "rodo"].every(
      (code) => pipelineQ.data?.input.documents.find((d) => d.code === code)?.accepted,
    ),
  );

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Dostęp i płatności"
        title="Abonament inwestora"
        subtitle={`Abonament kosztuje ${SUBSCRIPTION_PRICE_SENTENCE}. ${SUBSCRIPTION_PAYMENT_SENTENCE} Prowizję od Pożyczkobiorcy (7 % Kwoty Udzielonej, min 5 000 zł, bez VAT) płaci Klient — jest potrącana z wypłaty.`}
      />

      {tpay && payment && (
        <TpayReturnStatus
          paymentId={payment}
          tpayParam={tpay}
          onPaid={() => void stateQ.refetch()}
        />
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          void navigate({
            to: "/inwestor/abonament",
            search: { tab: v === "platnosci" ? "platnosci" : undefined },
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="pakiety">
            <CreditCard className="mr-2 h-4 w-4" /> Abonament
          </TabsTrigger>
          <TabsTrigger value="platnosci">
            <Receipt className="mr-2 h-4 w-4" /> Płatności i faktury
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platnosci" className="mt-4">
          <PaymentsAndInvoices />
        </TabsContent>

        <TabsContent value="pakiety" className="mt-4 space-y-6">
          <Card className={active ? "border-emerald-300" : "border-amber-300"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {active ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                )}
                {active ? "Abonament aktywny" : "Brak aktywnego abonamentu"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {state?.hasPaidAccess && (
                <div>
                  <span className="text-muted-foreground">Dostęp aktywny do: </span>
                  <b>{formatWarsawDate(state.activeUntil, true)}</b>{" "}
                  <Badge>{state.daysLeft} dni</Badge>
                </div>
              )}
              {!state?.hasPaidAccess && state?.isBypass && (
                <p className="text-muted-foreground">Dostęp personelu Finance You.</p>
              )}
              {!state?.hasPaidAccess && !state?.isBypass && state?.hasModuleAccess && (
                <p className="text-muted-foreground">Dostęp nadany przez zespół Finance You.</p>
              )}
              {!active && state?.activeUntil && (
                <p className="text-muted-foreground">
                  Poprzedni abonament wygasł:{" "}
                  <b className="text-foreground">{formatWarsawDate(state.activeUntil, true)}</b>.
                  Twoje dane i dokumenty pozostają zapisane.
                </p>
              )}
              {!active && (
                <p className="text-muted-foreground">
                  Panel inwestora otwiera się po opłaceniu abonamentu. Potem akceptujesz Umowę
                  ramową, NDA i umowę RODO — akceptacja otwiera moduł ofert.
                </p>
              )}
              {active && (
                <p className="text-muted-foreground">
                  Kolejny okres możesz opłacić wcześniej — zostanie doliczony od końca obecnego.
                </p>
              )}
            </CardContent>
          </Card>

          {active && !state?.isBypass && !pipelineQ.isLoading && !packageAccepted && (
            <Card className="border-sky-300">
              <CardHeader>
                <CardTitle className="text-base">Następny krok: zaakceptuj umowy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Abonament jest aktywny. Zaakceptuj Umowę ramową, NDA i umowę RODO — akceptacja
                  otwiera moduł ofert: Zlecenia, dopasowane Projekty i oferty.
                </p>
                <Button asChild>
                  <Link to="/inwestor/umowy">Przejdź do umów</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {!selected && productsQ.isSuccess && products.length === 0 && (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Zakup abonamentu jest chwilowo niedostępny. Spróbuj ponownie później albo napisz na
                kontakt@financeyou.pl.
              </CardContent>
            </Card>
          )}
          {!selected && products.length > 0 && (
            <AccessPlanCards
              products={products}
              hasActiveAccess={Boolean(state?.hasPaidAccess)}
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Co obejmuje abonament</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{t.tagline}</p>
              <ul className="space-y-1">
                {t.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{t.note}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
