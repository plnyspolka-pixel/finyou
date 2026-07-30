// Dystrybucja ofert — wysyłka tematów pożyczkowych e-mailem do inwestorów
// instytucjonalnych (wszystkich lub zaznaczonych). Odpowiedzi instytucji
// wracają dedykowanym aliasem zwrotnym prosto na kartę wniosku.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPLN, loanStatusLabels } from "@/lib/labels";
import { OfferDistributionPanel } from "@/components/admin/offer-distribution-panel";
import { OfferCardSection } from "@/components/admin/offer-card-section";

export const Route = createFileRoute("/admin/dystrybucja")({
  component: DystrybucjaPage,
});

function DystrybucjaPage() {
  const [apps, setApps] = useState<any[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: a } = await supabase
        .from("loan_applications")
        .select("id, status, loan_amount, client:clients(first_name,last_name)")
        .eq("available_to_investors", true);
      setApps(a ?? []);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dystrybucja ofert</h1>
        <p className="text-sm text-muted-foreground">
          Wybierz wniosek i roześlij go e-mailem do inwestorów instytucjonalnych. Dostępne są
          wnioski zakwalifikowane do szukania inwestora.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Wybierz wniosek</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {apps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak wniosków dostępnych dla inwestorów. Zakwalifikuj wniosek na jego karcie
              (Dystrybucja → „Do inwestorów").
            </p>
          ) : (
            apps.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedApp(a.id)}
                className={`w-full text-left border rounded-md p-3 hover:bg-accent transition ${selectedApp === a.id ? "border-primary bg-accent" : ""}`}
              >
                <div className="font-medium flex items-center justify-between gap-2">
                  <span>{a.client ? `${a.client.first_name} ${a.client.last_name}` : "—"}</span>
                  <Link
                    to="/admin/wnioski/$id"
                    params={{ id: a.id }}
                    className="text-xs underline text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    karta wniosku
                  </Link>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatPLN(a.loan_amount)} · {loanStatusLabels[a.status] ?? a.status}
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      {selectedApp && (
        <>
          <OfferCardSection applicationId={selectedApp} />
          <OfferDistributionPanel applicationId={selectedApp} />
        </>
      )}
    </div>
  );
}
