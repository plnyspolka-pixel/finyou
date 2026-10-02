// „Moje zlecenia" — lista Zleceń inwestora + automatyczne dopasowania Projektów
// (getMyOrderCycle dobiera pasujący Projekt do przyjętego Zlecenia przy każdym
// otwarciu widoku i co minutę) wraz z dalszym cyklem teaser → Karta Leada.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderCycleSection } from "@/components/inwestor/order-cycle";
import { getMyOrderCycle } from "@/lib/investor-agreements/order-cycle.functions";
import { withdrawInvestorOrder } from "@/lib/investor-agreements/legal-pack.functions";

export const Route = createFileRoute("/inwestor/zlecenia")({
  component: MyOrdersPage,
});

const ORDER_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  zlozone: { label: "Złożone — czeka na przyjęcie", tone: "bg-amber-100 text-amber-800" },
  przyjete: { label: "Przyjęte — szukamy dla Ciebie klienta", tone: "bg-emerald-100 text-emerald-800" },
  wykonane: { label: "Wykonane", tone: "bg-blue-100 text-blue-800" },
  wygasle: { label: "Wygasłe", tone: "bg-slate-100 text-slate-600" },
  cofniete: { label: "Cofnięte", tone: "bg-slate-100 text-slate-600" },
  odmowa: { label: "Odmowa", tone: "bg-red-100 text-red-700" },
};

function MyOrdersPage() {
  const qc = useQueryClient();
  const fetchCycle = useServerFn(getMyOrderCycle);
  const withdraw = useServerFn(withdrawInvestorOrder);
  const { data, isLoading } = useQuery({
    queryKey: ["order-cycle"],
    queryFn: () => fetchCycle(),
    refetchInterval: 60_000,
  });
  const mut = useMutation({
    mutationFn: (orderId: string) => withdraw({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Zlecenie cofnięte");
      void qc.invalidateQueries({ queryKey: ["order-cycle"] });
      void qc.invalidateQueries({ queryKey: ["legal-pack-state"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Wystąpił błąd"),
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie zleceń…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Moje zlecenia</h1>
        <p className="text-sm text-muted-foreground">
          Gdy w systemie pojawi się Projekt mieszczący się w kwocie Twojego przyjętego Zlecenia,
          dopasujemy go automatycznie i pokażemy tutaj teaser.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zlecenia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nie masz jeszcze Zleceń. Złóż je w „Zlecenia i Projekty".
            </p>
          ) : (
            data.orders.map((o: any) => {
              const st = ORDER_STATUS_LABELS[o.status] ?? { label: o.status, tone: "bg-slate-100" };
              const count = data.matches.filter((m: any) => m.order_id === o.id).length;
              return (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <div className="space-y-0.5">
                    <div className="font-medium">
                      FY-Z-{o.order_seq} · do {Number(o.amount_pln).toLocaleString("pl-PL")} zł
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {o.expires_at
                        ? `ważne do ${new Date(o.expires_at).toLocaleDateString("pl-PL")}`
                        : ""}
                      {count > 0 ? ` · dopasowane Projekty: ${count}` : ""}
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
            })
          )}
        </CardContent>
      </Card>

      <OrderCycleSection />
    </div>
  );
}
