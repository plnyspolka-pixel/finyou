// Formularz nabywcy + przejście do bramki Tpay (jednorazowa płatność za
// czasowy dostęp). Zastępuje dawny komponent "StripeEmbeddedCheckout" —
// faktyczną bramką jest Tpay i tylko ona jest komunikowana użytkownikowi.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, CreditCard, Loader2, Lock, Search, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { createAccessCheckout } from "@/lib/access/checkout.functions";
import { gusCompanyLookup } from "@/lib/gus-bir.functions";
import {
  formatGroszPln,
  isValidNip,
  validateBuyer,
  type AccessProduct,
  type BuyerType,
} from "@/lib/access/core";

interface Props {
  product: AccessProduct;
}

export function TpayAccessCheckoutForm({ product }: Props) {
  const checkoutFn = useServerFn(createAccessCheckout);
  const gusFn = useServerFn(gusCompanyLookup);

  const [loading, setLoading] = useState(false);
  const [gusLoading, setGusLoading] = useState(false);
  const [buyerType, setBuyerType] = useState<BuyerType>("person");
  const [buyerName, setBuyerName] = useState("");
  const [buyerNip, setBuyerNip] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerStreet, setBuyerStreet] = useState("");
  const [buyerPostalCode, setBuyerPostalCode] = useState("");
  const [buyerCity, setBuyerCity] = useState("");
  const [buyerCountry] = useState("PL");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [digitalConsent, setDigitalConsent] = useState(false);

  const fetchFromGus = async () => {
    const nip = buyerNip.replace(/[\s-]/g, "");
    if (!isValidNip(nip)) {
      toast.error("Podaj prawidłowy NIP, aby pobrać dane z GUS");
      return;
    }
    setGusLoading(true);
    try {
      const res = await gusFn({ data: { nip } });
      if (!res.success) {
        toast.error(res.message || "Nie znaleziono firmy w GUS");
        return;
      }
      const c = res.company;
      setBuyerName(c.name || buyerName);
      const streetLine =
        [c.address.street || c.address.city, c.address.buildingNumber].filter(Boolean).join(" ") +
        (c.address.apartmentNumber ? `/${c.address.apartmentNumber}` : "");
      if (streetLine.trim()) setBuyerStreet(streetLine.trim());
      if (c.address.postalCode) setBuyerPostalCode(c.address.postalCode);
      if (c.address.city) setBuyerCity(c.address.city);
      toast.success("Pobrano dane z GUS — sprawdź i w razie potrzeby popraw przed płatnością.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd połączenia z GUS");
    } finally {
      setGusLoading(false);
    }
  };

  const handlePay = async () => {
    const errors = validateBuyer({
      buyerType,
      buyerName,
      buyerEmail,
      buyerNip: buyerType === "company" ? buyerNip : null,
      buyerStreet,
      buyerPostalCode,
      buyerCity,
      buyerCountry,
    });
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    if (!termsAccepted) return toast.error("Zaakceptuj regulamin, aby kontynuować");
    if (!privacyAccepted) return toast.error("Zaakceptuj politykę prywatności, aby kontynuować");

    setLoading(true);
    try {
      const res = await checkoutFn({
        data: {
          productCode: product.code,
          buyerType,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
          buyerNip: buyerType === "company" ? buyerNip.trim() : undefined,
          buyerStreet: buyerStreet.trim(),
          buyerPostalCode: buyerPostalCode.trim(),
          buyerCity: buyerCity.trim(),
          buyerCountry,
          consents: { terms: true, privacy: true, digitalService: digitalConsent },
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
      {/* Podsumowanie zamówienia — navy w duchu FancyShell */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white">
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 140% at 0% 0%, oklch(0.30 0.12 265) 0%, oklch(0.18 0.05 265) 55%, oklch(0.13 0.04 265) 100%)",
          }}
        />
        <span
          aria-hidden
          className="absolute -right-10 -top-10 h-36 w-36 rounded-full blur-2xl"
          style={{
            background: "radial-gradient(circle, oklch(0.60 0.18 250 / 0.5), transparent 70%)",
          }}
        />
        <div className="relative">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300/80">
            Twoje zamówienie
          </div>
          <div className="mt-1 text-sm text-white/70">{product.label}</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">
              {formatGroszPln(product.amount_grosz)}
            </span>
            <span className="text-sm text-white/60">brutto</span>
          </div>
          <div className="mt-1 text-xs text-white/60">
            Płatność jednorazowa · dostęp na {product.duration_days} dni · bez automatycznych
            odnowień
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {["BLIK", "Karta", "Szybki przelew"].map((m) => (
              <span
                key={m}
                className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/85"
              >
                {m}
              </span>
            ))}
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-white/60">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Bezpieczna bramka Tpay
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 space-y-4 sm:p-5">
        <div>
          <Label className="text-sm font-medium">Kupuję jako</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setBuyerType("person")}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all ${
                buyerType === "person"
                  ? "border-primary bg-primary/10 font-semibold shadow-sm ring-1 ring-primary/30"
                  : "hover:bg-muted"
              }`}
            >
              <User className="h-4 w-4" /> Osoba prywatna
            </button>
            <button
              type="button"
              onClick={() => setBuyerType("company")}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all ${
                buyerType === "company"
                  ? "border-primary bg-primary/10 font-semibold shadow-sm ring-1 ring-primary/30"
                  : "hover:bg-muted"
              }`}
            >
              <Building2 className="h-4 w-4" /> Firma
            </button>
          </div>
        </div>

        {buyerType === "company" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="b-nip">NIP *</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  id="b-nip"
                  value={buyerNip}
                  onChange={(e) => setBuyerNip(e.target.value)}
                  placeholder="0000000000"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={fetchFromGus}
                  disabled={gusLoading}
                >
                  {gusLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="ml-1 whitespace-nowrap">Pobierz dane z GUS</span>
                </Button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="b-name">Pełna nazwa firmy *</Label>
              <Input
                id="b-name"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Firma Sp. z o.o."
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="b-email">E-mail do faktury *</Label>
              <Input
                id="b-email"
                type="email"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                placeholder="ksiegowosc@firma.pl"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="p-name">Imię i nazwisko *</Label>
              <Input
                id="p-name"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Jan Kowalski"
              />
            </div>
            <div>
              <Label htmlFor="p-email">E-mail *</Label>
              <Input
                id="p-email"
                type="email"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="b-street">Ulica i numer *</Label>
            <Input
              id="b-street"
              value={buyerStreet}
              onChange={(e) => setBuyerStreet(e.target.value)}
              placeholder="ul. Przykładowa 1/2"
            />
          </div>
          <div>
            <Label htmlFor="b-pc">Kod pocztowy *</Label>
            <Input
              id="b-pc"
              value={buyerPostalCode}
              onChange={(e) => setBuyerPostalCode(e.target.value)}
              placeholder="00-000"
            />
          </div>
          <div>
            <Label htmlFor="b-city">Miejscowość *</Label>
            <Input id="b-city" value={buyerCity} onChange={(e) => setBuyerCity(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Kraj</Label>
            <Input value="Polska" disabled />
          </div>
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            {buyerType === "company"
              ? "Po zaksięgowaniu płatności automatycznie wystawimy fakturę na firmę i wyślemy ją na podany adres e-mail."
              : "Po zaksięgowaniu płatności automatycznie wystawimy fakturę imienną i wyślemy ją na podany adres e-mail."}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 space-y-3 text-sm sm:p-5">
        <label className="flex items-start gap-2 cursor-pointer">
          <Checkbox
            checked={termsAccepted}
            onCheckedChange={(v) => setTermsAccepted(v === true)}
            className="mt-0.5"
          />
          <span>
            Akceptuję{" "}
            <a href="/regulamin" target="_blank" rel="noreferrer" className="underline">
              regulamin platformy Finance You
            </a>{" "}
            *
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <Checkbox
            checked={privacyAccepted}
            onCheckedChange={(v) => setPrivacyAccepted(v === true)}
            className="mt-0.5"
          />
          <span>
            Akceptuję{" "}
            <a href="/polityka-prywatnosci" target="_blank" rel="noreferrer" className="underline">
              politykę prywatności
            </a>{" "}
            *
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <Checkbox
            checked={digitalConsent}
            onCheckedChange={(v) => setDigitalConsent(v === true)}
            className="mt-0.5"
          />
          <span className="text-muted-foreground">
            Żądam rozpoczęcia świadczenia usługi cyfrowej bezpośrednio po opłaceniu i przyjmuję do
            wiadomości, że tracę w ten sposób prawo odstąpienia od umowy w zakresie wykonanej
            usługi.
          </span>
        </label>
      </div>

      <Button
        onClick={handlePay}
        disabled={loading}
        className="h-12 w-full rounded-xl bg-gradient-to-r from-[oklch(0.50_0.22_268)] via-[oklch(0.55_0.20_255)] to-[oklch(0.62_0.17_240)] text-base font-bold text-white shadow-[0_10px_30px_-10px_oklch(0.55_0.22_260/0.9)] transition-all hover:brightness-110 hover:shadow-[0_14px_40px_-10px_oklch(0.55_0.22_260)]"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Łączenie z Tpay…
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-5 w-5" />
            Zapłać {formatGroszPln(product.amount_grosz)} przez Tpay
          </>
        )}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
        Zostaniesz przeniesiony do szyfrowanej bramki płatności Tpay
      </p>
    </div>
  );
}
