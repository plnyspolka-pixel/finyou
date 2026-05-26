import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy } from "lucide-react";

export const Route = createFileRoute("/admin/kreator-pozyczki")({
  component: KreatorPozyczki,
});

// ───────────────────────────── helpers
const n = (v: string | number) => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};
const fmtPLN = (v: number) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(v || 0);
const fmtNum = (v: number, d = 2) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v || 0);
const addMonths = (iso: string, m: number) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const nd = new Date(d.getFullYear(), d.getMonth() + m, d.getDate());
  return nd.toISOString().slice(0, 10);
};
const plDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pl-PL");
};

// ───────────────────────────── types
type Client = {
  imie: string; nip: string; pesel: string; doc: string; adres: string; tel: string; email: string;
  forma: string; cel: string;
  // nieruchomość
  np_typ: string; np_kw: string; np_adres: string; np_wartosc: string;
  np_hipoteka_jest: boolean; np_hipoteka_kwota: string;
  np_wlasciciel: string; np_wlasciciel_jest_pb: boolean; np_potrzebny_poreczyciel: boolean;
  // preferencje
  pref_na_reke: string; pref_max_rata: string; pref_okres: string; pref_data_wyplaty: string;
  wyplata_sposob: string; wyplata_konto: string;
  // oświadczenia
  ośw_b2b: boolean; ośw_przedsiebiorca: boolean; ośw_niekonsument: boolean; ośw_prawda: boolean; ośw_warunki: boolean;
};
type Investor = {
  nazwa: string; adres: string; nip_pesel: string; konto: string; rodo_admin: string; email: string; tel: string;
  // decyzja
  kwota_na_reke: string;
  wyn_typ: "amount" | "percent";
  wyn_kwota: string; wyn_proc: string;
  prowizja: string;
  okres: string;
  data_wyplaty: string; data_zawarcia: string;
  oproc_roczne: string;
};
type Offer = {
  netAmountToClient: number;
  creditedCommission: number;
  nominalLoanAmount: number;
  maxMonthlyPaymentByClient: number;
  loanTermMonths: number;
  expectedMonthlyInvestorReturn: number;
  annualInterestPercent: number;
  monthlyInterestAmount: number;
  monthlyRiskFeeAmount: number;
  monthlyRiskFeePercent: number;
  warnings: string[];
};
type ScheduleRow = {
  lp: number; date: string; rata: number; kapital: number; odsetki: number; ryzyko: number; saldo: number; balon?: boolean;
};

// ───────────────────────────── core logic
function computeOffer(c: Client, inv: Investor): Offer {
  const netAmountToClient = n(inv.kwota_na_reke) || n(c.pref_na_reke);
  const creditedCommission = n(inv.prowizja);
  const nominalLoanAmount = netAmountToClient + creditedCommission;
  const loanTermMonths = Math.max(0, Math.round(n(inv.okres) || n(c.pref_okres)));
  const maxMonthlyPaymentByClient = n(c.pref_max_rata);
  const expectedMonthlyInvestorReturn =
    inv.wyn_typ === "percent"
      ? netAmountToClient * (n(inv.wyn_proc) / 100)
      : n(inv.wyn_kwota);
  const annualInterestPercent = n(inv.oproc_roczne);
  const monthlyInterestAmount = (nominalLoanAmount * annualInterestPercent) / 100 / 12;
  let monthlyRiskFeeAmount = expectedMonthlyInvestorReturn - monthlyInterestAmount;
  const warnings: string[] = [];
  if (monthlyRiskFeeAmount < 0) {
    warnings.push("Oprocentowanie roczne generuje odsetki wyższe niż oczekiwane miesięczne wynagrodzenie inwestora.");
    monthlyRiskFeeAmount = 0;
  }
  const monthlyRiskFeePercent = nominalLoanAmount > 0 ? (monthlyRiskFeeAmount / nominalLoanAmount) * 100 : 0;

  if (maxMonthlyPaymentByClient > expectedMonthlyInvestorReturn && expectedMonthlyInvestorReturn > 0) {
    warnings.push("Nadwyżka ponad wynagrodzenie inwestora pomniejsza kapitał bieżąco.");
  } else if (maxMonthlyPaymentByClient === expectedMonthlyInvestorReturn && expectedMonthlyInvestorReturn > 0) {
    warnings.push("Kapitał będzie spłacany w racie balonowej.");
  } else if (expectedMonthlyInvestorReturn > 0 && maxMonthlyPaymentByClient > 0) {
    warnings.push("Część wynagrodzenia inwestora zostanie rozliczona w racie balonowej.");
  }

  return {
    netAmountToClient, creditedCommission, nominalLoanAmount,
    maxMonthlyPaymentByClient, loanTermMonths, expectedMonthlyInvestorReturn,
    annualInterestPercent, monthlyInterestAmount, monthlyRiskFeeAmount, monthlyRiskFeePercent,
    warnings,
  };
}

