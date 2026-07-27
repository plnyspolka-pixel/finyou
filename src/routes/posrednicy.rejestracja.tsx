import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ComplianceNotice } from "@/components/affiliate/compliance-notice";
import { registerAffiliatePartner } from "@/lib/affiliate/partner.functions";
import { Building2, UserCircle } from "lucide-react";
import { SocialSignIn, AuthDivider } from "@/components/auth/social-sign-in";

export const Route = createFileRoute("/posrednicy/rejestracja")({
  validateSearch: (s: Record<string, unknown>) => ({ ref: typeof s.ref === "string" ? s.ref : "" }),
  head: () => ({
    meta: [{ title: "Rejestracja partnera — Program pośredników Finance You" }],
    links: [{ rel: "canonical", href: "https://financeyou.pl/posrednicy/rejestracja" }],
  }),
  component: RejestracjaPartnera,
});

function RejestracjaPartnera() {
  const { user, loading } = useAuth();
  const { ref } = Route.useSearch();
  const navigate = useNavigate();
  const register = useServerFn(registerAffiliatePartner);

  const [email, setEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // pola formularza partnera
  const [settlementType, setSettlementType] = useState<"b2b" | "unregistered_activity">(
    "unregistered_activity",
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [nip, setNip] = useState("");
  const [pesel, setPesel] = useState("");
  const [street, setStreet] = useState("");
  const [postal, setPostal] = useState("");
  const [city, setCity] = useState("");
  const [bank, setBank] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [source, setSource] = useState("");
  const [terms, setTerms] = useState(false);
  const [unregisteredAck, setUnregisteredAck] = useState(false);

  async function sendMagic(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return toast.error("Podaj adres e-mail");
    const redirect = `${window.location.origin}/posrednicy/rejestracja${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: redirect },
    });
    if (error) return toast.error("Nie udało się wysłać linku", { description: error.message });
    setMagicSent(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!terms) return toast.error("Zaakceptuj regulamin programu");
    if (settlementType === "b2b" && (!companyName.trim() || !nip.trim()))
      return toast.error("Dla B2B podaj nazwę firmy i NIP");
    if (settlementType === "unregistered_activity") {
      if (!pesel.trim()) return toast.error("Dla działalności nierejestrowanej podaj PESEL");
      if (!unregisteredAck)
        return toast.error("Potwierdź oświadczenie o działalności nierejestrowanej");
    }
    setSubmitting(true);
    try {
      await register({
        data: {
          settlementType,
          firstName,
          lastName,
          email: user?.email ?? billingEmail ?? "",
          phone,
          companyName,
          nip,
          pesel,
          addressStreet: street,
          addressPostalCode: postal,
          addressCity: city,
          bankAccount: bank,
          billingEmail,
          sourceDescription: source,
          sponsorReferralCode: ref || "",
          termsAccepted: true,
          termsVersion: "1.0",
        },
      });
      toast.success("Zgłoszenie wysłane! Konto partnera czeka na akceptację administratora.");
      void navigate({ to: "/posrednik" });
    } catch (err) {
      toast.error("Rejestracja nie powiodła się", { description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Ładowanie…</div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30 py-10 px-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center space-y-1">
          <Link to="/posrednicy" className="text-sm text-primary hover:underline">
            ← Program pośredników
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold">Rejestracja partnera</h1>
          {ref && (
            <p className="text-sm text-muted-foreground">
              Polecenie od partnera: <b>{ref}</b>
            </p>
          )}
        </div>

        <ComplianceNotice />

        {!user ? (
          <Card>
            <CardHeader>
              <CardTitle>Najpierw załóż konto lub zaloguj się</CardTitle>
              <CardDescription>
                Wyślemy link logujący na Twój e-mail. Po powrocie dokończysz rejestrację partnera.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {magicSent ? (
                <p className="text-sm">
                  Sprawdź skrzynkę <b>{email}</b> i kliknij link logujący, aby kontynuować.
                </p>
              ) : (
                <div className="space-y-4">
                  <SocialSignIn labelPrefix="Zarejestruj się" />
                  <AuthDivider label="lub e-mailem" />
                  <form onSubmit={sendMagic} className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="email"
                      placeholder="twoj@email.pl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <Button type="submit">Wyślij link</Button>
                  </form>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Masz konto?{" "}
                <Link to="/logowanie" className="text-primary hover:underline">
                  Zaloguj się
                </Link>
              </p>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={submit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Forma rozliczenia</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={settlementType}
                  onValueChange={(v) => setSettlementType(v as any)}
                  className="grid sm:grid-cols-2 gap-3"
                >
                  <label
                    className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${settlementType === "unregistered_activity" ? "border-primary bg-primary/5" : ""}`}
                  >
                    <RadioGroupItem value="unregistered_activity" className="mt-0.5" />
                    <span className="text-sm">
                      <b className="flex items-center gap-1">
                        <UserCircle className="h-4 w-4" /> Działalność nierejestrowana
                      </b>
                      <span className="text-xs text-muted-foreground">
                        osoba fizyczna w ramach limitu przychodów
                      </span>
                    </span>
                  </label>
                  <label
                    className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${settlementType === "b2b" ? "border-primary bg-primary/5" : ""}`}
                  >
                    <RadioGroupItem value="b2b" className="mt-0.5" />
                    <span className="text-sm">
                      <b className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" /> B2B
                      </b>
                      <span className="text-xs text-muted-foreground">
                        faktura / dokument księgowy
                      </span>
                    </span>
                  </label>
                </RadioGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dane partnera</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Imię</Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Nazwisko</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Telefon</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>E-mail do rozliczeń</Label>
                  <Input
                    type="email"
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    placeholder={user.email ?? ""}
                  />
                </div>
                {settlementType === "b2b" ? (
                  <>
                    <div className="space-y-1">
                      <Label>Nazwa firmy</Label>
                      <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>NIP</Label>
                      <Input value={nip} onChange={(e) => setNip(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <div className="space-y-1 sm:col-span-2">
                    <Label>PESEL</Label>
                    <Input value={pesel} onChange={(e) => setPesel(e.target.value)} />
                    <p className="text-xs text-muted-foreground">
                      Przechowywany w postaci zaszyfrowanej.
                    </p>
                  </div>
                )}
                <div className="space-y-1 sm:col-span-2">
                  <Label>Ulica i numer</Label>
                  <Input value={street} onChange={(e) => setStreet(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Kod pocztowy</Label>
                  <Input value={postal} onChange={(e) => setPostal(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Miejscowość</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Numer rachunku bankowego</Label>
                  <Input
                    value={bank}
                    onChange={(e) => setBank(e.target.value)}
                    placeholder="PL00 0000 0000 0000 0000 0000 0000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Przechowywany w postaci zaszyfrowanej, używany wyłącznie do wypłat.
                  </p>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Skąd pozyskujesz polecenia? (opcjonalnie)</Label>
                  <Textarea value={source} onChange={(e) => setSource(e.target.value)} rows={2} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 pt-6">
                {settlementType === "unregistered_activity" && (
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={unregisteredAck}
                      onCheckedChange={(c) => setUnregisteredAck(Boolean(c))}
                      className="mt-0.5"
                    />
                    <span>
                      Oświadczam, że jestem osobą fizyczną, spełniam warunki działalności
                      nierejestrowanej, monitoruję własny limit przychodów, nie przekroczyłem limitu
                      w danym kwartale, rozliczam przychody we własnym zeznaniu i poinformuję
                      Finance You o przekroczeniu limitu lub obowiązku rejestracji działalności.
                    </span>
                  </label>
                )}
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={terms}
                    onCheckedChange={(c) => setTerms(Boolean(c))}
                    className="mt-0.5"
                  />
                  <span>
                    Akceptuję regulamin programu pośredników Finance You i potwierdzam, że nie będę
                    gwarantować finansowania ani występować jako przedstawiciel Finance You bez
                    odrębnego upoważnienia.
                  </span>
                </label>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Wysyłanie…" : "Wyślij zgłoszenie"}
                </Button>
              </CardContent>
            </Card>
          </form>
        )}
      </div>
    </div>
  );
}
