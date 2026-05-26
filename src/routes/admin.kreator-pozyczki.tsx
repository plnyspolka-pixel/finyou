import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";

export const Route = createFileRoute("/admin/kreator-pozyczki")({
  component: KreatorPozyczki,
});

type FormState = {
  pb_nazwa: string; pb_pesel_nip: string; pb_doc: string; pb_adres: string; pb_tel: string; pb_email: string;
  has_poreczyciel: boolean;
  por_nazwa: string; por_adres: string;
  pd_nazwa: string; pd_adres: string; pd_administrator: string; pd_konto: string;
  has_posrednik: boolean; pos_nazwa: string;
  not_nazwisko: string; not_kancelaria: string;
  kwota: string; prowizja: string; kwota_wyplata: string;
  wyplata_przelew: string; wyplata_konto_pb: string;
  wyplata_gotowka: string;
  wyplata_posrednik: string; wyplata_konto_pos: string; wyplata_faktura: string;
  wyplata_notar: string; wyplata_konto_not: string;
  oprocentowanie: string; oplata_ryzyka: string;
  okres: string;
  data_zawarcia: string; miejsce_zawarcia: string;
  data_wyplaty: string;
  hipoteka_kwota: string; hipoteka_kw: string;
  egzekucja_kwota: string; egzekucja_data: string;
  por_hipoteka_kwota: string; por_hipoteka_kw: string;
  por_egzekucja_kwota: string; por_egzekucja_data: string;
  neg_od: string; neg_do: string; neg_tel: string;
  cel: string;
};

const empty: FormState = {
  pb_nazwa: "", pb_pesel_nip: "", pb_doc: "", pb_adres: "", pb_tel: "", pb_email: "",
  has_poreczyciel: false,
  por_nazwa: "", por_adres: "",
  pd_nazwa: "", pd_adres: "", pd_administrator: "", pd_konto: "",
  has_posrednik: false, pos_nazwa: "",
  not_nazwisko: "", not_kancelaria: "",
  kwota: "", prowizja: "", kwota_wyplata: "",
  wyplata_przelew: "", wyplata_konto_pb: "",
  wyplata_gotowka: "",
  wyplata_posrednik: "", wyplata_konto_pos: "", wyplata_faktura: "",
  wyplata_notar: "", wyplata_konto_not: "",
  oprocentowanie: "", oplata_ryzyka: "",
  okres: "12",
  data_zawarcia: "", miejsce_zawarcia: "",
  data_wyplaty: "",
  hipoteka_kwota: "", hipoteka_kw: "",
  egzekucja_kwota: "", egzekucja_data: "",
  por_hipoteka_kwota: "", por_hipoteka_kw: "",
  por_egzekucja_kwota: "", por_egzekucja_data: "",
  neg_od: "", neg_do: "", neg_tel: "",
  cel: "",
};

const fmt = (n: string | number) =>
  (parseFloat(String(n || 0)) || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const slownie = (n: string | number) => `${fmt(n)} złotych`;

type Row = { nr: number; data: string; kapital: number; odsetki: number; oplata: number; rata: number; saldo: number };

function buildHarmonogram(kwota: string, oproc: string, oplata: string, okres: string, dataWyplaty: string): Row[] {
  const k = parseFloat(kwota) || 0;
  const r = (parseFloat(oproc) || 0) / 100 / 12;
  const or = (parseFloat(oplata) || 0) / 100;
  const n = parseInt(okres) || 12;
  const rows: Row[] = [];
  let saldo = k;
  const kapitalRata = n > 0 ? k / n : 0;
  const startDate = dataWyplaty ? new Date(dataWyplaty) : new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    const odsetki = saldo * r;
    const oplataMies = k * or;
    const rata = kapitalRata + odsetki + oplataMies;
    saldo -= kapitalRata;
    rows.push({
      nr: i, data: d.toLocaleDateString("pl-PL"),
      kapital: kapitalRata, odsetki, oplata: oplataMies, rata,
      saldo: Math.max(0, saldo),
    });
  }
  return rows;
}

