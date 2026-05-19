import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createInvestorAccessCheckout } from "@/lib/payments.functions";

interface Props {
  priceId: string;
  returnUrl?: string;
}

export function StripeEmbeddedCheckoutForm({ priceId, returnUrl }: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const secret = await createInvestorAccessCheckout({
      data: {
        priceId,
        returnUrl: returnUrl || `${window.location.origin}/inwestor/abonament?session_id={CHECKOUT_SESSION_ID}`,
        environment: getStripeEnvironment(),
      },
    });
    if (!secret) throw new Error("Brak client_secret z serwera");
    return secret;
  };

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
