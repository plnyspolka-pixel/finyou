import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/rejestracja")({
  head: () => ({
    meta: [
      { title: "Finance You — Załóż konto klienta" },
      {
        name: "description",
        content:
          "Załóż darmowe konto w Finance You i złóż wniosek o prywatną pożyczkę pod zastaw nieruchomości do 1 000 000 zł. Decyzja w 24 godziny.",
      },
      { property: "og:title", content: "Finance You — Rejestracja" },
      {
        property: "og:description",
        content: "Darmowe konto klienta Finance You. Złóż wniosek o pożyczkę pod zastaw nieruchomości.",
      },
      { property: "og:url", content: "https://financeyou.pl/rejestracja" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/rejestracja" }],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !email.trim()) {
      toast.error("Uzupełnij wszystkie pola");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/`,
        data: { first_name: firstName, last_name: lastName, phone },
      },
    });
    setLoading(false);
    if (error) {
      toast.error("Nie udało się wysłać linku", { description: error.message });
      return;
    }
    try {
      const { trackEvent } = await import("@/lib/fb-pixel");
      await trackEvent("CompleteRegistration", { status: "pending_email" }, { email, phone, firstName, lastName });
    } catch {}
    setSent(true);
    toast.success("Wysłaliśmy link do logowania", {
      description: `Sprawdź skrzynkę ${email} — kliknij w link, by zalogować się i kontynuować.`,
    });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Załóż konto</CardTitle>
          <CardDescription>
            Wpisz swoje dane — wyślemy Ci link do logowania na e-mail. Bez haseł.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <div className="rounded-md border bg-muted/40 p-4 text-sm">
              <p className="font-medium">Sprawdź skrzynkę {email}</p>
              <p className="mt-1 text-muted-foreground">
                Kliknij w link, by zalogować się automatycznie. Jeśli nie widzisz wiadomości, sprawdź spam.
              </p>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fn">Imię</Label>
                  <Input id="fn" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ln">Nazwisko</Label>
                  <Input id="ln" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48 600 000 000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Wysyłanie linku…" : "Załóż konto i wyślij link"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Masz już konto?{" "}
                <Link to="/logowanie" className="font-medium text-accent hover:underline">
                  Zaloguj się
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
