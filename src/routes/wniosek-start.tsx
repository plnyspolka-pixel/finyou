import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/wniosek-start")({
  component: WniosekStartPage,
  head: () => ({
    meta: [
      { title: "Kontynuuj wniosek" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const STORAGE_KEY = "embed_calc_v1";

function captureParamsToStorage() {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  if (!sp.get("amount") && !sp.get("secType")) return;
  const payload = {
    amount: Number(sp.get("amount")) || null,
    annualRate: Number(sp.get("annualRate")) || null,
    months: Number(sp.get("months")) || null,
    maxPayment: Number(sp.get("maxPayment")) || null,
    secType: sp.get("secType") || null,
    source: sp.get("source") || "embed",
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* noop */
  }
}

function WniosekStartPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Zapamiętaj parametry kalkulatora przed jakimkolwiek redirectem (OAuth wraca tu z powrotem).
  useEffect(() => {
    captureParamsToStorage();
  }, []);

  // Już zalogowany → prosto do wniosku
  useEffect(() => {
    if (authLoading) return;
    if (user) void navigate({ to: "/klient" });
  }, [authLoading, user, navigate]);

  const oauth = async (provider: "google" | "apple") => {
    const res = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: `${window.location.origin}/wniosek-start`,
    });
    if (res.error) {
      const msg = res.error.message || "";
      if (/cancel/i.test(msg)) return;
      toast.error("Logowanie nie powiodło się", { description: msg });
    }
  };

  const submitSignup = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim() || !password) {
      toast.error("Uzupełnij wszystkie pola");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/wniosek-start`,
        data: { first_name: firstName, last_name: lastName, phone },
      },
    });
    setBusy(false);
    if (error) {
      toast.error("Rejestracja nie powiodła się", { description: error.message });
      return;
    }
    if (data.user) {
      await supabase.from("profiles").update({ phone }).eq("user_id", data.user.id);
    }
    if (data.session) {
      toast.success("Konto utworzone");
      navigate({ to: "/klient" });
    } else {
      toast.success("Konto utworzone", {
        description: "Sprawdź skrzynkę e-mail, by potwierdzić adres, a następnie zaloguj się.",
      });
      setMode("signin");
    }
  };

  const submitSignin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("Nie udało się zalogować", { description: error.message });
      return;
    }
    navigate({ to: "/klient" });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === "signup" ? "Załóż konto i kontynuuj" : "Zaloguj się"}</CardTitle>
          <CardDescription>
            Aby dokończyć wniosek (dane, dokumenty, KW) potrzebujemy konta — dzięki temu
            zapiszemy postęp i będziesz mógł wrócić w każdej chwili.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="w-full" onClick={() => oauth("google")}>
              Kontynuuj z Google
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => oauth("apple")}>
              Kontynuuj z Apple
            </Button>
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">lub e-mailem</span>
            </div>
          </div>

          {mode === "signup" ? (
            <form className="space-y-4" onSubmit={submitSignup}>
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
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Tworzenie konta…" : "Załóż konto i kontynuuj"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Masz już konto?{" "}
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => setMode("signin")}>
                  Zaloguj się
                </button>
              </p>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={submitSignin}>
              <div className="space-y-2">
                <Label htmlFor="email2">E-mail</Label>
                <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password2">Hasło</Label>
                <Input id="password2" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Logowanie…" : "Zaloguj się i kontynuuj"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Nie masz jeszcze konta?{" "}
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => setMode("signup")}>
                  Załóż konto
                </button>
              </p>
            </form>
          )}

          <p className="text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:underline">Wróć do strony głównej</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
