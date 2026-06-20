import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, CalendarDays, Info, Lock, Send, Loader2 } from "lucide-react";
import { formatPLN, securityTypeLabels, monthlyPayment, type SecurityType } from "@/lib/loan-math";
import { loanStatusLabels, formatPLNCompact } from "@/lib/labels";
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
  const [, setDocsCount] = useState(0);
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

  // Edytowalne parametry harmonogramu — live preview
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editMonths, setEditMonths] = useState<number>(0);
  const [editRate, setEditRate] = useState<number>(0);
  const [editMaxPayment, setEditMaxPayment] = useState<number>(0);
  const [sendingToInvestors, setSendingToInvestors] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loan) return;
    setEditAmount(Number(loan.loan_amount ?? 200_000));
    setEditMonths(Number(loan.preferred_period_months ?? 24));
    setEditRate(Number(loan.annual_investor_rate ?? 24));
    setEditMaxPayment(Number(loan.max_monthly_payment ?? 0));
  }, [loan?.id]);

  // Autozapis edycji harmonogramu (debounced) — tylko gdy wniosek nieblokowany
  useEffect(() => {
    if (!loan?.id || locked) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void supabase.from("loan_applications").update({
        loan_amount: editAmount,
        preferred_period_months: editMonths,
        annual_investor_rate: editRate,
        max_monthly_payment: editMaxPayment || null,
      }).eq("id", loan.id);
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [editAmount, editMonths, editRate, editMaxPayment, loan?.id, locked]);

  const schedule = useMemo(() => {
    const amount = editAmount;
    const months = editMonths;
    const annual = editRate;
    const maxPayment = editMaxPayment;
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
  }, [editAmount, editMonths, editRate, editMaxPayment]);

  const missingForInvestors = useMemo(() => {
    const m: string[] = [];
    if (!client?.first_name || !client?.phone) m.push("dane kontaktowe");
    if (!prop?.property_type) m.push("typ zabezpieczenia");
    if (!prop?.land_register_number && !prop?.area_sqm) m.push("numer KW lub powierzchnia");
    if (!loan?.investor_description) m.push("krótki opis dla inwestora");
    if (!editAmount || !editMonths || !editRate) m.push("warunki finansowe");
    return m;
  }, [client, prop, loan, editAmount, editMonths, editRate]);

  const sendToInvestors = async () => {
    if (!loan?.id) return;
    if (missingForInvestors.length > 0) {
      toast.error(`Aby wysłać do inwestorów uzupełnij: ${missingForInvestors.join(", ")}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSendingToInvestors(true);
    try {
      const { error } = await supabase.from("loan_applications").update({
        loan_amount: editAmount,
        preferred_period_months: editMonths,
        annual_investor_rate: editRate,
        max_monthly_payment: editMaxPayment || null,
        status: "wyslany_do_inwestorow",
      }).eq("id", loan.id);
      if (error) throw error;
      toast.success("Wniosek wysłany do inwestorów. Powiadomimy Cię o decyzji.");
      setRefreshTick((t) => t + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się wysłać wniosku");
    } finally {
      setSendingToInvestors(false);
    }
  };


  const statusLabel = loan ? (loanStatusLabels[loan.status as keyof typeof loanStatusLabels] ?? loan.status) : null;
  const completeness = Number(loan?.completeness_percent ?? 0);

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">Mój wniosek</h1>
          <p className="text-sm text-muted-foreground">
            {locked
              ? "Wniosek jest w analizie — dane są zablokowane do edycji."
              : "Uzupełnij dane, sprawdź podsumowanie i wstępny harmonogram spłat."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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

          </div>

          {/* Kalkulator raty przeniesiony do osobnego modułu: /klient/kalkulator */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Oblicz ratę i wyślij do inwestorów</CardTitle>
              <CardDescription>
                Edycja warunków, harmonogram spłat i wysyłka wniosku znajdują się teraz w osobnym module „Oblicz ratę”.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="cta" size="lg" className="w-full sm:w-auto">
                <Link to="/klient/kalkulator"><Send className="mr-2 h-4 w-4" />Przejdź do kalkulatora raty</Link>
              </Button>
            </CardContent>
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
