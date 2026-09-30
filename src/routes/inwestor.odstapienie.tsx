// Odstąpienie Konsumenta od Umowy ramowej (Zał. 4) — osobny, stały punkt
// w nawigacji panelu inwestora, żeby prawo odstąpienia było łatwo dostępne.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent } from "@/components/ui/card";
import { WithdrawalCard } from "@/components/inwestor/order-cycle";
import { getMyOrderCycle } from "@/lib/investor-agreements/order-cycle.functions";

export const Route = createFileRoute("/inwestor/odstapienie")({
  component: OdstapieniePage,
  head: () => ({ meta: [{ title: "Odstąpienie od umowy | Finance You" }] }),
});

function OdstapieniePage() {
  const qc = useQueryClient();
  const fetchCycle = useServerFn(getMyOrderCycle);
  const { data, isLoading } = useQuery({
    queryKey: ["order-cycle"],
    queryFn: () => fetchCycle(),
  });

  return (
    <div className="space-y-6">
      <FancyPageHeader
        title="Odstąpienie od umowy"
        subtitle="Konsument może odstąpić od Umowy ramowej zawartej na odległość w terminie 14 dni bez podania przyczyny."
      />
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : data?.isConsumer ? (
        <WithdrawalCard
          data={data}
          onDone={() => qc.invalidateQueries({ queryKey: ["order-cycle"] })}
        />
      ) : (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Prawo odstąpienia bez podania przyczyny przysługuje Inwestorowi będącemu Konsumentem.
            Twój profil nie jest oznaczony jako Konsument — Umowę ramową możesz wypowiedzieć na
            zasadach z § 16.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
