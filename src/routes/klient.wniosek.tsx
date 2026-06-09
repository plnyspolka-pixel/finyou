import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Pencil, Sparkles, FileText, CalendarDays, Info } from "lucide-react";
import { formatPLN, securityTypeLabels } from "@/lib/loan-math";
import { loanStatusLabels } from "@/lib/labels";
import { LinearLoanApplication } from "@/components/loan-application-variants";
import { buildDirectorSchedule } from "@/lib/client-profile-math";

export const Route = createFileRoute("/klient/wniosek")({
  component: KlientWniosek,
});

function KlientWniosek() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<any | null>(null);
  const [prop, setProp] = useState<any | null>(null);
  const [docsCount, setDocsCount] = useState(0);
  const [client, setClient] = useState<any | null>(null);

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
      }
    }
    setLoading(false);
  })(); }, [user]);

  const schedule = useMemo(() => {
    if (!loan) return null;
    const amount = Number(loan.loan_amount ?? 0);
    const months = Number(loan.preferred_period_months ?? 0);
    const maxPayment = Number(loan.max_monthly_payment ?? 0);
    const annual = Number(loan.annual_investor_rate ?? 0);
    if (!amount || !months || !maxPayment || !annual) return null;
    return buildDirectorSchedule({
      netAmountToClient: amount,
      creditedCommission: 0,
      maxMonthlyPaymentByClient: maxPayment,
      loanTermMonths: months,
      investorMonthlyReturnType: "amount",
      investorMonthlyReturnAmount: maxPayment,
      annualInterestPercent: annual,
      payoutDate: new Date().toISOString().slice(0, 10),
    });
  }, [loan]);

  const statusLabel = loan ? (loanStatusLabels[loan.status as keyof typeof loanStatusLabels] ?? loan.status) : null;
  const completeness = Number(loan?.completeness_percent ?? 0);

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Mój wniosek</h1>
          <p className="text-sm text-muted-foreground">Uzupełnij dane, sprawdź podsumowanie i wstępny harmonogram spłat.</p>
        </div>
        {statusLabel && <Badge variant="secondary">{statusLabel}</Badge>}
      </div>

      {/* 1. Wniosek — ten sam co na landingu */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Wypełnij wniosek</CardTitle>
          <CardDescription>
            Ten sam formularz, co na stronie głównej. Twoje dane zapisują się automatycznie do Twojego profilu.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <LinearLoanApplication embedded />
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
          {/* 2. Podsumowanie */}
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
                <Button size="sm" variant="ghost" asChild><Link to="/klient/profil"><Pencil className="mr-2 h-4 w-4" /> Edytuj profil</Link></Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Dokumenty</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <Row label="Wgranych plików">{docsCount}</Row>
                <Row label="Status KW">{loan.kw_status ?? "—"}</Row>
                <Separator className="my-2" />
                <Button size="sm" variant="ghost" asChild><Link to="/klient/dokumenty"><Pencil className="mr-2 h-4 w-4" /> Zarządzaj</Link></Button>
              </CardContent>
            </Card>
          </div>

          {loan.investor_description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Opis dla inwestora</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{loan.investor_description}</p>
              </CardContent>
            </Card>
          )}

          {/* 3. Harmonogram */}
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
                  <Metric label="Suma do spłaty" value={formatPLN(schedule.totalClientObligation)} />
                  <Metric label="Rata miesięczna" value={formatPLN(schedule.expectedMonthlyInvestorReturn)} />
                  <Metric label="Rata balonowa" value={formatPLN(schedule.balloonPayment)} />
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2 text-right">Rata</th>
                        <th className="px-3 py-2 text-right">Kapitał</th>
                        <th className="px-3 py-2 text-right">Odsetki</th>
                        <th className="px-3 py-2 text-right">Opłata za ryzyko</th>
                        <th className="px-3 py-2 text-right">Pozostały kapitał</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.rows.map((r) => (
                        <tr key={String(r.index)} className={r.index === "Balon" ? "border-t bg-primary/5 font-medium" : "border-t"}>
                          <td className="px-3 py-2">{r.index}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                          <td className="px-3 py-2 text-right">{formatPLN(r.paymentAmount)}</td>
                          <td className="px-3 py-2 text-right">{formatPLN(r.capital)}</td>
                          <td className="px-3 py-2 text-right">{formatPLN(r.interest)}</td>
                          <td className="px-3 py-2 text-right">{formatPLN(r.riskFee)}</td>
                          <td className="px-3 py-2 text-right">{formatPLN(r.remainingCapital)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(schedule.warnings.length > 0 || schedule.infos.length > 0) && (
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {schedule.warnings.map((w, i) => (
                      <div key={`w${i}`} className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                      </div>
                    ))}
                    {schedule.infos.map((it, i) => (
                      <div key={`i${i}`} className="flex items-start gap-2">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {it}
                      </div>
                    ))}
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