function buildDirectorSchedule(o: Offer, startDate: string): { rows: ScheduleRow[]; balloon: number; totals: { rata: number; kap: number; ods: number; ryz: number; } } {
  const rows: ScheduleRow[] = [];
  if (!o.loanTermMonths || !o.nominalLoanAmount) return { rows, balloon: 0, totals: { rata: 0, kap: 0, ods: 0, ryz: 0 } };

  let saldo = o.nominalLoanAmount;
  let nierozliczoneOds = 0;
  let nierozliczoneRyz = 0;

  const totalInterestRatio =
    o.monthlyInterestAmount + o.monthlyRiskFeeAmount > 0
      ? o.monthlyInterestAmount / (o.monthlyInterestAmount + o.monthlyRiskFeeAmount)
      : 1;

  // raty 1..N-1 (bieżące), ostatni wiersz to balon
  const regularMonths = Math.max(0, o.loanTermMonths - 1);
  for (let i = 1; i <= regularMonths; i++) {
    const date = addMonths(startDate, i);
    const rata = o.maxMonthlyPaymentByClient;
    let odsThis = 0;
    let ryzThis = 0;
    let kapThis = 0;

    if (rata >= o.expectedMonthlyInvestorReturn) {
      odsThis = o.monthlyInterestAmount;
      ryzThis = o.monthlyRiskFeeAmount;
      kapThis = rata - (odsThis + ryzThis);
      if (kapThis > saldo) kapThis = saldo;
      saldo -= kapThis;
    } else {
      // rata < wynagrodzenie inwestora — alokacja proporcjonalna: najpierw odsetki, potem ryzyko
      let remaining = rata;
      odsThis = Math.min(remaining, o.monthlyInterestAmount);
      remaining -= odsThis;
      ryzThis = Math.min(remaining, o.monthlyRiskFeeAmount);
      nierozliczoneOds += o.monthlyInterestAmount - odsThis;
      nierozliczoneRyz += o.monthlyRiskFeeAmount - ryzThis;
      kapThis = 0;
    }

    rows.push({ lp: i, date, rata: odsThis + ryzThis + kapThis, kapital: kapThis, odsetki: odsThis, ryzyko: ryzThis, saldo });
  }

  // rata balonowa
  const balloonDate = addMonths(startDate, o.loanTermMonths);
  // ostatni miesiąc — także generuje wynagrodzenie inwestora
  const lastMonthOds = o.monthlyInterestAmount;
  const lastMonthRyz = o.monthlyRiskFeeAmount;
  nierozliczoneOds += lastMonthOds;
  nierozliczoneRyz += lastMonthRyz;

  const balloonKapital = saldo;
  const balloonOds = nierozliczoneOds;
  const balloonRyz = nierozliczoneRyz;
  const balloonRata = balloonKapital + balloonOds + balloonRyz;
  rows.push({
    lp: o.loanTermMonths, date: balloonDate, rata: balloonRata,
    kapital: balloonKapital, odsetki: balloonOds, ryzyko: balloonRyz, saldo: 0, balon: true,
  });

  const totals = rows.reduce(
    (acc, r) => ({ rata: acc.rata + r.rata, kap: acc.kap + r.kapital, ods: acc.ods + r.odsetki, ryz: acc.ryz + r.ryzyko }),
    { rata: 0, kap: 0, ods: 0, ryz: 0 }
  );
  return { rows, balloon: balloonRata, totals };
}

