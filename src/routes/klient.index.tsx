import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, FolderOpen, Sparkles, Tag, MessageSquare } from "lucide-react";
import { loanStatusLabels } from "@/lib/labels";

export const Route = createFileRoute("/klient/")({
  component: KlientHome,
});

function KlientHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [loanStatus, setLoanStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: c } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!c) {
        void navigate({ to: "/wniosek-formularz" });
        return;
      }
      const { data: la } = await supabase
        .from("loan_applications")
        .select("status")
        .eq("client_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!la || la.status === "w_trakcie_uzupelniania") {
        void navigate({ to: "/wniosek-formularz" });
        return;
      }
      setLoanStatus(la.status);
      setChecking(false);
    })();
  }, [user, navigate]);

  if (checking) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Twój wniosek</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status: <span className="font-semibold text-foreground">{loanStatusLabels[loanStatus ?? ""] ?? loanStatus}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Co dalej?</CardTitle>
          <CardDescription>
            Twój wniosek trafił do analizy. Tu znajdziesz wszystkie informacje o jego statusie i ofertach.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Tile to="/klient/status" icon={<Sparkles className="h-4 w-4" />} label="Opis i analiza" />
          <Tile to="/klient/dokumenty" icon={<FolderOpen className="h-4 w-4" />} label="Dokumenty" />
          <Tile to="/klient/oferta" icon={<Tag className="h-4 w-4" />} label="Oferty inwestorów" />
          <Tile to="/klient/wiadomosci" icon={<MessageSquare className="h-4 w-4" />} label="Wiadomości" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chcesz coś zmienić we wniosku?</CardTitle>
          <CardDescription>Możesz wrócić do formularza i zaktualizować dane.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/wniosek-formularz">
              <FileText className="mr-2 h-4 w-4" /> Edytuj wniosek
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Button asChild variant="outline" className="h-auto justify-start py-4">
      <Link to={to}>
        <span className="mr-3">{icon}</span>
        {label}
      </Link>
    </Button>
  );
}
