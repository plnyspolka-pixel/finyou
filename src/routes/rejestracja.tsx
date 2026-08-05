import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, LineChart } from "lucide-react";
import { toast } from "sonner";
import { SocialSignIn, AuthDivider } from "@/components/auth/social-sign-in";
import { SiteHeader, SiteFooter } from "@/components/marketing/shell";
import { MktBadge } from "@/components/marketing/primitives";

type SignupRole = "klient" | "inwestor";

const searchSchema = z.object({
  // .catch — nieznana rola w URL (np. stare linki ?role=posrednik) nie wywala strony.
  role: z.enum(["klient", "inwestor"]).optional().catch(undefined),
});

export const Route = createFileRoute("/rejestracja")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Finance You — Załóż konto" },
      {
        name: "description",
        content:
          "Załóż darmowe konto w Finance You jako klient lub inwestor. Decyzja w 24 godziny.",
      },
      { property: "og:title", content: "Finance You — Rejestracja" },
      {
        property: "og:description",
        content: "Darmowe konto Finance You — klient lub inwestor.",
      },
      { property: "og:url", content: "https://financeyou.pl/rejestracja" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/rejestracja" }],
  }),
  component: RegisterPage,
});

const ROLE_TILES: {
  value: SignupRole;
  title: string;
  desc: string;
  icon: typeof Building2;
  badge: { v: "accent" | "secondary" | "gold"; t: string };
}[] = [
  {
    value: "klient",
    title: "Klient (pożyczkobiorca)",
    desc: "Złóż wniosek o pożyczkę pod zastaw nieruchomości.",
    icon: Building2,
    badge: { v: "accent", t: "Klient" },
  },
  {
    value: "inwestor",
    title: "Inwestor",
    desc: "Przeglądaj oferty i inwestuj w pożyczki zabezpieczone hipotecznie.",
    icon: LineChart,
    badge: { v: "secondary", t: "Inwestor" },
  },
];

const HERO_COPY: Record<SignupRole, { title: string; lead: string }> = {
  klient: {
    title: "Załóż konto klienta",
    lead: "Zostaw dane kontaktowe — wyślemy link do logowania i przeprowadzimy Cię do bezpłatnego wniosku o finansowanie.",
  },
  inwestor: {
    title: "Załóż konto inwestora",
    lead: "Dołącz do Klubu Inwestorów Hipotecznych — uzyskasz dostęp do spraw, edukacji, dokumentów i narzędzi AI.",
  },
};

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
    const target = role === "inwestor" ? "/inwestor" : "/klient";
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

  const hero = HERO_COPY[role];

  return (
    <div className="fy-marketing">
      <SiteHeader page={role} />

      <section className="fy-hero" style={{ color: "#fff" }}>
        <div aria-hidden className="fy-hero-fx" />
        <div
          style={{
            position: "relative",
            maxWidth: "48rem",
            margin: "0 auto",
            padding: "3rem 1.5rem 2rem",
            textAlign: "center",
          }}
        >
          <MktBadge variant={ROLE_TILES.find((t) => t.value === role)!.badge.v}>
            {ROLE_TILES.find((t) => t.value === role)!.badge.t}
          </MktBadge>
          <h1
            style={{
              marginTop: "0.8rem",
              fontSize: "clamp(1.8rem, 3.4vw, 2.5rem)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            {hero.title}
          </h1>
          <p
            style={{
              marginTop: "0.7rem",
              fontSize: "1rem",
              color: "rgba(255,255,255,.8)",
              maxWidth: "34rem",
              marginInline: "auto",
            }}
          >
            {hero.lead}
          </p>
        </div>
      </section>

      <div
        style={{
          maxWidth: "42rem",
          margin: "-1.5rem auto 0",
          padding: "0 1.5rem 4rem",
          position: "relative",
          zIndex: 2,
        }}
      >
        <Card className="border-border shadow-2xl">
          <CardContent className="space-y-6 p-6 md:p-8">
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
                <div className="grid gap-3 sm:grid-cols-2">
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

                <SocialSignIn
                  labelPrefix="Zarejestruj się"
                  onBeforeSignIn={() => {
                    // Zapamiętaj wybraną rolę — po powrocie z Google trafi do
                    // /wybor-panelu (0 ról → /wybor-roli), a auto-fix w use-auth
                    // dopilnuje nadania właściwej roli.
                    try {
                      window.localStorage.setItem("pending_role_selection", role);
                    } catch {
                      // localStorage niedostępny (np. tryb prywatny) — pomiń
                    }
                  }}
                />
                <AuthDivider label="lub e-mailem" />
                <form className="space-y-4" onSubmit={submit}>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="fn">Imię</Label>
                      <Input
                        id="fn"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ln">Nazwisko</Label>
                      <Input
                        id="ln"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
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
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
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

      <SiteFooter />
    </div>
  );
}
