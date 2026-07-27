import { createFileRoute, useSearch, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck, AlertCircle, Sparkles, CheckCircle2 } from "lucide-react";
import { SocialSignIn, AuthDivider } from "@/components/auth/social-sign-in";
import houseMark from "@/assets/financeyou-house-mark.png.asset.json";

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

  const oauthRedirect =
    typeof window !== "undefined" && token
      ? `${window.location.origin}/operator-rejestracja?token=${token}&welcome=1`
      : undefined;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050914] text-white">
      {/* Fancy aurora background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.35),transparent_60%)] blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(129,140,248,0.4),transparent_60%)] blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.18),transparent_60%)] blur-3xl" />
        {/* watermark grid removed */}
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-6xl place-items-center px-4 py-10">
        <div className="w-full">
          <div className="mb-8 flex justify-center lg:justify-start">
            <Link to="/">
              <img
                src={houseMark.url}
                alt="Finance You"
                className="h-20 w-auto drop-shadow-[0_8px_24px_rgba(56,189,248,0.35)] md:h-24"
                draggable={false}
              />
            </Link>
          </div>
          <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            {/* Left — hype panel */}
            <div className="hidden space-y-6 lg:block">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-white/70 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                Zaproszenie prywatne
              </div>
              <h1 className="bg-gradient-to-br from-white via-white to-cyan-200 bg-clip-text text-4xl font-bold leading-tight text-transparent md:text-5xl">
                Witaj w zespole operatorów
                <br />
                Finance You.
              </h1>
              <p className="max-w-md text-base text-white/70">
                Aktywuj swoje konto w kilka sekund. Po zalogowaniu trafisz od razu do panelu
                operatora — z leadami, wnioskami i wewnętrzną ofertą.
              </p>
              <ul className="space-y-3 text-sm text-white/80">
                {[
                  "Pełny dostęp do leadów bez opiekuna",
                  "Wewnętrzna oferta pożyczkowa z prowizją operatora",
                  "Skrzynka mailowa i historia rozmów pod jednym dachem",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — glass card */}
            <div className="mx-auto w-full max-w-md">
              <div className="relative rounded-2xl border border-white/15 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-transparent" />
                <div className="relative space-y-5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/15 ring-1 ring-cyan-300/40">
                      <ShieldCheck className="h-5 w-5 text-cyan-200" />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-widest text-white/60">
                        Finance You
                      </div>
                      <div className="text-lg font-semibold">Rejestracja operatora</div>
                    </div>
                  </div>

                  {status.state === "loading" && (
                    <div className="flex items-center gap-2 text-sm text-white/70">
                      <Loader2 className="h-4 w-4 animate-spin" /> Sprawdzam zaproszenie…
                    </div>
                  )}

                  {status.state === "invalid" && (
                    <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm">
                      <div className="flex items-center gap-2 font-medium text-red-200">
                        <AlertCircle className="h-4 w-4" /> Nie można użyć tego linku
                      </div>
                      <p className="mt-1 text-white/70">{status.reason}</p>
                      <p className="mt-3 text-xs text-white/50">
                        Poproś administratora o wygenerowanie nowego linku.
                      </p>
                    </div>
                  )}

                  {status.state === "valid" && redeeming && (
                    <div className="flex items-center gap-2 text-sm text-white/70">
                      <Loader2 className="h-4 w-4 animate-spin" /> Aktywuję konto operatora…
                    </div>
                  )}

                  {status.state === "valid" && !redeeming && !user && !sent && (
                    <>
                      <SocialSignIn
                        redirectUri={oauthRedirect}
                        variant="dark"
                        labelPrefix="Kontynuuj"
                      />
                      <AuthDivider label="lub e-mailem" variant="dark" />
                      <form className="space-y-3" onSubmit={submit}>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label htmlFor="fn" className="text-white/80">
                              Imię
                            </Label>
                            <Input
                              id="fn"
                              required
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              className="border-white/15 bg-white/10 text-white placeholder:text-white/40"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="ln" className="text-white/80">
                              Nazwisko
                            </Label>
                            <Input
                              id="ln"
                              required
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              className="border-white/15 bg-white/10 text-white placeholder:text-white/40"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="email" className="text-white/80">
                            E-mail
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            readOnly={!!status.email}
                            className="border-white/15 bg-white/10 text-white placeholder:text-white/40 read-only:opacity-70"
                          />
                          {status.email && (
                            <p className="text-xs text-white/50">
                              Adres przypisany przez administratora — nie można go zmienić.
                            </p>
                          )}
                        </div>
                        <Button
                          type="submit"
                          className="h-11 w-full bg-gradient-to-r from-cyan-400 to-indigo-500 text-white shadow-lg shadow-cyan-500/20 hover:opacity-90"
                          disabled={sending}
                        >
                          {sending ? "Wysyłanie linku…" : "Wyślij link aktywacyjny"}
                        </Button>
                      </form>
                      <p className="text-center text-xs text-white/60">
                        Masz już konto?{" "}
                        <Link
                          to="/logowanie"
                          search={
                            { next: `/operator-rejestracja?token=${token}&welcome=1` } as never
                          }
                          className="font-medium text-cyan-300 hover:underline"
                        >
                          Zaloguj się
                        </Link>
                      </p>
                    </>
                  )}

                  {status.state === "valid" && sent && !user && (
                    <div className="rounded-lg border border-white/15 bg-white/5 p-4 text-sm">
                      <p className="font-medium text-white">Sprawdź skrzynkę {email}</p>
                      <p className="mt-1 text-white/70">
                        Kliknij w link — wrócisz tutaj i Twoje konto operatora zostanie aktywowane.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-white/40">
                Konto operatora wewnętrznego można założyć wyłącznie z linku zapraszającego od
                administratora.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
