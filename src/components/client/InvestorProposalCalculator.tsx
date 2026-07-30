import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Info,
  Lock,
  Send,
  Loader2,
  Building2,
  Home,
  Trees,
  Map as MapIcon,
  Store,
  FileQuestion,
  Check,
  MapPin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { loanStatusLabels } from "@/lib/labels";
import { toast } from "sonner";
import { OfferCalculatorPanel } from "@/components/landing/offer-calculator-panel";
import { FancyShell } from "@/components/landing/fancy-shell";
import { securityTypeLabels, type SecurityType } from "@/lib/loan-math";
import { containsValidKw } from "@/lib/kw";
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
  "oferta_od_inwestora",
  "oferta_przekazana_klientowi",
  "zaakceptowany_przez_klienta",
  "do_umowy",
  "zamkniety",
  "archiwalny",
]);

export function InvestorProposalCalculator({
  filesSlot,
  lockReason,
}: {
  filesSlot?: React.ReactNode;
  lockReason?: string | null;
} = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<any | null>(null);
  const [prop, setProp] = useState<any | null>(null);
  const [client, setClient] = useState<any | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    void (async () => {
      if (!user) return;
      setLoading(true);
      const { data: c } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      setClient(c);
      if (c) {
        const { data: la } = await supabase
          .from("loan_applications")
          .select("*")
          .eq("client_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setLoan(la);
        if (la) {
          const { data: p } = await supabase
            .from("properties")
            .select("*")
            .eq("loan_application_id", la.id)
            .maybeSingle();
          setProp(p);
        }
      }
      setLoading(false);
    })();
  }, [user, refreshTick]);

  const locked = !!(loan?.status && LOCKED_STATUSES.has(loan.status));

  const [amount, setAmount] = useState<number>(200_000);
  const [months, setMonths] = useState<number>(24);
  const [annualRate, setAnnualRate] = useState<number>(30);
  const [maxPayment, setMaxPayment] = useState<number>(0);
  const [propertyType, setPropertyType] = useState<SecurityType | null>(null);
  const [savingPropertyType, setSavingPropertyType] = useState(false);
  const [city, setCity] = useState<string>("");
  const citySaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sendingToInvestors, setSendingToInvestors] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateTouchedRef = useRef(false);

  useEffect(() => {
    if (!loan) return;
    setAmount(Number(loan.loan_amount ?? 200_000));
    setMonths(Number(loan.preferred_period_months ?? 24));
    setAnnualRate(Number(loan.annual_investor_rate ?? 30));
    setMaxPayment(Number(loan.max_monthly_payment ?? 0));
    rateTouchedRef.current = true;
  }, [loan?.id]);

  useEffect(() => {
    if (prop?.property_type) setPropertyType(prop.property_type as SecurityType);
    if (prop?.city) setCity(String(prop.city));
  }, [prop?.id, prop?.property_type, prop?.city]);

  const saveCity = (value: string) => {
    setCity(value);
    if (!loan?.id || locked) return;
    if (citySaveTimer.current) clearTimeout(citySaveTimer.current);
    citySaveTimer.current = setTimeout(async () => {
      const trimmed = value.trim();
      try {
        if (prop?.id) {
          await supabase
            .from("properties")
            .update({ city: trimmed || null })
            .eq("id", prop.id);
          setProp((prev: any) => (prev ? { ...prev, city: trimmed || null } : prev));
        } else {
          const { data: inserted } = await supabase
            .from("properties")
            .insert({ loan_application_id: loan.id, property_type: "inna", city: trimmed || null })
            .select("*")
            .maybeSingle();
          if (inserted) setProp(inserted);
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Nie udało się zapisać miejscowości");
      }
    }, 600);
  };

  const savePropertyType = async (t: SecurityType) => {
    setPropertyType(t);
    if (!loan?.id || locked) return;
    setSavingPropertyType(true);
    try {
      if (prop?.id) {
        await supabase.from("properties").update({ property_type: t }).eq("id", prop.id);
        setProp((prev: any) => (prev ? { ...prev, property_type: t } : prev));
      } else {
        const { data: inserted } = await supabase
          .from("properties")
          .insert({ loan_application_id: loan.id, property_type: t })
          .select("*")
          .maybeSingle();
        if (inserted) setProp(inserted);
      }
      void qc.invalidateQueries({ queryKey: ["client-property", loan.id] });
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
      void supabase
        .from("loan_applications")
        .update({
          loan_amount: amount,
          preferred_period_months: months,
          annual_investor_rate: annualRate,
          max_monthly_payment: maxPayment || null,
        })
        .eq("id", loan.id);
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [amount, months, annualRate, maxPayment, loan?.id, locked]);

  const hasDesc = String(loan?.investor_description ?? "").trim().length >= 20;

  const missingForInvestors = useMemo(() => {
    const m: string[] = [];
    if (!client?.first_name || !client?.phone) m.push("dane kontaktowe");
    if (!prop?.property_type) m.push("typ zabezpieczenia");
    if (!String(city ?? prop?.city ?? "").trim()) m.push("miejscowość");
    if (!containsValidKw(prop?.land_register_number) && !prop?.area_sqm)
      m.push("poprawny numer KW lub powierzchnia");
    if (!hasDesc) m.push("krótki opis dla inwestora");
    if (!amount || !months || !annualRate) m.push("warunki finansowe");
    return m;
  }, [client, prop, hasDesc, amount, months, annualRate, city]);

  const sendToInvestors = async () => {
    if (!loan?.id) return;
    if (missingForInvestors.length > 0) {
      toast.error(`Aby wysłać do inwestorów uzupełnij: ${missingForInvestors.join(", ")}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSendingToInvestors(true);
    try {
      const acceptedSnapshot = {
        loan_amount: amount,
        period_months: months,
        annual_rate: annualRate,
        max_monthly_payment: maxPayment || null,
        property_type: propertyType,
        accepted_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("loan_applications")
        .update({
          loan_amount: amount,
          preferred_period_months: months,
          annual_investor_rate: annualRate,
          max_monthly_payment: maxPayment || null,
          accepted_terms: acceptedSnapshot,
          accepted_terms_at: acceptedSnapshot.accepted_at,
          accepted_loan_amount: amount,
          accepted_period_months: months,
          accepted_annual_rate: annualRate,
          accepted_max_monthly_payment: maxPayment || null,
          status: "szukamy_inwestora",
        })
        .eq("id", loan.id);
      if (error) throw error;
      toast.success("Warunki zaakceptowane i zapisane. Wniosek trafił do inwestorów.");
      setRefreshTick((t) => t + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się zapisać warunków");
    } finally {
      setSendingToInvestors(false);
    }
  };

  const statusLabel = loan
    ? (loanStatusLabels[loan.status as keyof typeof loanStatusLabels] ?? loan.status)
    : null;

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
    <div className="max-w-5xl space-y-4">
      {locked && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="gap-1">
            <Lock className="h-3.5 w-3.5" /> Zablokowany do edycji
          </Badge>
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
                Typ nieruchomości{" "}
                {savingPropertyType && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
              </span>
            </div>
            <p className="text-xs text-white/75">
              Wybierz, co stanowi zabezpieczenie — to wpływa na zainteresowanie inwestorów.
            </p>
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
                    <span className="text-xs font-semibold text-white">
                      {securityTypeLabels[type]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-foreground shadow-md">
                  <MapPin className="h-4 w-4" strokeWidth={3} />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-white">
                  Miejscowość <span className="text-rose-200">*</span>
                </span>
              </div>
              <p className="text-xs text-white/75">
                Podaj miasto/miejscowość, w której znajduje się nieruchomość.
              </p>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/80" />
                <Input
                  value={city}
                  onChange={(e) => saveCity(e.target.value)}
                  placeholder="np. Warszawa"
                  aria-invalid={!city.trim() || undefined}
                  className={cn(
                    "h-14 rounded-2xl border-2 bg-white/10 pl-12 pr-4 text-base font-semibold text-white placeholder:text-white/40 shadow-inner backdrop-blur-sm focus-visible:ring-2",
                    city.trim()
                      ? "border-white/30 focus-visible:border-white/70 focus-visible:ring-white/40"
                      : "border-rose-300/60 focus-visible:border-rose-200 focus-visible:ring-rose-300/40",
                  )}
                />
                {city.trim() && (
                  <span className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/25 ring-1 ring-white/40 shadow backdrop-blur-sm">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                )}
              </div>
            </div>
          </div>
        </FancyShell>

        {filesSlot}

        <div className="relative">
          <fieldset
            disabled={Boolean(lockReason)}
            className={cn("contents", lockReason && "pointer-events-none")}
          >
            <OfferCalculatorPanel
              amount={amount}
              setAmount={setAmount}
              months={months}
              setMonths={setMonths}
              maxMonths={maxMonths}
              annualRate={annualRate}
              setAnnualRate={setAnnualRate}
              rateTouchedRef={rateTouchedRef}
              maxPayment={maxPayment}
              setMaxPayment={setMaxPayment}
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

      {loan?.accepted_terms_at && (
        <FancyShell>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-400 text-emerald-950 shadow-md">
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-white">
                Zaakceptowane warunki pożyczki
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-white md:grid-cols-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/60">Kwota</div>
                <div className="text-lg font-bold">
                  {Number(loan.accepted_loan_amount ?? 0).toLocaleString("pl-PL")} zł
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/60">Okres</div>
                <div className="text-lg font-bold">{loan.accepted_period_months} mies.</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/60">
                  Oproc. roczne
                </div>
                <div className="text-lg font-bold">{Number(loan.accepted_annual_rate ?? 0)}%</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/60">Maks. rata</div>
                <div className="text-lg font-bold">
                  {loan.accepted_max_monthly_payment
                    ? `${Number(loan.accepted_max_monthly_payment).toLocaleString("pl-PL")} zł`
                    : "—"}
                </div>
              </div>
            </div>
            <p className="text-xs text-white/70">
              Zaakceptowano: {new Date(loan.accepted_terms_at).toLocaleString("pl-PL")}
            </p>
          </div>
        </FancyShell>
      )}

      {!locked && (
        <div className="space-y-3">
          {missingForInvestors.length > 0 && null}
          <Button
            onClick={() => void sendToInvestors()}
            disabled={sendingToInvestors || Boolean(lockReason)}
            aria-disabled={sendingToInvestors || Boolean(lockReason)}
            className={cn(
              "h-16 w-full rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 text-lg font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_45px_-12px_oklch(0.55_0.18_150/0.7)] ring-1 ring-emerald-300/50 transition hover:from-emerald-400 hover:via-emerald-500 hover:to-emerald-600 hover:shadow-[0_20px_55px_-12px_oklch(0.55_0.18_150/0.85)] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed disabled:hover:from-emerald-500 disabled:hover:via-emerald-600 disabled:hover:to-emerald-700",
            )}
          >
            {sendingToInvestors ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Wysyłam…
              </>
            ) : lockReason ? (
              <>
                <Lock className="mr-3 h-6 w-6" />
                Zaakceptuj warunki
              </>
            ) : (
              <>
                <Send className="mr-3 h-6 w-6" />
                {loan?.accepted_terms_at ? "Zaktualizuj warunki" : "Zaakceptuj warunki"}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
