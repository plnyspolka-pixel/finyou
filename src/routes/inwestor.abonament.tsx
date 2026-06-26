import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { subscriptionPlanLabels, subscriptionStatusLabels, formatDate } from "@/lib/labels";
import { StripeEmbeddedCheckoutForm } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { CheckCircle2 } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";

export const Route = createFileRoute("/inwestor/abonament")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: InwestorAbonament,
});

const PLANS = [
  {
    priceId: "investor_access_1d",
    label: "Dostęp 1-dniowy",
    price: "99 zł",
    period: "24 godziny",
    features: ["Dostęp do bazy zaakceptowanych wniosków", "Składanie ofert", "Idealne na szybki test"],
  },
  {
    priceId: "investor_access_1m",
    label: "Dostęp 1-miesięczny",
    price: "399 zł",
    period: "30 dni",
    features: ["Wszystko z planu dziennego", "Powiadomienia o nowych wnioskach", "Najlepszy stosunek ceny do czasu"],
    highlighted: true,
  },
  {
    priceId: "investor_access_1y",
    label: "Dostęp 1-roczny",
    price: "2 999 zł",
    period: "365 dni",
    features: ["Wszystko z planu miesięcznego", "Oszczędność ponad 1 800 zł rocznie", "Priorytetowe wsparcie"],
  },
];

function InwestorAbonament() {
  const { user } = useAuth();
  const { session_id } = useSearch({ from: "/inwestor/abonament" });
  const [inv, setInv] = useState<any | null>(null);
  const [activePrice, setActivePrice] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("investors").select("*").eq("user_id", user.id).maybeSingle();
    setInv(data);
  };

  useEffect(() => { void load(); }, [user]);

  // After Stripe return, poll briefly for webhook to update investor row
  useEffect(() => {
    if (!session_id) return;
    setActivePrice(null);
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      void load();
      if (attempts > 10) clearInterval(interval);
    }, 1500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session_id]);

  const activeUntil = inv?.subscription_active_until ? new Date(inv.subscription_active_until) : null;
  const hasActiveAccess = activeUntil && activeUntil > new Date();

  return (
    <div className="space-y-6">
      <PaymentTestModeBanner />

      <FancyPageHeader
        eyebrow="Subskrypcja"
        title="Dostęp inwestora"
        subtitle="Wybierz okres, na jaki chcesz mieć dostęp do bazy zaakceptowanych wniosków o pożyczkę."
      />

      {session_id && (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardContent className="flex items-center gap-3 py-4 text-emerald-900">
            <CheckCircle2 className="h-5 w-5" />
            <div className="text-sm">
              Dziękujemy! Twoja płatność została przyjęta. Aktywujemy dostęp w ciągu kilku sekund…
            </div>
          </CardContent>
        </Card>
      )}

      {inv && (
        <Card>
          <CardHeader><CardTitle>Twój status</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Plan: </span>
              <b>{inv.subscription_plan ? subscriptionPlanLabels[inv.subscription_plan as keyof typeof subscriptionPlanLabels] : "—"}</b>
            </div>
            <div>
              <span className="text-muted-foreground">Status: </span>
              <Badge variant={hasActiveAccess ? "default" : "secondary"}>
                {inv.subscription_status
                  ? subscriptionStatusLabels[inv.subscription_status as keyof typeof subscriptionStatusLabels]
                  : "—"}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Aktywny do: </span>
              {formatDate(inv.subscription_active_until)}
            </div>
          </CardContent>
        </Card>
      )}

      {!activePrice && (
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <Card key={p.priceId} className={p.highlighted ? "border-primary shadow-lg" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {p.label}
                  {p.highlighted && <Badge>Polecane</Badge>}
                </CardTitle>
                <div className="text-3xl font-bold">{p.price}</div>
                <div className="text-xs text-muted-foreground">jednorazowo · {p.period}</div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {p.features.map((f) => <li key={f}>• {f}</li>)}
                </ul>
                <Button
                  className="w-full"
                  variant={p.highlighted ? "default" : "outline"}
                  onClick={() => setActivePrice(p.priceId)}
                >
                  {hasActiveAccess ? "Przedłuż" : "Wykup dostęp"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activePrice && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Płatność</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setActivePrice(null)}>Anuluj</Button>
          </CardHeader>
          <CardContent>
            <StripeEmbeddedCheckoutForm priceId={activePrice as "investor_access_1d" | "investor_access_1m" | "investor_access_1y"} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
