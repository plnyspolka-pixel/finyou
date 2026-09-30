import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, CreditCard, Receipt } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TpayReturnStatus } from "@/components/access/TpayReturnStatus";
import { PaymentsAndInvoices } from "@/components/access/PaymentsAndInvoices";
import { ACCESS_PRESENTATION } from "@/lib/investor-plan/plans";

// Moduł „Dostęp i płatności": strona informacyjna (dostęp inwestora jest
// bezpłatny; abonament za dostęp do systemu planowany — bez checkoutu) oraz
// zakładka historii płatności z fakturami (rozliczenia sprzed zmiany cennika).
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
        title="Dostęp inwestora jest bezpłatny"
        subtitle="Usługa Finance You dla Inwestora jest nieodpłatna: nie ma abonamentu, opłaty sukcesu ani opłat za Projekt. Jedyną opłatą w systemie jest Prowizja Klientowska (7 % Kwoty Udzielonej, min 5 000 zł, bez VAT), która obciąża Klienta i jest potrącana z wypłaty. Historię wcześniejszych płatności i faktur znajdziesz w drugiej zakładce."
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
              <CardTitle className="text-base">Abonament — planowany</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Abonament za dostęp do systemu jest planowany na przyszłość. Jego wprowadzenie będzie
              wymagało nowej wersji Umowy ramowej doręczonej na trwałym nośniku i Twojej wyraźnej
              akceptacji — do tego czasu nic nie płacisz i żadna płatność nie zostanie naliczona.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