function Field({ label, value, onChange, type = "text", placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function DocView({ title, content }: { title: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Skopiowano");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
          {copied ? "Skopiowano" : "Kopiuj"}
        </Button>
      </CardHeader>
      <CardContent>
        <Textarea readOnly value={content} className="font-mono text-xs leading-relaxed min-h-[420px]" />
      </CardContent>
    </Card>
  );
}

function KreatorPozyczki() {
  const [d, setD] = useState<FormState>(empty);
  const [activeDoc, setActiveDoc] = useState("wniosek");
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K] | string) => setD((p) => ({ ...p, [k]: v as FormState[K] }));

  const harmonogram = useMemo(
    () => buildHarmonogram(d.kwota, d.oprocentowanie, d.oplata_ryzyka, d.okres, d.data_wyplaty),
    [d.kwota, d.oprocentowanie, d.oplata_ryzyka, d.okres, d.data_wyplaty],
  );
  const sumaKapital = harmonogram.reduce((s, r) => s + r.kapital, 0);
  const sumaOdsetki = harmonogram.reduce((s, r) => s + r.odsetki, 0);
  const sumaOplata = harmonogram.reduce((s, r) => s + r.oplata, 0);
  const sumaRazem = harmonogram.reduce((s, r) => s + r.rata, 0);

  const wniosek = `WNIOSEK O UDZIELENIE POŻYCZKI PIENIĘŻNEJ

I. DANE WNIOSKODAWCY
Imię i nazwisko / Firma: ${d.pb_nazwa || "....................."}
PESEL / NIP: ${d.pb_pesel_nip || "....................."}
Seria i numer dokumentu tożsamości: ${d.pb_doc || "....................."}
Adres zamieszkania / siedziby: ${d.pb_adres || "....................."}
Telefon: ${d.pb_tel || "....................."}
E-mail: ${d.pb_email || "....................."}

II. CHARAKTER POŻYCZKI
• Wnioskuję o udzielenie pożyczki pieniężnej na cele związane z prowadzoną działalnością gospodarczą.
• Oświadczam, że pożyczka nie ma charakteru konsumenckiego.

III. WARUNKI POŻYCZKI
Wnioskowana kwota: ${d.kwota ? fmt(d.kwota) + " zł" : "....................."}
Okres pożyczki: ${d.okres || "..."} miesięcy
Cel pożyczki: ${d.cel || "....................."}
Zabezpieczenie: Hipoteka na nieruchomości (KW: ${d.hipoteka_kw || "..."})

IV. OŚWIADCZENIA FINANSOWE (AML)
• Osiągam stały i rzeczywisty dochód umożliwiający spłatę pożyczki.
• Nie posiadam przeterminowanych zobowiązań pieniężnych.
• Żadne moje zobowiązanie kredytowe ani pożyczkowe nie zostało wypowiedziane.
• Wszystkie moje zobowiązania reguluję terminowo.
• Nie toczy się wobec mnie postępowanie egzekucyjne.

V. OŚWIADCZENIE PEP
[ ] Nie jestem osobą PEP ani osobą z nią powiązaną.
[ ] Jestem osobą PEP lub osobą powiązaną z PEP.

VI. AML – DO WYPEŁNIENIA PRZEZ POŻYCZKODAWCĘ
Ocena ryzyka: [ ] niskie  [ ] średnie  [ ] wysokie
[ ] Transakcja przekracza równowartość 15 000 EUR
[ ] Transakcja nie przekracza równowartości 15 000 EUR

VII. ODPOWIEDZIALNOŚĆ KARNA
Oświadczam, że jestem świadomy/a, iż podanie nieprawdziwych danych stanowi przestępstwo
z art. 286 §1 oraz art. 297 §1 Kodeksu karnego.

Miejscowość: ${d.miejsce_zawarcia || ".................."}
Data: ${d.data_zawarcia || ".................."}

..............................................
Czytelny podpis Wnioskodawcy`;

  const umowa = `UMOWA POŻYCZKI
zawarta dnia ${d.data_zawarcia || "..............."}, w ${d.miejsce_zawarcia || "..............."} pomiędzy:

${d.pb_nazwa || "POŻYCZKOBIORCA"}, ${d.pb_adres || "adres"}
zwany/a dalej „Pożyczkobiorcą"
${d.has_poreczyciel ? `\n${d.por_nazwa || "PORĘCZYCIEL"}, ${d.por_adres || "adres"}\nzwany/a dalej „Poręczycielem"\n` : ""}
${d.pd_nazwa || "POŻYCZKODAWCA"}, ${d.pd_adres || "adres"}
zwana dalej „Pożyczkodawcą"

§ 1
1. Przedmiotem Umowy jest udzielenie przez Pożyczkodawcę pożyczki pieniężnej dla Pożyczkobiorcy prowadzącego działalność gospodarczą na cele związane bezpośrednio z działalnością zawodową Pożyczkobiorcy.
2. Pożyczkobiorca oświadcza, iż uzyskane środki przeznaczy w całości na: ${d.cel || "bieżące finansowanie działalności zawodowej"}.
3. Kwota pożyczki nie może zostać przeznaczona na zakup, remont lub spłatę zobowiązań dotyczących nieruchomości.

§ 2
1. Pożyczkodawca udziela Pożyczkobiorcy pożyczki w kwocie ${d.kwota ? fmt(d.kwota) + " zł (słownie: " + slownie(d.kwota) + ")" : "............... zł"} z przeznaczeniem wyłącznie na cele wskazane w § 1.${d.has_poreczyciel ? " Poręczyciel poręcza spłatę tej pożyczki w całości wraz z odsetkami, prowizją i wszelkimi innymi należnościami." : ""}
2. Pożyczkodawca pobiera prowizję w wysokości ${d.prowizja ? fmt(d.prowizja) + " zł (słownie: " + slownie(d.prowizja) + ")" : "............... zł"}, obejmującą koszt weryfikacji wniosku, oszacowania zabezpieczenia hipotecznego, oceny ryzyka, przygotowania i zawarcia Umowy. Kwota prowizji pomniejszy kwotę do wypłaty.
3. Pożyczkodawca wypłaci Pożyczkobiorcy, po potrąceniu prowizji, kwotę ${d.kwota_wyplata ? fmt(d.kwota_wyplata) + " zł" : "............... zł"} w ciągu dwóch dni roboczych od ustanowienia zabezpieczeń, w następujący sposób:
${d.wyplata_przelew ? `   a) ${fmt(d.wyplata_przelew)} zł – przelewem na rachunek Pożyczkobiorcy nr ${d.wyplata_konto_pb || "..."}` : ""}
${d.wyplata_gotowka ? `   b) ${fmt(d.wyplata_gotowka)} zł – gotówką do rąk własnych Pożyczkobiorcy w dniu podpisania Umowy` : ""}
${d.has_posrednik && d.wyplata_posrednik ? `   c) ${fmt(d.wyplata_posrednik)} zł – na rachunek ${d.pos_nazwa || "pośrednika"} nr ${d.wyplata_konto_pos || "..."} tytułem faktury ${d.wyplata_faktura || "..."} za pośrednictwo finansowe` : ""}
${d.wyplata_notar ? `   d) ${fmt(d.wyplata_notar)} zł – na rachunek Kancelarii Notarialnej ${d.not_kancelaria || "..."} nr ${d.wyplata_konto_not || "..."} tytułem kosztów sporządzenia aktu notarialnego` : ""}
4. Oprocentowanie pożyczki wynosi ${d.oprocentowanie || "..."}% w stosunku rocznym, naliczane od niespłaconej części zadłużenia od dnia wypłaty do dnia zwrotu.
5. Pożyczkobiorca zobowiązuje się zwrócić pożyczkę z odsetkami przelewami na rachunek Pożyczkodawcy nr ${d.pd_konto || "..............."} zgodnie z Harmonogramem spłat (Załącznik nr 1).
6. Umowa wchodzi w życie z dniem przekazania Pożyczkodawcy: a) podpisanego oryginału Umowy z podpisem poświadczonym notarialnie; b) wypisu aktów notarialnych zawierających żądanie wpisu hipoteki i poddanie się rygorowi egzekucji; c) kompletu oryginałów dokumentów.
7. Niezależnie od odsetek i prowizji, Pożyczkobiorca uiszczać będzie Opłatę Podwyższonego Ryzyka w wysokości ${d.oplata_ryzyka || "..."}% wartości pożyczki za każdy rozpoczęty miesiąc, płatną zgodnie z Harmonogramem spłat. Opłata stanowi odrębne wynagrodzenie Pożyczkodawcy, nie stanowi odsetek w rozumieniu art. 359 k.c. i nie ma charakteru sankcyjnego.
8. Opłata Podwyższonego Ryzyka stanowi wynagrodzenie za przyjęcie podwyższonego ryzyka ekonomicznego wynikającego z: a) udzielenia pożyczki wyłącznie na podstawie oświadczeń Pożyczkobiorcy; b) zaniechania weryfikacji w BIK, KRD, ERIF, BIG InfoMonitor; c) braku wizji lokalnej nieruchomości; d) braku operatu szacunkowego; e) braku ubezpieczenia nieruchomości; f) przyspieszonej procedury rozpoznania wniosku i wypłaty środków.

