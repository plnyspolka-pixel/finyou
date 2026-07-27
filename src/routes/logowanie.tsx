import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { SocialSignIn, AuthDivider } from "@/components/auth/social-sign-in";
import { z } from "zod";

const searchSchema = z.object({
  claim: z.string().optional(),
  next: z.string().optional(),
  role: z.enum(["klient", "inwestor", "posrednik", "operator"]).optional(),
});

export const Route = createFileRoute("/logowanie")({
  validateSearch: (s) => searchSchema.parse(s),
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
  const navigate = useNavigate();
  const { claim, next, role } = useSearch({ from: "/logowanie" });

  // Zapisz token claim w localStorage, żeby pulpit go „odebrał" po logowaniu
  if (typeof window !== "undefined" && claim) {
    try {
      window.localStorage.setItem("pendingClaimToken", claim);
    } catch {}
  }

  const roleTarget =
    role === "inwestor"
      ? "/inwestor"
      : role === "operator"
        ? "/admin"
        : role === "posrednik"
          ? "/posrednik"
          : "/klient";
  const target = next && next.startsWith("/") ? next : roleTarget;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Podaj e-mail i hasło");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      toast.error("Nie udało się zalogować", { description: error.message });
      return;
    }
    toast.success("Witaj z powrotem!");
    void navigate({ to: target });
  };

  const submitMagic = async (e: FormEvent) => {
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
        emailRedirectTo: `${window.location.origin}${target}`,
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
          <CardDescription>
            {claim
              ? "Zaloguj się, aby dokończyć swój wniosek — automatycznie połączymy go z Twoim kontem."
              : "Po zalogowaniu trafisz do swojego panelu."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <SocialSignIn labelPrefix="Zaloguj się" />
              <AuthDivider label="lub e-mailem" />
              <Tabs defaultValue="password" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="password">Hasło</TabsTrigger>
                  <TabsTrigger value="magic">Link e-mail</TabsTrigger>
                </TabsList>

                <TabsContent value="password" className="mt-4">
                  <form className="space-y-4" onSubmit={submitPassword}>
                    <div className="space-y-2">
                      <Label htmlFor="email-pw">E-mail</Label>
                      <Input
                        id="email-pw"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Hasło</Label>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Logowanie…" : "Zaloguj się"}
                    </Button>
                    <div className="flex items-center justify-between text-sm">
                      <Link
                        to="/zapomniane-haslo"
                        className="text-muted-foreground hover:underline"
                      >
                        Nie pamiętam hasła
                      </Link>
                      <Link to="/rejestracja" className="font-medium text-accent hover:underline">
                        Zarejestruj się
                      </Link>
                    </div>
                  </form>
                </TabsContent>

                <TabsContent value="magic" className="mt-4">
                  <form className="space-y-4" onSubmit={submitMagic}>
                    <div className="space-y-2">
                      <Label htmlFor="email-magic">E-mail</Label>
                      <Input
                        id="email-magic"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Wysyłanie linku…" : "Wyślij link do logowania"}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      Bez haseł — kliknij link z maila, by się zalogować.
                    </p>
                  </form>
                </TabsContent>
              </Tabs>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
