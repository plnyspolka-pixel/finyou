import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, defaultPathForRoles } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Building2, Users, LineChart, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, roles, loading, refreshRoles } = useAuth();

  // Po powrocie z Google OAuth: jeśli użytkownik wybrał rolę "inwestor", dopisz ją
  useEffect(() => {
    if (!user) return;
    const pending =
      typeof window !== "undefined" ? localStorage.getItem("pending_signup_role") : null;
    if (typeof window !== "undefined") localStorage.removeItem("pending_signup_role");
    if (pending !== "inwestor") return;
    (async () => {
      try {
        await supabase.from("user_roles").insert({ user_id: user.id, role: "inwestor" });
        await supabase.from("investors").insert({
          user_id: user.id,
          investor_type: "indywidualny",
          first_name: user.user_metadata?.first_name ?? null,
          last_name: user.user_metadata?.last_name ?? null,
          email: user.email ?? null,
          subscription_status: "nieaktywny",
        });
      } catch {
        // Ignore duplicates or unavailable optional profile data.
      }
      await refreshRoles();
    })();
  }, [user, refreshRoles]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Ładowanie…
      </div>
    );
  }

  if (user) {
    return <Navigate to={defaultPathForRoles(roles)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              FY
            </div>
            Panel Finance You
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost">
              <Link to="/logowanie">Zaloguj się</Link>
            </Button>
            <Button asChild>
              <Link to="/rejestracja">Załóż konto</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wider text-accent">Finance You</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Centralny system obsługi pożyczek zabezpieczonych na nieruchomościach
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Od pozyskania leada, przez kompletny wniosek, po dystrybucję ofert do inwestorów —
            wszystko w jednym miejscu, po polsku.
          </p>
          <div className="mt-8 flex gap-3">
            <Button asChild size="lg">
              <Link to="/rejestracja">Rozpocznij wniosek</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/logowanie">Panel administratora</Link>
            </Button>
          </div>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Users,
              title: "Panel administratora",
              desc: "Leady, wnioski, klienci, follow-up i statystyki konwersji.",
            },
            {
              icon: Building2,
              title: "Panel klienta",
              desc: "Wieloetapowy formularz z linkiem powrotu i statusem wniosku.",
            },
            {
              icon: LineChart,
              title: "Panel inwestora",
              desc: "Dostęp do wniosków zgodnie z planem abonamentowym.",
            },
            {
              icon: ShieldCheck,
              title: "Bezpieczeństwo",
              desc: "Role i polityki dostępu na poziomie bazy danych.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-5">
              <f.icon className="h-6 w-6 text-accent" />
              <h3 className="mt-3 font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
