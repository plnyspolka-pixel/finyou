import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listDocxTemplates,
  generateDocxFromTemplate,
  listGeneratedDocs,
  getGeneratedDocSignedUrl,
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
import { Loader2, FileText, Download, Sparkles, Search, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { amountToWordsPLN } from "@/lib/amount-to-words-pl";

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

const todayDDMMYYYY = () => {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

function placeholderType(key: string): "date" | "amount" | "amount-words" | "number" | "textarea" | "text" {
  const k = key.toUpperCase();
  if (k.includes("DD.MM.RRRR") || k.startsWith("DATA")) return "date";
  if (k.includes("KWOTA SŁOWNIE")) return "amount-words";
  if (k.startsWith("KWOTA")) return "amount";
  if (k === "LICZBA" || k.startsWith("NR ") || k.startsWith("NUMER")) return "number";
  if (k === "OPIS PROPOZYCJI" || k.includes("STANOWISKO") || k.includes("WARUNKI") || k === "TYTUŁ" || k === "ADRES" || k === "ADRES SIEDZIBY" || k === "ADRES KANCELARII") return "textarea";
  return "text";
}

export function DocumentCreatorPage() {
  const _list = useServerFn(listDocxTemplates);
  const _generate = useServerFn(generateDocxFromTemplate);
  const _history = useServerFn(listGeneratedDocs);
  const _signedUrl = useServerFn(getGeneratedDocSignedUrl);

  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [history, setHistory] = useState<GeneratedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DocTemplate | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [commission, setCommission] = useState<string>("");
  const [addCommissionToCosts, setAddCommissionToCosts] = useState(false);
  const [generating, setGenerating] = useState(false);

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

  // Grupowanie po kategoriach
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

  // Po wybraniu szablonu — pre-fill domyślnymi wartościami
  useEffect(() => {
    if (!selected) return;
    const defaults: Record<string, string> = {};
    for (const key of selected.placeholders ?? []) {
      const t = placeholderType(key);
      if (t === "date") defaults[key] = todayDDMMYYYY();
      else defaults[key] = "";
    }
    setFormData(defaults);
    setCommission("");
    setAddCommissionToCosts(false);
  }, [selected?.id]);

  // Auto-wylicz „KWOTA SŁOWNIE" gdy zmieni się KWOTA / KWOTA ŁĄCZNA
  useEffect(() => {
    if (!selected) return;
    const hasWords = selected.placeholders?.some(k => k.toUpperCase().includes("KWOTA SŁOWNIE"));
    if (!hasWords) return;
    const amt = parseFloat((formData["KWOTA ŁĄCZNA"] || formData["KWOTA"] || "").replace(",", "."));
    if (isFinite(amt) && amt > 0) {
      const wordsKey = selected.placeholders!.find(k => k.toUpperCase().includes("KWOTA SŁOWNIE"))!;
      setFormData(d => ({ ...d, [wordsKey]: amountToWordsPLN(amt) }));
    }
  }, [formData["KWOTA"], formData["KWOTA ŁĄCZNA"], selected?.id]);

  const handleGenerate = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      // Dolicz prowizję do KWOTA / KWOTA ŁĄCZNA jeśli zaznaczone
      const finalData = { ...formData };
      const comm = parseFloat(commission.replace(",", "."));
      if (addCommissionToCosts && isFinite(comm) && comm > 0) {
        for (const k of ["KWOTA", "KWOTA ŁĄCZNA"]) {
          if (k in finalData) {
            const base = parseFloat((finalData[k] || "0").replace(",", "."));
            if (isFinite(base)) finalData[k] = (base + comm).toFixed(2);
          }
        }
        // Zaktualizuj słownie
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
          commissionAmount: isFinite(comm) ? comm : null,
          commissionAddedToCosts: addCommissionToCosts,
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
          Pakiet B2B: 31 wzorów (umowy, windykacja miękka i sądowa, oświadczenia). Wybierz wzór, uzupełnij pola, pobierz DOCX.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Lewa: lista wzorów */}
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

        {/* Prawa: formularz */}
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
                          {selected.placeholders?.length ?? 0} {(selected.placeholders?.length ?? 0) === 1 ? "pole" : "pól"} do uzupełnienia
                        </span>
                      </div>
                    </div>
                    <Button onClick={handleGenerate} disabled={generating} size="lg">
                      {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Generuj DOCX
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {(!selected.placeholders || selected.placeholders.length === 0) ? (
                    <p className="text-sm text-muted-foreground">Ten wzór nie ma pól do uzupełnienia — można od razu pobrać.</p>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {selected.placeholders.map(key => {
                        const t = placeholderType(key);
                        const isFull = t === "textarea";
                        return (
                          <div key={key} className={isFull ? "sm:col-span-2" : ""}>
                            <Label className="text-xs text-muted-foreground">{key}</Label>
                            {isFull ? (
                              <Textarea
                                rows={3}
                                value={formData[key] ?? ""}
                                onChange={e => setFormData(d => ({ ...d, [key]: e.target.value }))}
                              />
                            ) : (
                              <Input
                                type={t === "amount" || t === "number" ? "text" : "text"}
                                inputMode={t === "amount" || t === "number" ? "decimal" : undefined}
                                placeholder={
                                  t === "date" ? "DD.MM.RRRR" :
                                  t === "amount" ? "np. 50000,00" :
                                  t === "amount-words" ? "wyliczy się z kwoty…" : ""
                                }
                                value={formData[key] ?? ""}
                                onChange={e => setFormData(d => ({ ...d, [key]: e.target.value }))}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Prowizja pośrednika */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Prowizja pośrednika</CardTitle>
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
                      <Label htmlFor="comm-add" className="text-sm">Dolicz do KWOTY / KWOTY ŁĄCZNEJ</Label>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Prowizja jest zapisywana razem z dokumentem; po zaznaczeniu „Dolicz" zostanie też powiększona kwota główna i jej zapis słowny przed generowaniem.
                  </p>
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
