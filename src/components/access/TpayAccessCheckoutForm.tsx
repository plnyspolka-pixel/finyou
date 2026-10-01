// Formularz nabywcy + przejście do bramki Tpay (jednorazowa płatność za
// czasowy dostęp) albo do TubaPay (ta sama kwota w płatnościach miesięcznych).
// Zastępuje dawny komponent "StripeEmbeddedCheckout".
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";
import { createAccessCheckout } from "@/lib/access/checkout.functions";
import { createGuestInvestorCheckout } from "@/lib/access/guest-checkout.functions";
import { getTubapayInstallmentOffer } from "@/lib/access/tubapay.functions";
import { normalizePlPhone, type PaymentMethod } from "@/lib/access/tubapay-checkout";
import type { BillingPeriod } from "@/lib/investor-plan/plans";
import { FUNDACJA, REGULAMIN_ABONAMENTU_PATH } from "@/lib/legal/regulamin-abonamentu";
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
  /** Wymagane dla produktu „unlock" — okazja, którą odblokowuje ta płatność. */
  matchId?: string;
  /** Zakup abonamentu inwestora BEZ konta (strona publiczna) — konto zakłada
   *  webhook Tpay po wpłacie, z danych tego formularza. */
  guestPeriod?: BillingPeriod;
}