// ───────────────────────────── component
function KreatorPozyczki() {
  const [client, setClient] = useState<Client>({
    imie: "", nip: "", pesel: "", doc: "", adres: "", tel: "", email: "",
    forma: "Działalność gospodarcza", cel: "",
    np_typ: "mieszkanie", np_kw: "", np_adres: "", np_wartosc: "",
    np_hipoteka_jest: false, np_hipoteka_kwota: "",
    np_wlasciciel: "", np_wlasciciel_jest_pb: true, np_potrzebny_poreczyciel: false,
    pref_na_reke: "", pref_max_rata: "", pref_okres: "12", pref_data_wyplaty: "",
    wyplata_sposob: "przelew_klient", wyplata_konto: "",
    ośw_b2b: true, ośw_przedsiebiorca: true, ośw_niekonsument: true, ośw_prawda: true, ośw_warunki: true,
  });
  const [investor, setInvestor] = useState<Investor>({
    nazwa: "", adres: "", nip_pesel: "", konto: "", rodo_admin: "", email: "", tel: "",
    kwota_na_reke: "", wyn_typ: "amount", wyn_kwota: "", wyn_proc: "",
    prowizja: "0", okres: "12", data_wyplaty: "", data_zawarcia: "",
    oproc_roczne: "10",
  });
  const [nbpRate, setNbpRate] = useState<string>("5.75");
  const [nbpDate, setNbpDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const offer = useMemo(() => computeOffer(client, investor), [client, investor]);
  const startDate = investor.data_wyplaty || investor.data_zawarcia || client.pref_data_wyplaty || new Date().toISOString().slice(0, 10);
  const sched = useMemo(() => buildDirectorSchedule(offer, startDate), [offer, startDate]);

  const totalClientObligation = sched.totals.rata;
  const totalInvestorProfit = sched.totals.ods + sched.totals.ryz + offer.creditedCommission;
  const annualizedInvestorProfitAmount = offer.loanTermMonths > 0 ? (totalInvestorProfit / offer.loanTermMonths) * 12 : 0;
  const annualizedInvestorProfitPercent = offer.netAmountToClient > 0 ? (annualizedInvestorProfitAmount / offer.netAmountToClient) * 100 : 0;

  const minMortgage = totalClientObligation * 1.5;
  const min777 = totalClientObligation * 1.5;
  const okres777End = addMonths(investor.data_zawarcia, offer.loanTermMonths + 36);

  const nbpAnnual = (n(nbpRate) + 3.5) * 2;
  const nbpMonthly = nbpAnnual / 12;

  const canCompute = offer.netAmountToClient > 0 && offer.maxMonthlyPaymentByClient > 0 && offer.loanTermMonths > 0 && offer.expectedMonthlyInvestorReturn > 0;

  // documents
  const docWniosek = useMemo(() => buildWniosek(client, investor, offer), [client, investor, offer]);
  const docUmowa = useMemo(() => buildUmowa(client, investor, offer, sched.balloon, totalClientObligation), [client, investor, offer, sched.balloon, totalClientObligation]);
  const docHarmonogram = useMemo(() => buildHarmonogramDoc(sched.rows, offer), [sched.rows, offer]);
  const docProtokol = useMemo(() => buildProtokol(client, investor, offer), [client, investor, offer]);

  const copy = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt).then(() => toast.success(`Skopiowano: ${label}`));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Kreator umów pożyczkowych B2B</h1>
          <p className="text-sm text-muted-foreground">Sekretarka finansowa inwestora prywatnego — pożyczki zabezpieczone hipoteką.</p>
        </div>
        <div className="flex items-center gap-2">
          {canCompute
            ? <Badge variant="secondary">Harmonogram kompletny</Badge>
            : <Badge variant="outline">Uzupełnij wymagane dane</Badge>}
          <Button variant="outline" onClick={() => toast.success("Oferta przeliczona")}>Przelicz ofertę</Button>
        </div>
      </div>

      <Tabs defaultValue="klient" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="klient">Klient</TabsTrigger>
          <TabsTrigger value="nieruchomosc">Nieruchomość</TabsTrigger>
          <TabsTrigger value="inwestor">Inwestor</TabsTrigger>
          <TabsTrigger value="oferta">Oferta finansowa</TabsTrigger>
          <TabsTrigger value="harmonogram">Harmonogram</TabsTrigger>
          <TabsTrigger value="zabezp">Zabezpieczenia</TabsTrigger>
          <TabsTrigger value="dokumenty">Dokumenty</TabsTrigger>
        </TabsList>

        {/* ────── KLIENT ────── */}
        <TabsContent value="klient" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Dane pożyczkobiorcy (widok klienta)</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <Field label="Imię i nazwisko / firma"><Input value={client.imie} onChange={e=>setClient({...client, imie: e.target.value})}/></Field>
              <Field label="NIP"><Input value={client.nip} onChange={e=>setClient({...client, nip: e.target.value})}/></Field>
              <Field label="PESEL (jeśli os. fiz. prowadząca DG)"><Input value={client.pesel} onChange={e=>setClient({...client, pesel: e.target.value})}/></Field>
              <Field label="Numer dokumentu tożsamości"><Input value={client.doc} onChange={e=>setClient({...client, doc: e.target.value})}/></Field>
              <Field label="Adres zamieszkania / siedziby"><Input value={client.adres} onChange={e=>setClient({...client, adres: e.target.value})}/></Field>
              <Field label="Telefon"><Input value={client.tel} onChange={e=>setClient({...client, tel: e.target.value})}/></Field>
              <Field label="E-mail"><Input value={client.email} onChange={e=>setClient({...client, email: e.target.value})}/></Field>
              <Field label="Forma działalności"><Input value={client.forma} onChange={e=>setClient({...client, forma: e.target.value})}/></Field>
              <Field label="Cel pożyczki (związany z działalnością gospodarczą)" className="md:col-span-2">
                <Textarea value={client.cel} onChange={e=>setClient({...client, cel: e.target.value})}/>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Preferencje finansowe klienta</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <Field label="Kwota potrzebna „na rękę” (PLN)"><Input type="number" value={client.pref_na_reke} onChange={e=>setClient({...client, pref_na_reke: e.target.value})}/></Field>
              <Field label="Maksymalna miesięczna rata bieżąca (PLN)"><Input type="number" value={client.pref_max_rata} onChange={e=>setClient({...client, pref_max_rata: e.target.value})}/></Field>
              <Field label="Preferowany okres pożyczki (m-cy)"><Input type="number" value={client.pref_okres} onChange={e=>setClient({...client, pref_okres: e.target.value})}/></Field>
              <Field label="Preferowana data wypłaty"><Input type="date" value={client.pref_data_wyplaty} onChange={e=>setClient({...client, pref_data_wyplaty: e.target.value})}/></Field>
              <Field label="Sposób wypłaty środków">
                <Select value={client.wyplata_sposob} onValueChange={v=>setClient({...client, wyplata_sposob: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="przelew_klient">Przelew do klienta</SelectItem>
                    <SelectItem value="gotowka">Gotówka</SelectItem>
                    <SelectItem value="przelew_posrednik">Przelew do pośrednika</SelectItem>
                    <SelectItem value="przelew_notar">Przelew do kancelarii notarialnej</SelectItem>
                    <SelectItem value="podzial">Podział na kilka pozycji</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Rachunek bankowy do wypłaty"><Input value={client.wyplata_konto} onChange={e=>setClient({...client, wyplata_konto: e.target.value})}/></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Oświadczenia klienta (B2B)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Toggle checked={client.ośw_b2b} onChange={v=>setClient({...client, ośw_b2b: v})}>Pożyczka jest związana z działalnością gospodarczą.</Toggle>
              <Toggle checked={client.ośw_przedsiebiorca} onChange={v=>setClient({...client, ośw_przedsiebiorca: v})}>Klient działa jako przedsiębiorca.</Toggle>
              <Toggle checked={client.ośw_niekonsument} onChange={v=>setClient({...client, ośw_niekonsument: v})}>Pożyczka nie ma charakteru konsumenckiego.</Toggle>
              <Toggle checked={client.ośw_prawda} onChange={v=>setClient({...client, ośw_prawda: v})}>Klient potwierdza prawdziwość danych.</Toggle>
              <Toggle checked={client.ośw_warunki} onChange={v=>setClient({...client, ośw_warunki: v})}>Klient rozumie, że ostateczne warunki zależą od decyzji inwestora.</Toggle>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────── NIERUCHOMOŚĆ ────── */}
        <TabsContent value="nieruchomosc" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Nieruchomość — zabezpieczenie hipoteczne</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <Field label="Typ nieruchomości">
                <Select value={client.np_typ} onValueChange={v=>setClient({...client, np_typ: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mieszkanie">Mieszkanie</SelectItem>
                    <SelectItem value="dom">Dom</SelectItem>
                    <SelectItem value="lokal_uslugowy">Lokal usługowy</SelectItem>
                    <SelectItem value="dzialka_budowlana">Działka budowlana</SelectItem>
                    <SelectItem value="grunt_rolny">Grunt rolny</SelectItem>
                    <SelectItem value="inna">Inna</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Numer księgi wieczystej"><Input value={client.np_kw} onChange={e=>setClient({...client, np_kw: e.target.value})}/></Field>
              <Field label="Adres nieruchomości" className="md:col-span-2"><Input value={client.np_adres} onChange={e=>setClient({...client, np_adres: e.target.value})}/></Field>
              <Field label="Szacunkowa wartość (PLN)"><Input type="number" value={client.np_wartosc} onChange={e=>setClient({...client, np_wartosc: e.target.value})}/></Field>
              <Field label="Właściciel nieruchomości"><Input value={client.np_wlasciciel} onChange={e=>setClient({...client, np_wlasciciel: e.target.value})}/></Field>
              <Toggle checked={client.np_hipoteka_jest} onChange={v=>setClient({...client, np_hipoteka_jest: v})}>Istnieje już hipoteka na nieruchomości</Toggle>
              {client.np_hipoteka_jest && (
                <Field label="Kwota istniejącego zadłużenia (PLN)"><Input type="number" value={client.np_hipoteka_kwota} onChange={e=>setClient({...client, np_hipoteka_kwota: e.target.value})}/></Field>
              )}
              <Toggle checked={client.np_wlasciciel_jest_pb} onChange={v=>setClient({...client, np_wlasciciel_jest_pb: v})}>Właściciel jest pożyczkobiorcą</Toggle>
              <Toggle checked={client.np_potrzebny_poreczyciel} onChange={v=>setClient({...client, np_potrzebny_poreczyciel: v})}>Potrzebny poręczyciel / właściciel zabezpieczenia</Toggle>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────── INWESTOR ────── */}
        <TabsContent value="inwestor" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Dane pożyczkodawcy (widok inwestora)</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <Field label="Imię i nazwisko / firma"><Input value={investor.nazwa} onChange={e=>setInvestor({...investor, nazwa: e.target.value})}/></Field>
              <Field label="Adres"><Input value={investor.adres} onChange={e=>setInvestor({...investor, adres: e.target.value})}/></Field>
              <Field label="NIP / PESEL"><Input value={investor.nip_pesel} onChange={e=>setInvestor({...investor, nip_pesel: e.target.value})}/></Field>
              <Field label="Rachunek bankowy do spłat"><Input value={investor.konto} onChange={e=>setInvestor({...investor, konto: e.target.value})}/></Field>
              <Field label="Administrator danych (RODO)"><Input value={investor.rodo_admin} onChange={e=>setInvestor({...investor, rodo_admin: e.target.value})}/></Field>
              <Field label="E-mail"><Input value={investor.email} onChange={e=>setInvestor({...investor, email: e.target.value})}/></Field>
              <Field label="Telefon"><Input value={investor.tel} onChange={e=>setInvestor({...investor, tel: e.target.value})}/></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Decyzja inwestora</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <Field label="Kwota wypłacona klientowi „na rękę” (PLN)"><Input type="number" value={investor.kwota_na_reke} onChange={e=>setInvestor({...investor, kwota_na_reke: e.target.value})}/></Field>
              <Field label="Prowizja kredytowana (PLN)"><Input type="number" value={investor.prowizja} onChange={e=>setInvestor({...investor, prowizja: e.target.value})}/></Field>
              <Field label="Okres pożyczki (m-cy)"><Input type="number" value={investor.okres} onChange={e=>setInvestor({...investor, okres: e.target.value})}/></Field>
              <Field label="Oprocentowanie roczne (%)"><Input type="number" step="0.01" value={investor.oproc_roczne} onChange={e=>setInvestor({...investor, oproc_roczne: e.target.value})}/></Field>
              <Field label="Typ oczekiwanego wynagrodzenia">
                <Select value={investor.wyn_typ} onValueChange={(v: any)=>setInvestor({...investor, wyn_typ: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">Kwotowo (PLN/m-c)</SelectItem>
                    <SelectItem value="percent">Procentowo (% od kwoty „na rękę”/m-c)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {investor.wyn_typ === "amount"
                ? <Field label="Oczekiwane wynagrodzenie miesięczne (PLN)"><Input type="number" value={investor.wyn_kwota} onChange={e=>setInvestor({...investor, wyn_kwota: e.target.value})}/></Field>
                : <Field label="Oczekiwane wynagrodzenie miesięczne (%)"><Input type="number" step="0.01" value={investor.wyn_proc} onChange={e=>setInvestor({...investor, wyn_proc: e.target.value})}/></Field>}
              <Field label="Data wypłaty"><Input type="date" value={investor.data_wyplaty} onChange={e=>setInvestor({...investor, data_wyplaty: e.target.value})}/></Field>
              <Field label="Data zawarcia umowy"><Input type="date" value={investor.data_zawarcia} onChange={e=>setInvestor({...investor, data_zawarcia: e.target.value})}/></Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────── OFERTA ────── */}
        <TabsContent value="oferta" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Oferta finansowa (źródło prawdy)</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <ReadOnly label="Kwota wypłacona klientowi „na rękę”" value={fmtPLN(offer.netAmountToClient)}/>
              <ReadOnly label="Prowizja kredytowana" value={fmtPLN(offer.creditedCommission)}/>
              <ReadOnly label="Nominalna kwota pożyczki" value={fmtPLN(offer.nominalLoanAmount)}/>
              <ReadOnly label="Maksymalna miesięczna rata klienta" value={fmtPLN(offer.maxMonthlyPaymentByClient)}/>
              <ReadOnly label="Okres pożyczki" value={`${offer.loanTermMonths} m-cy`}/>
              <ReadOnly label="Oczekiwane miesięczne wynagrodzenie inwestora" value={fmtPLN(offer.expectedMonthlyInvestorReturn)}/>
              <ReadOnly label="Oprocentowanie roczne" value={`${fmtNum(offer.annualInterestPercent)} %`}/>
              <ReadOnly label="Odsetki miesięczne (od kwoty nominalnej)" value={fmtPLN(offer.monthlyInterestAmount)}/>
              <ReadOnly label="Opłata za ryzyko miesięcznie" value={fmtPLN(offer.monthlyRiskFeeAmount)}/>
              <ReadOnly label="Opłata za ryzyko miesięcznie (%)" value={`${fmtNum(offer.monthlyRiskFeePercent, 3)} %`}/>
            </CardContent>
          </Card>

          {offer.warnings.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Informacje techniczne</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {offer.warnings.map((w, i) => <div key={i} className="text-muted-foreground">• {w}</div>)}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ────── HARMONOGRAM ────── */}
        <TabsContent value="harmonogram" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Benchmark prawny (NBP)</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-4 gap-3">
              <Field label="Data weryfikacji"><Input type="date" value={nbpDate} onChange={e=>setNbpDate(e.target.value)}/></Field>
              <Field label="Stopa referencyjna NBP (%)"><Input type="number" step="0.01" value={nbpRate} onChange={e=>setNbpRate(e.target.value)}/></Field>
              <ReadOnly label="Roczny poziom odsetek ustawowych" value={`${fmtNum(nbpAnnual)} %`}/>
              <ReadOnly label="Miesięczny ekwiwalent" value={`${fmtNum(nbpMonthly, 3)} %`}/>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Harmonogram spłat</CardTitle></CardHeader>
            <CardContent>
              {!canCompute ? (
                <p className="text-sm text-muted-foreground">Uzupełnij kwotę „na rękę”, maksymalną ratę, okres i wynagrodzenie inwestora aby zobaczyć harmonogram.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lp.</TableHead>
                      <TableHead>Data raty</TableHead>
                      <TableHead className="text-right">Kwota raty</TableHead>
                      <TableHead className="text-right">Kapitał</TableHead>
                      <TableHead className="text-right">Odsetki</TableHead>
                      <TableHead className="text-right">Opłata za ryzyko</TableHead>
                      <TableHead className="text-right">Kapitał pozostały</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sched.rows.map(r => (
                      <TableRow key={r.lp} className={r.balon ? "bg-muted/50 font-medium" : ""}>
                        <TableCell>{r.balon ? `${r.lp} (balon)` : r.lp}</TableCell>
                        <TableCell>{plDate(r.date)}</TableCell>
                        <TableCell className="text-right">{fmtPLN(r.rata)}</TableCell>
                        <TableCell className="text-right">{fmtPLN(r.kapital)}</TableCell>
                        <TableCell className="text-right">{fmtPLN(r.odsetki)}</TableCell>
                        <TableCell className="text-right">{fmtPLN(r.ryzyko)}</TableCell>
                        <TableCell className="text-right">{fmtPLN(r.saldo)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Podsumowanie dla inwestora</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <ReadOnly label="Czas trwania umowy" value={`${offer.loanTermMonths} m-cy`}/>
              <ReadOnly label="Oprocentowanie roczne" value={`${fmtNum(offer.annualInterestPercent)} %`}/>
              <ReadOnly label="Procent miesięczny opłaty za ryzyko" value={`${fmtNum(offer.monthlyRiskFeePercent, 3)} %`}/>
              <ReadOnly label="Wysokość prowizji" value={fmtPLN(offer.creditedCommission)}/>
              <ReadOnly label="Nominalna kwota pożyczki" value={fmtPLN(offer.nominalLoanAmount)}/>
              <ReadOnly label="Kwota wypłacona klientowi „na rękę”" value={fmtPLN(offer.netAmountToClient)}/>
              <ReadOnly label="Całkowite zobowiązanie klienta" value={fmtPLN(totalClientObligation)}/>
              <ReadOnly label="Całkowity zysk inwestora" value={fmtPLN(totalInvestorProfit)}/>
              <ReadOnly label="Roczny zysk inwestora (kwota)" value={fmtPLN(annualizedInvestorProfitAmount)}/>
              <ReadOnly label="Roczny zysk inwestora (% od kwoty „na rękę”)" value={`${fmtNum(annualizedInvestorProfitPercent)} %`}/>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────── ZABEZPIECZENIA ────── */}
        <TabsContent value="zabezp" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Rekomendacja zabezpieczenia</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <ReadOnly label="Minimalna rekomendowana kwota hipoteki" value={fmtPLN(minMortgage)}/>
              <ReadOnly label="Rekomendowana kwota egzekucji z art. 777 k.p.c." value={fmtPLN(min777)}/>
              <ReadOnly label="Termin obowiązywania klauzuli wykonalności" value={`${offer.loanTermMonths + 36} m-cy`}/>
              <ReadOnly label="Data końcowa terminu art. 777" value={plDate(okres777End)}/>
              <ReadOnly label="Numer KW" value={client.np_kw || "—"}/>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────── DOKUMENTY ────── */}
        <TabsContent value="dokumenty" className="space-y-4">
          <DocCard title="Wniosek klienta" text={docWniosek} onCopy={()=>copy(docWniosek, "Wniosek")}/>
          <DocCard title="Umowa pożyczki" text={docUmowa} onCopy={()=>copy(docUmowa, "Umowa")}/>
          <DocCard title="Załącznik nr 1 — Harmonogram" text={docHarmonogram} onCopy={()=>copy(docHarmonogram, "Harmonogram")}/>
          <DocCard title="Załącznik nr 2 — Protokół negocjacji" text={docProtokol} onCopy={()=>copy(docProtokol, "Protokół")}/>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────────── small UI helpers
function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm">{value}</div>
    </div>
  );
}
function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <span className="text-sm">{children}</span>
      <Switch checked={checked} onCheckedChange={onChange}/>
    </div>
  );
}
function DocCard({ title, text, onCopy }: { title: string; text: string; onCopy: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={onCopy}><Copy className="h-4 w-4 mr-1"/>Kopiuj</Button>
      </CardHeader>
      <CardContent>
        <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 p-4 rounded-md max-h-[480px] overflow-auto">{text}</pre>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────── document builders
function buildWniosek(c: Client, _i: Investor, o: Offer): string {
  return [
    `WNIOSEK O UDZIELENIE POŻYCZKI (B2B)`,
    ``,
    `POŻYCZKOBIORCA: ${c.imie || "—"}`,
    `NIP: ${c.nip || "—"}    PESEL: ${c.pesel || "—"}`,
    `Adres: ${c.adres || "—"}`,
    `Telefon: ${c.tel || "—"}   E-mail: ${c.email || "—"}`,
    `Forma działalności: ${c.forma}`,
    `Cel pożyczki: ${c.cel || "—"}`,
    ``,
    `NIERUCHOMOŚĆ STANOWIĄCA ZABEZPIECZENIE`,
    `Typ: ${c.np_typ}   KW: ${c.np_kw || "—"}`,
    `Adres: ${c.np_adres || "—"}`,
    `Wartość szacunkowa: ${fmtPLN(n(c.np_wartosc))}`,
    `Istniejąca hipoteka: ${c.np_hipoteka_jest ? `TAK (${fmtPLN(n(c.np_hipoteka_kwota))})` : "NIE"}`,
    `Właściciel: ${c.np_wlasciciel || "—"} (${c.np_wlasciciel_jest_pb ? "jest pożyczkobiorcą" : "osoba trzecia"})`,
    ``,
    `PREFERENCJE FINANSOWE KLIENTA`,
    `Kwota „na rękę”: ${fmtPLN(o.netAmountToClient)}`,
    `Maksymalna rata bieżąca: ${fmtPLN(o.maxMonthlyPaymentByClient)}`,
    `Okres: ${o.loanTermMonths} m-cy`,
    `Data wypłaty: ${plDate(c.pref_data_wyplaty)}`,
    `Sposób wypłaty: ${c.wyplata_sposob}`,
    ``,
    `OŚWIADCZENIA`,
    `• Pożyczka związana z działalnością gospodarczą: ${c.ośw_b2b ? "TAK" : "NIE"}`,
    `• Klient działa jako przedsiębiorca: ${c.ośw_przedsiebiorca ? "TAK" : "NIE"}`,
    `• Pożyczka nie ma charakteru konsumenckiego: ${c.ośw_niekonsument ? "TAK" : "NIE"}`,
    `• Dane prawdziwe: ${c.ośw_prawda ? "TAK" : "NIE"}`,
    `• Akceptacja, że warunki zależą od decyzji inwestora: ${c.ośw_warunki ? "TAK" : "NIE"}`,
  ].join("\n");
}

function buildUmowa(c: Client, i: Investor, o: Offer, balloon: number, total: number): string {
  return [
    `UMOWA POŻYCZKI (B2B) ZABEZPIECZONA HIPOTECZNIE`,
    `Zawarta dnia ${plDate(i.data_zawarcia)}`,
    ``,
    `POŻYCZKODAWCA: ${i.nazwa || "—"}, ${i.adres || "—"}, NIP/PESEL: ${i.nip_pesel || "—"}`,
    `Rachunek do spłat: ${i.konto || "—"}`,
    ``,
    `POŻYCZKOBIORCA: ${c.imie || "—"}, ${c.adres || "—"}, NIP: ${c.nip || "—"}`,
    ``,
    `§1. PRZEDMIOT UMOWY`,
    `1. Nominalna kwota pożyczki: ${fmtPLN(o.nominalLoanAmount)}`,
    `2. Kwota wypłacona Pożyczkobiorcy „na rękę”: ${fmtPLN(o.netAmountToClient)}`,
    `3. Prowizja kredytowana: ${fmtPLN(o.creditedCommission)} (spłacana wraz z kapitałem).`,
    `4. Data wypłaty: ${plDate(i.data_wyplaty)}`,
    ``,
    `§2. OPROCENTOWANIE I OPŁATA ZA RYZYKO`,
    `1. Oprocentowanie roczne: ${fmtNum(o.annualInterestPercent)} % od kwoty nominalnej.`,
    `2. Miesięczna opłata za ryzyko: ${fmtPLN(o.monthlyRiskFeeAmount)} (${fmtNum(o.monthlyRiskFeePercent, 3)} % od kwoty nominalnej miesięcznie).`,
    ``,
    `§3. WARUNKI SPŁATY`,
    `1. Maksymalna miesięczna rata bieżąca: ${fmtPLN(o.maxMonthlyPaymentByClient)}.`,
    `2. Okres umowy: ${o.loanTermMonths} miesięcy.`,
    `3. Rata balonowa (ostatnia): ${fmtPLN(balloon)}.`,
    `4. Całkowita kwota zobowiązań Pożyczkobiorcy: ${fmtPLN(total)}.`,
    `5. Szczegółowy harmonogram stanowi Załącznik nr 1.`,
    ``,
    `§4. ZABEZPIECZENIE`,
    `1. Hipoteka umowna na nieruchomości KW ${c.np_kw || "—"} (${c.np_adres || "—"}).`,
    `2. Oświadczenie o poddaniu się egzekucji w trybie art. 777 § 1 pkt 5 k.p.c.`,
    ``,
    `§5. POSTANOWIENIA KOŃCOWE`,
    `Umowa ma charakter B2B i nie jest umową o kredyt konsumencki.`,
  ].join("\n");
}

function buildHarmonogramDoc(rows: ScheduleRow[], o: Offer): string {
  const head = `ZAŁĄCZNIK NR 1 — HARMONOGRAM SPŁAT\nNominalna kwota pożyczki: ${fmtPLN(o.nominalLoanAmount)}\n`;
  const cols = `Lp. | Data raty | Kwota raty | Kapitał | Odsetki | Opłata za ryzyko | Kapitał pozostały`;
  const body = rows.map(r =>
    `${r.balon ? `${r.lp} (Rata balonowa)` : r.lp} | ${plDate(r.date)} | ${fmtPLN(r.rata)} | ${fmtPLN(r.kapital)} | ${fmtPLN(r.odsetki)} | ${fmtPLN(r.ryzyko)} | ${fmtPLN(r.saldo)}`
  ).join("\n");
  return `${head}\n${cols}\n${body}`;
}

function buildProtokol(c: Client, i: Investor, o: Offer): string {
  return [
    `ZAŁĄCZNIK NR 2 — PROTOKÓŁ NEGOCJACJI`,
    `Strony: ${i.nazwa || "—"} oraz ${c.imie || "—"}`,
    `Data: ${plDate(i.data_zawarcia)}`,
    ``,
    `Strony oświadczają, że indywidualnie negocjowały i uzgodniły:`,
    `• kwotę wypłacaną klientowi „na rękę”: ${fmtPLN(o.netAmountToClient)}`,
    `• maksymalną miesięczną ratę klienta: ${fmtPLN(o.maxMonthlyPaymentByClient)}`,
    `• okres pożyczki: ${o.loanTermMonths} m-cy`,
    `• prowizję kredytowaną: ${fmtPLN(o.creditedCommission)}`,
    `• oczekiwane miesięczne wynagrodzenie inwestora: ${fmtPLN(o.expectedMonthlyInvestorReturn)}`,
    `• oprocentowanie roczne: ${fmtNum(o.annualInterestPercent)} %`,
    `• miesięczną opłatę za ryzyko: ${fmtPLN(o.monthlyRiskFeeAmount)}`,
    `• ratę balonową wynikającą z relacji raty klienta do wynagrodzenia inwestora`,
    `• zabezpieczenia: hipoteka oraz egzekucja z art. 777 k.p.c.`,
    `• terminy wypłaty i spłaty.`,
    ``,
    `Negocjacje miały charakter indywidualny i obie strony akceptują uzgodnione warunki.`,
  ].join("\n");
}