§ 3
1. Pożyczkobiorca złoży notarialne oświadczenie o żądaniu ustanowienia hipoteki do kwoty ${d.hipoteka_kwota ? fmt(d.hipoteka_kwota) + " zł" : "............... zł"} w KW nr ${d.hipoteka_kw || "..............."}, zabezpieczającej wszelkie wierzytelności z niniejszej Umowy.
2. Pożyczkobiorca podda się rygorowi egzekucji z art. 777 § 1 pkt 5 k.p.c. do kwoty ${d.egzekucja_kwota ? fmt(d.egzekucja_kwota) + " zł" : "............... zł"}. Wierzyciel może wystąpić o klauzulę wykonalności do dnia ${d.egzekucja_data || "..............."}.
${d.has_poreczyciel ? `3. Poręczyciel złoży notarialne oświadczenie o żądaniu ustanowienia hipoteki do kwoty ${d.por_hipoteka_kwota ? fmt(d.por_hipoteka_kwota) + " zł" : "............... zł"} w KW nr ${d.por_hipoteka_kw || "..."}.
4. Poręczyciel podda się rygorowi egzekucji z art. 777 § 1 pkt 5 k.p.c. do kwoty ${d.por_egzekucja_kwota ? fmt(d.por_egzekucja_kwota) + " zł" : "............... zł"}. Wierzyciel może wystąpić o klauzulę do dnia ${d.por_egzekucja_data || "..."}.` : ""}

