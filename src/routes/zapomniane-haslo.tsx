import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/zapomniane-haslo")({
  head: () => ({
    meta: [
      { title: "Finance You — Reset hasła" },
      {
        name: "description",
        content: "Zresetuj hasło do panelu Finance You. Wyślemy link do ustawienia nowego hasła.",
      },
      { property: "og:title", content: "Finance You — Reset hasła" },
      {
        property: "og:description",
        content: "Zresetuj hasło do panelu Finance You.",
      },
      { name: "robots", content: "noindex,follow" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/zapomniane-haslo" }],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nowe-haslo`,
    });
    setLoading(false);
    if (error) {
      toast.error("Nie udało się wysłać linku", { description: error.message });
      return;
    }
    setSent(true);
    toast.success("Link wysłany", {
      description: `Sprawdź skrzynkę ${email.trim()} (również folder spam).`,
    });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset hasła</CardTitle>
          <CardDescription>
            Podaj adres e-mail powiązany z kontem. Wyślemy link do ustawienia nowego hasła.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-medium">Sprawdź skrzynkę e-mail.</p>
              <p className="mt-1">
                Jeżeli konto istnieje, wysłaliśmy na {email.trim()} link do ustawienia nowego hasła.
                Link jest ważny przez 1 godzinę.
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
                {loading ? "Wysyłanie…" : "Wyślij link resetujący"}
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-muted-foreground">
            Pamiętasz hasło?{" "}
            <Link to="/logowanie" className="font-medium text-accent hover:underline">
              Wróć do logowania
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
