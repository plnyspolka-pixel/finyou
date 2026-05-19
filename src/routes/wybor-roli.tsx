import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, LineChart } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/wybor-roli")({
  component: RolePickerPage,
});

function RolePickerPage() {
  const navigate = useNavigate();
  const { user, loading, refreshRoles } = useAuth();
  const [submitting, setSubmitting] = useState<"klient" | "inwestor" | null>(null);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Ładowanie…</div>
    );
  }
  if (!user) return <Navigate to="/logowanie" />;

  const pick = async (role: "klient" | "inwestor") => {
    setSubmitting(role);
    try {
      if (role === "inwestor") {
        await supabase
          .from("user_roles")
          .insert({ user_id: user.id, role: "inwestor" });
        await supabase.from("investors").insert({
          user_id: user.id,
          investor_type: "indywidualny",
          first_name: user.user_metadata?.first_name ?? user.user_metadata?.full_name ?? null,
          last_name: user.user_metadata?.last_name ?? null,
          email: user.email ?? null,
          subscription_status: "nieaktywny",
        });
        // Usuń domyślną rolę klienta przypisaną przez trigger, by inwestor trafiał do swojego panelu
        await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", user.id)
          .eq("role", "klient");
      }
      try {
        localStorage.removeItem("pending_role_selection");
      } catch {
        /* noop */
      }
      await refreshRoles();
      toast.success("Konto skonfigurowane");
      navigate({ to: role === "inwestor" ? "/inwestor" : "/klient" });
    } catch (e) {
      toast.error("Nie udało się zapisać wyboru", {
        description: e instanceof Error ? e.message : String(e),
      });
      setSubmitting(null);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Wybierz typ konta</CardTitle>
          <CardDescription>Określ, w jakiej roli chcesz korzystać z platformy.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => pick("klient")}
            className="group flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-5 text-left transition hover:border-accent hover:bg-accent/5 disabled:opacity-50"
          >
            <Building2 className="h-8 w-8 text-accent" />
            <div>
              <div className="font-semibold text-foreground">Klient (pożyczkobiorca)</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Złóż wniosek o pożyczkę zabezpieczoną na nieruchomości.
              </p>
            </div>
            <span className="mt-auto text-sm font-medium text-accent">
              {submitting === "klient" ? "Zapisywanie…" : "Kontynuuj jako klient →"}
            </span>
          </button>

          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => pick("inwestor")}
            className="group flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-5 text-left transition hover:border-accent hover:bg-accent/5 disabled:opacity-50"
          >
            <LineChart className="h-8 w-8 text-accent" />
            <div>
              <div className="font-semibold text-foreground">Inwestor indywidualny</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Przeglądaj oferty pożyczek i inwestuj zgodnie z planem abonamentowym.
              </p>
            </div>
            <span className="mt-auto text-sm font-medium text-accent">
              {submitting === "inwestor" ? "Zapisywanie…" : "Kontynuuj jako inwestor →"}
            </span>
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
