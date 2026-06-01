import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SecurityTypePicker } from "@/components/security-type-picker";
import {
  monthlyPayment, formatPLN,
  type SecurityType,
} from "@/lib/loan-math";
import { AlertTriangle, Calculator } from "lucide-react";

export const Route = createFileRoute("/embed/wniosek")({
  component: EmbedWniosek,
  head: () => ({
    meta: [
      { title: "Wniosek o pożyczkę" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function EmbedWniosek() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const source = params?.get("source") ?? "embed";

  const [amount, setAmount] = useState(200_000);
  const [annualRate, setAnnualRate] = useState(20);
  const [months, setMonths] = useState(24);
  const [maxPayment, setMaxPayment] = useState(5000);
  const [secType, setSecType] = useState<SecurityType | null>(null);

  const rataNominal = useMemo(() => monthlyPayment(amount, annualRate, months), [amount, annualRate, months]);
  const rata = useMemo(() => (maxPayment > 0 ? Math.min(rataNominal, maxPayment) : rataNominal), [rataNominal, maxPayment]);
  const balloon = useMemo(() => Math.max(0, (rataNominal - rata) * months), [rataNominal, rata, months]);
  const totalPay = useMemo(() => rata * months + balloon, [rata, months, balloon]);
  const investorComp = useMemo(() => Math.max(0, totalPay - amount), [totalPay, amount]);
  const exceedsMax = balloon > 0;

  const canContinue = secType !== null && amount > 0 && months > 0 && annualRate > 0;

  const goToFullForm = () => {
    const origin = window.location.origin;
    const url = new URL("/wniosek-start", origin);
    url.searchParams.set("amount", String(amount));
    url.searchParams.set("annualRate", String(annualRate));
    url.searchParams.set("months", String(months));
    url.searchParams.set("maxPayment", String(maxPayment));
    if (secType) url.searchParams.set("secType", secType);
    url.searchParams.set("source", `embed_${source}`);
    const target = url.toString();
    // Wybij z iframe, jeśli jesteśmy osadzeni
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.href = target;
        return;
      }
    } catch {
      // cross-origin top → otwórz w nowej karcie
      window.open(target, "_blank", "noopener");
      return;
    }
    window.location.href = target;
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-2xl space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <header>
          <h1 className="text-xl font-bold">Sprawdź warunki pożyczki pod zastaw nieruchomości</h1>
          <p className="text-xs text-muted-foreground">Kalkulator wstępny — dalsze kroki (dane, dokumenty, KW) wypełnisz w pełnym wniosku.</p>
        </header>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="flex items-center gap-2"><Calculator className="h-4 w-4" /> Kwota</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="w-32" />
            </div>
            <Slider min={20000} max={1_000_000} step={5000} value={[amount]} onValueChange={(v) => setAmount(v[0])} />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Wynagrodzenie roczne</Label>
              <div className="flex items-center gap-1">
                <Input type="number" step="0.5" value={annualRate} onChange={(e) => setAnnualRate(Number(e.target.value) || 0)} className="w-20" />
                <span className="text-sm">%</span>
              </div>
            </div>
            <Slider min={15} max={60} step={0.5} value={[Math.min(60, Math.max(15, annualRate))]} onValueChange={(v) => setAnnualRate(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>15%</span><span>60%</span></div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between"><Label>Okres</Label><span className="text-sm">{months} mies.</span></div>
            <Slider min={3} max={72} step={1} value={[months]} onValueChange={(v) => setMonths(v[0])} />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Maksymalna rata</Label>
              <Input type="number" value={maxPayment} onChange={(e) => setMaxPayment(Number(e.target.value) || 0)} className="w-32" />
            </div>
            <Slider min={500} max={50000} step={250} value={[Math.min(50000, maxPayment)]} onValueChange={(v) => setMaxPayment(v[0])} />
          </div>

          <div className="space-y-2">
            <Label>Co ma być zabezpieczeniem?</Label>
            <SecurityTypePicker value={secType} onChange={setSecType} />
          </div>

          <div className="rounded border bg-muted/30 p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Rata miesięczna</span><b>{formatPLN(rata)}</b></div>
            {balloon > 0 && (
              <div className="flex justify-between"><span>Ostatnia rata (z nadwyżką balonową)</span><b>{formatPLN(rata + balloon)}</b></div>
            )}
            <div className="flex justify-between"><span>Łączne wynagrodzenie inwestora</span><b>{formatPLN(investorComp)}</b></div>
            <div className="flex justify-between"><span>Łączna kwota do spłaty</span><b>{formatPLN(totalPay)}</b></div>
            <p className="text-xs text-muted-foreground pt-1">Kalkulacja poglądowa. Nie stanowi oferty ani decyzji pożyczkowej.</p>
          </div>

          {exceedsMax && (
            <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>
              Część zobowiązania przekraczająca maksymalną ratę zostanie rozliczona w racie balonowej na koniec okresu.
            </AlertDescription></Alert>
          )}

          <Button className="w-full" disabled={!canContinue} onClick={goToFullForm}>
            Dalej — wypełnij pełny wniosek
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            W kolejnym kroku utworzysz konto (e-mail + telefon albo Google / Apple), a następnie uzupełnisz dane, nieruchomość i dokumenty.
          </p>
        </div>
      </div>
    </div>
  );
}