§ 4
1. W przypadku braku spłaty Pożyczkodawca może skierować sprawę do firmy windykacyjnej. Koszty windykacji (do 10% pożyczki miesięcznie) obciążają Pożyczkobiorcę.
2. W przypadku opóźnienia Pożyczkobiorca zapłaci odsetki za opóźnienie w wysokości dwukrotności odsetek ustawowych za opóźnienie.
3. Kolejność zaliczania wpłat: a) prowizja; b) koszty windykacyjne; c) odsetki za opóźnienie; d) odsetki kapitałowe; e) kapitał.

§ 5
1. Pożyczkobiorca oświadcza, że: a) zawiera Umowę jako przedsiębiorca w rozumieniu art. 4 ust. 1 Prawa przedsiębiorców; b) przepisy ustawy o kredycie konsumenckim nie mają zastosowania; c) wszelkie dane są kompletne i zgodne z prawdą; d) w pełni zrozumiał treść i skutki prawne Umowy; e) nie znajduje się w przymusowym położeniu (art. 388 k.c.); f) wyraża zgodę na cesję wierzytelności; g) wyraża zgodę na dostarczanie korespondencji e-mailem: ${d.pb_email || "....................."}
2. Pożyczkodawca – administrator danych (${d.pd_administrator || d.pd_nazwa || "..."}): dane przetwarzane na podstawie art. 6 ust. 1 lit. b RODO; przechowywane przez 10 lat.
3. Strony oświadczają, że zapisy Umowy są efektem indywidualnych negocjacji.

§ 6
1. Wszelkie zmiany Umowy wymagają formy pisemnej pod rygorem nieważności.
2. Umowę sporządzono w 2 jednobrzmiących egzemplarzach.
3. W sprawach nieobjętych Umową stosuje się przepisy Kodeksu cywilnego.
4. Właściwy sąd: sąd miejscowo właściwy dla siedziby Pożyczkodawcy.

