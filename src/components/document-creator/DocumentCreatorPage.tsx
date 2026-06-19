import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listDocxTemplates,
  generateDocxFromTemplate,
  listGeneratedDocs,
  getGeneratedDocSignedUrl,
  getDocxTemplatePreview,
  type DocTemplate,
  type GeneratedDoc,
} from "@/lib/document-generator.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Loader2,
  FileText,
  Download,
  Sparkles,
  Search,
  Wand2,
  Calculator,
  Wallet,
  UserRound,
  Building2,
  CalendarDays,
  ArrowRight,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { amountToWordsPLN } from "@/lib/amount-to-words-pl";
import { buildDirectorSchedule, formatPLN } from "@/lib/client-profile-math";

// ════════════════════════════════════════════════════════════════════
// KATEGORIE
// ════════════════════════════════════════════════════════════════════

const CATEGORY_LABELS: Record<string, string> = {
  umowa: "Umowy",
  windykacja_miekka: "Windykacja miękka",
  windykacja_sadowa: "Windykacja sądowa",
  oswiadczenie: "Oświadczenia",
  zalacznik: "Załączniki",
  instrukcja: "Instrukcje",
  inne: "Inne",
};

const CATEGORY_COLORS: Record<string, string> = {
  umowa: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  windykacja_miekka: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  windykacja_sadowa: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  oswiadczenie: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  zalacznik: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  instrukcja: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

// ════════════════════════════════════════════════════════════════════
// HELPERY
// ════════════════════════════════════════════════════════════════════

const todayDDMMYYYY = () => {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const isoToDDMM = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};
const addMonthsISO = (iso: string, months: number) => {
  const d = new Date(iso);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d.toISOString().slice(0, 10);
};

type FieldType = "text" | "textarea" | "date" | "amount" | "amount-words" | "number";

interface FieldSchema {
  key: string;
  label: string;
  type?: FieldType;
  placeholder?: string;
  helper?: string;
}
interface Section {
  title: string;
  icon?: "creditor" | "borrower" | "terms" | "place";
  fields: FieldSchema[];
}
interface TplSchema {
  sections: Section[];
  hasCommission?: boolean;
  hasCalculator?: boolean;
  /** Mapowanie wyników kalkulatora -> placeholdery umowy */
  calcMap?: {
    amountKey?: string;          // np. "KWOTA"
    amountWordsKey?: string;     // "KWOTA SŁOWNIE"
    interestKey?: string;        // "OPROCENTOWANIE"
    monthsKey?: string;          // "LICZBA"
    payoutDateKey?: string;      // "DATA"
  };
}

const T = (k: string, label: string, type?: FieldType, helper?: string): FieldSchema => ({
  key: k, label, type, helper,
});

// Per-slug schematy. Klucze muszą odpowiadać `placeholders` w DB.
const TEMPLATE_SCHEMAS: Record<string, TplSchema> = {
  // ─────── Umowa pożyczki ───────
  "u01-04-umowa-pozyczki-z-zalacznikami-redline": {
    hasCommission: true,
    hasCalculator: true,
    calcMap: {
      amountKey: "KWOTA",
      amountWordsKey: "KWOTA SŁOWNIE",
      interestKey: "OPROCENTOWANIE",
      monthsKey: "LICZBA",
      payoutDateKey: "DATA",
    },
    sections: [
      {
        title: "Miejsce i data podpisania", icon: "place",
        fields: [
          T("MIEJSCOWOŚĆ", "Miejscowość podpisania"),
          T("DD.MM.RRRR", "Data podpisania umowy", "date"),
        ],
      },
      {
        title: "POŻYCZKODAWCA (wierzyciel / inwestor)", icon: "creditor",
        fields: [
          T("NAZWA / FIRMA POŻYCZKODAWCY", "Nazwa / firma pożyczkodawcy"),
          T("ADRES", "Adres pożyczkodawcy", "textarea"),
          T("KRS / NIP / REGON", "KRS / NIP / REGON pożyczkodawcy"),
        ],
      },
      {
        title: "POŻYCZKOBIORCA", icon: "borrower",
        fields: [
          T("IMIĘ I NAZWISKO / FIRMA", "Imię i nazwisko lub firma pożyczkobiorcy"),
          T("PESEL / NIP", "PESEL lub NIP pożyczkobiorcy"),
        ],
      },
      {
        title: "Warunki pożyczki", icon: "terms",
        fields: [
          T("KWOTA", "Kwota pożyczki (zostanie podstawiona z kalkulatora)", "amount"),
          T("KWOTA SŁOWNIE", "Kwota słownie (auto)", "amount-words"),
          T("OPROCENTOWANIE", "Oprocentowanie roczne [%]"),
          T("LICZBA", "Liczba miesięcy", "number"),
          T("DATA", "Data wypłaty pożyczki", "date"),
          T("NUMER RACHUNKU", "Numer rachunku pożyczkobiorcy"),
        ],
      },
    ],
  },

  // ─────── Oświadczenie 777 ───────
  "u05-oswiadczenie-777-instrukcja-dla-notariusza": {
    sections: [
      { title: "Miejsce i data", icon: "place", fields: [
        T("MIEJSCOWOŚĆ", "Miejscowość"),
        T("DD.MM.RRRR", "Data oświadczenia", "date"),
      ]},
      { title: "Wierzyciel (pożyczkodawca)", icon: "creditor", fields: [
        T("NAZWA / FIRMA", "Nazwa / firma wierzyciela"),
      ]},
      { title: "Dłużnik (pożyczkobiorca)", icon: "borrower", fields: [
        T("IMIĘ I NAZWISKO", "Imię i nazwisko dłużnika"),
      ]},
      { title: "Zabezpieczenie", icon: "terms", fields: [
        T("KWOTA", "Kwota egzekucji [PLN]", "amount"),
        T("KWOTA SŁOWNIE", "Kwota słownie (auto)", "amount-words"),
        T("DATA", "Termin (do dnia)", "date"),
      ]},
    ],
  },

  // ─────── Hipoteka ───────
  "u06-hipoteka-oswiadczenie-i-wniosek-o-wpis": {
    sections: [
      { title: "Miejsce i data", icon: "place", fields: [
        T("MIEJSCOWOŚĆ", "Miejscowość"),
        T("DD.MM.RRRR", "Data", "date"),
      ]},
      { title: "Wierzyciel hipoteczny (pożyczkodawca)", icon: "creditor", fields: [
        T("NAZWA / FIRMA", "Nazwa / firma wierzyciela"),
      ]},
      { title: "Właściciel nieruchomości (pożyczkobiorca)", icon: "borrower", fields: [
        T("IMIĘ I NAZWISKO", "Imię i nazwisko właściciela"),
        T("NR KW", "Numer księgi wieczystej"),
      ]},
      { title: "Zabezpieczenie", icon: "terms", fields: [
        T("KWOTA", "Suma hipoteki [PLN]", "amount"),
        T("DATA", "Termin", "date"),
      ]},
    ],
  },

  // ─────── Pokwitowanie wypłaty ───────
  "u07-pokwitowanie-wyplaty-pozyczki": {
    sections: [
      { title: "Miejsce i data", icon: "place", fields: [
        T("MIEJSCOWOŚĆ", "Miejscowość"),
        T("DD.MM.RRRR", "Data pokwitowania", "date"),
      ]},
      { title: "Pożyczkodawca (wypłacający)", icon: "creditor", fields: [
        T("NAZWA / FIRMA POŻYCZKODAWCY", "Nazwa / firma pożyczkodawcy"),
      ]},
      { title: "Pożyczkobiorca (otrzymujący)", icon: "borrower", fields: [
        T("IMIĘ I NAZWISKO / FIRMA", "Imię i nazwisko / firma pożyczkobiorcy"),
        T("NUMER RACHUNKU", "Numer rachunku, na który wypłacono"),
      ]},
      { title: "Kwota", icon: "terms", fields: [
        T("KWOTA", "Wypłacona kwota [PLN]", "amount"),
        T("KWOTA SŁOWNIE", "Kwota słownie (auto)", "amount-words"),
        T("DATA", "Data wypłaty", "date"),
      ]},
    ],
  },

  // ─────── Ugoda — rozłożenie na raty ───────
  "08-ugoda-rozlozenie-na-raty": {
    sections: [
      { title: "Miejsce i data", icon: "place", fields: [
        T("MIEJSCOWOŚĆ", "Miejscowość"),
        T("DD.MM.RRRR", "Data ugody", "date"),
      ]},
      { title: "Pożyczkodawca (wierzyciel)", icon: "creditor", fields: [
        T("NAZWA / FIRMA POŻYCZKODAWCY", "Nazwa / firma pożyczkodawcy"),
        T("ADRES", "Adres pożyczkodawcy", "textarea"),
        T("KRS / NIP", "KRS / NIP pożyczkodawcy"),
      ]},
      { title: "Pożyczkobiorca (dłużnik)", icon: "borrower", fields: [
        T("IMIĘ I NAZWISKO / FIRMA", "Imię i nazwisko / firma pożyczkobiorcy"),
        T("PESEL / NIP", "PESEL / NIP pożyczkobiorcy"),
        T("NUMER RACHUNKU", "Numer rachunku do spłat"),
      ]},
      { title: "Pierwotna umowa", icon: "terms", fields: [
        T("DATA UMOWY", "Data pierwotnej umowy pożyczki", "date"),
      ]},
      { title: "Warunki ugody", icon: "terms", fields: [
        T("KWOTA ŁĄCZNA", "Łączna kwota zadłużenia [PLN]", "amount"),
        T("KWOTA SŁOWNIE", "Kwota słownie (auto)", "amount-words"),
        T("LICZBA", "Liczba rat", "number"),
        T("DATA", "Termin pierwszej raty", "date"),
      ]},
    ],
  },

  // ─────── Aneks ───────
  "01-aneks-przedluzenie-terminu-i-prowizja": {
    sections: [
      { title: "Miejsce i data", icon: "place", fields: [
        T("MIEJSCOWOŚĆ", "Miejscowość"),
        T("DATA UMOWY DD.MM.RRRR", "Data podpisania aneksu", "date"),
      ]},
      { title: "Pożyczkobiorca", icon: "borrower", fields: [
        T("IMIĘ I NAZWISKO / FIRMA", "Imię i nazwisko / firma pożyczkobiorcy"),
        T("ADRES", "Adres pożyczkobiorcy", "textarea"),
        T("CEIDG / NIP / REGON", "CEIDG / NIP / REGON pożyczkobiorcy"),
      ]},
      { title: "Pożyczkodawca", icon: "creditor", fields: [
        T("NAZWA / FIRMA", "Nazwa / firma pożyczkodawcy"),
        T("KRS / NIP / REGON", "KRS / NIP / REGON pożyczkodawcy"),
      ]},
      { title: "Warunki aneksu", icon: "terms", fields: [
        T("LICZBA", "O ile dni / miesięcy przedłużamy", "number"),
        T("DATA", "Nowy termin spłaty", "date"),
        T("KWOTA", "Kwota dodatkowej prowizji [PLN]", "amount"),
        T("KWOTA SŁOWNIE", "Kwota słownie (auto)", "amount-words"),
      ]},
    ],
  },

  // ─────── Cesja ───────
  "11-umowa-przelewu-wierzytelnosci-cesja": {
    sections: [
      { title: "Miejsce i data", icon: "place", fields: [
        T("MIEJSCOWOŚĆ", "Miejscowość"),
        T("DD.MM.RRRR", "Data umowy cesji", "date"),
      ]},
      { title: "Cedent — sprzedający wierzytelność (pierwotny pożyczkodawca)", icon: "creditor", fields: [
        T("NAZWA / FIRMA", "Nazwa / firma cedenta"),
        T("ADRES", "Adres cedenta", "textarea"),
        T("KRS / NIP / REGON", "KRS / NIP / REGON cedenta"),
      ]},
      { title: "Cesjonariusz — nabywca wierzytelności", icon: "creditor", fields: [
        T("NAZWA / FIRMA / IMIĘ I NAZWISKO", "Nabywca wierzytelności"),
        T("NIP / PESEL", "NIP / PESEL nabywcy"),
      ]},
      { title: "Dłużnik (pożyczkobiorca)", icon: "borrower", fields: [
        T("IMIĘ I NAZWISKO DŁUŻNIKA", "Imię i nazwisko dłużnika"),
        T("NR KW", "Numer KW (jeśli zabezpieczenie)"),
      ]},
      { title: "Wierzytelność", icon: "terms", fields: [
        T("DATA UMOWY", "Data pierwotnej umowy pożyczki", "date"),
        T("KWOTA", "Wartość wierzytelności [PLN]", "amount"),
        T("WARUNKI PŁATNOŚCI", "Warunki płatności za cesję", "textarea"),
      ]},
    ],
  },
};

function guessType(key: string): FieldType {
  const k = key.toUpperCase();
  if (k.includes("DD.MM.RRRR") || k.startsWith("DATA")) return "date";
  if (k.includes("KWOTA SŁOWNIE")) return "amount-words";
  if (k.startsWith("KWOTA")) return "amount";
  if (k === "LICZBA" || k.startsWith("NR ") || k.startsWith("NUMER")) return "number";
  if (k === "OPIS PROPOZYCJI" || k.includes("STANOWISKO") || k.includes("WARUNKI") || k === "TYTUŁ" || k === "ADRES" || k === "ADRES SIEDZIBY" || k === "ADRES KANCELARII") return "textarea";
  return "text";
}

function buildFallbackSchema(tpl: DocTemplate): TplSchema {
  return {
    sections: [{
      title: "Pola do uzupełnienia",
      fields: (tpl.placeholders ?? []).map((k) => ({ key: k, label: k, type: guessType(k) })),
    }],
  };
}

function sectionIcon(i?: Section["icon"]) {
  switch (i) {
    case "creditor": return <Building2 className="h-4 w-4 text-blue-600" />;
    case "borrower": return <UserRound className="h-4 w-4 text-emerald-600" />;
    case "terms": return <Wallet className="h-4 w-4 text-amber-600" />;
    case "place": return <CalendarDays className="h-4 w-4 text-muted-foreground" />;
    default: return null;
  }
}

// ════════════════════════════════════════════════════════════════════
// KOMPONENT
// ════════════════════════════════════════════════════════════════════

export function DocumentCreatorPage() {
  const _list = useServerFn(listDocxTemplates);
  const _generate = useServerFn(generateDocxFromTemplate);
  const _history = useServerFn(listGeneratedDocs);
  const _signedUrl = useServerFn(getGeneratedDocSignedUrl);
  const _preview = useServerFn(getDocxTemplatePreview);

  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [history, setHistory] = useState<GeneratedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DocTemplate | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [commission, setCommission] = useState<string>("");
  const [addCommissionToCosts, setAddCommissionToCosts] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewText, setPreviewText] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState<"template" | "filled">("template");

  // Stan kalkulatora pożyczki
  const [calc, setCalc] = useState({
    netAmount: 50_000,
    months: 12,
    maxMonthly: 1_200,
    annualInterest: 9.5,
    investorMonthlyPct: 1.5,
    payoutDate: todayISO(),
  });

  const schema: TplSchema = useMemo(() => {
    if (!selected) return { sections: [] };
    return TEMPLATE_SCHEMAS[selected.slug] ?? buildFallbackSchema(selected);
  }, [selected]);

  const refresh = async () => {
    setLoading(true);
    try {
      const [t, h] = await Promise.all([_list(), _history({ data: { limit: 30 } })]);
      setTemplates(t);
      setHistory(h);
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd ładowania");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, []);

  // grupowanie listy po kategoriach
  const groups = useMemo(() => {
    const filtered = templates.filter(t =>
      !search || t.name.toLowerCase().includes(search.toLowerCase())
    );
    const map = new Map<string, DocTemplate[]>();
    for (const t of filtered) {
      const cat = t.category ?? "inne";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return Array.from(map.entries());
  }, [templates, search]);

  // pre-fill po wyborze
  useEffect(() => {
    if (!selected) return;
    const defaults: Record<string, string> = {};
    for (const key of selected.placeholders ?? []) {
      const t = guessType(key);
      defaults[key] = t === "date" ? todayDDMMYYYY() : "";
    }
    setFormData(defaults);
    setCommission("");
    setAddCommissionToCosts(false);
  }, [selected?.id]);

  // auto KWOTA SŁOWNIE
  useEffect(() => {
    if (!selected) return;
    const wordsKey = selected.placeholders?.find(k => k.toUpperCase().includes("KWOTA SŁOWNIE"));
    if (!wordsKey) return;
    const src = formData["KWOTA ŁĄCZNA"] || formData["KWOTA"] || "";
    const amt = parseFloat(src.replace(/\s/g, "").replace(",", "."));
    if (isFinite(amt) && amt > 0) {
      setFormData(d => d[wordsKey] === amountToWordsPLN(amt) ? d : ({ ...d, [wordsKey]: amountToWordsPLN(amt) }));
    }
  }, [formData["KWOTA"], formData["KWOTA ŁĄCZNA"], selected?.id]);

  // ─── kalkulator: harmonogram
  const scheduleData = useMemo(() => {
    if (!schema.hasCalculator) return null;
    return buildDirectorSchedule({
      netAmountToClient: calc.netAmount,
      creditedCommission: parseFloat(commission.replace(",", ".")) || 0,
      maxMonthlyPaymentByClient: calc.maxMonthly,
      loanTermMonths: calc.months,
      payoutDate: calc.payoutDate,
      annualInterestPercent: calc.annualInterest,
      investorMonthlyReturnType: "percent",
      investorMonthlyReturnPercent: calc.investorMonthlyPct,
    } as any);
  }, [calc, commission, schema.hasCalculator]);

  const applyCalculatorToContract = () => {
    if (!schema.calcMap || !scheduleData) return;
    const m = schema.calcMap;
    const next = { ...formData };
    if (m.amountKey) next[m.amountKey] = scheduleData.nominalLoanAmount.toFixed(2);
    if (m.amountWordsKey) next[m.amountWordsKey] = amountToWordsPLN(scheduleData.nominalLoanAmount);
    if (m.interestKey) next[m.interestKey] = `${calc.annualInterest.toFixed(2).replace(".", ",")}%`;
    if (m.monthsKey) next[m.monthsKey] = String(calc.months);
    if (m.payoutDateKey) next[m.payoutDateKey] = isoToDDMM(calc.payoutDate);
    setFormData(next);
    toast.success("Dane z kalkulatora wpisane do umowy");
  };

  const handleGenerate = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      const finalData = { ...formData };
      const comm = parseFloat(commission.replace(",", "."));
      // Prowizja DOLICZANA tylko w umowie pożyczki gdy zaznaczone
      if (schema.hasCommission && addCommissionToCosts && isFinite(comm) && comm > 0) {
        for (const k of ["KWOTA", "KWOTA ŁĄCZNA"]) {
          if (k in finalData) {
            const base = parseFloat((finalData[k] || "0").replace(",", "."));
            if (isFinite(base)) finalData[k] = (base + comm).toFixed(2);
          }
        }
        const wordsKey = selected.placeholders?.find(k => k.toUpperCase().includes("KWOTA SŁOWNIE"));
        if (wordsKey) {
          const amt = parseFloat((finalData["KWOTA ŁĄCZNA"] || finalData["KWOTA"] || "0").replace(",", "."));
          if (isFinite(amt)) finalData[wordsKey] = amountToWordsPLN(amt);
        }
      }

      const res = await _generate({
        data: {
          templateId: selected.id,
          formData: finalData,
          commissionAmount: schema.hasCommission && isFinite(comm) ? comm : null,
          commissionAddedToCosts: schema.hasCommission ? addCommissionToCosts : false,
        },
      });
      toast.success("Dokument wygenerowany");
      const url = await _signedUrl({ data: { path: res.docxPath } });
      window.open(url.url, "_blank");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd generowania");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (path: string) => {
    try {
      const r = await _signedUrl({ data: { path } });
      window.open(r.url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd pobierania");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wand2 className="h-6 w-6" /> Kreator dokumentów
        </h1>
        <p className="text-sm text-muted-foreground">
          Wybierz wzór, uzupełnij pola pogrupowane wg stron umowy (pożyczkodawca / pożyczkobiorca), pobierz DOCX.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Lista wzorów */}
        <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Wzory dokumentów</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Szukaj…"
                className="pl-8"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>}
            {!loading && groups.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Brak wzorów.</p>
            )}
            {groups.map(([cat, items]) => (
              <div key={cat}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {CATEGORY_LABELS[cat] ?? cat}
                </div>
                <div className="space-y-1">
                  {items.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className={`w-full text-left rounded-md px-3 py-2 text-sm transition ${
                        selected?.id === t.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/60"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                        <span className="leading-snug">{t.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Formularz */}
        <div className="space-y-4">
          {!selected && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
                Wybierz wzór z listy po lewej, aby uzupełnić pola.
              </CardContent>
            </Card>
          )}

          {selected && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{selected.name}</CardTitle>
                      <div className="mt-2 flex items-center gap-2">
                        {selected.category && (
                          <Badge className={CATEGORY_COLORS[selected.category] ?? ""}>
                            {CATEGORY_LABELS[selected.category] ?? selected.category}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {selected.placeholders?.length ?? 0} pól do uzupełnienia
                        </span>
                      </div>
                    </div>
                    <Button onClick={handleGenerate} disabled={generating} size="lg">
                      {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Generuj DOCX
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {/* Kalkulator pożyczki — tylko dla umowy pożyczki */}
              {schema.hasCalculator && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-primary" />
                      Kalkulator pożyczki (suwaki) — generuje harmonogram i wypełnia umowę
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <SliderField
                        label="Kwota netto dla klienta"
                        value={calc.netAmount} min={5_000} max={500_000} step={1_000}
                        format={(v) => formatPLN(v)}
                        onChange={(v) => setCalc(c => ({ ...c, netAmount: v }))}
                      />
                      <SliderField
                        label="Okres pożyczki"
                        value={calc.months} min={3} max={60} step={1}
                        format={(v) => `${v} mies.`}
                        onChange={(v) => setCalc(c => ({ ...c, months: v }))}
                      />
                      <SliderField
                        label="Maks. miesięczna rata klienta"
                        value={calc.maxMonthly} min={200} max={20_000} step={50}
                        format={(v) => formatPLN(v)}
                        onChange={(v) => setCalc(c => ({ ...c, maxMonthly: v }))}
                      />
                      <SliderField
                        label="Oprocentowanie roczne"
                        value={calc.annualInterest} min={0} max={25} step={0.25}
                        format={(v) => `${v.toFixed(2)} %`}
                        onChange={(v) => setCalc(c => ({ ...c, annualInterest: v }))}
                      />
                      <SliderField
                        label="Oczekiwany zwrot inwestora / mies."
                        value={calc.investorMonthlyPct} min={0.3} max={3.5} step={0.05}
                        format={(v) => `${v.toFixed(2)} %`}
                        onChange={(v) => setCalc(c => ({ ...c, investorMonthlyPct: v }))}
                      />
                      <div>
                        <Label className="text-xs text-muted-foreground">Data wypłaty</Label>
                        <Input
                          type="date"
                          value={calc.payoutDate}
                          onChange={(e) => setCalc(c => ({ ...c, payoutDate: e.target.value }))}
                        />
                      </div>
                    </div>

                    {scheduleData && (
                      <>
                        <div className="grid gap-2 sm:grid-cols-4 text-sm">
                          <Stat label="Kwota nominalna" value={formatPLN(scheduleData.nominalLoanAmount)} />
                          <Stat label="Rata regularna" value={formatPLN(calc.maxMonthly)} />
                          <Stat label="Rata balonowa" value={formatPLN(scheduleData.balloonPayment)} />
                          <Stat label="Suma zobowiązania" value={formatPLN(scheduleData.totalClientObligation)} />
                        </div>

                        {scheduleData.warnings.length > 0 && (
                          <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 text-xs text-yellow-900 dark:text-yellow-100">
                            {scheduleData.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                          </div>
                        )}

                        <div className="rounded-md border overflow-hidden">
                          <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/60 sticky top-0">
                                <tr>
                                  <th className="text-left px-2 py-1.5">#</th>
                                  <th className="text-left px-2 py-1.5">Data</th>
                                  <th className="text-right px-2 py-1.5">Rata</th>
                                  <th className="text-right px-2 py-1.5">Odsetki</th>
                                  <th className="text-right px-2 py-1.5">Ryzyko</th>
                                  <th className="text-right px-2 py-1.5">Kapitał</th>
                                  <th className="text-right px-2 py-1.5">Saldo</th>
                                </tr>
                              </thead>
                              <tbody>
                                {scheduleData.rows.map((r, i) => (
                                  <tr key={i} className={r.index === "Balon" ? "bg-primary/10 font-semibold" : "border-t"}>
                                    <td className="px-2 py-1">{r.index}</td>
                                    <td className="px-2 py-1">{new Date(r.date).toLocaleDateString("pl-PL")}</td>
                                    <td className="px-2 py-1 text-right">{formatPLN(r.paymentAmount)}</td>
                                    <td className="px-2 py-1 text-right">{formatPLN(r.interest)}</td>
                                    <td className="px-2 py-1 text-right">{formatPLN(r.riskFee)}</td>
                                    <td className="px-2 py-1 text-right">{formatPLN(r.capital)}</td>
                                    <td className="px-2 py-1 text-right">{formatPLN(r.remainingCapital)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <Button onClick={applyCalculatorToContract} variant="default" className="w-full">
                          <ArrowRight className="mr-2 h-4 w-4" /> Wpisz dane z kalkulatora do umowy
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Pola pogrupowane wg sekcji */}
              {schema.sections.map((sec, idx) => (
                <Card key={idx}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      {sectionIcon(sec.icon)}
                      {sec.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {sec.fields.map((f) => {
                        const t = f.type ?? guessType(f.key);
                        const isFull = t === "textarea";
                        const isDateInput = t === "date";
                        return (
                          <div key={f.key} className={isFull ? "sm:col-span-2" : ""}>
                            <Label className="text-xs text-muted-foreground">{f.label}</Label>
                            {isFull ? (
                              <Textarea
                                rows={2}
                                value={formData[f.key] ?? ""}
                                onChange={e => setFormData(d => ({ ...d, [f.key]: e.target.value }))}
                              />
                            ) : isDateInput ? (
                              <Input
                                type="text"
                                placeholder="DD.MM.RRRR"
                                value={formData[f.key] ?? ""}
                                onChange={e => setFormData(d => ({ ...d, [f.key]: e.target.value }))}
                              />
                            ) : (
                              <Input
                                inputMode={t === "amount" || t === "number" ? "decimal" : undefined}
                                placeholder={
                                  t === "amount" ? "np. 50000,00" :
                                  t === "amount-words" ? "wyliczy się z kwoty…" : ""
                                }
                                value={formData[f.key] ?? ""}
                                onChange={e => setFormData(d => ({ ...d, [f.key]: e.target.value }))}
                              />
                            )}
                            {f.helper && <p className="text-[11px] text-muted-foreground mt-1">{f.helper}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Prowizja — TYLKO przy umowie pożyczki */}
              {schema.hasCommission && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Prowizja pośrednika</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Dotyczy wyłącznie umowy pożyczki. Pozostałe dokumenty (pokwitowania, oświadczenia, hipoteka itd.) nie zawierają prowizji.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                      <div>
                        <Label className="text-xs text-muted-foreground">Kwota prowizji [PLN]</Label>
                        <Input
                          inputMode="decimal"
                          placeholder="np. 2500,00"
                          value={commission}
                          onChange={e => setCommission(e.target.value)}
                        />
                      </div>
                      <div className="flex items-end gap-2 pb-2">
                        <Checkbox
                          id="comm-add"
                          checked={addCommissionToCosts}
                          onCheckedChange={v => setAddCommissionToCosts(!!v)}
                        />
                        <Label htmlFor="comm-add" className="text-sm">Dolicz do kwoty pożyczki</Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Historia */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ostatnio wygenerowane</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak dokumentów.</p>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{h.template_name ?? "Dokument"}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(h.created_at).toLocaleString("pl-PL")}
                          {h.commission_amount ? ` · prowizja ${h.commission_amount.toLocaleString("pl-PL")} PLN` : ""}
                        </div>
                      </div>
                      {h.docx_path && (
                        <Button size="sm" variant="outline" onClick={() => handleDownload(h.docx_path!)}>
                          <Download className="mr-1 h-3.5 w-3.5" /> DOCX
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Sub-komponenty
// ════════════════════════════════════════════════════════════════════

function SliderField({
  label, value, min, max, step, format, onChange,
}: {
  label: string;
  value: number; min: number; max: number; step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-sm font-semibold tabular-nums">{format(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min} max={max} step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
