import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDateTime } from "@/lib/labels";
import { extractLoanCalcPayload, type LoanCalcPayload } from "@/lib/loan-calc-pdf";
import { buildCalcFieldValues } from "@/lib/loan-calc-fill";
import { readCalcHandoff, clearCalcHandoff, onCalcHandoffChange } from "@/lib/loan-calc-handoff";
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
import { gusCompanyLookup } from "@/lib/gus-bir.functions";
import { krsCompanyLookup } from "@/lib/krs.functions";
import { companyBankAccountLookup } from "@/lib/company-bank-lookup.functions";
import {
  extractOrderedFields,
  groupFields,
  companyValueForField,
  calculatorValueForField,
  previewSegments,
  amountKind,
  type DocField,
  type FieldGroup,
  type CompanyBundle,
  type CalculatorOutputs,
} from "@/lib/document-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  FileText,
  Download,
  Sparkles,
  Search,
  Wand2,
  Calculator,
  Building2,
  UserRound,
  Wallet,
  CalendarDays,
  ArrowRight,
  Eye,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Upload,
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

const todayISO = () => new Date().toISOString().slice(0, 10);
const isoToDDMM = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

function parseAmountPL(s: string | undefined | null): number {
  if (!s) return NaN;
  // \s w JS obejmuje też spację nierozdzielającą używaną przez Intl.NumberFormat
  let x = String(s).replace(/\s/g, "");
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  return parseFloat(x);
}