§ 7
1. Pożyczkodawca może wypowiedzieć Umowę ze skutkiem natychmiastowym gdy Pożyczkobiorca: a) opóźnia się z zapłatą raty ponad 14 dni; b) używa pożyczki niezgodnie z celem; c) podał nieprawdziwe dane; d) utrudnia wykonanie praw Pożyczkodawcy; e) narusza istotne postanowienia Umowy; f) wszczęto wobec niego egzekucję lub upadłość.
2. Po wypowiedzeniu Pożyczkobiorca spłaci całość w terminie 7 dni.

....................................     ....................................
Pożyczkodawca                           Pożyczkobiorca
${d.has_poreczyciel ? "\n....................................\nPoręczyciel" : ""}`;

  const pad = (s: string, n: number, right = false) =>
    right ? s.padStart(n) : s.padEnd(n);

  const harmonogramDoc = `ZAŁĄCZNIK NR 1 – HARMONOGRAM SPŁAT

Kwota pożyczki:          ${d.kwota ? fmt(d.kwota) + " zł" : "....................."}
Data wypłaty:            ${d.data_wyplaty || "....................."}
Oprocentowanie umowne:   ${d.oprocentowanie || "..."}% w skali roku
Opłata Podwyższonego Ryzyka: ${d.oplata_ryzyka || "..."}% miesięcznie

${pad("Nr", 4)} ${pad("Data", 14)} ${pad("Kapitał", 12, true)} ${pad("Odsetki", 12, true)} ${pad("Opl. Ryz.", 12, true)} ${pad("Rata", 12, true)} ${pad("Saldo", 14, true)}
${"-".repeat(82)}
${harmonogram.map((r) =>
  `${pad(String(r.nr), 4)} ${pad(r.data, 14)} ${pad(fmt(r.kapital), 12, true)} ${pad(fmt(r.odsetki), 12, true)} ${pad(fmt(r.oplata), 12, true)} ${pad(fmt(r.rata), 12, true)} ${pad(fmt(r.saldo), 14, true)}`
).join("\n")}
${"-".repeat(82)}
Łączny kapitał:          ${fmt(sumaKapital)} zł
Łączne odsetki:          ${fmt(sumaOdsetki)} zł
Łączna Opł. Ryzyka:      ${fmt(sumaOplata)} zł
ŁĄCZNA SUMA:             ${fmt(sumaRazem)} zł

Pożyczkodawca: ....................................
Pożyczkobiorca: ...................................
${d.has_poreczyciel ? "Poręczyciel: ......................................" : ""}`;

  const protokol = `ZAŁĄCZNIK NR 2 – PROTOKÓŁ Z NEGOCJACJI INDYWIDUALNYCH

1. DANE STRON
Pożyczkodawca: ${d.pd_nazwa || "....................."}
Pożyczkobiorca: ${d.pb_nazwa || "....................."}
Numer telefonu użyty w negocjacjach: ${d.neg_tel || d.pb_tel || "....................."}
${d.has_poreczyciel ? `Poręczyciel: ${d.por_nazwa || "....................."}` : ""}
${d.has_posrednik ? `Pośrednik finansowy: ${d.pos_nazwa || "....................."}` : ""}
Notariusz: ${d.not_nazwisko || "....................."}
Kancelaria: ${d.not_kancelaria || "....................."}

2. MIEJSCE, FORMY I PRZEBIEG NEGOCJACJI
Negocjacje prowadzone były w trybie indywidualnym, w szczególności:
- telefonicznie (${d.neg_tel || d.pb_tel || "..."}),
${d.has_posrednik ? `- za pośrednictwem pośrednika finansowego: ${d.pos_nazwa || "..."},` : ""}
- drogą elektroniczną (${d.pb_email || "..."}),
- osobiście podczas czynności notarialnych u ${d.not_nazwisko || "..."}

Negocjacje trwały: od ${d.neg_od || "............"} do ${d.neg_do || "............"}

3. ZAKRES NEGOCJOWANYCH INDYWIDUALNIE WARUNKÓW
Strony potwierdzają, że indywidualnie negocjowane były:
• Kwota pożyczki i jej przeznaczenie
• Wysokość prowizji
• Sposób i terminy wypłaty pożyczki
• Wysokość oprocentowania umownego
• Wysokość Opłaty Podwyższonego Ryzyka
• Rezygnacja z weryfikacji BIK/KRD/ERIF/BIG InfoMonitor
• Rezygnacja z operatu szacunkowego i wizji lokalnej
• Rezygnacja z obowiązku ubezpieczenia nieruchomości
• Ustanowienie zabezpieczeń (hipoteka, egzekucja z aktu)
• Harmonogram spłat
• Postanowienia dotyczące windykacji
• Prawo Pożyczkodawcy do wypowiedzenia Umowy
• Forma doręczeń

