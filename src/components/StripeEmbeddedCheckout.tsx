import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createInvestorAccessCheckout, TPAY_PLANS, type TpayPlanId, type BuyerType } from "@/lib/payments.functions";

interface Props {
  priceId: TpayPlanId;
  returnUrl?: string;
}

export function StripeEmbeddedCheckoutForm({ priceId, returnUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const [buyerType, setBuyerType] = useState<BuyerType>("person");
  const [buyerName, setBuyerName] = useState("");
  const [buyerNip, setBuyerNip] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerCity, setBuyerCity] = useState("");
  const [buyerPostalCode, setBuyerPostalCode] = useState("");
  const plan = TPAY_PLANS[priceId];

  const handlePay = async () => {
    if (buyerType === "company") {
      if (!buyerName.trim()) return toast.error("Podaj nazwę firmy");
      if (!buyerNip.trim()) return toast.error("Podaj NIP");
    } else {
      if (!buyerName.trim()) return toast.error("Podaj imię i nazwisko (do faktury)");
      if (!buyerEmail.trim()) return toast.error("Podaj e-mail (do wysyłki faktury)");
    }
    setLoading(true);
    try {
      const res = await createInvestorAccessCheckout({
        data: {
          priceId,
          returnUrl: returnUrl || `${window.location.origin}/inwestor/abonament`,
          buyerType,
          buyerName: buyerName.trim() || undefined,
          buyerEmail: buyerEmail.trim() || undefined,
          buyerNip: buyerType === "company" ? buyerNip.trim() : undefined,
          buyerAddress: buyerAddress.trim() || undefined,
          buyerCity: buyerCity.trim() || undefined,
          buyerPostalCode: buyerPostalCode.trim() || undefined,
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
          Zostaniesz przeniesiony do bezpiecznej bramki płatności Tpay. Dostępne: BLIK, karta, szybki przelew.
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <div>
          <Label className="text-sm font-medium">Kupuję jako</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setBuyerType("person")}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                buyerType === "person" ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
              }`}
            >
              Osoba fizyczna
            </button>
            <button
              type="button"
              onClick={() => setBuyerType("company")}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                buyerType === "company" ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
              }`}
            >
              Firma (faktura VAT)
            </button>
          </div>
        </div>

        {buyerType === "company" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="b-name">Nazwa firmy *</Label>
              <Input id="b-name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Firma Sp. z o.o." />
            </div>
            <div>
              <Label htmlFor="b-nip">NIP *</Label>
              <Input id="b-nip" value={buyerNip} onChange={(e) => setBuyerNip(e.target.value)} placeholder="0000000000" />
            </div>
            <div>
              <Label htmlFor="b-email">E-mail do faktury</Label>
              <Input id="b-email" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="ksiegowosc@firma.pl" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="b-addr">Ulica i nr</Label>
              <Input id="b-addr" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="b-pc">Kod pocztowy</Label>
              <Input id="b-pc" value={buyerPostalCode} onChange={(e) => setBuyerPostalCode(e.target.value)} placeholder="00-000" />
            </div>
            <div>
              <Label htmlFor="b-city">Miasto</Label>
              <Input id="b-city" value={buyerCity} onChange={(e) => setBuyerCity(e.target.value)} />
            </div>
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Faktura VAT zostanie wystawiona automatycznie po zaksięgowaniu wpłaty i wysłana na podany adres e-mail.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="p-name">Imię i nazwisko *</Label>
              <Input id="p-name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Jan Kowalski" />
            </div>
            <div>
              <Label htmlFor="p-email">E-mail do faktury *</Label>
              <Input id="p-email" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
            </div>
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Faktura (bez VAT-u nabywcy) zostanie wystawiona automatycznie po zaksięgowaniu wpłaty i wysłana na podany e-mail.
            </p>
          </div>
        )}
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