function groupIcon(g: FieldGroup) {
  if (g.key === "miejsce-data") return <CalendarDays className="h-4 w-4 text-muted-foreground" />;
  if (g.key === "kwoty") return <Wallet className="h-4 w-4 text-amber-600" />;
  if (g.partyKind === "company") return <Building2 className="h-4 w-4 text-blue-600" />;
  if (g.partyKind === "person-or-company")
    return <UserRound className="h-4 w-4 text-emerald-600" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

/** Czy wybrany wzór to Umowa pożyczki (tylko przy niej pokazujemy kalkulator). */
function isLoanAgreement(t: DocTemplate | null): boolean {
  if (!t) return false;
  const slug = (t.slug ?? "").toLowerCase();
  const name = (t.name ?? "").toLowerCase();
  return (
    slug.includes("umowa-pozyczki") ||
    name.includes("umowa pożyczki") ||
    name.includes("umowa pozyczki")
  );
}

// ════════════════════════════════════════════════════════════════════
// Pobieranie danych firmowych (GUS → KRS → rachunek)
// ════════════════════════════════════════════════════════════════════

interface BundleResult {
  bundle: CompanyBundle;
  sources: string[];
  warnings: string[];
  bankNote: string | null;
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
  const _gus = useServerFn(gusCompanyLookup);
  const _krs = useServerFn(krsCompanyLookup);
  const _bank = useServerFn(companyBankAccountLookup);

  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [history, setHistory] = useState<GeneratedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DocTemplate | null>(null);

  const [values, setValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  // Harmonogram wczytany z PDF kalkulatora → wstawiany jako tabela w [HARMONOGRAM].
  const [importedSchedule, setImportedSchedule] = useState<LoanCalcPayload["schedule"] | null>(
    null,
  );
  const [handoffReady, setHandoffReady] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Nasłuchuj kalkulacji przekazanej z kalkulatora (w aplikacji).
  useEffect(() => {
    const sync = () => setHandoffReady(!!readCalcHandoff());
    sync();
    return onCalcHandoffChange(sync);
  }, []);
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
    commission: 0,
    payoutDate: todayISO(),
  });
  const [showCalc, setShowCalc] = useState(false);

  // Pola wzoru wyliczone z podglądu
  const fields = useMemo<DocField[]>(
    () => (previewText ? extractOrderedFields(previewText) : []),
    [previewText],
  );
  const groups = useMemo<FieldGroup[]>(() => groupFields(fields), [fields]);
  // Kalkulator pokazujemy WYŁĄCZNIE przy Umowie pożyczki.
  const showCalculator = useMemo(() => isLoanAgreement(selected), [selected]);

  // Mapowanie pól "kwota słownie" → odpowiadające pole kwotowe.
  // W jednych wzorach „SŁOWNIE" jest PO kwocie (wezwania), w innych PRZED nią
  // (umowa: „BRUTTO SŁOWNIE", potem „BRUTTO CYFRAMI"). Dlatego szukamy najbliższego
  // pola kwotowego (w obie strony), preferując ten sam rodzaj kwoty (przez wspólną
  // funkcję amountKind) i pole bezpośrednio sąsiadujące.
  const wordsToAmount = useMemo(() => {
    const map: Record<string, string> = {};
    const amounts = fields.filter((f) => f.semantic === "amount");
    for (const w of fields) {
      if (w.semantic !== "amountWords") continue;
      const wk = amountKind(w.key);
      let best: DocField | null = null;
      let bestScore = Infinity;
      for (const a of amounts) {
        // odległość dominuje; ten sam rodzaj i kierunek „przed" rozstrzygają remisy
        const score =
          Math.abs(a.occ - w.occ) +
          (amountKind(a.key) === wk ? 0 : 0.4) +
          (a.occ < w.occ ? 0 : 0.1);
        if (score < bestScore) {
          bestScore = score;
          best = a;
        }
      }
      if (best) map[w.id] = best.id;
    }
    return map;
  }, [fields]);

  const setValue = useCallback((id: string, val: string) => {
    setValues((v) => ({ ...v, [id]: val }));
  }, []);

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
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Grupowanie listy wzorów po kategoriach
  const templateGroups = useMemo(() => {
    const filtered = templates.filter(
      (t) => !search || t.name.toLowerCase().includes(search.toLowerCase()),
    );
    const map = new Map<string, DocTemplate[]>();
    for (const t of filtered) {
      const cat = t.category ?? "inne";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return Array.from(map.entries());
  }, [templates, search]);

  // Po wyborze wzoru — wczytaj podgląd, wyzeruj formularz
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    if (!selected) return;
    setValues({});
    setPreviewText("");
    setPreviewError(null);
    setShowCalc(false);
    setImportedSchedule(null);
    setPreviewLoading(true);
    _preview({ data: { templateId: selected.id } })
      .then((r) => setPreviewText(r.text))
      .catch((e: any) => {
        const msg = String(e?.message ?? "błąd");
        setPreviewError(msg);
        if (!/not found|nie istnieje/i.test(msg)) toast.error(`Podgląd wzoru: ${msg}`);
      })
      .finally(() => setPreviewLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Auto „kwota słownie" z najbliższej kwoty cyfrowej
  useEffect(() => {
    if (Object.keys(wordsToAmount).length === 0) return;
    setValues((v) => {
      let changed = false;
      const next = { ...v };
      for (const [wordId, amountId] of Object.entries(wordsToAmount)) {
        const amt = parseAmountPL(v[amountId]);
        if (isFinite(amt) && amt > 0) {
          const w = amountToWordsPLN(amt);
          if (next[wordId] !== w) {
            next[wordId] = w;
            changed = true;
          }
        }
      }
      return changed ? next : v;
    });
  }, [values, wordsToAmount]);

  // ─── Kalkulator: harmonogram
  const scheduleData = useMemo(() => {
    if (!showCalculator) return null;
    return buildDirectorSchedule({
      netAmountToClient: calc.netAmount,
      creditedCommission: calc.commission || 0,
      maxMonthlyPaymentByClient: calc.maxMonthly,
      loanTermMonths: calc.months,
      payoutDate: calc.payoutDate,
      annualInterestPercent: calc.annualInterest,
      investorMonthlyReturnType: "percent",
      investorMonthlyReturnPercent: calc.investorMonthlyPct,
    } as any);
  }, [calc, showCalculator]);

  const applyCalculatorToContract = () => {
    if (!scheduleData) return;
    const outputs: CalculatorOutputs = {
      nominal: scheduleData.nominalLoanAmount,
      net: calc.netAmount,
      commission: calc.commission || 0,
      total: scheduleData.totalClientObligation,
      annualInterestPercent: calc.annualInterest,
      months: calc.months,
      payoutDateDDMM: isoToDDMM(calc.payoutDate),
    };
    setValues((v) => {
      const next = { ...v };
      let count = 0;
      for (const f of fields) {
        const val = calculatorValueForField(f, outputs);
        if (val != null) {
          next[f.id] = val;
          count++;
        }
      }
      if (count === 0)
        toast.message("Ten wzór nie ma pól finansowych do wypełnienia z kalkulatora.");
      else toast.success(`Wpisano dane z kalkulatora do ${count} pól.`);
      return next;
    });
  };

  // ─── Wczytanie danych z kalkulatora (deterministycznie, bez AI)
  const applyCalcPayload = useCallback(
    (p: LoanCalcPayload, source: "app" | "pdf") => {
      setImportedSchedule(p.schedule ?? null);
      setValues((v) => {
        const mapped = buildCalcFieldValues(fields, p);
        const count = Object.keys(mapped).length;
        if (count === 0)
          toast.message("Nie znalazłem pól finansowych do uzupełnienia w tym wzorze.");
        else
          toast.success(
            `Wczytano dane z ${source === "app" ? "kalkulatora" : "PDF"} do ${count} pól.` +
              (p.schedule?.length
                ? ` Harmonogram (${p.schedule.length} rat) wstawię w [HARMONOGRAM].`
                : ""),
          );
        return { ...v, ...mapped };
      });
    },
    [fields],
  );

  const loadFromCalculator = useCallback(() => {
    const h = readCalcHandoff();
    if (!h) {
      toast.error("Brak kalkulacji. W kalkulatorze inwestora kliknij „Wyślij do kreatora”.");
      return;
    }
    applyCalcPayload(h.payload, "app");
  }, [applyCalcPayload]);

  const onPickCalcPdf = useCallback(
    async (file: File) => {
      const t = toast.loading("Odczytuję dane z PDF…");
      try {
        const buf = await file.arrayBuffer();
        const payload = extractLoanCalcPayload(buf);
        if (!payload) {
          toast.error("To nie jest PDF z kalkulatora Finance You — brak danych do odczytu.", {
            id: t,
          });
          return;
        }
        applyCalcPayload(payload, "pdf");
        toast.dismiss(t);
      } catch (e: any) {
        toast.error(e?.message ?? "Nie udało się wczytać PDF.", { id: t });
      }
    },
    [applyCalcPayload],
  );

  // ─── Pobieranie danych firmowych
  const loadCompanyBundle = useCallback(
    async (ids: { nip?: string; regon?: string; krs?: string }): Promise<BundleResult> => {
      const bundle: CompanyBundle = {};
      const sources: string[] = [];
      const warnings: string[] = [];
      let bankNote: string | null = null;

      // 1) GUS REGON BIR — priorytet NIP > REGON > KRS
      const payload: { nip?: string; regon?: string; krs?: string } = {};
      if (ids.nip) payload.nip = ids.nip;
      else if (ids.regon) payload.regon = ids.regon;
      else if (ids.krs) payload.krs = ids.krs;

      let gus: any = null;
      try {
        gus = await _gus({ data: payload });
      } catch (e: any) {
        warnings.push(e?.message ?? "Błąd połączenia z GUS.");
      }
      if (gus?.success) {
        const c = gus.company;
        bundle.name = c.name || bundle.name;
        bundle.nip = c.nip || bundle.nip;
        bundle.regon = c.regon || bundle.regon;
        bundle.krs = c.krs || bundle.krs;
        bundle.legalForm = c.legalForm || bundle.legalForm;
        bundle.addressFull = c.address?.fullAddress || bundle.addressFull;
        bundle.phone = c.contact?.phone || bundle.phone;
        bundle.email = c.contact?.email || bundle.email;
        sources.push("GUS REGON BIR");
      } else if (gus?.message) {
        warnings.push(`GUS: ${gus.message}`);
      }

      // 2) KRS — pełny odpis (zarząd, reprezentacja, adres)
      const krsNum = (bundle.krs || ids.krs || "").replace(/\D/g, "");
      if (krsNum) {
        let krs: any = null;
        try {
          krs = await _krs({ data: { krs: krsNum } });
        } catch (e: any) {
          warnings.push(e?.message ?? "Błąd połączenia z KRS.");
        }
        if (krs?.success) {
          const c = krs.company;
          bundle.name = bundle.name || c.name;
          bundle.nip = bundle.nip || c.nip;
          bundle.regon = bundle.regon || c.regon;
          bundle.krs = bundle.krs || c.krs;
          bundle.legalForm = bundle.legalForm || c.legalForm;
          if (c.address?.fullAddress) bundle.addressFull = c.address.fullAddress;
          const bm = c.managementBoard?.[0];
          if (bm) {
            bundle.representativeName =
              [bm.firstName, bm.lastName].filter(Boolean).join(" ").trim() ||
              bundle.representativeName;
            bundle.representativeRole =
              bm.role || c.representation?.method || bundle.representativeRole;
          } else if (c.representation?.method) {
            bundle.representativeRole = c.representation.method;
          }
          sources.push("KRS");
          const fl = c.flags ?? {};
          if (fl.liquidation) warnings.push("KRS: podmiot w likwidacji.");
          if (fl.bankruptcy) warnings.push("KRS: informacja o upadłości.");
          if (fl.restructuring) warnings.push("KRS: informacja o restrukturyzacji.");
          if (fl.deleted) warnings.push("KRS: podmiot wykreślony.");
        } else if (krs?.message) {
          warnings.push(`KRS: ${krs.message}`);
        }
      }

      // 3) Rachunek bankowy z internetu (Perplexity) — wymaga ręcznej weryfikacji
      if (bundle.nip || bundle.krs || bundle.name) {
        let bk: any = null;
        try {
          bk = await _bank({
            data: {
              companyName: bundle.name || "",
              nip: bundle.nip || "",
              krs: bundle.krs || "",
              regon: bundle.regon || "",
            },
          });
        } catch {
          /* miękko */
        }
        if (bk?.success && bk.normalized) {
          bundle.bankAccount = bk.normalized;
          bankNote = "Numer rachunku znaleziony w internecie — zweryfikuj ręcznie przed przelewem.";
          if (Array.isArray(bk.sources)) sources.push(...bk.sources.slice(0, 2));
        }
      }

      return { bundle, sources, warnings, bankNote };
    },
    [_gus, _krs, _bank],
  );

  const applyBundleToGroup = useCallback((group: FieldGroup, bundle: CompanyBundle) => {
    setValues((v) => {
      const next = { ...v };
      let count = 0;
      for (const f of group.fields) {
        if (!f.autofill) continue;
        const val = companyValueForField(f, bundle);
        if (val) {
          next[f.id] = val;
          count++;
        }
      }
      if (count === 0) toast.message("Brak pasujących pól do uzupełnienia w tej sekcji.");
      else toast.success(`Uzupełniono ${count} pól danymi firmy.`);
      return next;
    });
  }, []);

  const handleGenerate = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      const commission = calc.commission || 0;
      const res = await _generate({
        data: {
          templateId: selected.id,
          values,
          commissionAmount: showCalculator && commission > 0 ? commission : null,
          commissionAddedToCosts: false,
          schedule: importedSchedule ?? undefined,
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

  const filledCount = useMemo(
    () => fields.filter((f) => (values[f.id] ?? "").trim().length > 0).length,
    [fields, values],
  );
  const fillableCount = useMemo(
    () => fields.filter((f) => f.semantic !== "instruction").length,
    [fields],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wand2 className="h-6 w-6" /> Kreator dokumentów
        </h1>
        <p className="text-sm text-muted-foreground">
          Wybierz wzór, uzupełnij pola pogrupowane wg stron umowy. Dane firmowe pobierzesz jednym
          kliknięciem z GUS, KRS i Białej Listy, a kwoty z kalkulatora pożyczki. Treść wzoru nie
          jest zmieniana.
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
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            {!loading && templateGroups.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Brak wzorów.</p>
            )}
            {templateGroups.map(([cat, items]) => (
              <div key={cat}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {CATEGORY_LABELS[cat] ?? cat}
                </div>
                <div className="space-y-1">
                  {items.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className={`w-full text-left rounded-md px-3 py-2 text-sm transition ${
                        selected?.id === t.id
                          ? "bg-primary/10 ring-1 ring-primary/30"
                          : "hover:bg-muted/60"
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
              <Card className="lg:sticky lg:top-4 z-10 shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="leading-snug">{selected.name}</CardTitle>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {selected.category && (
                          <Badge className={CATEGORY_COLORS[selected.category] ?? ""}>
                            {CATEGORY_LABELS[selected.category] ?? selected.category}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {fillableCount > 0
                            ? `${filledCount} / ${fillableCount} pól uzupełnionych`
                            : "wczytywanie pól…"}
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={handleGenerate}
                      disabled={generating || previewLoading}
                      size="lg"
                      className="shrink-0"
                    >
                      {generating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Generuj DOCX
                    </Button>
                  </div>
                  {/* Pasek postępu uzupełnienia */}
                  {fillableCount > 0 && (
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.round((filledCount / fillableCount) * 100)}%` }}
                      />
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Pola, których nie uzupełnisz, zostaną w dokumencie jako{" "}
                    <code className="rounded bg-muted px-1">[NAZWA POLA]</code> — treść wzoru nie
                    jest zmieniana.
                  </p>
                </CardHeader>
              </Card>

              {/* Wczytanie danych z kalkulatora (deterministycznie, bez AI) */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-primary" /> Wczytaj dane z kalkulatora
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      W kalkulatorze inwestora kliknij „Wyślij do kreatora” — tu uzupełnię wszystkie
                      dane finansowe i cały harmonogram, deterministycznie (bez AI). Możesz też
                      wczytać z pobranego PDF.
                    </p>
                    {handoffReady && !importedSchedule && (
                      <p className="text-[11px] text-primary mt-0.5 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Wykryto kalkulację z kalkulatora — kliknij
                        „Wczytaj z kalkulatora”.
                      </p>
                    )}
                    {importedSchedule && (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Wczytano harmonogram:{" "}
                        {importedSchedule.length} rat — zostanie wstawiony w miejsce{" "}
                        <code className="rounded bg-muted px-1">[HARMONOGRAM]</code>.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onPickCalcPdf(f);
                        if (pdfInputRef.current) pdfInputRef.current.value = "";
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => pdfInputRef.current?.click()}
                    >
                      <Upload className="mr-2 h-4 w-4" /> Z PDF
                    </Button>
                    <Button
                      onClick={loadFromCalculator}
                      disabled={!handoffReady}
                      className="shrink-0"
                    >
                      <Calculator className="mr-2 h-4 w-4" /> Wczytaj z kalkulatora
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Kalkulator pożyczki — tylko przy Umowie pożyczki */}
              {showCalculator && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-3">
                    <button
                      type="button"
                      onClick={() => setShowCalc((s) => !s)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calculator className="h-4 w-4 text-primary" />
                        Kalkulator pożyczki — przelicz i wpisz kwoty do dokumentu
                      </CardTitle>
                      {showCalc ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </CardHeader>
                  {showCalc && (
                    <CardContent className="space-y-5">
                      <div className="grid gap-5 sm:grid-cols-2">
                        <SliderField
                          label="Kwota netto dla klienta"
                          value={calc.netAmount}
                          min={5_000}
                          max={500_000}
                          step={1_000}
                          format={(v) => formatPLN(v)}
                          onChange={(v) => setCalc((c) => ({ ...c, netAmount: v }))}
                        />
                        <SliderField
                          label="Prowizja kredytowana"
                          value={calc.commission}
                          min={0}
                          max={100_000}
                          step={500}
                          format={(v) => formatPLN(v)}
                          onChange={(v) => setCalc((c) => ({ ...c, commission: v }))}
                        />
                        <SliderField
                          label="Okres pożyczki"
                          value={calc.months}
                          min={3}
                          max={60}
                          step={1}
                          format={(v) => `${v} mies.`}
                          onChange={(v) => setCalc((c) => ({ ...c, months: v }))}
                        />
                        <SliderField
                          label="Maks. miesięczna rata klienta"
                          value={calc.maxMonthly}
                          min={200}
                          max={20_000}
                          step={50}
                          format={(v) => formatPLN(v)}
                          onChange={(v) => setCalc((c) => ({ ...c, maxMonthly: v }))}
                        />
                        <SliderField
                          label="Oprocentowanie roczne"
                          value={calc.annualInterest}
                          min={0}
                          max={25}
                          step={0.25}
                          format={(v) => `${v.toFixed(2)} %`}
                          onChange={(v) => setCalc((c) => ({ ...c, annualInterest: v }))}
                        />
                        <SliderField
                          label="Oczekiwany zwrot inwestora / mies."
                          value={calc.investorMonthlyPct}
                          min={0.3}
                          max={3.5}
                          step={0.05}
                          format={(v) => `${v.toFixed(2)} %`}
                          onChange={(v) => setCalc((c) => ({ ...c, investorMonthlyPct: v }))}
                        />
                        <div>
                          <Label className="text-xs text-muted-foreground">Data wypłaty</Label>
                          <Input
                            type="date"
                            value={calc.payoutDate}
                            onChange={(e) => setCalc((c) => ({ ...c, payoutDate: e.target.value }))}
                          />
                        </div>
                      </div>

                      {scheduleData && (
                        <>
                          <div className="grid gap-2 sm:grid-cols-4 text-sm">
                            <Stat
                              label="Kwota nominalna (brutto)"
                              value={formatPLN(scheduleData.nominalLoanAmount)}
                            />
                            <Stat label="Rata regularna" value={formatPLN(calc.maxMonthly)} />
                            <Stat
                              label="Rata balonowa"
                              value={formatPLN(scheduleData.balloonPayment)}
                            />
                            <Stat
                              label="Suma zobowiązania"
                              value={formatPLN(scheduleData.totalClientObligation)}
                            />
                          </div>

                          {scheduleData.warnings.length > 0 && (
                            <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 text-xs text-yellow-900 dark:text-yellow-100">
                              {scheduleData.warnings.map((w, i) => (
                                <div key={i}>⚠ {w}</div>
                              ))}
                            </div>
                          )}

                          <Button
                            onClick={applyCalculatorToContract}
                            variant="default"
                            className="w-full"
                          >
                            <ArrowRight className="mr-2 h-4 w-4" /> Wpisz kwoty z kalkulatora do
                            dokumentu
                          </Button>
                        </>
                      )}
                    </CardContent>
                  )}
                </Card>
              )}

              {/* Pola pogrupowane wg sekcji */}
              {previewLoading ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Analizuję wzór…
                  </CardContent>
                </Card>
              ) : (
                groups.map((g) => (
                  <GroupCard
                    key={g.key}
                    group={g}
                    values={values}
                    setValue={setValue}
                    onFetchCompany={loadCompanyBundle}
                    onApplyBundle={applyBundleToGroup}
                  />
                ))
              )}

              {/* Podgląd wzoru */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Eye className="h-4 w-4 text-primary" />
                      Podgląd dokumentu
                    </CardTitle>
                    <div className="flex items-center gap-1 rounded-md border p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setPreviewMode("template")}
                        className={`px-2.5 py-1 rounded ${previewMode === "template" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      >
                        Wzór z polami
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode("filled")}
                        className={`px-2.5 py-1 rounded ${previewMode === "filled" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      >
                        Z wypełnionymi danymi
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {previewLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Ładowanie podglądu…
                    </div>
                  ) : previewText ? (
                    <div className="max-h-[480px] overflow-y-auto rounded-md border bg-muted/30 p-4">
                      <PreviewRenderer
                        text={previewText}
                        values={previewMode === "filled" ? values : null}
                      />
                    </div>
                  ) : previewError ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-sm space-y-2">
                      <p className="font-medium text-destructive">Nie można wczytać wzoru</p>
                      <p className="text-muted-foreground">{previewError}</p>
                      <p className="text-xs text-muted-foreground">
                        Wgraj plik .docx w{" "}
                        <a href="/admin/dokumenty" className="underline">
                          /admin/dokumenty
                        </a>{" "}
                        (przycisk „Wgraj/Zamień .docx" na karcie tego wzoru).
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Brak podglądu dla tego wzoru.
                    </p>
                  )}
                </CardContent>
              </Card>
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
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{h.template_name ?? "Dokument"}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(h.created_at)}
                          {h.commission_amount
                            ? ` · prowizja ${h.commission_amount.toLocaleString("pl-PL")} PLN`
                            : ""}
                        </div>
                      </div>
                      {h.docx_path && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(h.docx_path!)}
                        >
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
// Karta grupy pól (z autouzupełnianiem firmowym)
// ════════════════════════════════════════════════════════════════════

function GroupCard({
  group,
  values,
  setValue,
  onFetchCompany,
  onApplyBundle,
}: {
  group: FieldGroup;
  values: Record<string, string>;
  setValue: (id: string, val: string) => void;
  onFetchCompany: (ids: { nip?: string; regon?: string; krs?: string }) => Promise<BundleResult>;
  onApplyBundle: (group: FieldGroup, bundle: CompanyBundle) => void;
}) {
  const isInstrukcje = group.key === "instrukcje";
  const canAutofill = group.fields.some((f) => f.autofill);
  const showCompanyBox =
    (group.partyKind === "company" || group.partyKind === "person-or-company") && canAutofill;

  const [open, setOpen] = useState(!isInstrukcje);
  const [nip, setNip] = useState("");
  const [krs, setKrs] = useState("");
  const [regon, setRegon] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{
    sources: string[];
    warnings: string[];
    bankNote: string | null;
  } | null>(null);

  const fetchCompany = async () => {
    const ids = {
      nip: nip.replace(/\D/g, ""),
      krs: krs.replace(/\D/g, ""),
      regon: regon.replace(/\D/g, ""),
    };
    if (!ids.nip && !ids.krs && !ids.regon) {
      toast.error("Podaj NIP, KRS albo REGON");
      return;
    }
    setBusy(true);
    const t = toast.loading("Pobieram dane firmy z GUS / KRS…");
    try {
      const res = await onFetchCompany(ids);
      if (res.sources.length === 0 && res.warnings.length === 0) {
        toast.error("Nie udało się pobrać danych firmy.", { id: t });
      } else if (res.sources.length === 0) {
        toast.error(res.warnings[0] ?? "Nie znaleziono firmy.", { id: t });
      } else {
        onApplyBundle(group, res.bundle);
        toast.success(
          `Dane pobrane z: ${res.sources.filter((s) => !s.startsWith("http")).join(", ") || "rejestrów"}.`,
          {
            id: t,
          },
        );
      }
      setNote({ sources: res.sources, warnings: res.warnings, bankNote: res.bankNote });
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd pobierania danych firmy.", { id: t });
    } finally {
      setBusy(false);
    }
  };

  const fillable = group.fields.filter((f) => f.semantic !== "instruction");
  const groupFilled = fillable.filter((f) => (values[f.id] ?? "").trim().length > 0).length;
  const allFilled = fillable.length > 0 && groupFilled === fillable.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            {groupIcon(group)}
            {group.label}
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              {fillable.length > 0
                ? `${groupFilled}/${fillable.length}`
                : `(${group.fields.length})`}
            </span>
            {allFilled && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            {showCompanyBox && (
              <Badge
                variant="secondary"
                className="gap-1 text-[10px] font-normal text-primary bg-primary/10"
              >
                <Building2 className="h-3 w-3" /> auto z GUS/KRS
              </Badge>
            )}
          </CardTitle>
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {/* Pasek autouzupełniania firmowego */}
          {showCompanyBox && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-primary" />
                Pobierz dane firmy automatycznie
              </div>
              <p className="text-[11px] text-muted-foreground">
                Wpisz dowolny identyfikator firmy — zaciągniemy nazwę, adres, NIP/REGON/KRS,
                reprezentację i rachunek bankowy z GUS, KRS i Białej Listy.
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <Input
                  placeholder="NIP"
                  inputMode="numeric"
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                />
                <Input
                  placeholder="KRS"
                  inputMode="numeric"
                  value={krs}
                  onChange={(e) => setKrs(e.target.value)}
                />
                <Input
                  placeholder="REGON"
                  inputMode="numeric"
                  value={regon}
                  onChange={(e) => setRegon(e.target.value)}
                />
                <Button type="button" onClick={fetchCompany} disabled={busy} className="shrink-0">
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-1 hidden sm:inline">Pobierz</span>
                </Button>
              </div>
              {note && (note.sources.length > 0 || note.warnings.length > 0 || note.bankNote) && (
                <div className="space-y-1 text-[11px]">
                  {note.sources.filter((s) => !s.startsWith("http")).length > 0 && (
                    <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="h-3 w-3" /> Źródła:{" "}
                      {note.sources.filter((s) => !s.startsWith("http")).join(", ")}
                    </div>
                  )}
                  {note.bankNote && (
                    <div className="flex items-start gap-1 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {note.bankNote}
                    </div>
                  )}
                  {note.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-1 text-amber-700 dark:text-amber-300"
                    >
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isInstrukcje && (
            <p className="text-[11px] text-muted-foreground">
              Te pola to opcje i miejsca do ręcznego wyboru we wzorze. Wypełnij tylko jeśli chcesz —
              puste zostaną w dokumencie bez zmian.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((f) => (
              <FieldInputRow
                key={f.id}
                field={f}
                value={values[f.id] ?? ""}
                onChange={(v) => setValue(f.id, v)}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function FieldInputRow({
  field,
  value,
  onChange,
}: {
  field: DocField;
  value: string;
  onChange: (v: string) => void;
}) {
  const isFull = field.input === "textarea";
  return (
    <div className={isFull ? "sm:col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground">{field.label}</Label>
      {field.input === "textarea" ? (
        <Textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : field.input === "choice" && field.options ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Wybierz…" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.input === "date" ? (
        <Input
          type="text"
          placeholder="DD.MM.RRRR"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          inputMode={field.input === "amount" || field.input === "number" ? "decimal" : undefined}
          placeholder={
            field.input === "amount"
              ? "np. 50 000,00"
              : field.semantic === "amountWords"
                ? "wyliczy się z kwoty…"
                : ""
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.key !== field.label && (
        <p className="text-[11px] text-muted-foreground mt-1 font-mono opacity-70">[{field.key}]</p>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Sub-komponenty
// ════════════════════════════════════════════════════════════════════

function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
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
        min={min}
        max={max}
        step={step}
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

/**
 * Renderuje treść wzoru. Korzysta z `previewSegments` — TEGO SAMEGO tokenizera,
 * co silnik pól — więc indeksy wystąpień (occ) są spójne z wartościami formularza,
 * a powtarzające się klucze mają niezależne wartości.
 */
function PreviewRenderer({
  text,
  values,
}: {
  text: string;
  values: Record<string, string> | null;
}) {
  const segments = previewSegments(text);
  return (
    <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed font-sans text-foreground">
      {segments.map((seg, i) => {
        if (!seg.isToken) return <span key={i}>{seg.text}</span>;
        const val = values ? (values[String(seg.occ)] ?? "").trim() : "";
        if (values && val) {
          return (
            <span
              key={i}
              className="rounded bg-emerald-100 dark:bg-emerald-900/40 px-1 font-semibold text-emerald-900 dark:text-emerald-100"
              title={`Wypełnione: ${seg.key}`}
            >
              {val}
            </span>
          );
        }
        return (
          <span
            key={i}
            className="rounded bg-amber-100 dark:bg-amber-900/40 px-1 font-mono text-[12px] text-amber-900 dark:text-amber-100 border border-amber-300/60 dark:border-amber-700/60"
            title="Pole do uzupełnienia"
          >
            {seg.text}
          </span>
        );
      })}
    </pre>
  );
}
