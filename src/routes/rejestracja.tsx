import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, LineChart, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { SocialSignIn, AuthDivider } from "@/components/auth/social-sign-in";

type SignupRole = "klient" | "inwestor" | "posrednik";

const searchSchema = z.object({
  role: z.enum(["klient", "inwestor", "posrednik"]).optional(),
});

export const Route = createFileRoute("/rejestracja")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Finance You — Załóż konto" },
      {
        name: "description",
        content:
          "Załóż darmowe konto w Finance You jako klient, inwestor lub pośrednik. Decyzja w 24 godziny.",
      },
      { property: "og:title", content: "Finance You — Rejestracja" },
      {
        property: "og:description",
        content: "Darmowe konto Finance You — klient, inwestor lub pośrednik.",
      },
      { property: "og:url", content: "https://financeyou.pl/rejestracja" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/rejestracja" }],
  }),
  component: RegisterPage,
});

const ROLE_TILES: { value: SignupRole; title: string; desc: string; icon: typeof Building2 }[] = [
  {
    value: "klient",
    title: "Klient (pożyczkobiorca)",
    desc: "Złóż wniosek o pożyczkę pod zastaw nieruchomości.",
    icon: Building2,
  },
  {
    value: "inwestor",
    title: "Inwestor",
    desc: "Przeglądaj oferty i inwestuj w pożyczki zabezpieczone hipotecznie.",
    icon: LineChart,
  },
  {
    value: "posrednik",
    title: "Pośrednik",
    desc: "Wprowadzaj wnioski klientów i zarabiaj na prowizjach sieciowych.",
    icon: Briefcase,
  },
];

function RegisterPage() {
  const search = useSearch({ from: "/rejestracja" });
  const [role, setRole] = useState<SignupRole>(search.role ?? "klient");
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
    const target = role === "inwestor" ? "/inwestor" : role === "posrednik" ? "/posrednik" : "/klient";
    try {
      window.localStorage.setItem("pending_role_selection", role);
    } catch {}
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}${target}`,
        data: { first_name: firstName, last_name: lastName, phone, signup_role: role },
      },
    });
    setLoading(false);
    if (error) {
      toast.error("Nie udało się wysłać linku", { description: error.message });
      return;
    }
    try {
      const { trackEvent } = await import("@/lib/fb-pixel");
      await trackEvent(
        "CompleteRegistration",
        { status: "pending_email", signup_role: role },
        { email, phone, firstName, lastName },
      );
    } catch {}
    setSent(true);
    toast.success("Wysłaliśmy link do logowania", {
      description: `Sprawdź skrzynkę ${email} — kliknij w link, by zalogować się i kontynuować.`,
    });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Załóż konto</CardTitle>
          <CardDescription>
            Wybierz typ konta i podaj dane — wyślemy link do logowania. Bez haseł.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {sent ? (
            <div className="rounded-md border bg-muted/40 p-4 text-sm">
              <p className="font-medium">Sprawdź skrzynkę {email}</p>
              <p className="mt-1 text-muted-foreground">
                Kliknij w link, by zalogować się automatycznie. Jeśli nie widzisz wiadomości,
                sprawdź spam.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {ROLE_TILES.map((t) => {
                  const Icon = t.icon;
                  const active = role === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setRole(t.value)}
                      className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition ${
                        active
                          ? "border-accent bg-accent/10 ring-2 ring-accent/40"
                          : "border-border hover:border-accent/60 hover:bg-accent/5"
                      }`}
                    >
                      <Icon className="h-6 w-6 text-accent" />
                      <div className="font-semibold text-foreground">{t.title}</div>
                      <p className="text-xs text-muted-foreground">{t.desc}</p>
                    </button>
                  );
                })}
              </div>

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
                  <Input
                    id="phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+48 600 000 000"
                  />
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
