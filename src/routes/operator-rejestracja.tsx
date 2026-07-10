import { createFileRoute, useSearch, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";

const searchSchema = z.object({
  token: z.string().uuid().optional(),
  welcome: z.coerce.number().optional(),
});

export const Route = createFileRoute("/operator-rejestracja")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Finance You — Rejestracja operatora" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OperatorRegisterPage,
});

type InviteStatus =
  | { state: "loading" }
  | { state: "invalid"; reason: string }
  | { state: "valid"; email: string | null; expiresAt: string };

function OperatorRegisterPage() {
  const { token, welcome } = useSearch({ from: "/operator-rejestracja" });
  const navigate = useNavigate();
  const { user, refreshRoles } = useAuth();
  const [status, setStatus] = useState<InviteStatus>({ state: "loading" });
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus({ state: "invalid", reason: "Brakuje tokenu zaproszenia w linku." });
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc("get_operator_invite", { _token: token });
      if (error) {
        setStatus({ state: "invalid", reason: error.message });
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setStatus({ state: "invalid", reason: "Nie znaleziono zaproszenia." });
        return;
      }
      if (row.used) {
        setStatus({ state: "invalid", reason: "To zaproszenie zostało już wykorzystane." });
        return;
      }
      if (!row.is_valid) {
        setStatus({ state: "invalid", reason: "Link wygasł. Poproś administratora o nowy." });
        return;
      }
      setStatus({ state: "valid", email: row.email, expiresAt: row.expires_at });
      if (row.email && !email) setEmail(row.email);
    })();
  }, [token, email]);

  useEffect(() => {
    if (!token || !user || status.state !== "valid" || redeeming) return;
    if (!welcome) return;
    setRedeeming(true);
    (async () => {
      const { error } = await supabase.rpc("redeem_operator_invite", { _token: token });
      if (error) {
        toast.error("Nie udało się aktywować konta operatora", { description: error.message });
        setRedeeming(false);
        return;
      }
      await refreshRoles();
      try {
        window.localStorage.removeItem("pending_role_selection");
      } catch {}
      toast.success("Konto operatora aktywne");
      navigate({ to: "/operator/leady" });
    })();
  }, [user, token, welcome, status, redeeming, refreshRoles, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !firstName.trim() || !lastName.trim()) {
      toast.error("Uzupełnij wszystkie pola");
      return;
    }
    setSending(true);
    const redirectUrl = `${window.location.origin}/operator-rejestracja?token=${token}&welcome=1`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectUrl,
        data: {
          first_name: firstName,
          last_name: lastName,
          signup_role: "klient",
        },
      },
    });
    setSending(false);
    if (error) {
      toast.error("Nie udało się wysłać linku", { description: error.message });
      return;
    }
    setSent(true);
    toast.success("Wysłaliśmy link do logowania", {
      description: `Sprawdź ${email} — po kliknięciu w link wrócisz tutaj i konto zostanie aktywowane.`,
    });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <CardTitle>Rejestracja operatora Finance You</CardTitle>
          </div>
          <CardDescription>
            Konto operatora wewnętrznego można założyć wyłącznie z linku zapraszającego od administratora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.state === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Sprawdzam zaproszenie…
            </div>
          )}

          {status.state === "invalid" && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <AlertCircle className="h-4 w-4" /> Nie można użyć tego linku
              </div>
              <p className="mt-1 text-muted-foreground">{status.reason}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                Poproś administratora o wygenerowanie nowego linku.
              </p>
            </div>
          )}

          {status.state === "valid" && redeeming && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Aktywuję konto operatora…
            </div>
          )}

          {status.state === "valid" && !redeeming && !user && !sent && (
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
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={!!status.email}
                />
                {status.email && (
                  <p className="text-xs text-muted-foreground">
                    Adres przypisany przez administratora — nie można go zmienić.
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? "Wysyłanie linku…" : "Załóż konto i wyślij link"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Masz już konto?{" "}
                <Link
                  to="/logowanie"
                  search={{ next: `/operator-rejestracja?token=${token}&welcome=1` } as never}
                  className="font-medium text-accent hover:underline"
                >
                  Zaloguj się
                </Link>
              </p>
            </form>
          )}

          {status.state === "valid" && sent && !user && (
            <div className="rounded-md border bg-muted/40 p-4 text-sm">
              <p className="font-medium">Sprawdź skrzynkę {email}</p>
              <p className="mt-1 text-muted-foreground">
                Kliknij w link — wrócisz tutaj i Twoje konto operatora zostanie aktywowane.
              </p>
            </div>
          )}

          {status.state === "valid" && user && !welcome && !redeeming && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Jesteś zalogowany jako <strong>{user.email}</strong>. Kliknij poniżej, aby aktywować rolę operatora.
              </p>
              <Button
                className="w-full"
                onClick={async () => {
                  if (!token) return;
                  setRedeeming(true);
                  const { error } = await supabase.rpc("redeem_operator_invite", { _token: token });
                  if (error) {
                    toast.error("Nie udało się aktywować", { description: error.message });
                    setRedeeming(false);
                    return;
                  }
                  await refreshRoles();
                  toast.success("Konto operatora aktywne");
                  navigate({ to: "/operator/leady" });
                }}
              >
                Aktywuj konto operatora
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
