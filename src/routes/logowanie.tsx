import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { SocialSignIn, AuthDivider } from "@/components/auth/social-sign-in";
import { FinanceYouLogo } from "@/components/finance-you-logo";
import {
  FileSearch,
  Handshake,
  KeyRound,
  LineChart,
  MailCheck,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";
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

type RoleKey = "klient" | "inwestor" | "posrednik" | "operator";

const ROLE_CONTENT: Record<
  RoleKey,
  {
    eyebrow: string;
    heading: string;
    subheading: string;
    points: { icon: LucideIcon; text: string }[];
  }
> = {
  inwestor: {
    eyebrow: "Panel inwestora",
    heading: "Inwestuj w pożyczki zabezpieczone nieruchomościami",
    subheading:
      "Pełne dane ofert, dokumenty i księgi wieczyste, składanie ofert oraz 7 warstw ochrony inwestora — wszystko w jednym panelu.",
    points: [
      { icon: FileSearch, text: "Pełne dane ofert, dokumenty, KW, analizy i wyceny" },
      { icon: Handshake, text: "Składanie ofert, czat z pożyczkobiorcą i umowy" },
      { icon: ShieldCheck, text: "7 warstw ochrony inwestora i Windykacja AI" },
    ],
  },
  posrednik: {
    eyebrow: "Panel pośrednika",
    heading: "Twoje oferty, leady i CRM w jednym miejscu",
    subheading:
      "Dodawaj oferty, odbieraj leady Finance You i prowadź klientów od pierwszego kontaktu do wypłaty pożyczki.",
    points: [
      { icon: Users, text: "Leady Finance You i pełny CRM pośrednika" },
      { icon: LineChart, text: "Kampanie, automatyzacje i skrzynka wiadomości" },
      { icon: Sparkles, text: "Akademia Pośrednika i program partnerski" },
    ],
  },
  operator: {
    eyebrow: "Panel operatora",
    heading: "Zarządzaj platformą Finance You",
    subheading: "Wnioski, inwestorzy, płatności i integracje — pełna kontrola operacyjna.",
    points: [
      { icon: LineChart, text: "Podgląd wniosków, ofert i płatności na żywo" },
      { icon: Users, text: "Zarządzanie inwestorami i pośrednikami" },
      { icon: ShieldCheck, text: "Bezpieczny dostęp z kontrolą uprawnień" },
    ],
  },
  klient: {
    eyebrow: "Panel klienta",
    heading: "Twój wniosek o pożyczkę pod ręką",
    subheading:
      "Śledź status wniosku, dodawaj dokumenty i rozmawiaj z inwestorem — wszystko w jednym, bezpiecznym panelu.",
    points: [
      { icon: FileSearch, text: "Status wniosku i dokumenty w jednym miejscu" },
      { icon: MessagesSquare, text: "Bezpośredni kontakt z inwestorem" },
      { icon: ShieldCheck, text: "Twoje dane chronione i szyfrowane" },
    ],
  },
};

// Klasy dla pól formularza na ciemnym, szklanym tle.
const darkInput =
  "h-11 rounded-xl border-white/15 bg-white/[0.08] text-white placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-sky-300/50 focus-visible:border-white/30";

function LoginPage() {
  const navigate = useNavigate();
  const { claim, next, role } = useSearch({ from: "/logowanie" });

  // Zapisz token claim w localStorage, żeby pulpit go „odebrał" po logowaniu
  if (typeof window !== "undefined" && claim) {
    try {
      window.localStorage.setItem("pendingClaimToken", claim);
    } catch {
      // localStorage może być niedostępny (tryb prywatny) — logowanie działa dalej.
    }
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
  const content = ROLE_CONTENT[role ?? "klient"];
  const goesToCheckout = target.includes("abonament");

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 py-10">
      {/* Tło: navy aurora w duchu FancyShell */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 140% at 0% 0%, oklch(0.30 0.14 265) 0%, oklch(0.17 0.06 265) 55%, oklch(0.12 0.04 265) 100%)",
        }}
      />
      <span
        aria-hidden
        className="absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, oklch(0.50 0.22 268 / 0.55), transparent 70%)",
          animation: "fy-login-drift-a 11s ease-in-out infinite alternate",
        }}
      />
      <span
        aria-hidden
        className="absolute -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, oklch(0.62 0.16 235 / 0.45), transparent 70%)",
          animation: "fy-login-drift-b 13s ease-in-out infinite alternate",
        }}
      />
      <span
        aria-hidden
        className="absolute bottom-[-8rem] left-1/3 h-[24rem] w-[24rem] rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, oklch(0.48 0.20 285 / 0.40), transparent 70%)",
          animation: "fy-login-drift-c 15s ease-in-out infinite alternate",
        }}
      />
      <span
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.95 0.02 250) 1px, transparent 1px), linear-gradient(90deg, oklch(0.95 0.02 250) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(80% 70% at 50% 40%, black, transparent)",
        }}
      />

      <div className="relative z-10 grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.05fr_minmax(0,26rem)]">
        {/* Lewy panel — marka i korzyści zależne od roli */}
        <div className="hidden flex-col lg:flex">
          <FinanceYouLogo variant="dark" size="lg" className="self-start" />
          <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.24em] text-sky-300/80">
            {content.eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-white drop-shadow-sm xl:text-4xl">
            {content.heading}
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/70">
            {content.subheading}
          </p>
          <ul className="mt-7 space-y-4">
            {content.points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/[0.07] shadow-[inset_0_1px_0_oklch(1_0_0/0.12)]">
                  <Icon className="h-5 w-5 text-sky-300" />
                </span>
                <span className="text-sm text-white/85">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Prawa kolumna — karta logowania z animowaną obwódką */}
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <FinanceYouLogo variant="dark" size="md" />
          </div>

          <div className="relative overflow-hidden rounded-3xl p-[2px] shadow-[0_25px_80px_-20px_oklch(0.40_0.25_268/0.65)]">
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 aspect-square w-[220%] -translate-x-1/2 -translate-y-1/2"
              style={{
                background:
                  "conic-gradient(from 0deg, oklch(0.40 0.25 268), oklch(0.70 0.16 235), oklch(0.55 0.20 255), oklch(0.30 0.15 265), oklch(0.40 0.25 268))",
                animation: "fy-login-spin 8s linear infinite",
              }}
            />
            <div className="relative overflow-hidden rounded-[22px] bg-[oklch(0.16_0.05_265/0.92)] p-6 backdrop-blur-xl sm:p-7">
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-40"
                style={{
                  background:
                    "radial-gradient(70% 100% at 50% 0%, oklch(0.45 0.18 265 / 0.35), transparent 100%)",
                }}
              />

              <div className="relative">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/50 lg:hidden">
                  {content.eyebrow}
                </p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white lg:mt-0">
                  Zaloguj się
                </h2>
                <p className="mt-1.5 text-sm text-white/65">
                  {claim
                    ? "Zaloguj się, aby dokończyć swój wniosek — automatycznie połączymy go z Twoim kontem."
                    : goesToCheckout
                      ? "Po zalogowaniu przejdziesz prosto do wyboru pakietu i płatności."
                      : "Po zalogowaniu trafisz do swojego panelu."}
                </p>

                {goesToCheckout && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    Pełny dostęp czeka po drugiej stronie
                  </div>
                )}

                <div className="mt-6 space-y-4">
                  {sent ? (
                    <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-5">
                      <div className="flex items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/20">
                          <MailCheck className="h-5 w-5 text-emerald-300" />
                        </span>
                        <div className="text-sm">
                          <p className="font-semibold text-white">Sprawdź skrzynkę {email}</p>
                          <p className="mt-1 text-white/65">
                            Kliknij w link, by zalogować się automatycznie. Jeśli nie widzisz
                            wiadomości, sprawdź spam.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <SocialSignIn labelPrefix="Zaloguj się" variant="dark" />
                      <AuthDivider label="lub e-mailem" variant="dark" />
                      <Tabs defaultValue="password" className="w-full">
                        <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl border border-white/10 bg-white/[0.07] p-1 text-white/55">
                          <TabsTrigger
                            value="password"
                            className="gap-1.5 rounded-lg data-[state=active]:bg-white/15 data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <KeyRound className="h-3.5 w-3.5" /> Hasło
                          </TabsTrigger>
                          <TabsTrigger
                            value="magic"
                            className="gap-1.5 rounded-lg data-[state=active]:bg-white/15 data-[state=active]:text-white data-[state=active]:shadow-none"
                          >
                            <Wand2 className="h-3.5 w-3.5" /> Link e-mail
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="password" className="mt-4">
                          <form className="space-y-4" onSubmit={submitPassword}>
                            <div className="space-y-2">
                              <Label htmlFor="email-pw" className="text-white/80">
                                E-mail
                              </Label>
                              <Input
                                id="email-pw"
                                type="email"
                                autoComplete="email"
                                required
                                placeholder="twoj@email.pl"
                                className={darkInput}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="password" className="text-white/80">
                                Hasło
                              </Label>
                              <Input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                placeholder="••••••••"
                                className={darkInput}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                              />
                            </div>
                            <Button
                              type="submit"
                              disabled={loading}
                              className="h-11 w-full rounded-xl bg-gradient-to-r from-[oklch(0.50_0.22_268)] via-[oklch(0.55_0.20_255)] to-[oklch(0.62_0.17_240)] text-[15px] font-bold text-white shadow-[0_10px_30px_-10px_oklch(0.55_0.22_260/0.9)] transition-all hover:brightness-110 hover:shadow-[0_14px_40px_-10px_oklch(0.55_0.22_260)]"
                            >
                              {loading ? "Logowanie…" : "Zaloguj się"}
                            </Button>
                            <div className="flex items-center justify-between text-sm">
                              <Link
                                to="/zapomniane-haslo"
                                className="text-white/55 transition-colors hover:text-white/85 hover:underline"
                              >
                                Nie pamiętam hasła
                              </Link>
                              <Link
                                to="/rejestracja"
                                className="font-semibold text-sky-300 transition-colors hover:text-sky-200 hover:underline"
                              >
                                Zarejestruj się
                              </Link>
                            </div>
                          </form>
                        </TabsContent>

                        <TabsContent value="magic" className="mt-4">
                          <form className="space-y-4" onSubmit={submitMagic}>
                            <div className="space-y-2">
                              <Label htmlFor="email-magic" className="text-white/80">
                                E-mail
                              </Label>
                              <Input
                                id="email-magic"
                                type="email"
                                autoComplete="email"
                                required
                                placeholder="twoj@email.pl"
                                className={darkInput}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                              />
                            </div>
                            <Button
                              type="submit"
                              disabled={loading}
                              className="h-11 w-full rounded-xl bg-gradient-to-r from-[oklch(0.50_0.22_268)] via-[oklch(0.55_0.20_255)] to-[oklch(0.62_0.17_240)] text-[15px] font-bold text-white shadow-[0_10px_30px_-10px_oklch(0.55_0.22_260/0.9)] transition-all hover:brightness-110 hover:shadow-[0_14px_40px_-10px_oklch(0.55_0.22_260)]"
                            >
                              {loading ? "Wysyłanie linku…" : "Wyślij link do logowania"}
                            </Button>
                            <p className="text-center text-xs text-white/50">
                              Bez haseł — kliknij link z maila, by się zalogować.
                            </p>
                          </form>
                        </TabsContent>
                      </Tabs>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-white/40">
            <ShieldCheck className="h-3.5 w-3.5" />
            Połączenie szyfrowane · Twoje dane są bezpieczne
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fy-login-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes fy-login-drift-a { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(30px,20px) scale(1.15); } }
        @keyframes fy-login-drift-b { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(-35px,15px) scale(1.1); } }
        @keyframes fy-login-drift-c { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(25px,-20px) scale(1.2); } }
      `}</style>
    </div>
  );
}
