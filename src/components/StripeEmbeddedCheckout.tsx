import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createInvestorAccessCheckout, TPAY_PLANS, type TpayPlanId } from "@/lib/payments.functions";

interface Props {
  priceId: TpayPlanId;
  returnUrl?: string;
}

export function StripeEmbeddedCheckoutForm({ priceId, returnUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const plan = TPAY_PLANS[priceId];

  const handlePay = async () => {
    setLoading(true);
    try {
      const res = await createInvestorAccessCheckout({
        data: {
          priceId,
          returnUrl: returnUrl || `${window.location.origin}/inwestor/abonament`,
        },
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("paymentUrl" in res && res.paymentUrl) {
        window.location.href = res.paymentUrl;
        return;
      }
      toast.error("Nie udało się utworzyć płatności");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd płatności");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="text-sm text-muted-foreground">{plan?.label}</div>
        <div className="text-3xl font-bold mt-1">{plan?.amount} zł</div>
        <div className="text-xs text-muted-foreground mt-1">
          Zostaniesz przeniesiony do bezpiecznej bramki płatności Tpay.
          Dostępne: BLIK, karta, szybki przelew.
        </div>
      </div>
      <Button onClick={handlePay} disabled={loading} className="w-full" size="lg">
        {loading ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Łączenie z Tpay…</>
        ) : (
          <>Zapłać {plan?.amount} zł przez Tpay<ExternalLink className="ml-2 h-4 w-4" /></>
        )}
      </Button>
    </div>
  );
}
