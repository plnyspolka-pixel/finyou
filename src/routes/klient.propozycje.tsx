import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { InvestorOffersSection } from "@/components/client/InvestorOffersSection";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent } from "@/components/ui/card";
import { VerificationTilesSection } from "./klient.index";

export const Route = createFileRoute("/klient/propozycje")({
  component: KlientPropozycje,
});

function KlientPropozycje() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["client-loan-propozycje", user?.id],
    queryFn: async () => {
      const { data: client } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!client) return { client: null, loan: null };
      const { data: loan } = await supabase
        .from("loan_applications")
        .select("id")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { client, loan };
    },
    enabled: Boolean(user),
  });

  const clientRow = data?.client ?? null;
  const loanRow = data?.loan ?? null;

  return (
    <div className="space-y-6 max-w-5xl">
      <FancyPageHeader
        eyebrow="Twoje propozycje"
        title="Propozycje zawarcia umowy pożyczki"
        subtitle="Tutaj zobaczysz oferty zawarcia umowy pożyczki złożone dla Ciebie przez naszych inwestorów."
      />

      {loanRow?.id ? (
        <InvestorOffersSection loanApplicationId={loanRow.id} />
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Najpierw uzupełnij wniosek w sekcji „Twoja oferta", aby inwestorzy mogli złożyć
            propozycje.
          </CardContent>
        </Card>
      )}

      {loanRow?.id ? (
        <div className="space-y-3">
          <div className="px-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Zwiększ swoje szanse na lepsze warunki
            </div>
            <h2 className="text-lg font-black uppercase tracking-wider sm:text-xl">
              Dodatkowe weryfikacje — możesz ubiegać się o niższe koszty pożyczki
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Im więcej informacji potwierdzisz, tym śmielej możesz wnioskować o niższe koszty w
              naszym kalkulatorze — decyzję podejmują inwestorzy.
            </p>
          </div>
          <VerificationTilesSection clientRow={clientRow} loanId={loanRow.id} />
        </div>
      ) : null}
    </div>
  );
}
