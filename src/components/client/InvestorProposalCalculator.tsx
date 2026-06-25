import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Info, Lock, Send, Loader2, Sparkles, Building2, Home, Trees, Map as MapIcon, Store, FileQuestion, Check } from "lucide-react";
import { loanStatusLabels } from "@/lib/labels";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { assistBusinessDescription } from "@/lib/ai-assist.functions";
import { OfferCalculatorPanel } from "@/components/landing/offer-calculator-panel";
import { FancyShell } from "@/components/landing/fancy-shell";
import { securityTypeLabels, type SecurityType } from "@/lib/loan-math";
import { cn } from "@/lib/utils";

const PROPERTY_TILES: { type: SecurityType; icon: typeof Building2 }[] = [
  { type: "mieszkanie", icon: Building2 },
  { type: "dom", icon: Home },
  { type: "grunt_rolny", icon: Trees },
  { type: "dzialka_budowlana", icon: MapIcon },
  { type: "lokal_uslugowy", icon: Store },
  { type: "inna", icon: FileQuestion },
];

// Klient może swobodnie zmieniać parametry propozycji aż do momentu, w którym
// pojawi się konkretna oferta od inwestora lub umowa wchodzi w realizację.
const LOCKED_STATUSES = new Set<string>([
  "oferta_od_inwestora", "oferta_przekazana_klientowi",
  "zaakceptowany_przez_klienta", "do_umowy", "zamkniety", "archiwalny",
]);

