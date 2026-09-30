import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, CreditCard, Receipt } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TpayReturnStatus } from "@/components/access/TpayReturnStatus";
import { PaymentsAndInvoices } from "@/components/access/PaymentsAndInvoices";
import {
  ACCESS_PRESENTATION,
  SUBSCRIPTION_OPTIONS,
  SUBSCRIPTION_PAYMENT_SENTENCE,
  SUBSCRIPTION_PRICE_SENTENCE,
  SUBSCRIPTION_YEARLY_DISCOUNT_PCT,
} from "@/lib/investor-plan/plans";

// Moduł „Dostęp i płatności": cennik abonamentu (te same ceny co strona
// /dla-inwestora — lib/investor-plan/plans.ts) oraz zakładka historii
// płatności z fakturami. Checkout abonamentu jest jeszcze wyłączony: konta
// na Umowie ramowej v7 mają dostęp bez opłat do czasu akceptacji nowej wersji.
export type AbonamentTab = "pakiety" | "platnosci";

export const Route = createFileRoute("/inwestor/abonament")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tpay?: string; payment?: string; product?: string; tab?: AbonamentTab } => ({
    tpay: typeof search.tpay === "string" ? search.tpay : undefined,
    payment: typeof search.payment === "string" ? search.payment : undefined,
    // Stare deep-linki ?product=… (historyczne e-maile) — ignorowane.
    product: typeof search.product === "string" ? search.product : undefined,
    tab:
      search.tab === "platnosci" ? "platnosci" : search.tab === "pakiety" ? "pakiety" : undefined,
  }),
  component: InwestorAbonament,
});

function InwestorAbonament() {
  const { tpay, payment, tab } = useSearch({ from: "/inwestor/abonament" });
  const navigate = useNavigate();
  const activeTab: AbonamentTab = tab ?? "pakiety";
  const t = ACCESS_PRESENTATION;

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Dostęp i płatności"
        title="Abonament inwestora"
        subtitle={`Abonament kosztuje ${SUBSCRIPTION_PRICE_SENTENCE}. ${SUBSCRIPTION_PAYMENT_SENTENCE} Prowizję Klientowską Finance You (7 % Kwoty Udzielonej, min 5 000 zł, bez VAT) płaci Klient — jest potrącana z wypłaty. Historię płatności i faktur znajdziesz w drugiej zakładce.`}
      />

      {tpay && payment && (
        <TpayReturnStatus paymentId={payment} tpayParam={tpay} onPaid={() => undefined} />
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
            <CreditCard className="mr-2 h-4 w-4" /> Dostęp
          </TabsTrigger>
          <TabsTrigger value="platnosci">
            <Receipt className="mr-2 h-4 w-4" /> Płatności i faktury
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platnosci" className="mt-4">
          <PaymentsAndInvoices />
        </TabsContent>

        <TabsContent value="pakiety" className="mt-4 space-y-6">
          <Card className="border-emerald-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> {t.name} — {t.priceLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {(["miesiecznie", "rocznie"] as const).map((p) => {
                const o = SUBSCRIPTION_OPTIONS[p];
                return (
                  <div key={p} className="rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                      {o.label}
                      {p === "rocznie" && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                          −{SUBSCRIPTION_YEARLY_DISCOUNT_PCT}%
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-2xl font-black">
                      {o.priceLabel}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        {o.periodLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{o.hint}</p>
                  </div>
                );
              })}
            </CardContent>
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

          <Card className="border-slate-300">
            <CardHeader>
              <CardTitle className="text-base">Twój dostęp — kiedy zaczyna się abonament</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Abonament zacznie Cię obowiązywać dopiero po zaakceptowaniu nowej wersji Umowy
              ramowej, doręczonej Ci na trwałym nośniku. Do tego czasu korzystasz z dostępu na
              dotychczasowych warunkach — nic nie płacisz i żadna płatność nie zostanie naliczona.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
