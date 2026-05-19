import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/rejestracja")({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const oauth = async (provider: "google" | "apple") => {
    try {
      localStorage.setItem("pending_role_selection", "1");
    } catch {
      /* noop */
    }
    const res = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: `${window.location.origin}/`,
    });
    if (res.error) {
      const msg = res.error.message || "";
      if (/cancel/i.test(msg)) return;
      toast.error("Rejestracja nie powiodła się", { description: msg });
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !email.trim() || !password) {
      toast.error("Uzupełnij wszystkie pola");
      return;
    }
    setLoading(true);
    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { first_name: firstName, last_name: lastName, phone },
      },
    });
    if (error) {
      setLoading(false);
      toast.error("Rejestracja nie powiodła się", { description: error.message });
      return;
    }
    if (data.user) {
      await supabase.from("profiles").update({ phone }).eq("user_id", data.user.id);
    }
    setLoading(false);
    if (data.session) {
      toast.success("Konto utworzone");
      navigate({ to: "/wybor-roli" });
    } else {
      toast.success("Konto utworzone", {
        description: "Sprawdź skrzynkę e-mail, by potwierdzić adres, a następnie zaloguj się.",
      });
      navigate({ to: "/logowanie" });
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Załóż konto</CardTitle>
          <CardDescription>Wybierz najwygodniejszy sposób rejestracji.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="w-full" onClick={() => oauth("google")}>
              Zarejestruj się przez Google
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => oauth("apple")}>
              Zarejestruj się przez Apple
            </Button>
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">lub e-mailem</span>
            </div>
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
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input id="phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48 600 000 000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Hasło</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Tworzenie konta…" : "Załóż konto"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Masz już konto?{" "}
              <Link to="/logowanie" className="font-medium text-accent hover:underline">
                Zaloguj się
              </Link>
            </p>
            <p className="text-center text-xs text-muted-foreground">
              Konto administratora i operatora przydziela administrator po założeniu konta.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
