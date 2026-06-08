import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/logowanie")({
  head: () => ({
    meta: [
      { title: "Finance You — Zaloguj się do panelu klienta" },
      {
        name: "description",
        content:
          "Zaloguj się do Finance You, aby śledzić status wniosku o pożyczkę pod zastaw nieruchomości, dodawać dokumenty i kontaktować się z inwestorem.",
      },
      { property: "og:title", content: "Finance You — Logowanie" },
      {
        property: "og:description",
        content: "Panel klienta Finance You — status wniosku, dokumenty, kontakt z inwestorem.",
      },
      { property: "og:url", content: "https://financeyou.pl/logowanie" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex,follow" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/logowanie" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Wpisz adres e-mail");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    setLoading(false);
    if (error) {
      toast.error("Nie udało się wysłać linku", { description: error.message });
      return;
    }
    setSent(true);
    toast.success("Wysłaliśmy link do logowania", {
      description: `Sprawdź skrzynkę ${email}.`,
    });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Zaloguj się</CardTitle>
          <CardDescription>Podaj swój e-mail — wyślemy Ci link do logowania. Bez haseł.</CardDescription>
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
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Wysyłanie linku…" : "Wyślij link do logowania"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Nie masz konta?{" "}
                <Link to="/rejestracja" className="font-medium text-accent hover:underline">
                  Zarejestruj się
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
