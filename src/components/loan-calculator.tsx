import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Calculator,
  RefreshCw,
  Info,
  HelpCircle,
  Download,
  Copy,
  Scale,
  ShieldAlert,
  ExternalLink,
  TrendingUp,
  Wallet,
  HandCoins,
  Printer,
  Send,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatPLN, propertyTypeLabels } from "@/lib/labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { residentialAuctionBlockRisk } from "@/lib/risk-assessment/forced-sale";
import { getNbpRates } from "@/lib/nbp-rates.functions";
import { sendLoanScheduleToClient } from "@/lib/loan-schedule.functions";
import { buildLoanCalcPdfBlob, type LoanCalcPayload } from "@/lib/loan-calc-pdf";
import { buildEngineSchedule } from "@/lib/contract-engine/loan-schedule";
import { saveCalcHandoff } from "@/lib/loan-calc-handoff";
import { FancyShell } from "@/components/landing/fancy-shell";

const FANCY_CARD_CLS =
  "bg-transparent border-white/10 shadow-none text-white [&_.text-muted-foreground]:text-white/70 [&_.text-xs.text-muted-foreground]:text-white/60";

/** Pole liczbowe z lokalnym stanem tekstu — nie nadpisuje wpisywanej wartości w trakcie edycji. */
function NumberField({
  value,
  onCommit,
  className,
  step,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  step?: string | number;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>(String(value));
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);
  return (
    <Input
      type="text"
      inputMode="decimal"
      step={step}
      value={focused ? draft : String(value)}
      onFocus={(e) => {
        setFocused(true);
        setDraft(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/\s+/g, "").replace(",", ".");
        setDraft(e.target.value);
        if (raw === "" || raw === "-" || raw === "." || raw === "-.") return;
        const n = Number(raw);
        if (Number.isFinite(n)) onCommit(n);
      }}
      onBlur={() => {
        setFocused(false);
        const n = Number(draft.replace(/\s+/g, "").replace(",", "."));
        onCommit(Number.isFinite(n) ? n : 0);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}

// Limity ustawowe:
// Odsetki ustawowe (art. 359 §2 KC): stopa ref. NBP + 3,5 p.p.
// Odsetki maksymalne (art. 359 §2¹ KC): 2 × odsetki ustawowe = 2 × (stopa ref. NBP + 3,5 p.p.).
// Maks. koszty pozaodsetkowe (art. 36a UoKK): MPKK = K·(10% + 10%·n/R), maks. 45% K.
function maxNonInterestCosts(amount: number, months: number): number {
  if (!amount || !months) return 0;
  const mpkk = amount * (0.1 + 0.1 * (months / 12));
  return Math.min(mpkk, amount * 0.45);
}

function maxInterestRate(refRate: number): number {
  return (refRate + 3.5) * 2;
}

export type LoanCalculatorState = {
  amount: number;
  months: number;
  annualRate: number;
  commissionPct: number;
  commissionPln: number;
  financeYouFeePct: number;
  financeYouFeePln: number;
  grossPrincipal: number;
  maxPayment: number;
  nominalRata: number;
  cappedRata: number;
  balloon: number;
  totalRata: number;
  totalOds: number;
  totalKap: number;
  totalCost: number;
  totalToRepay: number;
  schedule: { idx: number; date: string; rata: number; kap: number; ods: number; saldo: number }[];
};

type Props = {
  initialAmount?: number;
  /** Kwota do wypłaty na rękę dla klienta (nadrzędna względem kwoty nominalnej). Jeśli podana, kalkulator dobiera kwotę nominalną tak, aby klient dostał na rękę tę wartość. */
  initialOnHand?: number;
  initialMonths?: number;
  initialAnnualRate?: number;
  initialCommissionPct?: number;
  initialMaxPayment?: number;
  onChange?: (s: LoanCalculatorState) => void;
  /** Włącza rozszerzone ostrzeżenia prawne i wskazówki dla inwestora (kalkulator /inwestor/kalkulator). */
  investorGuidance?: boolean;
  /** Ukrywa prowizję Finance You (0%) — używane dla oferty wewnętrznej pośrednika. */
  hideFinanceYouFee?: boolean;
  /** Włącza tryb prowizji wewnętrznej operatora (2–5% jako część prowizji inwestora). */
  internalOperatorMode?: boolean;
  /** Tryb darmowego konta inwestora: oprocentowanie STAŁE równe odsetkom
   *  maksymalnym (limit ustawowy z NBP), prowizja inwestora = 0 (zablokowana),
   *  prowizja Finance You 2× wyższa niż w planie komercyjnym. */
  freeTierMode?: boolean;
  /** Domyślny e-mail klienta (do wysyłki harmonogramu). */
  clientEmail?: string | null;
  /** Nazwa/nazwisko klienta (nagłówek harmonogramu i maila). */
  clientName?: string | null;
};

/** Tooltip ze słowniczkiem przy etykiecie pola. */
function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-grid place-items-center text-muted-foreground hover:text-foreground align-middle"
            aria-label="Wyjaśnienie"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function LoanCalculator({
  initialAmount = 100_000,
  initialOnHand,
  initialMonths = 12,
  initialAnnualRate = 10,
  initialCommissionPct = 5,
  initialMaxPayment = 5000,
  onChange,
  investorGuidance = false,
  hideFinanceYouFee = false,
  internalOperatorMode = false,
  freeTierMode = false,
  clientEmail = null,
  clientName = null,
}: Props) {
  const fetchRates = useServerFn(getNbpRates);
  const ratesQ = useQuery({
    queryKey: ["nbp-rates"],
    queryFn: () => fetchRates(),
    staleTime: 12 * 60 * 60 * 1000,
  });
  const liveRefRate = ratesQ.data?.referenceRate ?? 3.75;

  const [months, setMonths] = useState(initialMonths);
  const [annualRate, setAnnualRate] = useState(initialAnnualRate);
  const [commissionPct, setCommissionPct] = useState(initialCommissionPct);
  const [maxPayment, setMaxPayment] = useState(initialMaxPayment);
  const [operatorCommissionPct, setOperatorCommissionPct] = useState(3);

  // ŹRÓDŁO PRAWDY: kwota do wypłaty na rękę dla klienta (to, o co wnioskuje).
  // Kwota nominalna pożyczki jest z niej WYPROWADZANA: z góry potrącane są obie prowizje —
  // inwestora oraz Finance You (koszt klienta, kredytowany do kapitału pożyczki).
  // Nominał = onHand / (1 − prowizja_inwestora% − prowizja_FY%).
  const [onHand, setOnHand] = useState<number>(initialOnHand ?? initialAmount);

  // Prowizja Finance You — koszt POŻYCZKOBIORCY (klient dostaje na nią fakturę VAT
  // od Finance You). Jest potrącana z kwoty udzielonej pożyczki, powiększa kapitał
  // pożyczki, klient ją spłaca w ratach (odsetki liczą się także od niej), a przez raty
  // wraca ona do inwestora — dlatego podnosi jego wkład gotówkowy na starcie
  // (inwestor wykłada onHand + prowizję FY), ale jest neutralna dla jego zysku.
  // Skala liniowa od 10% (przy 20 000 zł) do 4% (przy 1 000 000 zł) kwoty nominalnej.
  // W trybie oferty wewnętrznej (hideFinanceYouFee) prowizja FY = 0.
  // Ponieważ % FY zależy od nominału, a nominał zależy od %, iterujemy do punktu stałego.
  const { amount, financeYouFeePct } = useMemo(() => {
    // Model silnika: PEŁNA WYPŁATA — Pożyczkobiorca otrzymuje całą Kwotę Pożyczki.
    // Prowizja nie jest potrącana z wypłaty (jest rozłożona na raty), więc kwota
    // na rękę = Kwota Pożyczki (brak „ubruttowienia").
    const fyMultiplier = freeTierMode ? 2 : 1;
    const amt = onHand;
    const t = Math.min(1, Math.max(0, (amt - 20_000) / (1_000_000 - 20_000)));
    const fyPct = hideFinanceYouFee ? 0 : Math.round((10 - t * 6) * fyMultiplier * 10) / 10;
    return { amount: amt, financeYouFeePct: fyPct };
  }, [onHand, hideFinanceYouFee, freeTierMode]);

  // Kwota Pożyczki = kwota wypłacana na rękę (pełna wypłata) — wartości są równe.
  const setAmount = (nominal: number) => {
    const clamped = Math.min(1_000_000, Math.max(20_000, nominal || 0));
    setOnHand(clamped);
  };
  const rateTouched = useRef(false);
  const commissionTouched = useRef(false);
  const setAnnualRateTouched = (v: number) => {
    rateTouched.current = true;
    setAnnualRate(v);
  };
  const setCommissionPctTouched = (v: number) => {
    commissionTouched.current = true;
    setCommissionPct(v);
  };

  // Tryb inwestora: ręczne nadpisanie stopy NBP, model prowizji, potwierdzenie stopy.
  const [nbpOverride, setNbpOverride] = useState<number | null>(null);
  const [nbpConfirmed, setNbpConfirmed] = useState(false);
  const [agreementDate, setAgreementDate] = useState<string>("");

  const [checkRate, setCheckRate] = useState(false);
  const [checkCommission, setCheckCommission] = useState(false);
  const [checkKrotnosc, setCheckKrotnosc] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Proponowane zabezpieczenia — domyślnie 2× łącznej należności inwestora (suma rat).
  // null = trzymaj się domyślnej krotności; liczba = wartość nadpisana ręcznie.
  const [mortgageOverride, setMortgageOverride] = useState<number | null>(null);
  const [art777Override, setArt777Override] = useState<number | null>(null);

  // Nieruchomość stanowiąca zabezpieczenie — rodzaj i suma oszacowania (0 = nie podano).
  // Pozwala na żywo sprawdzić próg 5% (art. 952¹ § 2 KPC) i wartość „po komorniku".
  const [propertyType, setPropertyType] = useState<string>("mieszkanie");
  const [propertyValue, setPropertyValue] = useState<number>(0);

  // Wysyłka harmonogramu do klienta
  const sendSchedule = useServerFn(sendLoanScheduleToClient);
  const [sendOpen, setSendOpen] = useState(false);
  const [recipient, setRecipient] = useState<string>(clientEmail ?? "");
  const [sending, setSending] = useState(false);
  useEffect(() => {
    setRecipient(clientEmail ?? "");
  }, [clientEmail]);

  const effectiveRefRate = investorGuidance && nbpOverride != null ? nbpOverride : liveRefRate;
  const MAX_INTEREST_RATE = maxInterestRate(effectiveRefRate);
  const statutoryInterest = effectiveRefRate + 3.5;

  const financeYouFeePln = Math.round((amount * financeYouFeePct) / 100);
  // Kapitał, od którego liczone są odsetki i raty = Kwota Pożyczki (pełna
  // wypłata). Prowizja inwestora i Finance You NIE wchodzą do kapitału —
  // są rozłożone na raty jako osobny składnik (model silnika).
  const grossPrincipal = amount;

  const maxNonInterest = maxNonInterestCosts(amount, months);

  // Prowizja inwestora — zawsze sterowana ręcznie suwakiem.
  const commissionPln = (amount * commissionPct) / 100;
  const effectiveCommissionPct = commissionPct;

  // Prowizja wewnętrzna operatora — część prowizji inwestora (2–5%).
  const operatorCommissionPctClamped = Math.min(5, Math.max(2, operatorCommissionPct));
  const operatorCommissionPln = internalOperatorMode
    ? (amount * operatorCommissionPctClamped) / 100
    : 0;
  const investorNetCommissionPln = Math.max(0, commissionPln - operatorCommissionPln);

  // Harmonogram = model silnika (jedno źródło prawdy): pełna wypłata kapitału,
  // prowizja (inwestora + Finance You) rozłożona na raty, odsetki od salda,
  // balon = ostatnia z N rat.
  const scheduleCommission = commissionPln + financeYouFeePln;
  const schedule = useMemo(() => {
    if (!grossPrincipal || !months)
      return {
        rows: [] as any[],
        totalRata: 0,
        totalOds: 0,
        totalKap: 0,
        totalProw: 0,
        balloon: 0,
        nominalRata: 0,
        cappedRata: 0,
      };
    const monthlyRate = annualRate / 100 / 12;
    const nominalRata =
      monthlyRate > 0
        ? (grossPrincipal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
        : grossPrincipal / months;
    const monthlyComm = scheduleCommission / months;
    const cap = maxPayment > 0 ? maxPayment : nominalRata + monthlyComm;

    const eng = buildEngineSchedule({
      kwotaPozyczki: grossPrincipal,
      prowizja: scheduleCommission,
      annualRatePercent: annualRate,
      months,
      maxMonthlyPayment: cap,
    });

    const start = new Date();
    const rows = eng.rows.map((r) => {
      const d = new Date(start);
      d.setMonth(d.getMonth() + r.nr);
      return {
        idx: r.nr,
        date: d.toLocaleDateString("pl-PL"),
        rata: r.rata_razem,
        kap: r.kapital,
        ods: r.odsetki,
        prow: r.prowizja,
        saldo: r.saldo,
      };
    });
    return {
      rows,
      totalRata: eng.totalToRepay,
      totalOds: eng.totalInterest,
      totalKap: grossPrincipal,
      totalProw: scheduleCommission,
      balloon: eng.balloon,
      nominalRata: nominalRata + monthlyComm,
      cappedRata: Math.min(nominalRata + monthlyComm, cap),
    };
  }, [grossPrincipal, months, annualRate, maxPayment, scheduleCommission]);

  // MPKK obejmuje prowizję inwestora ORAZ prowizję Finance You — obie są kosztami
  // pozaodsetkowymi po stronie klienta (art. 36a UoKK).
  const nonInterestTotal = commissionPln + financeYouFeePln;
  // Całkowity koszt pożyczki PO STRONIE KLIENTA = odsetki + prowizja inwestora + prowizja FY.
  const totalCost = schedule.totalOds + commissionPln + financeYouFeePln;
  // Na rękę = kwota nominalna − prowizja inwestora − prowizja FY (obie potrącane z góry).
  // Z konstrukcji (nominał = onHand / (1 − prowizja_inw% − prowizja_FY%)) wartość ta jest równa onHand.
  const disbursedOnHand = Math.max(0, onHand);

  // Łączna kwota spłacana przez pożyczkobiorcę = raty z harmonogramu (zwrot nominału + odsetki).
  // Obie prowizje są potrącane z góry (zawarte w nominale), więc NIE doliczają się ponownie.
  const totalToRepay = schedule.totalRata;

  // Inwestor: realny wkład gotówkowy na starcie = środki wychodzące z jego konta:
  //  • wypłata na rękę dla klienta (nominał − prowizja inwestora − prowizja FY, potrącone z góry),
  //  • prowizja Finance You — inwestor przekazuje ją operatorowi (Finance You) przy uruchomieniu;
  //    klient dostaje na nią fakturę VAT od Finance You. Klient spłaca ją w ratach (kredytowana
  //    do kapitału), więc wraca do inwestora — jest neutralna dla zysku, ale podnosi wkład startowy,
  //  • w ofercie wewnętrznej dodatkowo prowizja operatora pośrednika (z własnych środków inwestora);
  //    tam prowizja FY = 0.
  const investorCashOut = Math.max(0, disbursedOnHand + financeYouFeePln + operatorCommissionPln);
  // Inwestor odbiera łącznie = wszystkie raty z harmonogramu (zwrot nominału + odsetki).
  // Prowizja FY spłacana przez klienta wraca do inwestora w ratach — dlatego nie odejmujemy jej z zysku.
  const investorTotalIn = totalToRepay;
  // Zysk = to, co wraca, minus to, co wyszło z konta:
  // odsetki + prowizja inwestora (netto). Prowizja FY jest przelotowa (wyłożona i zwrócona w ratach).
  const investorProfit = investorTotalIn - investorCashOut;
  const investorRoiPct = investorCashOut > 0 ? (investorProfit / investorCashOut) * 100 : 0;
  const investorRoiAnnualPct = months > 0 ? (investorRoiPct * 12) / months : 0;
  // Krotność: ile razy klient oddaje względem kwoty otrzymanej na rękę.
  // Prowizja FY jest kosztem klienta (kredytowana), ale klient dostaje ją w formie usługi FY —
  // krotność liczymy klasycznie: łączna spłata ÷ kwota na rękę.
  const krotnoscBasis = Math.max(0, disbursedOnHand);
  const krotnoscRepay = totalToRepay;
  const krotnosc = krotnoscBasis > 0 ? krotnoscRepay / krotnoscBasis : 0;

  // Proponowane zabezpieczenia: domyślnie dwukrotność sumy wszystkich należności
  // inwestora (łącznej kwoty do spłaty). Edytowalne — override ma pierwszeństwo.
  const proposedSecurityDefault = Math.round(totalToRepay * 2);
  const mortgageAmount = mortgageOverride ?? proposedSecurityDefault;
  const art777Amount = art777Override ?? proposedSecurityDefault;

  // Wycena „po komorniku" (KPC): cena wywołania I licytacji = 3/4 sumy oszacowania (art. 965),
  // II licytacji = 2/3 (art. 983); po bezskutecznej II licytacji wierzyciel może przejąć za 2/3
  // (art. 984). Ostrożny odzysk z egzekucji przyjmujemy na poziomie 2/3.
  const firstAuctionPln = Math.round(propertyValue * 0.75);
  const secondAuctionPln = Math.round(propertyValue * (2 / 3));
  // Próg 5% dla nieruchomości mieszkaniowej (art. 952¹ § 2 KPC): licytacji mieszkania/domu
  // nie można wyznaczyć, gdy egzekwowana należność główna < 1/20 sumy oszacowania.
  const auctionBlock = residentialAuctionBlockRisk({
    propertyType,
    loanAmountPln: amount,
    propertyValuePln: propertyValue,
  });
  const ltvPct = propertyValue > 0 ? (amount / propertyValue) * 100 : 0;
  const collateralCoveragePct =
    propertyValue > 0 && totalToRepay > 0 ? (secondAuctionPln / totalToRepay) * 100 : 0;
  const collateralShortfall = propertyValue > 0 && totalToRepay > secondAuctionPln + 1e-9;

  const interestExceeds = annualRate > MAX_INTEREST_RATE + 1e-9;
  const nonInterestExceeds = nonInterestTotal > maxNonInterest + 1e-9;
  const commissionOver45 = commissionPln > amount * 0.45 + 1e-9;
  const krotnoscWarn = krotnosc > 1.5;
  const krotnoscDanger = krotnosc > 2.0;
  const periodWarn = months > 24;
  const anyWarning = interestExceeds || nonInterestExceeds;

  // Ograniczenia trybu oferty wewnętrznej pośrednika.
  const internalCashOutExceeds = internalOperatorMode && investorCashOut > 100_000 + 1e-9;
  const internalYieldTooLow = internalOperatorMode && investorRoiAnnualPct < 36 - 1e-9;
  const internalPeriodTooShort = internalOperatorMode && months < 12;

  useEffect(() => {
    if (internalOperatorMode && months < 12) setMonths(12);
  }, [internalOperatorMode, months]);

  useEffect(() => {
    if (freeTierMode || !rateTouched.current) {
      // Konto darmowe: oprocentowanie STAŁE = odsetki maksymalne (śledzi NBP).
      const rounded = freeTierMode
        ? Math.floor(MAX_INTEREST_RATE * 100) / 100
        : Math.floor(MAX_INTEREST_RATE * 10) / 10;
      if (Math.abs(annualRate - rounded) > 1e-9) setAnnualRate(rounded);
    }
  }, [MAX_INTEREST_RATE, annualRate, freeTierMode]);

  useEffect(() => {
    // Konto darmowe: inwestor nie pobiera prowizji.
    if (freeTierMode) {
      if (Math.abs(commissionPct) > 1e-9) setCommissionPct(0);
      return;
    }
    if (!commissionTouched.current) {
      // Maksymalna prowizja bez wątpliwości prawnych = limit MPKK (% kwoty nominalnej),
      // przycięta do zakresu suwaka (0–30%).
      const mpkkPct = Math.min(30, Math.max(0, 10 + 10 * (months / 12)));
      const rounded = Math.floor(mpkkPct * 2) / 2; // krok 0,5%
      if (Math.abs(commissionPct - rounded) > 1e-9) setCommissionPct(rounded);
    }
  }, [months, commissionPct, freeTierMode]);

  useEffect(() => {
    onChange?.({
      amount,
      months,
      annualRate,
      commissionPct: effectiveCommissionPct,
      commissionPln,
      financeYouFeePct,
      financeYouFeePln,
      grossPrincipal,
      maxPayment,
      nominalRata: schedule.nominalRata,
      cappedRata: schedule.cappedRata,
      balloon: schedule.balloon,
      totalRata: schedule.totalRata,
      totalOds: schedule.totalOds,
      totalKap: schedule.totalKap,
      totalCost,
      totalToRepay,
      schedule: schedule.rows,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    amount,
    months,
    annualRate,
    effectiveCommissionPct,
    commissionPln,
    financeYouFeePct,
    financeYouFeePln,
    grossPrincipal,
    maxPayment,
    schedule.balloon,
    schedule.totalRata,
    schedule.totalOds,
  ]);

  const contractClause =
    `Pożyczka oprocentowana jest według stopy stanowiącej dwukrotność odsetek ustawowych, ` +
    `tj. dwukrotność sumy stopy referencyjnej Narodowego Banku Polskiego i 3,5 punktu procentowego. ` +
    `Na dzień zawarcia niniejszej umowy stopa oprocentowania wynosi ${annualRate.toFixed(2).replace(".", ",")}% w stosunku rocznym ` +
    `(stopa referencyjna NBP: ${effectiveRefRate.toFixed(2).replace(".", ",")}%, limit odsetek maksymalnych: ${MAX_INTEREST_RATE.toFixed(2).replace(".", ",")}%). ` +
    `W przypadku zmiany stopy referencyjnej NBP oprocentowanie ulega odpowiedniej zmianie z dniem wejścia w życie nowej stopy, ` +
    `nie przekraczając wysokości odsetek maksymalnych.`;

  function downloadScheduleCsv() {
    const header = ["Nr raty", "Termin", "Rata", "Kapitał", "Odsetki", "Prowizja", "Saldo"];
    const fmt = (n: number) => n.toFixed(2).replace(".", ",");
    const lines = [header.join(";")];
    for (const r of schedule.rows) {
      lines.push(
        [r.idx, r.date, fmt(r.rata), fmt(r.kap), fmt(r.ods), fmt(r.prow ?? 0), fmt(r.saldo)].join(
          ";",
        ),
      );
    }
    lines.push(
      [
        "",
        "RAZEM",
        fmt(schedule.totalRata),
        fmt(schedule.totalKap),
        fmt(schedule.totalOds),
        fmt(schedule.totalProw),
        "",
      ].join(";"),
    );
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `harmonogram-${Math.round(amount)}-${months}m.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /** Fragment HTML harmonogramu (tabela + podsumowanie) — używany do wydruku PDF i do maila. */
  function buildScheduleInnerHtml(): string {
    const m = (n: number) => formatPLN(n);
    const th = (t: string, right = false) =>
      `<th style="padding:8px;text-align:${right ? "right" : "left"};border-bottom:2px solid #333;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#555;">${t}</th>`;
    const sum = (label: string, val: string, strong = false) =>
      `<tr><td style="padding:5px 0;color:#444;">${label}</td><td style="padding:5px 0;text-align:right;${strong ? "font-weight:700;" : ""}">${val}</td></tr>`;
    const rows = schedule.rows
      .map(
        (r) =>
          `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${r.idx}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${r.date}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${m(r.rata)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${m(r.kap)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${m(r.ods)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${m(r.prow ?? 0)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${m(r.saldo)}</td></tr>`,
      )
      .join("");
    return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;max-width:720px;">
      <h1 style="font-size:20px;margin:0 0 4px;">Harmonogram spłat pożyczki</h1>
      ${clientName ? `<p style="margin:0 0 12px;color:#555;">dla: <b>${escapeHtml(clientName)}</b></p>` : ""}
      <table style="width:100%;border-collapse:collapse;margin:12px 0 4px;font-size:14px;">
        ${sum("Kwota Pożyczki (pełna wypłata)", m(onHand), true)}
        ${sum("Okres", `${months} mies.`)}
        ${sum("Oprocentowanie", `${annualRate.toFixed(2).replace(".", ",")}% / rok`)}
        ${sum("Rata miesięczna", m(schedule.cappedRata))}
        ${schedule.balloon > 0 ? sum("Rata balonowa (ostatnia)", m(schedule.balloon)) : ""}
        ${sum("Prowizja (rozłożona na raty)", m(commissionPln))}
        ${sum("Całkowity koszt pożyczki", m(totalCost))}
        ${sum("Łączna kwota do spłaty", m(totalToRepay), true)}
        ${sum("Proponowana kwota hipoteki", m(mortgageAmount))}
        ${sum("Kwota art. 777 k.p.c. (rygor egzekucji)", m(art777Amount))}
      </table>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
        <thead><tr>${th("#")}${th("Termin")}${th("Rata", true)}${th("Kapitał", true)}${th("Odsetki", true)}${th("Prowizja", true)}${th("Saldo", true)}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="2" style="padding:8px;font-weight:700;border-top:2px solid #333;">RAZEM</td>
          <td style="padding:8px;text-align:right;font-weight:700;border-top:2px solid #333;">${m(schedule.totalRata)}</td>
          <td style="padding:8px;text-align:right;font-weight:700;border-top:2px solid #333;">${m(schedule.totalKap)}</td>
          <td style="padding:8px;text-align:right;font-weight:700;border-top:2px solid #333;">${m(schedule.totalOds)}</td>
          <td style="padding:8px;text-align:right;font-weight:700;border-top:2px solid #333;">${m(schedule.totalProw)}</td>
          <td style="border-top:2px solid #333;"></td>
        </tr></tfoot>
      </table>
      <p style="margin-top:16px;font-size:11px;line-height:1.5;color:#666;">${escapeHtml(contractClause)}</p>
      <p style="margin-top:8px;font-size:11px;color:#999;">Dokument informacyjny wygenerowany w kalkulatorze Finance You. Nie stanowi oferty w rozumieniu art. 66 KC.</p>
    </div>`;
  }

  function buildScheduleText(): string {
    return [
      "Harmonogram spłat pożyczki",
      clientName ? `dla: ${clientName}` : "",
      `Kwota do wypłaty na rękę: ${formatPLN(onHand)}`,
      `Kwota nominalna pożyczki: ${formatPLN(Math.round(amount))}`,
      `Okres: ${months} mies.`,
      `Oprocentowanie: ${annualRate.toFixed(2).replace(".", ",")}% / rok`,
      `Rata miesięczna: ${formatPLN(schedule.cappedRata)}`,
      schedule.balloon > 0 ? `Rata balonowa: ${formatPLN(schedule.balloon)}` : "",
      `Łączna kwota do spłaty: ${formatPLN(totalToRepay)}`,
      `Proponowana kwota hipoteki: ${formatPLN(mortgageAmount)}`,
      `Kwota art. 777 k.p.c.: ${formatPLN(art777Amount)}`,
      "",
      "Szczegółowy harmonogram w załączonej treści.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /** Buduje payload kalkulacji (dane finansowe + harmonogram) do PDF/kreatora. */
  function buildCalcPayload(): LoanCalcPayload {
    return {
      v: 1,
      generatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      onHand: Math.round(onHand),
      nominal: Math.round(amount),
      months,
      annualRate,
      commissionPct: effectiveCommissionPct,
      commissionPln: Math.round(commissionPln),
      financeYouFeePct,
      financeYouFeePln: Math.round(financeYouFeePln),
      monthlyPayment: Math.round(schedule.cappedRata * 100) / 100,
      balloon: Math.round(schedule.balloon * 100) / 100,
      totalInterest: Math.round(schedule.totalOds * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalToRepay: Math.round(totalToRepay * 100) / 100,
      mortgageAmount,
      art777Amount,
      agreementDate: agreementDate ? agreementDate.split("-").reverse().join(".") : undefined,
      clientName: clientName ?? undefined,
      schedule: schedule.rows.map((r: any) => ({
        idx: r.idx,
        date: r.date,
        rata: Math.round(r.rata * 100) / 100,
        kap: Math.round(r.kap * 100) / 100,
        ods: Math.round(r.ods * 100) / 100,
        prow: Math.round((r.prow ?? 0) * 100) / 100,
        saldo: Math.round(r.saldo * 100) / 100,
      })),
    };
  }

  /** Przekazuje kalkulację do Kreatora dokumentów w aplikacji (bez pliku). */
  function sendCalcToCreator() {
    saveCalcHandoff(buildCalcPayload());
    toast.success("Kalkulacja przekazana do kreatorów", {
      description: "Otwórz Kreator dokumentów i kliknij „Wczytaj z kalkulatora”.",
    });
  }

  /** Pobiera PDF z wbudowanym blokiem danych — Kreator dokumentów odczyta go deterministycznie. */
  function downloadCalcPdf() {
    const blob = buildLoanCalcPdfBlob(buildCalcPayload());
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kalkulacja-pozyczki-${Math.round(onHand)}-${months}m.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Otwiera okno wydruku z harmonogramem — użytkownik zapisuje jako PDF. */
  function printSchedulePdf() {
    const w = window.open("", "_blank", "width=840,height=1000");
    if (!w) {
      toast.error("Nie udało się otworzyć okna wydruku — odblokuj wyskakujące okienka.");
      return;
    }
    w.document.write(
      `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Harmonogram spłat pożyczki</title>` +
        `<style>@page{margin:16mm;} body{margin:24px;} tr{page-break-inside:avoid;}</style></head>` +
        `<body>${buildScheduleInnerHtml()}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  }

  async function handleSendToClient() {
    const to = recipient.trim();
    if (!to) {
      toast.error("Podaj adres e-mail klienta.");
      return;
    }
    setSending(true);
    try {
      await sendSchedule({
        data: {
          to,
          clientName: clientName ?? undefined,
          subject: `Harmonogram spłat pożyczki${clientName ? ` — ${clientName}` : ""}`,
          html: buildScheduleInnerHtml(),
          text: buildScheduleText(),
        },
      });
      toast.success(`Harmonogram wysłany do ${to}.`);
      setSendOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się wysłać harmonogramu.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <FancyShell>
        <Card className={FANCY_CARD_CLS}>
          <CardContent className="py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-white">
            <div className="flex items-center gap-2 font-semibold">
              <RefreshCw className={`h-3.5 w-3.5 ${ratesQ.isFetching ? "animate-spin" : ""}`} />
              Stopy NBP{" "}
              {ratesQ.data?.source === "fallback" && (
                <span className="text-xs text-white/60">(dane offline)</span>
              )}
            </div>
            <span className="text-white/80">
              Referencyjna:{" "}
              <b className="tabular-nums text-white">{effectiveRefRate.toFixed(2)}%</b>
              {investorGuidance && nbpOverride != null && (
                <span className="text-xs text-amber-300"> (ręcznie)</span>
              )}
            </span>
            {ratesQ.data?.lombardRate != null && (
              <span className="text-white/80">
                Lombardowa:{" "}
                <b className="tabular-nums text-white">{ratesQ.data.lombardRate.toFixed(2)}%</b>
              </span>
            )}
            {ratesQ.data?.depositRate != null && (
              <span className="text-white/80">
                Depozytowa:{" "}
                <b className="tabular-nums text-white">{ratesQ.data.depositRate.toFixed(2)}%</b>
              </span>
            )}
            <span className="text-white/70">
              Maks. odsetki ustawowe:{" "}
              <b className="tabular-nums text-emerald-300">{MAX_INTEREST_RATE.toFixed(2)}%</b>
            </span>
            {ratesQ.data?.effectiveFrom && (
              <span className="text-xs text-white/60 ml-auto">
                obowiązuje od {ratesQ.data.effectiveFrom}
              </span>
            )}
          </CardContent>
        </Card>
      </FancyShell>

      {/* HERO — najważniejsze liczby (fancy) */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(ellipse_at_top_left,_hsl(220_70%_25%),_hsl(230_60%_12%)_60%,_hsl(235_50%_8%))] p-6 md:p-8 shadow-2xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[conic-gradient(from_120deg,_#a78bfa,_#22d3ee,_#34d399,_#a78bfa)] opacity-25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-[conic-gradient(from_0deg,_#22d3ee,_#a78bfa,_#f472b6,_#22d3ee)] opacity-20 blur-3xl"
        />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
            Najważniejsze liczby
          </p>
          <h2 className="mt-1 text-2xl font-black text-white md:text-3xl">
            Co realnie wchodzi i wychodzi z tej pożyczki
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {/* Investor cash out */}
            <div className="group relative overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] p-5 backdrop-blur-sm transition hover:bg-white/[0.09]">
              <div className="flex items-center gap-2 text-white/70">
                <Wallet className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-widest">
                  Inwestor wkłada
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-white md:text-4xl">
                {formatPLN(investorCashOut)}
              </p>
              <p className="mt-1 text-xs text-white/65">
                {internalOperatorMode
                  ? "gotówka z konta inwestora (wypłata dla klienta + prowizja operatora)"
                  : hideFinanceYouFee
                    ? "gotówka z konta inwestora (kwota nominalna − prowizja potrącona z góry)"
                    : `gotówka z konta inwestora: wypłata dla klienta ${formatPLN(disbursedOnHand)} + prowizja Finance You ${formatPLN(financeYouFeePln)} (przelotowa — klient spłaca ją w ratach, wraca do inwestora)`}
              </p>
            </div>

            {/* Investor cash in */}
            <div className="group relative overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400/15 to-cyan-400/10 p-5 backdrop-blur-sm transition hover:from-emerald-400/20 hover:to-cyan-400/15">
              <div className="flex items-center gap-2 text-emerald-200/90">
                <TrendingUp className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-widest">
                  Inwestor odbiera łącznie
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-white md:text-4xl">
                {formatPLN(investorTotalIn)}
              </p>
              <p className="mt-1 text-xs text-emerald-100/80">
                zysk <b className="text-white">{formatPLN(investorProfit)}</b> · ROI{" "}
                <b className="text-white">{investorRoiPct.toFixed(1)}%</b> (
                {investorRoiAnnualPct.toFixed(1)}% / rok)
              </p>
            </div>

            {/* Client on hand */}
            <div className="group relative overflow-hidden rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-400/15 to-rose-400/10 p-5 backdrop-blur-sm transition hover:from-amber-400/20 hover:to-rose-400/15">
              <div className="flex items-center gap-2 text-amber-200/90">
                <HandCoins className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-widest">
                  Klient dostaje na rękę
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-white md:text-4xl">
                {formatPLN(disbursedOnHand)}
              </p>
              <p className="mt-1 text-xs text-amber-100/80">
                kwota nominalna <b className="text-white">{formatPLN(amount)}</b> − prowizja
                inwestora <b className="text-white">{formatPLN(commissionPln)}</b>
                {!hideFinanceYouFee && (
                  <>
                    {" "}
                    − prowizja Finance You{" "}
                    <b className="text-white">{formatPLN(financeYouFeePln)}</b> (FV od Finance You
                    dla klienta)
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs text-white/75 md:grid-cols-4">
            <div>
              <span className="text-white/55">Rata miesięczna</span>
              <div className="mt-0.5 text-base font-bold tabular-nums text-white">
                {formatPLN(schedule.cappedRata)}
              </div>
            </div>
            <div>
              <span className="text-white/55">Okres</span>
              <div className="mt-0.5 text-base font-bold tabular-nums text-white">
                {months} mies.
              </div>
            </div>
            <div>
              <span className="text-white/55">Łączna spłata</span>
              <div className="mt-0.5 text-base font-bold tabular-nums text-white">
                {formatPLN(totalToRepay)}
              </div>
            </div>
            <div>
              <span className="text-white/55">Krotność spłaty</span>
              <div
                className={`mt-0.5 text-base font-bold tabular-nums ${krotnoscDanger ? "text-rose-300" : krotnoscWarn ? "text-amber-300" : "text-white"}`}
              >
                {krotnosc.toFixed(2)}×
              </div>
            </div>
          </div>
        </div>
      </div>

      <FancyShell>
        <Card className={FANCY_CARD_CLS}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Calculator className="h-5 w-5" /> Parametry pożyczki
            </CardTitle>
            <CardDescription className="text-white/70">
              Suwaki działają tak samo, jak po stronie klienta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  Kwota nominalna pożyczki{" "}
                  {investorGuidance && (
                    <InfoTip text="Kwota brutto wpisana w umowie. Zawiera prowizję inwestora ORAZ prowizję Finance You — obie potrącane z góry. Klient otrzymuje na rękę kwotę nominalną pomniejszoną o obie prowizje; odsetki liczone są od całej kwoty nominalnej. Klient dostaje fakturę VAT od Finance You za prowizję FY." />
                  )}
                </Label>
                <NumberField
                  value={Math.round(amount)}
                  onCommit={(n) => setAmount(n || 0)}
                  className="w-40"
                />
              </div>
              <Slider
                min={20000}
                max={1_000_000}
                step={100}
                value={[Math.min(1_000_000, Math.max(20000, amount))]}
                onValueChange={(v) => setAmount(v[0])}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>20 000 zł</span>
                <span>1 000 000 zł</span>
              </div>
              {investorGuidance && (
                <Alert className="py-2">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Klient otrzymuje na rękę <b>{formatPLN(disbursedOnHand)}</b> (kwota nominalna −
                    prowizja inwestora). Kwota nominalna umowy (brutto) jest wyższa o prowizję i
                    koszty.
                  </AlertDescription>
                </Alert>
              )}
              <div className="rounded-md border bg-muted/30 p-3 text-sm grid gap-1.5 sm:grid-cols-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Do wypłaty klientowi (po prowizji inwestora)
                  </span>
                  <b className="tabular-nums">{formatPLN(disbursedOnHand)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Realny wkład gotówkowy inwestora
                    {internalOperatorMode && " (z prowizją operatora)"}
                  </span>
                  <b className="tabular-nums text-primary">{formatPLN(investorCashOut)}</b>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  Klient otrzymuje na rękę{" "}
                  {investorGuidance && (
                    <InfoTip text="Kwota faktycznie wypłacana klientowi (to, o co wnioskuje). Wartość NADRZĘDNA — wpisana ręcznie pozostaje stała, a kwota nominalna pożyczki dobierana jest automatycznie. Prowizja inwestora oraz prowizja Finance You są potrącane z góry — obie kredytowane do kapitału i spłacane przez klienta w ratach." />
                  )}
                </Label>
                <NumberField
                  value={Math.round(onHand)}
                  onCommit={(target) =>
                    setOnHand(Math.min(1_000_000, Math.max(1_000, target || 0)))
                  }
                  className="w-40"
                />
              </div>
              <Slider
                min={10_000}
                max={1_000_000}
                step={500}
                value={[Math.min(1_000_000, Math.max(10_000, Math.round(onHand)))]}
                onValueChange={(v) => setOnHand(v[0])}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>10 000 zł</span>
                <span>
                  Kwota nominalna:{" "}
                  <b className="tabular-nums text-foreground">{formatPLN(amount)}</b>
                </span>
                <span>1 000 000 zł</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Okres (miesiące)</Label>
                <span className="text-sm tabular-nums">{months} mies.</span>
              </div>
              <Slider
                min={internalOperatorMode ? 12 : 3}
                max={72}
                step={1}
                value={[Math.max(internalOperatorMode ? 12 : 3, months)]}
                onValueChange={(v) => setMonths(v[0])}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{internalOperatorMode ? "12 mies." : "3 mies."}</span>
                <span>72 mies.</span>
              </div>
              {investorGuidance && periodWarn && (
                <Alert className="py-2 border-amber-300 bg-amber-50 text-amber-900">
                  <Info className="h-4 w-4 !text-amber-600" />
                  <AlertDescription className="text-xs">
                    Przy okresie powyżej 24 miesięcy referencyjna prowizja MPKK przekracza 30%
                    kwoty, a roczna efektywność spada. Rozważ krótszy okres lub odnowienie umowy po
                    12–24 miesiącach.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {freeTierMode && (
              <Alert className="py-2">
                <AlertDescription className="text-xs">
                  <b>Konto darmowe inwestora:</b> oprocentowanie stałe w maksymalnej ustawowej
                  wysokości — 2 × (stopa referencyjna NBP + 3,5 p.p.), aktualnie{" "}
                  <b>{MAX_INTEREST_RATE.toFixed(2)}%</b> (liczone na bieżąco z danych NBP). Inwestor
                  nie pobiera prowizji, a prowizja Finance You jest 2× wyższa niż w planie pełnym.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  Roczne oprocentowanie (odsetki){" "}
                  {investorGuidance && (
                    <InfoTip text="Górny limit z art. 359 §2¹ KC = 2 × (stopa ref. NBP + 3,5 p.p.). Odsetki ponad limit są nienależne i podlegają zwrotowi." />
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  {freeTierMode ? (
                    <b className="tabular-nums">{annualRate.toFixed(2)}</b>
                  ) : (
                    <NumberField
                      step="0.1"
                      value={annualRate}
                      onCommit={(n) => setAnnualRateTouched(n || 0)}
                      className="w-24"
                    />
                  )}
                  <span className="text-sm">%</span>
                </div>
              </div>
              <Slider
                disabled={freeTierMode}
                min={0}
                max={MAX_INTEREST_RATE}
                step={0.1}
                value={[Math.min(MAX_INTEREST_RATE, Math.max(0, annualRate))]}
                onValueChange={(v) => !freeTierMode && setAnnualRateTouched(v[0])}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span className={interestExceeds ? "text-destructive font-medium" : ""}>
                  {freeTierMode
                    ? `konto darmowe: oprocentowanie stałe = odsetki maksymalne (${MAX_INTEREST_RATE.toFixed(2)}%)`
                    : `limit ustawowy: ${MAX_INTEREST_RATE.toFixed(2)}%`}
                </span>
                <span>{MAX_INTEREST_RATE.toFixed(2)}%</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  Prowizja dla inwestora (jednorazowa, pozaodsetkowa){" "}
                  {investorGuidance && (
                    <InfoTip text="Jedyny koszt pozaodsetkowy. Ustawiana ręcznie suwakiem; potrącana z góry przy uruchomieniu." />
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  {freeTierMode ? (
                    <b className="tabular-nums">0</b>
                  ) : (
                    <NumberField
                      step="0.5"
                      value={commissionPct}
                      onCommit={(n) => setCommissionPctTouched(n || 0)}
                      className="w-24"
                    />
                  )}
                  <span className="text-sm">% ({formatPLN(commissionPln)})</span>
                </div>
              </div>
              <Slider
                disabled={freeTierMode}
                min={0}
                max={30}
                step={0.5}
                value={[Math.min(30, Math.max(0, commissionPct))]}
                onValueChange={(v) => !freeTierMode && setCommissionPctTouched(v[0])}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0%</span>
                {freeTierMode ? (
                  <span>konto darmowe: inwestor nie pobiera prowizji</span>
                ) : nonInterestExceeds ? (
                  <span className="text-destructive font-medium">
                    przekroczono limit MPKK (art. 36a UoKK): {formatPLN(maxNonInterest)}
                  </span>
                ) : (
                  <span />
                )}
                <span>30%</span>
              </div>
            </div>

            {internalOperatorMode && (
              <div className="space-y-3 rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-white">
                    Prowizja wewnętrzna operatora (część prowizji inwestora)
                    <InfoTip text="Wydzielona część prowizji inwestora, która trafia do operatora prowadzącego temat. Nie jest doliczana do kosztów pożyczki — stanowi wewnętrzny podział prowizji inwestora." />
                  </Label>
                  <div className="flex items-center gap-2">
                    <NumberField
                      step="0.1"
                      value={operatorCommissionPctClamped}
                      onCommit={(n) => setOperatorCommissionPct(Math.min(5, Math.max(2, n || 0)))}
                      className="w-20"
                    />
                    <span className="text-sm text-white">
                      % ({formatPLN(operatorCommissionPln)})
                    </span>
                  </div>
                </div>
                <Slider
                  min={2}
                  max={5}
                  step={0.1}
                  value={[operatorCommissionPctClamped]}
                  onValueChange={(v) => setOperatorCommissionPct(v[0])}
                />
                <div className="flex justify-between text-xs text-white/70">
                  <span>2%</span>
                  <span>5%</span>
                </div>
                <div className="grid gap-1.5 border-t border-white/15 pt-2 text-sm sm:grid-cols-2">
                  <div className="flex justify-between text-white/80">
                    <span>Prowizja operatora</span>
                    <b className="tabular-nums text-amber-200">
                      {formatPLN(operatorCommissionPln)}
                    </b>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span>Prowizja netto dla inwestora</span>
                    <b className="tabular-nums text-emerald-200">
                      {formatPLN(investorNetCommissionPln)}
                    </b>
                  </div>
                </div>
                {operatorCommissionPln > commissionPln && (
                  <Alert className="py-2 border-rose-400/60 bg-rose-950/60 text-rose-50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Prowizja operatora przekracza prowizję inwestora — zwiększ prowizję inwestora
                      lub zmniejsz udział operatora.
                    </AlertDescription>
                  </Alert>
                )}
                {internalCashOutExceeds && (
                  <Alert className="py-2 border-rose-400/60 bg-rose-950/60 text-rose-50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Wkład inwestora <b>{formatPLN(investorCashOut)}</b> przekracza limit{" "}
                      <b>100 000 zł</b> dla oferty wewnętrznej. Zmniejsz kwotę pożyczki lub zwiększ
                      prowizję inwestora.
                    </AlertDescription>
                  </Alert>
                )}
                {internalYieldTooLow && (
                  <Alert className="py-2 border-rose-400/60 bg-rose-950/60 text-rose-50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Realny roczny zysk inwestora <b>{investorRoiAnnualPct.toFixed(1)}%</b> jest
                      poniżej minimum <b>36% RRSO</b>. Zwiększ oprocentowanie, prowizję inwestora
                      lub skróć okres.
                    </AlertDescription>
                  </Alert>
                )}
                {internalPeriodTooShort && (
                  <Alert className="py-2 border-rose-400/60 bg-rose-950/60 text-rose-50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Minimalny okres pożyczki dla oferty wewnętrznej to <b>12 miesięcy</b>.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {!hideFinanceYouFee && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm grid gap-1.5 sm:grid-cols-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    Prowizja Finance You ({financeYouFeePct}%, koszt klienta — FV od Finance You)
                    {investorGuidance && (
                      <InfoTip text="Wynagrodzenie operatora. Klient dostaje na nią fakturę VAT od Finance You. Prowizja jest potrącana z kwoty udzielonej pożyczki — powiększa kapitał (odsetki liczą się także od niej), klient spłaca ją w ratach, a przez to wraca do inwestora. Podnosi wkład gotówkowy inwestora na starcie, ale jest neutralna dla jego zysku." />
                    )}
                  </span>
                  <b className="tabular-nums">{formatPLN(financeYouFeePln)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Kapitał pożyczki (od którego liczone są odsetki)
                  </span>
                  <b className="tabular-nums">{formatPLN(grossPrincipal)}</b>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Maksymalna rata dla klienta</Label>
                <NumberField
                  value={maxPayment}
                  onCommit={(n) => setMaxPayment(n || 0)}
                  className="w-40"
                />
              </div>
              <Slider
                min={500}
                max={50000}
                step={100}
                value={[Math.min(50000, Math.max(500, maxPayment))]}
                onValueChange={(v) => setMaxPayment(v[0])}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>500 zł</span>
                <span>50 000 zł</span>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm grid gap-1.5 sm:grid-cols-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    Rata nominalna (annuitet)
                    {investorGuidance && (
                      <InfoTip text="Pełna rata annuitetowa wyliczona od kwoty nominalnej pożyczki i oprocentowania." />
                    )}
                  </span>
                  <b className="tabular-nums">{formatPLN(schedule.nominalRata)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    Rata balonowa (ostatnia nadwyżka)
                    {investorGuidance && (
                      <InfoTip text="Jednorazowa spłata nadwyżki kapitału na koniec umowy, gdy rata miesięczna jest ograniczona limitem." />
                    )}
                  </span>
                  <b className="tabular-nums">{formatPLN(schedule.balloon)}</b>
                </div>
              </div>
              {schedule.balloon > 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Część zobowiązania przekraczająca maksymalną ratę zostanie rozliczona w racie
                    balonowej na koniec okresu.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      </FancyShell>

      {nonInterestExceeds && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Upewnij się, że pożyczka jest w modelu B2B</AlertTitle>
          <AlertDescription className="pt-1">
            Koszty pozaodsetkowe <b>{formatPLN(nonInterestTotal)}</b> przekraczają limit MPKK{" "}
            <b>{formatPLN(maxNonInterest)}</b> (art. 36a UoKK). Limit ten dotyczy{" "}
            <b>kredytu konsumenckiego</b> — przy umowie z konsumentem nadwyżka będzie nienależna.
            Aby kontynuować z tą prowizją, pożyczkobiorca musi być przedsiębiorcą, a pożyczka
            udzielona w <b>modelu B2B</b> (na cele związane z prowadzoną działalnością gospodarczą).
          </AlertDescription>
        </Alert>
      )}

      {/* STATUSY — 3 niezależne składniki: Odsetki / MPKK / Krotność (fancy) */}
      {(() => {
        const baseCls =
          "border-2 rounded-xl p-4 [&_b]:text-white [&_b]:font-bold [&>svg]:!top-4 [&>svg]:!left-4 [&>svg+div]:!pl-7 [&_[data-slot=alert-title]]:!text-base [&_[data-slot=alert-title]]:!font-bold [&_[data-slot=alert-title]]:!mb-1";
        const okCls = `${baseCls} border-emerald-400/70 bg-emerald-950/80 text-emerald-50 shadow-[0_0_40px_-12px_rgba(16,185,129,0.7)] [&_[data-slot=alert-description]]:!text-emerald-50/95`;
        const warnCls = `${baseCls} border-amber-400/70 bg-amber-950/80 text-amber-50 shadow-[0_0_40px_-12px_rgba(245,158,11,0.7)] [&_[data-slot=alert-description]]:!text-amber-50/95`;
        const dangerCls = `${baseCls} border-rose-400/80 bg-rose-950/80 text-rose-50 shadow-[0_0_40px_-10px_rgba(244,63,94,0.8)] [&_[data-slot=alert-description]]:!text-rose-50/95`;
        return (
          <div className="space-y-3">
            {/* 1) Odsetki maksymalne (art. 359 §2¹ KC) */}
            {interestExceeds ? (
              <Alert className={dangerCls}>
                <AlertTriangle className="h-4 w-4 !text-rose-300" />
                <AlertTitle>Odsetki — przekroczony limit ustawowy</AlertTitle>
                <AlertDescription className="pt-1 text-rose-100/90">
                  Oprocentowanie <b>{annualRate.toFixed(2)}%</b> przekracza limit (
                  <b>{MAX_INTEREST_RATE.toFixed(2)}%</b> = 2 × (stopa ref. NBP{" "}
                  {effectiveRefRate.toFixed(2)}% + 3,5 p.p.), art. 359 §2¹ KC). Pożyczkobiorca może
                  żądać zwrotu nadpłaconych odsetek — nadwyżka nie jest egzekwowalna.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className={okCls}>
                <CheckCircle2 className="h-4 w-4 !text-emerald-300" />
                <AlertTitle>Odsetki w limicie ustawowym</AlertTitle>
                <AlertDescription className="text-sm text-emerald-100/90">
                  Oprocentowanie <b>{annualRate.toFixed(2)}%</b> ≤ limit{" "}
                  <b>{MAX_INTEREST_RATE.toFixed(2)}%</b> (art. 359 §2¹ KC — odsetki maksymalne).
                </AlertDescription>
              </Alert>
            )}

            {/* 2) MPKK — zasady współżycia społecznego (art. 58 §2 KC) / wyzysk (art. 388 KC) */}
            {investorGuidance &&
              (nonInterestExceeds || commissionOver45 ? (
                <Alert className={dangerCls}>
                  <ShieldAlert className="h-4 w-4 !text-rose-300" />
                  <AlertTitle>MPKK — silne ryzyko zasad współżycia społecznego</AlertTitle>
                  <AlertDescription className="text-sm text-rose-100/90">
                    Prowizja <b>{formatPLN(commissionPln)}</b>{" "}
                    {commissionOver45 ? (
                      "przekracza 45% kwoty nominalnej — absolutne maksimum referencyjne MPKK"
                    ) : (
                      <>
                        przekracza limit MPKK <b>{formatPLN(maxNonInterest)}</b>
                      </>
                    )}
                    . Ryzyko nieważności postanowień (art. 58 §2 KC) i wyzysku (art. 388 KC).
                  </AlertDescription>
                </Alert>
              ) : commissionPln > maxNonInterest + 1e-9 ? (
                <Alert className={warnCls}>
                  <AlertTriangle className="h-4 w-4 !text-amber-300" />
                  <AlertTitle>MPKK — prowizja powyżej referencyjnego limitu</AlertTitle>
                  <AlertDescription className="text-sm text-amber-100/90">
                    Prowizja <b>{formatPLN(commissionPln)}</b> przekracza referencyjny limit MPKK{" "}
                    <b>{formatPLN(maxNonInterest)}</b>. Sądy stosują MPKK przy ocenie zasad
                    współżycia społecznego (art. 58 §2 KC) i wyzysku (art. 388 KC).
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className={okCls}>
                  <CheckCircle2 className="h-4 w-4 !text-emerald-300" />
                  <AlertTitle>MPKK w limicie — zgodne z zasadami współżycia społecznego</AlertTitle>
                  <AlertDescription className="text-sm text-emerald-100/90">
                    Koszty pozaodsetkowe <b>{formatPLN(commissionPln)}</b> ≤{" "}
                    <b>{formatPLN(maxNonInterest)}</b> (art. 58 §2 KC — referencyjny limit MPKK).
                  </AlertDescription>
                </Alert>
              ))}

            {/* 3) Krotność spłaty — lichwa (art. 304 KK) */}
            {investorGuidance &&
              (krotnoscDanger ? (
                <Alert className={dangerCls}>
                  <ShieldAlert className="h-4 w-4 !text-rose-300" />
                  <AlertTitle>
                    Krotność {krotnosc.toFixed(2)}× — ryzyko lichwy (art. 304 KK)
                  </AlertTitle>
                  <AlertDescription className="text-sm text-rose-100/90">
                    Pożyczkobiorca oddaje <b>{krotnosc.toFixed(2)}×</b> kwotę otrzymaną na rękę.
                    Powyżej 2,0× rośnie ryzyko zakwalifikowania jako lichwa (art. 304 KK — kara do 3
                    lat) i wyzysk (art. 388 KC).
                  </AlertDescription>
                </Alert>
              ) : krotnoscWarn ? (
                <Alert className={warnCls}>
                  <AlertTriangle className="h-4 w-4 !text-amber-300" />
                  <AlertTitle>Krotność {krotnosc.toFixed(2)}× — strefa ostrzegawcza</AlertTitle>
                  <AlertDescription className="text-sm text-amber-100/90">
                    Pożyczkobiorca spłaca <b>{krotnosc.toFixed(2)}×</b> kwotę, którą otrzymał.
                    Powyżej 2,0× istnieje ryzyko zakwalifikowania jako lichwa (art. 304 KK).
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className={okCls}>
                  <CheckCircle2 className="h-4 w-4 !text-emerald-300" />
                  <AlertTitle>
                    Krotność {krotnosc.toFixed(2)}× — bezpieczna (brak ryzyka lichwy)
                  </AlertTitle>
                  <AlertDescription className="text-sm text-emerald-100/90">
                    Pożyczkobiorca spłaca <b>{krotnosc.toFixed(2)}×</b> kwotę otrzymaną — poniżej
                    progu 2,0× (art. 304 KK).
                  </AlertDescription>
                </Alert>
              ))}
          </div>
        );
      })()}

      <FancyShell>
        <Card
          className={`${FANCY_CARD_CLS} ${investorGuidance && krotnoscDanger ? "ring-2 ring-rose-400/60" : ""}`}
        >
          <CardHeader>
            <CardTitle className="text-white">Podsumowanie</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
            <div className="flex justify-between">
              <span>Kwota nominalna (kapitał)</span>
              <b className="tabular-nums">{formatPLN(amount)}</b>
            </div>
            <div className="flex justify-between">
              <span>Do wypłaty klientowi na rękę</span>
              <b className="tabular-nums text-emerald-300">{formatPLN(disbursedOnHand)}</b>
            </div>
            <div className="flex justify-between">
              <span>Odsetki razem</span>
              <b className="tabular-nums">{formatPLN(schedule.totalOds)}</b>
            </div>

            <div className="flex justify-between">
              <span>
                Prowizja dla inwestora{" "}
                <span className="text-xs text-white/60">(koszt pozaodsetkowy)</span>
              </span>
              <b className="tabular-nums">{formatPLN(commissionPln)}</b>
            </div>
            {internalOperatorMode && (
              <>
                <div className="flex justify-between">
                  <span className="pl-3">
                    ↳ prowizja operatora ({operatorCommissionPctClamped.toFixed(1)}%)
                  </span>
                  <b className="tabular-nums text-amber-200">{formatPLN(operatorCommissionPln)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="pl-3">↳ prowizja netto inwestora</span>
                  <b className="tabular-nums text-emerald-200">
                    {formatPLN(investorNetCommissionPln)}
                  </b>
                </div>
              </>
            )}
            {!hideFinanceYouFee && (
              <div className="flex justify-between">
                <span>
                  Prowizja Finance You{" "}
                  <span className="text-xs text-white/60">
                    (koszt klienta, FV od Finance You — kredytowana do kapitału)
                  </span>
                </span>
                <b className="tabular-nums">{formatPLN(financeYouFeePln)}</b>
              </div>
            )}

            {investorGuidance && (
              <div className="flex justify-between">
                <span className="flex items-center gap-1">
                  Krotność spłaty{" "}
                  <InfoTip text="Ile razy pożyczkobiorca oddaje więcej niż otrzymał na rękę (łączna spłata ÷ kwota na rękę). Prowizje inwestora i Finance You są potrącane z góry z kwoty pożyczki i klient spłaca je w ratach — dlatego podnoszą krotność." />
                </span>
                <b
                  className={`tabular-nums ${krotnoscDanger ? "text-rose-300" : krotnoscWarn ? "text-amber-300" : ""}`}
                >
                  {krotnosc.toFixed(2)}×
                </b>
              </div>
            )}
            <div className="flex justify-between">
              <span>
                Całkowity koszt pożyczki{" "}
                <span className="text-xs text-white/60">
                  (odsetki + prowizja inwestora{!hideFinanceYouFee && " + prowizja FY"})
                </span>
              </span>
              <b className="tabular-nums">{formatPLN(totalCost)}</b>
            </div>
            <div className="flex justify-between">
              <span>
                Wkład gotówkowy inwestora{" "}
                <span className="text-xs text-white/60">
                  {hideFinanceYouFee ? "" : "(na rękę dla klienta + prowizja FY do Finance You)"}
                </span>
              </span>
              <b className="tabular-nums">{formatPLN(investorCashOut)}</b>
            </div>
            <div className="flex justify-between">
              <span>
                Zysk inwestora{" "}
                <span className="text-xs text-white/60">(odsetki + prowizja inwestora netto)</span>
              </span>
              <b className="tabular-nums text-emerald-300">{formatPLN(investorProfit)}</b>
            </div>
            <div className="flex justify-between md:col-span-2 border-t border-white/15 pt-2">
              <span>Łączna kwota do spłaty (raty z harmonogramu)</span>
              <b className="tabular-nums">{formatPLN(totalToRepay)}</b>
            </div>
          </CardContent>
        </Card>
      </FancyShell>

      {investorGuidance && schedule.rows.length > 0 && (
        <FancyShell>
          <Card className={FANCY_CARD_CLS}>
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Scale className="h-4 w-4" /> Proponowane zabezpieczenia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Rodzaj nieruchomości (zabezpieczenie){" "}
                    <InfoTip text="Dla mieszkania i domu obowiązuje próg z art. 952¹ § 2 KPC: wierzyciel może wyznaczyć licytację dopiero, gdy należność główna wynosi co najmniej 5% (1/20) sumy oszacowania." />
                  </Label>
                  <Select value={propertyType} onValueChange={setPropertyType}>
                    <SelectTrigger className="w-full bg-white text-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(propertyTypeLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Wartość nieruchomości (suma oszacowania){" "}
                    <InfoTip text="Szacunkowa wartość rynkowa przyjmowana jako suma oszacowania w egzekucji. Od niej liczone są ceny wywołania licytacji (3/4 i 2/3) oraz próg 5% dla mieszkań i domów. Zostaw 0, aby pominąć analizę zabezpieczenia." />
                  </Label>
                  <NumberField
                    value={propertyValue}
                    onCommit={(n) => setPropertyValue(Math.max(0, Math.round(n || 0)))}
                    className="w-full bg-white text-slate-900"
                  />
                  <p className="text-xs text-white/60">0 = pomiń analizę zabezpieczenia.</p>
                </div>
              </div>

              {propertyValue > 0 && (
                <>
                  <div className="rounded-md border border-white/15 bg-white/[0.05] p-3 text-sm grid gap-1.5 sm:grid-cols-2">
                    <div className="flex justify-between">
                      <span className="text-white/70">LTV (kwota nominalna / wartość)</span>
                      <b className="tabular-nums">{ltvPct.toFixed(1)}%</b>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/70">Próg 5% licytacji (art. 952¹ § 2 KPC)</span>
                      <b className="tabular-nums">
                        {auctionBlock.applicable
                          ? formatPLN(auctionBlock.thresholdPln ?? 0)
                          : "nie dotyczy"}
                      </b>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/70">I licytacja — cena wywołania (3/4)</span>
                      <b className="tabular-nums">{formatPLN(firstAuctionPln)}</b>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/70">
                        Wartość „po komorniku" (2/3 — II licytacja / przejęcie)
                      </span>
                      <b className="tabular-nums">{formatPLN(secondAuctionPln)}</b>
                    </div>
                    <div className="flex justify-between sm:col-span-2 border-t border-white/15 pt-1.5">
                      <span className="text-white/70">
                        Pokrycie łącznej należności ({formatPLN(totalToRepay)}) wartością „po
                        komorniku"
                      </span>
                      <b
                        className={`tabular-nums ${collateralShortfall ? "text-rose-300" : "text-emerald-300"}`}
                      >
                        {collateralCoveragePct.toFixed(0)}%
                      </b>
                    </div>
                  </div>

                  {auctionBlock.blocked && (
                    <Alert className="py-2 border-rose-400/60 bg-rose-950/60 text-rose-50">
                      <ShieldAlert className="h-4 w-4" />
                      <AlertTitle>
                        Możliwa blokada licytacji — kwota poniżej 5% wartości (art. 952¹ § 2 KPC)
                      </AlertTitle>
                      <AlertDescription className="text-xs">
                        {auctionBlock.message}
                      </AlertDescription>
                    </Alert>
                  )}
                  {collateralShortfall && (
                    <Alert className="py-2 border-amber-400/60 bg-amber-950/60 text-amber-50">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Wartość „po komorniku" ({formatPLN(secondAuctionPln)} = 2/3 sumy
                        oszacowania) nie pokrywa łącznej należności {formatPLN(totalToRepay)}. W
                        razie egzekucji odzysk z samej nieruchomości może być niepełny — rozważ
                        niższą kwotę pożyczki, krótszy okres lub dodatkowe zabezpieczenie.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Proponowana kwota hipoteki{" "}
                    <InfoTip text="Kwota wpisu hipoteki umownej. Domyślnie dwukrotność sumy wszystkich należności inwestora (łącznej kwoty do spłaty). Wpisz własną wartość, aby nadpisać." />
                  </Label>
                  <div className="flex items-center gap-2">
                    <NumberField
                      value={mortgageAmount}
                      onCommit={(n) => setMortgageOverride(Math.max(0, Math.round(n || 0)))}
                      className="w-full bg-white text-slate-900"
                    />
                    {mortgageOverride != null && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-white/80 hover:text-white"
                        title="Przywróć domyślną (2×)"
                        onClick={() => setMortgageOverride(null)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-white/60">
                    Domyślnie 2× łącznej należności inwestora ({formatPLN(proposedSecurityDefault)}
                    ).
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Kwota art. 777 k.p.c. (rygor egzekucji){" "}
                    <InfoTip text="Kwota, do której pożyczkobiorca poddaje się egzekucji wprost z aktu notarialnego (art. 777 § 1 pkt 5 k.p.c.). Domyślnie dwukrotność sumy wszystkich należności inwestora." />
                  </Label>
                  <div className="flex items-center gap-2">
                    <NumberField
                      value={art777Amount}
                      onCommit={(n) => setArt777Override(Math.max(0, Math.round(n || 0)))}
                      className="w-full bg-white text-slate-900"
                    />
                    {art777Override != null && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-white/80 hover:text-white"
                        title="Przywróć domyślną (2×)"
                        onClick={() => setArt777Override(null)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-white/60">
                    Domyślnie 2× łącznej należności inwestora ({formatPLN(proposedSecurityDefault)}
                    ).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </FancyShell>
      )}

      <FancyShell>
        <Card className={FANCY_CARD_CLS}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Harmonogram spłat</CardTitle>
            {investorGuidance && schedule.rows.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendCalcToCreator}
                  className="bg-white text-slate-900 hover:bg-white/90 border-white"
                  title="Przekaż dane kalkulacji do kreatorów w aplikacji"
                >
                  <Send className="mr-2 h-3.5 w-3.5" /> Wyślij do kreatora
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadCalcPdf}
                  className="bg-white text-slate-900 hover:bg-white/90 border-white"
                  title="PDF z danymi kalkulacji — Kreator dokumentów odczyta je automatycznie"
                >
                  <Download className="mr-2 h-3.5 w-3.5" /> Pobierz PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={printSchedulePdf}
                  className="bg-white text-slate-900 hover:bg-white/90 border-white"
                >
                  <Printer className="mr-2 h-3.5 w-3.5" /> Drukuj
                </Button>
                <Dialog open={sendOpen} onOpenChange={setSendOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white text-slate-900 hover:bg-white/90 border-white"
                    >
                      <Send className="mr-2 h-3.5 w-3.5" /> Wyślij do klienta
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Wyślij harmonogram do klienta</DialogTitle>
                      <DialogDescription>
                        Klient otrzyma e-mail z podsumowaniem oferty i pełnym harmonogramem spłat.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className="space-y-1.5">
                        <Label>Adres e-mail klienta</Label>
                        <Input
                          type="email"
                          value={recipient}
                          onChange={(e) => setRecipient(e.target.value)}
                          placeholder="klient@example.com"
                        />
                      </div>
                      <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Do wypłaty na rękę</span>
                          <b className="tabular-nums">{formatPLN(onHand)}</b>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Rata miesięczna</span>
                          <b className="tabular-nums">{formatPLN(schedule.cappedRata)}</b>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Okres</span>
                          <b className="tabular-nums">{months} mies.</b>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Łączna kwota do spłaty</span>
                          <b className="tabular-nums">{formatPLN(totalToRepay)}</b>
                        </div>
                      </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                      <Button variant="outline" onClick={printSchedulePdf}>
                        <Printer className="mr-2 h-4 w-4" /> Podgląd / PDF
                      </Button>
                      <Button onClick={handleSendToClient} disabled={sending || !recipient.trim()}>
                        {sending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Wysyłam…
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" /> Wyślij e-mail
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Dialog open={exportOpen} onOpenChange={setExportOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white text-slate-900 hover:bg-white/90 border-white"
                    >
                      <Download className="mr-2 h-3.5 w-3.5" /> Pobierz jako CSV
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Weryfikacja przed pobraniem harmonogramu</DialogTitle>
                      <DialogDescription>
                        Potwierdź założenia zanim wygenerujesz dokument.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={checkRate}
                          onCheckedChange={(c) => setCheckRate(Boolean(c))}
                          className="mt-0.5"
                        />
                        <span>
                          Potwierdzam aktualną stopę ref. NBP: <b>{effectiveRefRate.toFixed(2)}%</b>{" "}
                          (limit odsetek: {MAX_INTEREST_RATE.toFixed(2)}%).
                        </span>
                      </label>
                      <div className="flex items-center gap-2 text-sm pl-6">
                        <span className="text-muted-foreground">Data zawarcia umowy:</span>
                        <Input
                          type="date"
                          value={agreementDate}
                          onChange={(e) => setAgreementDate(e.target.value)}
                          className="w-44"
                        />
                      </div>
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={checkCommission}
                          onCheckedChange={(c) => setCheckCommission(Boolean(c))}
                          className="mt-0.5"
                        />
                        <span>
                          Prowizja <b>{formatPLN(commissionPln)}</b> mieści się w przyjętym limicie
                          referencyjnym
                          {commissionPln > maxNonInterest ? " (UWAGA: powyżej MPKK)" : ""}.
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={checkKrotnosc}
                          onCheckedChange={(c) => setCheckKrotnosc(Boolean(c))}
                          className="mt-0.5"
                        />
                        <span>
                          Krotność spłaty: <b>{krotnosc.toFixed(2)}×</b> — akceptuję ryzyko prawne.
                        </span>
                      </label>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={downloadScheduleCsv}
                        disabled={
                          !checkRate || !checkCommission || !checkKrotnosc || !agreementDate
                        }
                      >
                        <Download className="mr-2 h-4 w-4" /> Pobierz harmonogram
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto rounded-lg border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/80">#</TableHead>
                    <TableHead className="text-white/80">Termin</TableHead>
                    <TableHead className="text-white/80">Rata</TableHead>
                    <TableHead className="text-white/80">Kapitał</TableHead>
                    <TableHead className="text-white/80">Odsetki</TableHead>
                    <TableHead className="text-white/80">Prowizja</TableHead>
                    <TableHead className="text-white/80">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.rows.map((r) => (
                    <TableRow key={r.idx} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-white/90">{r.idx}</TableCell>
                      <TableCell className="text-white/90">{r.date}</TableCell>
                      <TableCell className="tabular-nums text-white">{formatPLN(r.rata)}</TableCell>
                      <TableCell className="tabular-nums text-white">{formatPLN(r.kap)}</TableCell>
                      <TableCell className="tabular-nums text-white">{formatPLN(r.ods)}</TableCell>
                      <TableCell className="tabular-nums text-white">
                        {formatPLN(r.prow ?? 0)}
                      </TableCell>
                      <TableCell className="tabular-nums text-white">
                        {formatPLN(r.saldo)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </FancyShell>

      {investorGuidance && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Kalkulator ma charakter informacyjny. Nie stanowi porady prawnej ani finansowej. Limity
          odsetek zmieniają się z decyzjami RPP — weryfikuj je przed każdym podpisaniem umowy.
          Finance You Sp. z o.o. zaleca konsultację prawną przy niestandardowych strukturach
          pożyczek. Podstawy prawne: art. 359 §2¹ KC (odsetki maksymalne), art. 36a UoKK (MPKK
          ref.), art. 388 KC (wyzysk), art. 304 KK (lichwa), art. 58 §2 KC (zasady współżycia
          społecznego).
        </p>
      )}
    </div>
  );
}
