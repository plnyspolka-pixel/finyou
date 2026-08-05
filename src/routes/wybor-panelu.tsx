// Ekran tuż po zalogowaniu: jedna rola → automatyczne przejście do panelu,
// kilka ról → wybór panelu (pokazywany przy każdym logowaniu, bez zapamiętywania).
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { useAuth, panelsForRoles, type AppRole } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2,
  Calculator,
  Headset,
  LineChart,
  Loader2,
  ShieldCheck,
  Users,
} from "lucide-react";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/wybor-panelu")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Finance You — Wybierz panel" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PanelPickerPage,
});

const ROLE_ICONS: Record<AppRole, typeof Building2> = {
  administrator: ShieldCheck,
  operator: Headset,
  ksiegowosc: Calculator,
  posrednik: Users,
  inwestor: LineChart,
  klient: Building2,
};

function PanelPickerPage() {
  const navigate = useNavigate();
  const { user, roles, loading, signOut } = useAuth();
  const { next } = Route.useSearch();

  // Bezpieczny deep-link (np. powrót do konkretnego wniosku) ma pierwszeństwo.
  const nextPath = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  const panels = panelsForRoles(roles);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/logowanie", replace: true });
      return;
    }
    if (nextPath) {
      void navigate({ to: nextPath, replace: true });
      return;
    }
    if (panels.length === 0) {
      // Konto bez roli — najpierw wybór typu konta.
      void navigate({ to: "/wybor-roli", replace: true });
      return;
    }
    if (panels.length === 1) {
      void navigate({ to: panels[0].path, replace: true });
    }
  }, [loading, user, nextPath, roles, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !user || nextPath || panels.length < 2) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Przenosimy Cię do panelu…
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Wybierz panel</CardTitle>
          <CardDescription>
            Twoje konto ma kilka ról — zdecyduj, w którym panelu chcesz teraz pracować.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {panels.map((p) => {
              const Icon = ROLE_ICONS[p.role] ?? Building2;
              return (
                <button
                  key={p.role}
                  type="button"
                  onClick={() => void navigate({ to: p.path })}
                  className="group flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-5 text-left transition hover:border-accent hover:bg-accent/5"
                >
                  <Icon className="h-8 w-8 text-accent" />
                  <div>
                    <div className="font-semibold text-foreground">{p.title}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                  </div>
                  <span className="mt-auto text-sm font-medium text-accent">
                    Przejdź do panelu →
                  </span>
                </button>
              );
            })}
          </div>
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                void signOut().then(() => navigate({ to: "/logowanie" }));
              }}
              className="text-sm text-muted-foreground hover:underline"
            >
              To nie ja — wyloguj się
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
