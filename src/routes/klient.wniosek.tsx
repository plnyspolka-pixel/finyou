import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Pencil, Sparkles, FileText, Send } from "lucide-react";
import { formatPLN, securityTypeLabels } from "@/lib/loan-math";
import { loanStatusLabels } from "@/lib/labels";

export const Route = createFileRoute("/klient/wniosek")({
  component: KlientWniosekSummary,
});

function KlientWniosekSummary() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<any | null>(null);
  const [prop, setProp] = useState<any | null>(null);
  const [docsCount, setDocsCount] = useState(0);
  const [client, setClient] = useState<any | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: c } = await supabase.from("clients").select("*").eq("user_id", user.id).maybeSingle();
    setClient(c);
    if (!c) { setLoading(false); return; }
    const { data: la } = await supabase.from("loan_applications").select("*")
      .eq("client_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setLoan(la);
    if (la) {
      const { data: p } = await supabase.from("properties").select("*").eq("loan_application_id", la.id).maybeSingle();
      setProp(p);
      const { count } = await supabase.from("documents").select("*", { count: "exact", head: true }).eq("loan_application_id", la.id);
      setDocsCount(count ?? 0);
    }
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [user]);

  if (loading) return <div className="text-muted-foreground">Ładowanie…</div>;

  if (!loan) {
    return (
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Nie masz jeszcze wniosku</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">Złóż wniosek, żeby zobaczyć tu jego podsumowanie.</p>
          <Button variant="cta" size="cta" onClick={() => navigate({ to: "/wniosek-zabezpieczenie" })}>Złóż wniosek</Button>
        </CardContent>
      </Card>
    );
  }

  const statusLabel = loanStatusLabels[loan.status as keyof typeof loanStatusLabels] ?? loan.status;
  const completeness = Number(loan.completeness_percent ?? 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Mój wniosek</h1>
          <p className="text-sm text-muted-foreground">Podsumowanie i edycja Twojego wniosku o pożyczkę.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{statusLabel}</Badge>
          <Button size="sm" variant="outline" asChild>
            <Link to="/wniosek-formularz"><Pencil className="mr-2 h-4 w-4" /> Edytuj wniosek</Link>
          </Button>
        </div>
      </div>

      {completeness < 100 && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Kompletność wniosku</span><span>{completeness}%</span>
            </div>
            <Progress value={completeness} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Warunki finansowe</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row label="Kwota">{loan.loan_amount ? formatPLN(Number(loan.loan_amount)) : "—"}</Row>
            <Row label="Okres">{loan.preferred_period_months ? `${loan.preferred_period_months} mies.` : "—"}</Row>
            <Row label="Maks. rata">{loan.max_monthly_payment ? formatPLN(Number(loan.max_monthly_payment)) : "—"}</Row>
            <Row label="Oprocentowanie roczne (dla inwestora)">{loan.annual_investor_rate ? `${loan.annual_investor_rate}%` : "—"}</Row>
            <Separator className="my-2" />
            <Button size="sm" variant="ghost" asChild><Link to="/wniosek-warunki"><Pencil className="mr-2 h-4 w-4" /> Zmień warunki</Link></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Nieruchomość (zabezpieczenie)</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row label="Typ">{prop?.property_type ? (securityTypeLabels as any)[prop.property_type] ?? prop.property_type : "—"}</Row>
            <Row label="Adres">{[prop?.street, prop?.city, prop?.voivodeship].filter(Boolean).join(", ") || "—"}</Row>
            <Row label="KW">{prop?.land_register_number || "—"}</Row>
            <Row label="Powierzchnia">{prop?.area_sqm ? `${prop.area_sqm} m²` : "—"}</Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Dane kontaktowe</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row label="Imię i nazwisko">{[client?.first_name, client?.last_name].filter(Boolean).join(" ") || "—"}</Row>
            <Row label="E-mail">{client?.email || "—"}</Row>
            <Row label="Telefon">{client?.phone || "—"}</Row>
            <Separator className="my-2" />
            <Button size="sm" variant="ghost" asChild><Link to="/klient/profil"><Pencil className="mr-2 h-4 w-4" /> Edytuj profil</Link></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Dokumenty</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row label="Wgranych plików">{docsCount}</Row>
            <Row label="Status KW">{loan.kw_status ?? "—"}</Row>
            <Separator className="my-2" />
            <Button size="sm" variant="ghost" asChild><Link to="/wniosek-formularz"><Pencil className="mr-2 h-4 w-4" /> Dodaj / zarządzaj</Link></Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Opis dla inwestora</CardTitle>
          <CardDescription>Cel biznesowy, na który mają zostać przeznaczone środki — widoczny dla inwestorów rozpatrujących Twój wniosek.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loan.investor_description ? (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{loan.investor_description}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nie dodano jeszcze opisu dla inwestora.</p>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link to="/wniosek-opis">
              <Pencil className="mr-2 h-4 w-4" /> {loan.investor_description ? "Edytuj opis" : "Dodaj opis"}
            </Link>
          </Button>
        </CardContent>
      </Card>

      {loan.status === "w_trakcie_uzupelniania" && (
        <div className="flex justify-end">
          <Button onClick={() => navigate({ to: "/wniosek-opis" })}>
            <Send className="mr-2 h-4 w-4" /> Przejdź do wysłania wniosku
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