export function InvestorProposalCalculator({
  filesSlot,
  lockReason,
}: {
  filesSlot?: React.ReactNode;
  lockReason?: string | null;
} = {}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<any | null>(null);
  const [prop, setProp] = useState<any | null>(null);
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
      }
    }
    setLoading(false);
  })(); }, [user, refreshTick]);

  const locked = !!(loan?.status && LOCKED_STATUSES.has(loan.status));

  const [amount, setAmount] = useState<number>(200_000);
  const [months, setMonths] = useState<number>(24);
  const [annualRate, setAnnualRate] = useState<number>(30);
  const [maxPayment, setMaxPayment] = useState<number>(0);
  const [canExtend, setCanExtend] = useState<boolean>(false);
  const [propertyType, setPropertyType] = useState<SecurityType | null>(null);
  const [savingPropertyType, setSavingPropertyType] = useState(false);
  const [investorDesc, setInvestorDesc] = useState<string>("");
  const [savingDesc, setSavingDesc] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [sendingToInvestors, setSendingToInvestors] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateTouchedRef = useRef(false);
  const assistDesc = useServerFn(assistBusinessDescription);

  useEffect(() => {
    if (!loan) return;
    setAmount(Number(loan.loan_amount ?? 200_000));
    setMonths(Number(loan.preferred_period_months ?? 24));
    setAnnualRate(Number(loan.annual_investor_rate ?? 30));
    setMaxPayment(Number(loan.max_monthly_payment ?? 0));
    setInvestorDesc(String(loan.investor_description ?? ""));
    rateTouchedRef.current = true;
  }, [loan?.id]);

  useEffect(() => {
    if (prop?.property_type) setPropertyType(prop.property_type as SecurityType);
  }, [prop?.id, prop?.property_type]);

  const savePropertyType = async (t: SecurityType) => {
    setPropertyType(t);
    if (!loan?.id || locked) return;
    setSavingPropertyType(true);
    try {
      if (prop?.id) {
        await supabase.from("properties").update({ property_type: t }).eq("id", prop.id);
      } else {
        await supabase.from("properties").insert({ loan_application_id: loan.id, property_type: t });
      }
      setRefreshTick((x) => x + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się zapisać typu nieruchomości");
    } finally {
      setSavingPropertyType(false);
    }
  };

  // Max okres spłaty maleje wraz z kwotą (jak na landingu).
  const maxMonths = useMemo(() => {
    if (amount <= 400_000) return 72;
    const t = Math.min(1, Math.max(0, (amount - 400_000) / (1_000_000 - 400_000)));
    return Math.round(36 - t * (36 - 12));
  }, [amount]);

  useEffect(() => {
    if (months > maxMonths) setMonths(maxMonths);
  }, [maxMonths, months]);

  useEffect(() => {
    if (!loan?.id || locked) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void supabase.from("loan_applications").update({
        loan_amount: amount,
        preferred_period_months: months,
        annual_investor_rate: annualRate,
        max_monthly_payment: maxPayment || null,
      }).eq("id", loan.id);
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [amount, months, annualRate, maxPayment, loan?.id, locked]);


  const hasDesc = investorDesc.trim().length >= 20;

  const missingForInvestors = useMemo(() => {
    const m: string[] = [];
    if (!client?.first_name || !client?.phone) m.push("dane kontaktowe");
    if (!prop?.property_type) m.push("typ zabezpieczenia");
    if (!prop?.land_register_number && !prop?.area_sqm) m.push("numer KW lub powierzchnia");
    if (!hasDesc) m.push("krótki opis dla inwestora");
    if (!amount || !months || !annualRate) m.push("warunki finansowe");
    return m;
  }, [client, prop, hasDesc, amount, months, annualRate]);

  const saveInvestorDesc = async () => {
    if (!loan?.id) return;
    if (investorDesc.trim().length < 20) { toast.error("Opis powinien mieć min. 20 znaków"); return; }
    setSavingDesc(true);
    try {
      const { error } = await supabase.from("loan_applications")
        .update({ investor_description: investorDesc.trim() }).eq("id", loan.id);
      if (error) throw error;
      toast.success("Opis zapisany");
      setRefreshTick((t) => t + 1);
    } catch (e: any) { toast.error(e?.message ?? "Błąd zapisu"); }
    finally { setSavingDesc(false); }
  };

  const generateDesc = async (mode: "draft" | "improve" | "expand") => {
    if (!loan?.id) { toast.error("Brak wniosku"); return; }
    setAiBusy(true);
    const t = toast.loading("Generuję opis…");
    try {
      const res: any = await assistDesc({ data: { currentText: investorDesc, mode, loanId: loan.id } });
      if (res?.text) setInvestorDesc(String(res.text));
      toast.success("Gotowe — sprawdź i popraw wedle uznania.", { id: t });
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd AI", { id: t });
    } finally { setAiBusy(false); }
  };

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
        loan_amount: amount,
        preferred_period_months: months,
        annual_investor_rate: annualRate,
        max_monthly_payment: maxPayment || null,
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

  if (loading) return <p className="text-sm text-muted-foreground">Ładowanie kalkulatora…</p>;

  if (!loan) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Najpierw wypełnij wniosek — wtedy uruchomimy tu kalkulator raty.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      {(locked || statusLabel) && (
        <div className="flex flex-wrap items-center gap-2">
          {locked && <Badge className="gap-1"><Lock className="h-3.5 w-3.5" /> Zablokowany do edycji</Badge>}
          {statusLabel && <Badge variant="secondary">{statusLabel}</Badge>}
        </div>
      )}

      <fieldset disabled={locked} className="contents">
        <FancyShell>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-foreground shadow-md">
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-white">
                Typ nieruchomości {savingPropertyType && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
              </span>
            </div>
            <p className="text-xs text-white/75">Wybierz, co stanowi zabezpieczenie — to wpływa na zainteresowanie inwestorów.</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {PROPERTY_TILES.map(({ type, icon: Icon }) => {
                const active = propertyType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => void savePropertyType(type)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center backdrop-blur-sm transition touch-manipulation select-none",
                      active
                        ? "border-white bg-white/20 ring-2 ring-white/40"
                        : "border-white/25 bg-white/5 hover:border-white/60 hover:bg-white/10",
                    )}
                  >
                    <Icon className={cn("h-7 w-7", active ? "text-white" : "text-white/70")} />
                    <span className="text-xs font-semibold text-white">{securityTypeLabels[type]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </FancyShell>

        {filesSlot}

        <div className="relative">
          <fieldset disabled={Boolean(lockReason)} className={cn("contents", lockReason && "pointer-events-none")}>
            <OfferCalculatorPanel
              amount={amount} setAmount={setAmount}
              months={months} setMonths={setMonths}
              maxMonths={maxMonths}
              canExtend={canExtend} setCanExtend={setCanExtend}
              annualRate={annualRate} setAnnualRate={setAnnualRate}
              rateTouchedRef={rateTouchedRef}
              maxPayment={maxPayment} setMaxPayment={setMaxPayment}
              headerLabel="Twoja oferta"
            />
          </fieldset>
          {lockReason && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-2xl bg-background/55 backdrop-blur-[2px]">
              <div className="pointer-events-auto mt-6 flex max-w-md items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 shadow-lg dark:bg-amber-950 dark:text-amber-100">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{lockReason}</span>
              </div>
            </div>
          )}
        </div>
      </fieldset>

      {!locked && (
        <div className="space-y-4">
          <FancyShell>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                    <Sparkles className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                  <div className="leading-tight">
                    <div className="text-base font-bold uppercase tracking-[0.16em]">Krótki opis dla inwestora</div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">2–5 zdań — po co i jak spłacisz</div>
                  </div>
                </div>
                {hasDesc && <span className="rounded-full bg-emerald-400/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100 ring-1 ring-emerald-300/50">✓ uzupełniony</span>}
              </div>
              <Textarea
                rows={5}
                value={investorDesc}
                onChange={(e) => setInvestorDesc(e.target.value)}
                placeholder="Np. Potrzebuję 200 000 zł na uruchomienie kolejnego sklepu, mam już 2 lokalizacje. Spłatę pokryję z bieżących przychodów…"
                disabled={aiBusy}
                className="rounded-2xl border-2 border-white/25 bg-white/10 text-white placeholder:text-white/50 backdrop-blur-sm focus-visible:border-white/70 focus-visible:ring-white/40"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => void generateDesc(investorDesc.trim() ? "improve" : "draft")}
                  disabled={aiBusy}
                  className="rounded-xl bg-white/20 font-semibold text-white ring-1 ring-white/30 backdrop-blur-sm hover:bg-white/30"
                >
                  {aiBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {investorDesc.trim() ? "Popraw opis (AI)" : "Wygeneruj opis (AI)"}
                </Button>
                {investorDesc.trim() && (
                  <Button
                    size="sm"
                    onClick={() => void generateDesc("expand")}
                    disabled={aiBusy}
                    className="rounded-xl bg-transparent font-semibold text-white/90 ring-1 ring-white/30 hover:bg-white/10"
                  >
                    Rozwiń (AI)
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => void saveInvestorDesc()}
                  disabled={savingDesc || aiBusy}
                  className="rounded-xl bg-white text-slate-900 font-semibold hover:bg-white/90"
                >
                  {savingDesc ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Zapisz opis
                </Button>
              </div>
            </div>
          </FancyShell>

          <div className="space-y-3">
            {missingForInvestors.length > 0 && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Aby wysłać wniosek, uzupełnij jeszcze: <strong>{missingForInvestors.join(", ")}</strong>.</span>
              </div>
            )}
            <Button
              onClick={() => void sendToInvestors()}
              disabled={sendingToInvestors}
              className="h-16 w-full rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 text-lg font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_45px_-12px_oklch(0.55_0.18_150/0.7)] ring-1 ring-emerald-300/50 transition hover:from-emerald-400 hover:via-emerald-500 hover:to-emerald-600 hover:shadow-[0_20px_55px_-12px_oklch(0.55_0.18_150/0.85)] disabled:opacity-60"
            >
              {sendingToInvestors
                ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Wysyłam…</>
                : <><Send className="mr-3 h-6 w-6" />Wyślij wniosek</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
