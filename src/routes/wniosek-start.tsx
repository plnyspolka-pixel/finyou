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
            <Button type="button" variant="outline" className="w-full gap-2" onClick={() => oauth("google")}>
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Kontynuuj z Google
            </Button>
            <Button type="button" variant="outline" className="w-full gap-2" onClick={() => oauth("apple")}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.06 1.87-2.54 5.98.22 7.13-.57 1.5-1.31 2.99-2.27 4.08zm-5.85-15.1c.07-2.04 1.76-3.79 3.75-3.94.29 2.32-2.07 4.49-3.75 3.94z" />
              </svg>
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
