import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { selectAccountRole } from "@/lib/account-role.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, LineChart } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/wybor-roli")({
  component: RolePickerPage,
});

type Pick = "klient" | "inwestor";

function RolePickerPage() {
  const navigate = useNavigate();
  const { user, loading, refreshRoles } = useAuth();
  const selectRoleFn = useServerFn(selectAccountRole);
  const [submitting, setSubmitting] = useState<Pick | null>(null);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Ładowanie…</div>
    );
  }
  if (!user) return <Navigate to="/logowanie" />;

  const pick = async (role: Pick) => {
    setSubmitting(role);
    try {
      // Rolę zapisuje serwer.
      await selectRoleFn({ data: { role } });
      try {
        localStorage.removeItem("pending_role_selection");
      } catch {}
      await refreshRoles();
      toast.success("Konto skonfigurowane");
      navigate({
        to: role === "inwestor" ? "/inwestor" : "/klient",
      });
    } catch (e) {
      toast.error("Nie udało się zapisać wyboru", {
        description: e instanceof Error ? e.message : String(e),
      });
      setSubmitting(null);
    }
  };

  const tile = (role: Pick, Icon: typeof Building2, title: string, desc: string) => (
    <button
      type="button"
      disabled={submitting !== null}
      onClick={() => pick(role)}
      className="group flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-5 text-left transition hover:border-accent hover:bg-accent/5 disabled:opacity-50"
    >
      <Icon className="h-8 w-8 text-accent" />
      <div>
        <div className="font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </div>
      <span className="mt-auto text-sm font-medium text-accent">
        {submitting === role ? "Zapisywanie…" : `Kontynuuj jako ${title.toLowerCase()} →`}
      </span>
    </button>
  );

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>Wybierz typ konta</CardTitle>
          <CardDescription>Określ, w jakiej roli chcesz korzystać z platformy.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {tile("klient", Building2, "Klient", "Złóż wniosek o pożyczkę pod zastaw nieruchomości.")}
          {tile(
            "inwestor",
            LineChart,
            "Inwestor",
            "Przeglądaj oferty i inwestuj w zabezpieczone pożyczki.",
          )}
        </CardContent>
      </Card>
    </div>
  );
}
