import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { InvestorOffersSection } from "@/components/client/InvestorOffersSection";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/klient/propozycje")({
  component: KlientPropozycje,
});

function KlientPropozycje() {
  const { user } = useAuth();

  const { data: loanRow } = useQuery({
    queryKey: ["client-loan-propozycje", user?.id],
    queryFn: async () => {
      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!client) return null;
      const { data } = await supabase
        .from("loan_applications")
        .select("id")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: Boolean(user),
  });

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
            Najpierw uzupełnij wniosek w sekcji „Twoja oferta”, aby inwestorzy mogli złożyć propozycje.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
