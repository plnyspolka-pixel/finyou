import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Pencil, FileText, CalendarDays, Info, Lock } from "lucide-react";
import { formatPLN, securityTypeLabels, monthlyPayment, type SecurityType } from "@/lib/loan-math";
import { loanStatusLabels } from "@/lib/labels";
import { LinearLoanApplication, type LoanWizardPrefill } from "@/components/loan-application-variants";
import { toast } from "sonner";

export const Route = createFileRoute("/klient/wniosek")({
  component: KlientWniosek,
});

// Statusy, w których wniosek jest już "wysłany" i nie powinien być edytowany.
const LOCKED_STATUSES = new Set<string>([
  "wniosek_kompletny",
  "do_analizy",
  "rokuje",
  "nie_rokuje",
  "wyslany_do_inwestorow",
  "oferta_od_inwestora",
  "oferta_przekazana_klientowi",
  "zaakceptowany_przez_klienta",
  "do_umowy",
  "zamkniety",
  "archiwalny",
]);

function KlientWniosek() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<any | null>(null);
  const [prop, setProp] = useState<any | null>(null);
  const [docsCount, setDocsCount] = useState(0);
  const [client, setClient] = useState<any | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => { void (async () => {
    if (!user) return;
    setLoading(true);
    const { data: c } = await supabase.from("clients").select("*").eq("user_id", user.id).maybeSingle();
    setClient(c);
    if (c) {
      const { data: la } = await supabase.from("loan_applications").select("*")
        .eq("client_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      setLoan(la);
      if (la) {
        const { data: p } = await supabase.from("properties").select("*").eq("loan_application_id", la.id).maybeSingle();
        setProp(p);
        const { count } = await supabase.from("documents").select("*", { count: "exact", head: true }).eq("loan_application_id", la.id);
        setDocsCount(count ?? 0);
      } else {
        setProp(null);
        setDocsCount(0);
      }
    }
    setLoading(false);
  })(); }, [user, refreshTick]);

  const locked = !!(loan?.status && LOCKED_STATUSES.has(loan.status));

  // Prefill kreatora z istniejących danych klienta
  const prefill = useMemo<LoanWizardPrefill | undefined>(() => {
    if (!client && !loan && !prop) return undefined;
    return {
      amount: loan?.loan_amount ? Number(loan.loan_amount) : undefined,
      months: loan?.preferred_period_months ? Number(loan.preferred_period_months) : undefined,
      annualRate: loan?.annual_investor_rate ? Number(loan.annual_investor_rate) : undefined,
      maxPayment: loan?.max_monthly_payment ? Number(loan.max_monthly_payment) : undefined,
      secType: (prop?.property_type as SecurityType | undefined) ?? undefined,
      kwNumber: prop?.land_register_number ?? undefined,
      kwChoice: prop?.land_register_number ? "znam" : undefined,
      firstName: client?.first_name ?? undefined,
      lastName: client?.last_name ?? undefined,
      email: client?.email ?? undefined,
      phone: client?.phone ?? undefined,
    };
  }, [client, loan, prop]);

  // Zapis i zablokowanie wniosku po wysłaniu
  const handleSubmit = async (draft: {
    amount: number; months: number; annualRate: number; maxPayment: number;
    secType: SecurityType | null; kwNumber: string;
    firstName: string; lastName: string; email: string; phone: string;
  }) => {
    if (!user) {
      toast.error("Najpierw się zaloguj.");
      return;
    }
    let clientId = client?.id as string | undefined;
    if (!clientId) {
      const { data: created, error: ce } = await supabase.from("clients").insert({
        user_id: user.id,
        first_name: draft.firstName,
        last_name: draft.lastName,
        email: draft.email,
        phone: draft.phone,
        consent_rodo: true,
        source: "panel_klienta",
      }).select("id").single();
      if (ce || !created) throw ce ?? new Error("client insert failed");
      clientId = created.id;
    } else {
      await supabase.from("clients").update({
        first_name: draft.firstName || client.first_name,
        last_name: draft.lastName || client.last_name,
        email: draft.email || client.email,
        phone: draft.phone || client.phone,
      }).eq("id", clientId);
    }

    const loanPayload = {
      client_id: clientId!,
      loan_amount: draft.amount,
      preferred_period_months: draft.months,
      annual_investor_rate: draft.annualRate,
      max_monthly_payment: draft.maxPayment,
      status: "do_analizy" as const,
      source: loan?.source ?? "panel_klienta",
    };

    let loanId = loan?.id as string | undefined;
    if (loanId) {
      const { error: ue } = await supabase.from("loan_applications").update(loanPayload).eq("id", loanId);
      if (ue) throw ue;
    } else {
      const { data: created, error: le } = await supabase.from("loan_applications").insert(loanPayload).select("id").single();
      if (le || !created) throw le ?? new Error("loan insert failed");
      loanId = created.id;
    }

    const propPayload = {
      loan_application_id: loanId,
      property_type: draft.secType ?? "inna",
      land_register_number: draft.kwNumber || null,
    };
    if (prop?.id) {
      await supabase.from("properties").update(propPayload).eq("id", prop.id);
    } else {
      await supabase.from("properties").insert(propPayload);
    }

    toast.success("Wniosek wysłany do analizy. Skontaktujemy się z Tobą.");
    setRefreshTick((t) => t + 1);
  };

  // Poprawiony harmonogram — annuity z opcjonalną ratą balonową
  const schedule = useMemo(() => {
    if (!loan) return null;
    const amount = Number(loan.loan_amount ?? 0);
    const months = Number(loan.preferred_period_months ?? 0);
    const maxPayment = Number(loan.max_monthly_payment ?? 0);
    const annual = Number(loan.annual_investor_rate ?? 0);
    if (!amount || !months || !annual) return null;

    const nominalMonthly = monthlyPayment(amount, annual, months);
    const monthly = maxPayment > 0 ? Math.min(nominalMonthly, maxPayment) : nominalMonthly;
    const r = annual / 100 / 12;

    type Row = { index: number | "Balon"; date: string; payment: number; interest: number; capital: number; remaining: number };
    const rows: Row[] = [];
    let remaining = amount;
    const start = new Date();
    for (let i = 1; i <= months; i++) {
      const interest = remaining * r;
      let capital = Math.max(0, monthly - interest);
      if (capital > remaining) capital = remaining;
      const payment = interest + capital;
      remaining = Math.max(0, remaining - capital);
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      rows.push({ index: i, date: d.toLocaleDateString("pl-PL"), payment, interest, capital, remaining });
    }
    const balloon = remaining;
    if (balloon > 0.5) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + months);
      rows.push({ index: "Balon", date: d.toLocaleDateString("pl-PL"), payment: balloon, interest: 0, capital: balloon, remaining: 0 });
    }
    const total = rows.reduce((a, x) => a + x.payment, 0);
    return { rows, monthly, balloon, total, nominalMonthly };
  }, [loan]);

  const statusLabel = loan ? (loanStatusLabels[loan.status as keyof typeof loanStatusLabels] ?? loan.status) : null;
  const completeness = Number(loan?.completeness_percent ?? 0);

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Mój wniosek</h1>
          <p className="text-sm text-muted-foreground">
            {locked
              ? "Wniosek jest w analizie — dane są zablokowane do edycji."
              : "Uzupełnij dane, sprawdź podsumowanie i wstępny harmonogram spłat."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {locked && <Badge className="gap-1"><Lock className="h-3.5 w-3.5" /> Zablokowany</Badge>}
          {statusLabel && <Badge variant="secondary">{statusLabel}</Badge>}
        </div>
      </div>

      {/* 1. Wniosek — ten sam co na landingu, ale prefillowany i zamykany po wysyłce */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">{locked ? "Wysłany wniosek" : "Wypełnij wniosek"}</CardTitle>
          <CardDescription>
            {locked
              ? "Wniosek został przekazany do analizy. Jeśli chcesz coś zmienić — napisz do nas."
              : "Twoje dane są wczytane automatycznie. Po wysłaniu wniosek zostanie zablokowany do edycji."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <LinearLoanApplication
            embedded
            prefill={prefill}
            locked={locked}
            onSubmit={handleSubmit}
          />
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Ładowanie podsumowania…</p>
      ) : !loan ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Po wypełnieniu pierwszego kroku wniosku pojawi się tu Twoje podsumowanie i wstępny harmonogram spłat.
          </CardContent>
        </Card>
      ) : (
        <>
          {completeness > 0 && completeness < 100 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Kompletność wniosku</span>
                <span className="font-medium">{completeness}%</span>
              </div>
              <Progress value={completeness} />
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Warunki finansowe</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <Row label="Kwota">{loan.loan_amount ? formatPLN(Number(loan.loan_amount)) : "—"}</Row>
                <Row label="Okres">{loan.preferred_period_months ? `${loan.preferred_period_months} mies.` : "—"}</Row>
                <Row label="Maks. rata">{loan.max_monthly_payment ? formatPLN(Number(loan.max_monthly_payment)) : "—"}</Row>
                <Row label="Oprocentowanie roczne">{loan.annual_investor_rate ? `${loan.annual_investor_rate}%` : "—"}</Row>
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
                <Button size="sm" variant="ghost" asChild disabled={locked}>
                  <Link to="/klient/profil"><Pencil className="mr-2 h-4 w-4" /> Edytuj profil</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Dokumenty</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <Row label="Wgranych plików">{docsCount}</Row>
                <Row label="Status KW">{loan.kw_status ?? "—"}</Row>
                <Separator className="my-2" />
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/klient/dokumenty"><Pencil className="mr-2 h-4 w-4" /> Zarządzaj</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* 3. Harmonogram — annuity z balonem */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Harmonogram spłat</CardTitle>
              <CardDescription>
                {schedule
                  ? "Wstępna kalkulacja na podstawie podanych warunków. Ostateczny harmonogram dostaniesz po przyjęciu oferty przez inwestora."
                  : "Harmonogram pojawi się, kiedy uzupełnisz kwotę, okres, maks. ratę i oprocentowanie."}
              </CardDescription>
            </CardHeader>
            {schedule && (
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Rata miesięczna" value={formatPLN(schedule.monthly)} />
                  <Metric label="Rata balonowa" value={schedule.balloon > 0.5 ? formatPLN(schedule.balloon) : "—"} />
                  <Metric label="Suma do spłaty" value={formatPLN(schedule.total)} />
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2 text-right">Rata</th>
                        <th className="px-3 py-2 text-right">Odsetki</th>
                        <th className="px-3 py-2 text-right">Kapitał</th>
                        <th className="px-3 py-2 text-right">Pozostały kapitał</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.rows.map((r) => (
                        <tr key={String(r.index)} className={r.index === "Balon" ? "border-t bg-primary/5 font-medium" : "border-t"}>
                          <td className="px-3 py-2">{r.index}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                          <td className="px-3 py-2 text-right">{formatPLN(r.payment)}</td>
                          <td className="px-3 py-2 text-right">{formatPLN(r.interest)}</td>
                          <td className="px-3 py-2 text-right">{formatPLN(r.capital)}</td>
                          <td className="px-3 py-2 text-right">{formatPLN(r.remaining)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {schedule.balloon > 0.5 && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50/50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Twoja maksymalna rata jest niższa niż rata wymagana do pełnej spłaty w tym okresie — różnica trafia do ostatniej raty balonowej.
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}