4. POTWIERDZENIA STRON
Pożyczkobiorca potwierdza, że wszystkie warunki były negocjowane indywidualnie, są jasne
i zrozumiałe, treść Umowy nie została mu narzucona.

Pożyczkobiorca: ....................................
${d.has_poreczyciel ? "Poręczyciel: ......................................" : ""}
Pożyczkodawca: ....................................`;

  const docs = {
    wniosek: { title: "Wniosek o udzielenie pożyczki", content: wniosek },
    umowa: { title: "Umowa pożyczki", content: umowa },
    harmonogram: { title: "Zał. 1 – Harmonogram spłat", content: harmonogramDoc },
    protokol: { title: "Zał. 2 – Protokół z negocjacji", content: protokol },
  } as const;

  const complete = [d.pb_nazwa, d.pd_nazwa, d.kwota, d.oprocentowanie, d.oplata_ryzyka, d.hipoteka_kw].filter(Boolean).length;
  const pct = Math.round((complete / 6) * 100);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Kreator kompletu pożyczkowego</h1>
        <p className="text-sm text-muted-foreground">Uzupełnij dane w zakładkach — dokumenty generują się na bieżąco.</p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <Progress value={pct} className="flex-1" />
          <span className="text-sm text-muted-foreground min-w-24 text-right">Kompletność: {pct}%</span>
        </CardContent>
      </Card>

      <Tabs defaultValue="strony">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="strony">Dane stron</TabsTrigger>
          <TabsTrigger value="finanse">Warunki finansowe</TabsTrigger>
          <TabsTrigger value="zabezpieczenia">Zabezpieczenia</TabsTrigger>
          <TabsTrigger value="podglad">Podgląd dokumentów</TabsTrigger>
        </TabsList>

        <TabsContent value="strony" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Pożyczkobiorca</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <Field label="Imię i nazwisko / firma" value={d.pb_nazwa} onChange={set("pb_nazwa")} />
              <Field label="PESEL / NIP" value={d.pb_pesel_nip} onChange={set("pb_pesel_nip")} />
              <Field label="Seria i numer dokumentu tożsamości" value={d.pb_doc} onChange={set("pb_doc")} />
              <Field label="Adres zamieszkania / siedziby" value={d.pb_adres} onChange={set("pb_adres")} />
              <Field label="Telefon" value={d.pb_tel} onChange={set("pb_tel")} type="tel" />
              <Field label="E-mail" value={d.pb_email} onChange={set("pb_email")} type="email" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Pożyczkodawca</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <Field label="Nazwa / firma" value={d.pd_nazwa} onChange={set("pd_nazwa")} />
              <Field label="Adres" value={d.pd_adres} onChange={set("pd_adres")} />
              <Field label="Administrator danych (RODO)" value={d.pd_administrator} onChange={set("pd_administrator")} hint="Jeśli inny niż nazwa firmy" />
              <Field label="Numer rachunku bankowego" value={d.pd_konto} onChange={set("pd_konto")} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Poręczyciel</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={d.has_poreczyciel} onCheckedChange={(v) => setD((p) => ({ ...p, has_poreczyciel: v }))} />
                <Label className="text-sm">Umowa zawiera poręczyciela</Label>
              </div>
              {d.has_poreczyciel && (
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Imię i nazwisko / firma poręczyciela" value={d.por_nazwa} onChange={set("por_nazwa")} />
                  <Field label="Adres poręczyciela" value={d.por_adres} onChange={set("por_adres")} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Pośrednik i notariusz</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={d.has_posrednik} onCheckedChange={(v) => setD((p) => ({ ...p, has_posrednik: v }))} />
                <Label className="text-sm">Uczestniczy pośrednik finansowy</Label>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {d.has_posrednik && <Field label="Nazwa / imię i nazwisko pośrednika" value={d.pos_nazwa} onChange={set("pos_nazwa")} />}
                <Field label="Notariusz – imię i nazwisko" value={d.not_nazwisko} onChange={set("not_nazwisko")} />
                <Field label="Kancelaria notarialna" value={d.not_kancelaria} onChange={set("not_kancelaria")} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Miejsce i data zawarcia</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <Field label="Miejsce zawarcia umowy" value={d.miejsce_zawarcia} onChange={set("miejsce_zawarcia")} />
              <Field label="Data zawarcia umowy" value={d.data_zawarcia} onChange={set("data_zawarcia")} type="date" />
              <Field label="Cel pożyczki (krótko)" value={d.cel} onChange={set("cel")} placeholder="np. bieżące finansowanie działalności" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finanse" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Kwoty</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3">
              <Field label="Kwota pożyczki (zł)" value={d.kwota} onChange={set("kwota")} type="number" hint="Kwota brutto przed potrąceniem prowizji" />
              <Field label="Prowizja (zł)" value={d.prowizja} onChange={set("prowizja")} type="number" />
              <Field label="Kwota do wypłaty (zł)" value={d.kwota_wyplata} onChange={set("kwota_wyplata")} type="number" hint="= kwota pożyczki – prowizja" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Wypłata – podział</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <Field label="Przelew na konto pożyczkobiorcy (zł)" value={d.wyplata_przelew} onChange={set("wyplata_przelew")} type="number" />
              <Field label="Numer konta pożyczkobiorcy" value={d.wyplata_konto_pb} onChange={set("wyplata_konto_pb")} />
              <Field label="Gotówka do rąk własnych (zł)" value={d.wyplata_gotowka} onChange={set("wyplata_gotowka")} type="number" />
              {d.has_posrednik && (
                <>
                  <Field label="Przelew dla pośrednika (zł)" value={d.wyplata_posrednik} onChange={set("wyplata_posrednik")} type="number" />
                  <Field label="Konto pośrednika" value={d.wyplata_konto_pos} onChange={set("wyplata_konto_pos")} />
                  <Field label="Numer faktury za pośrednictwo" value={d.wyplata_faktura} onChange={set("wyplata_faktura")} />
                </>
              )}
              <Field label="Przelew dla kancelarii notarialnej (zł)" value={d.wyplata_notar} onChange={set("wyplata_notar")} type="number" />
              <Field label="Konto kancelarii notarialnej" value={d.wyplata_konto_not} onChange={set("wyplata_konto_not")} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Oprocentowanie i harmonogram</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <Field label="Oprocentowanie umowne (% rocznie)" value={d.oprocentowanie} onChange={set("oprocentowanie")} type="number" />
              <Field label="Opłata Podwyższonego Ryzyka (% miesięcznie)" value={d.oplata_ryzyka} onChange={set("oplata_ryzyka")} type="number" />
              <Field label="Okres pożyczki (miesiące)" value={d.okres} onChange={set("okres")} type="number" />
              <Field label="Data wypłaty pożyczki" value={d.data_wyplaty} onChange={set("data_wyplaty")} type="date" />
            </CardContent>
          </Card>

          {d.kwota && d.oprocentowanie && d.oplata_ryzyka && (
            <Card>
              <CardHeader><CardTitle className="text-base">Podgląd harmonogramu</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted">
                        {["Nr","Data","Kapitał","Odsetki","Opl. Ryz.","Rata","Saldo"].map((h) => (
                          <th key={h} className="px-2 py-1.5 text-right font-medium text-muted-foreground border-b">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {harmonogram.map((r) => (
                        <tr key={r.nr} className="border-b">
                          <td className="px-2 py-1 text-right">{r.nr}</td>
                          <td className="px-2 py-1 text-right">{r.data}</td>
                          <td className="px-2 py-1 text-right">{fmt(r.kapital)}</td>
                          <td className="px-2 py-1 text-right">{fmt(r.odsetki)}</td>
                          <td className="px-2 py-1 text-right">{fmt(r.oplata)}</td>
                          <td className="px-2 py-1 text-right font-medium">{fmt(r.rata)}</td>
                          <td className="px-2 py-1 text-right text-muted-foreground">{fmt(r.saldo)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted font-medium">
                        <td colSpan={2} className="px-2 py-1.5">RAZEM</td>
                        <td className="px-2 py-1.5 text-right">{fmt(sumaKapital)}</td>
                        <td className="px-2 py-1.5 text-right">{fmt(sumaOdsetki)}</td>
                        <td className="px-2 py-1.5 text-right">{fmt(sumaOplata)}</td>
                        <td className="px-2 py-1.5 text-right">{fmt(sumaRazem)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ["Koszt odsetek", fmt(sumaOdsetki) + " zł"],
                    ["Koszt Opł. Ryzyka", fmt(sumaOplata) + " zł"],
                    ["Całkowity koszt pożyczki", fmt(sumaOdsetki + sumaOplata + (parseFloat(d.prowizja) || 0)) + " zł"],
                    ["RRSO (szacunkowe)", d.kwota && parseInt(d.okres) > 0 ? (((sumaRazem - parseFloat(d.kwota)) / parseFloat(d.kwota)) * (12 / parseInt(d.okres)) * 100).toFixed(1) + "%" : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-md bg-muted px-3 py-2">
                      <p className="text-xs text-muted-foreground">{k}</p>
                      <p className="text-sm font-semibold">{v}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Negocjacje (do protokołu)</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3">
              <Field label="Negocjacje od (data)" value={d.neg_od} onChange={set("neg_od")} type="date" />
              <Field label="Negocjacje do (data)" value={d.neg_do} onChange={set("neg_do")} type="date" />
              <Field label="Telefon użyty w negocjacjach" value={d.neg_tel} onChange={set("neg_tel")} hint="Jeśli inny niż telefon pożyczkobiorcy" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="zabezpieczenia" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Hipoteka – Pożyczkobiorca</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <Field label="Kwota hipoteki (zł)" value={d.hipoteka_kwota} onChange={set("hipoteka_kwota")} type="number" hint="Zazwyczaj 150–200% kwoty pożyczki" />
              <Field label="Numer księgi wieczystej (KW)" value={d.hipoteka_kw} onChange={set("hipoteka_kw")} placeholder="np. LU1L/00012345/6" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Egzekucja z art. 777 k.p.c. – Pożyczkobiorca</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <Field label="Kwota egzekucji (zł)" value={d.egzekucja_kwota} onChange={set("egzekucja_kwota")} type="number" hint="Zazwyczaj 150–200% kwoty pożyczki" />
              <Field label="Termin klauzuli wykonalności (data)" value={d.egzekucja_data} onChange={set("egzekucja_data")} type="date" />
            </CardContent>
          </Card>
          {d.has_poreczyciel && (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">Hipoteka – Poręczyciel</CardTitle></CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-3">
                  <Field label="Kwota hipoteki poręczyciela (zł)" value={d.por_hipoteka_kwota} onChange={set("por_hipoteka_kwota")} type="number" />
                  <Field label="Numer KW poręczyciela" value={d.por_hipoteka_kw} onChange={set("por_hipoteka_kw")} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Egzekucja z art. 777 k.p.c. – Poręczyciel</CardTitle></CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-3">
                  <Field label="Kwota egzekucji poręczyciela (zł)" value={d.por_egzekucja_kwota} onChange={set("por_egzekucja_kwota")} type="number" />
                  <Field label="Termin klauzuli wykonalności" value={d.por_egzekucja_data} onChange={set("por_egzekucja_data")} type="date" />
                </CardContent>
              </Card>
            </>
          )}
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            ⚠ Standardowa praktyka: hipoteka i kwota egzekucji na poziomie 150–200% kwoty pożyczki. Kwota egzekucji powinna pokryć kapitał + odsetki + prowizję + koszty windykacji.
          </div>
        </TabsContent>

        <TabsContent value="podglad" className="space-y-4">
          <Tabs value={activeDoc} onValueChange={setActiveDoc}>
            <TabsList className="flex flex-wrap h-auto">
              {Object.entries(docs).map(([k, doc]) => (
                <TabsTrigger key={k} value={k}>{doc.title}</TabsTrigger>
              ))}
            </TabsList>
            {Object.entries(docs).map(([k, doc]) => (
              <TabsContent key={k} value={k}>
                <DocView title={doc.title} content={doc.content} />
              </TabsContent>
            ))}
          </Tabs>
          <p className="text-xs text-muted-foreground">
            Załącznik nr 3 (tabela opłat windykacyjnych) pozostaje niezmienny — użyj wersji z oryginalnego szablonu.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