export function TpayAccessCheckoutForm({ product, matchId, guestPeriod }: Props) {
  const checkoutFn = useServerFn(createAccessCheckout);
  const guestCheckoutFn = useServerFn(createGuestInvestorCheckout);
  const gusFn = useServerFn(gusCompanyLookup);
  const tubapayOfferFn = useServerFn(getTubapayInstallmentOffer);

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("tpay");
  const [tubapayOptions, setTubapayOptions] = useState<number[]>([]);
  const [installments, setInstallments] = useState<number | null>(null);
  const [buyerPhone, setBuyerPhone] = useState("");
  const [tubapayConsent, setTubapayConsent] = useState(false);
  const isTubapay = paymentMethod === "tubapay";

  // Raty TubaPay — tylko dla dostępu czasowego, gdy TubaPay zwróci ofertę
  // dla ceny produktu (bez oferty formularz działa wyłącznie z Tpay).
  useEffect(() => {
    if (product.kind === "unlock") return;
    let cancelled = false;
    tubapayOfferFn({ data: { productCode: product.code } })
      .then((res) => {
        if (cancelled || !res.available) return;
        setTubapayOptions(res.options);
        setInstallments(res.options[res.options.length - 1] ?? null);
      })
      .catch(() => {
        // brak oferty — zostaje Tpay
      });
    return () => {
      cancelled = true;
    };
  }, [product.code, product.kind, tubapayOfferFn]);

  const choosePaymentMethod = (m: PaymentMethod) => {
    setPaymentMethod(m);
    // Umowę z TubaPay zawiera osoba fizyczna.
    if (m === "tubapay") setBuyerType("person");
  };
  // Inwestor płaci na podstawie Regulaminu Abonamentu Inwestora (sprzedawca:
  // Fundacja); umowy o dostęp do Klientów akceptuje później w panelu.
  const isInvestor = product.audience === "investor";

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
    if (isInvestor && !digitalConsent)
      return toast.error("Potwierdź rozpoczęcie szkolenia od razu, aby kontynuować");
    if (!privacyAccepted) return toast.error("Zaakceptuj politykę prywatności, aby kontynuować");
    if (isTubapay) {
      if (buyerName.trim().split(/\s+/).length < 2)
        return toast.error("Do płatności TubaPay podaj imię i nazwisko");
      if (!normalizePlPhone(buyerPhone))
        return toast.error("Podaj numer telefonu komórkowego (9 cyfr)");
      if (!installments) return toast.error("Wybierz liczbę płatności miesięcznych");
      if (!tubapayConsent) return toast.error("Wyraź zgodę na przekazanie danych TubaPay");
    }

    setLoading(true);
    try {
      const buyer = {
        buyerType,
        buyerName: buyerName.trim(),
        buyerEmail: buyerEmail.trim(),
        buyerNip: buyerType === "company" ? buyerNip.trim() : undefined,
        buyerStreet: buyerStreet.trim(),
        buyerPostalCode: buyerPostalCode.trim(),
        buyerCity: buyerCity.trim(),
        buyerCountry,
        consents: {
          terms: true as const,
          privacy: true as const,
          digitalService: digitalConsent,
          tubapay: isTubapay && tubapayConsent,
        },
        paymentMethod,
        ...(isTubapay ? { buyerPhone: buyerPhone.trim(), installments } : {}),
      };
      const res: { error?: string; paymentUrl?: string } = guestPeriod
        ? await guestCheckoutFn({ data: { ...buyer, period: guestPeriod } })
        : await checkoutFn({ data: { ...buyer, productCode: product.code, matchId } });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.paymentUrl) {
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
        <div className="text-sm text-muted-foreground">{product.label}</div>
        <div className="text-3xl font-bold mt-1">{formatGroszPln(product.amount_grosz)} brutto</div>
        <div className="text-xs text-muted-foreground mt-1">
          Płatność jednorazowa ·{" "}
          {product.duration_days
            ? `dostęp na ${product.duration_days} dni`
            : "jednorazowe odblokowanie okazji"}
          .{" "}
          {isTubapay
            ? "Zostaniesz przeniesiony do TubaPay — podpiszesz umowę płatności podzielonej i opłacisz pierwszą ratę szybkim przelewem z własnego konta."
            : "Zostaniesz przeniesiony do bezpiecznej bramki płatności Tpay (BLIK, karta, szybki przelew)."}
        </div>
      </div>

      {tubapayOptions.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3">
          <Label className="text-sm font-medium">Sposób płatności</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => choosePaymentMethod("tpay")}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                !isTubapay ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
              }`}
            >
              Jednorazowo (Tpay)
            </button>
            <button
              type="button"
              disabled={buyerType === "company"}
              title={
                buyerType === "company"
                  ? "Raty TubaPay są dostępne tylko dla osoby prywatnej"
                  : undefined
              }
              onClick={() => choosePaymentMethod("tubapay")}
              className={`rounded-md border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                isTubapay ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
              }`}
            >
              W ratach (TubaPay)
            </button>
          </div>
          {isTubapay && (
            <div className="space-y-2">
              <Label className="text-sm">Liczba płatności miesięcznych</Label>
              <div className="flex flex-wrap gap-2">
                {tubapayOptions.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setInstallments(n)}
                    className={`rounded-md border px-3 py-1.5 text-sm transition ${
                      installments === n
                        ? "border-primary bg-primary/10 font-medium"
                        : "hover:bg-muted"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {installments && (
                <p className="text-xs text-muted-foreground">
                  Orientacyjnie {installments} ×{" "}
                  {formatGroszPln(Math.ceil(product.amount_grosz / installments))}. Ostateczny
                  harmonogram zobaczysz w umowie z TubaPay przed jej zawarciem.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border p-4 space-y-4">
        <div>
          <Label className="text-sm font-medium">Kupuję jako</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setBuyerType("person")}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                buyerType === "person"
                  ? "border-primary bg-primary/10 font-medium"
                  : "hover:bg-muted"
              }`}
            >
              Osoba prywatna
            </button>
            <button
              type="button"
              disabled={isTubapay}
              title={isTubapay ? "Płatność w ratach TubaPay — tylko osoba prywatna" : undefined}
              onClick={() => setBuyerType("company")}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                buyerType === "company"
                  ? "border-primary bg-primary/10 font-medium"
                  : "hover:bg-muted"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Firma
            </button>
          </div>
          {isTubapay ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Raty TubaPay są dostępne tylko dla osób prywatnych (umowę z TubaPay zawiera osoba
              fizyczna). Aby kupić jako firma, wybierz „Jednorazowo (Tpay)”.
            </p>
          ) : (
            tubapayOptions.length > 0 &&
            buyerType === "company" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Jako firma możesz zapłacić jednorazowo przez Tpay — raty TubaPay są tylko dla osób
                prywatnych.
              </p>
            )
          )}
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
              <Label htmlFor="b-email">
                {guestPeriod ? "E-mail (login do konta i faktura) *" : "E-mail do faktury *"}
              </Label>
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
              <Label htmlFor="p-email">
                {guestPeriod ? "E-mail (login do konta) *" : "E-mail *"}
              </Label>
              <Input
                id="p-email"
                type="email"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
              />
            </div>
            {isTubapay && (
              <div>
                <Label htmlFor="p-phone">Telefon komórkowy *</Label>
                <Input
                  id="p-phone"
                  type="tel"
                  inputMode="tel"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  placeholder="500 600 700"
                />
              </div>
            )}
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

      <div className="rounded-lg border p-4 space-y-3 text-sm">
        <label className="flex items-start gap-2 cursor-pointer">
          <Checkbox
            checked={termsAccepted}
            onCheckedChange={(v) => setTermsAccepted(v === true)}
            className="mt-0.5"
          />
          <span>
            Akceptuję{" "}
            {isInvestor ? (
              <>
                <a
                  href={REGULAMIN_ABONAMENTU_PATH}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Regulamin abonamentu inwestora
                </a>{" "}
                (sprzedawca: {FUNDACJA.nazwa})
              </>
            ) : (
              <a href="/regulamin" target="_blank" rel="noreferrer" className="underline">
                regulamin Finance You
              </a>
            )}{" "}
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
          {isInvestor ? (
            <span>
              Żądam rozpoczęcia dostarczania szkolenia (treści cyfrowych) bezpośrednio po opłaceniu,
              przed upływem terminu do odstąpienia od umowy, i przyjmuję do wiadomości, że tracę w
              ten sposób prawo odstąpienia od umowy. *
            </span>
          ) : (
            <span className="text-muted-foreground">
              Żądam rozpoczęcia świadczenia usługi cyfrowej bezpośrednio po opłaceniu i przyjmuję do
              wiadomości, że tracę w ten sposób prawo odstąpienia od umowy w zakresie wykonanej
              usługi.
            </span>
          )}
        </label>
      </div>

      {isTubapay && (
        <div className="rounded-lg border p-4 text-sm">
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={tubapayConsent}
              onCheckedChange={(v) => setTubapayConsent(v === true)}
              className="mt-0.5"
            />
            <span>
              Wyrażam zgodę na przekazanie moich danych (imię i nazwisko, adres, e-mail, telefon)
              TubaPay sp. z o.o. w celu zawarcia umowy płatności podzielonej. Administratorem tych
              danych w TubaPay jest TubaPay sp. z o.o. —{" "}
              <a
                href="https://tubapay.pl/platform/polityka-prywatnosci"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                polityka prywatności TubaPay
              </a>
              . *
            </span>
          </label>
        </div>
      )}

      {guestPeriod && (
        <p className="text-xs text-muted-foreground">
          Po zaksięgowaniu płatności automatycznie założymy Twoje konto inwestora na podstawie
          powyższych danych i wyślemy na podany e-mail link do logowania.
        </p>
      )}

      {isInvestor && (
        <p className="text-xs text-muted-foreground">
          Umowę ramową, NDA i umowę RODO zaakceptujesz w panelu, gdy zechcesz dostępu do Klientów i
          Projektów — Finance You nie pobiera za nie wynagrodzenia.
        </p>
      )}

      <Button onClick={handlePay} disabled={loading} className="w-full" size="lg">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isTubapay ? "Łączenie z TubaPay…" : "Łączenie z Tpay…"}
          </>
        ) : (
          <>
            {isTubapay
              ? `Zapłać w ${installments ?? ""} ratach z TubaPay`
              : `Zapłać ${formatGroszPln(product.amount_grosz)} przez Tpay`}
            <ExternalLink className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
