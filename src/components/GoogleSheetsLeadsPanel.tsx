import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  syncGoogleSheet,
  listDriveSpreadsheets,
  getSpreadsheetMeta,
  previewSheetRange,
} from "@/lib/sheets.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Eye,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/labels";

type SheetCfg = {
  id: string;
  label: string;
  spreadsheetId: string;
  range: string;
  columnMap: {
    phone?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    source?: string;
  };
};

const COL_KEYS = ["phone", "first_name", "last_name", "email", "source"] as const;
const emptySheet = (): SheetCfg => ({
  id: crypto.randomUUID(),
  label: "",
  spreadsheetId: "",
  range: "Sheet1!A:Z",
  columnMap: {
    phone: "phone",
    first_name: "first_name",
    last_name: "last_name",
    email: "email",
    source: "source",
  },
});

export function GoogleSheetsLeadsPanel({ onSynced }: { onSynced?: () => void }) {
  const [integ, setInteg] = useState<any>(null);
  const [sheets, setSheets] = useState<SheetCfg[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SheetCfg | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [previews, setPreviews] = useState<
    Record<
      string,
      { loading: boolean; header: string[]; rows: any[][]; total: number; error?: string }
    >
  >({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const syncFn = useServerFn(syncGoogleSheet);
  const previewFn = useServerFn(previewSheetRange);

  const load = async () => {
    const { data } = await supabase
      .from("integration_settings")
      .select("*")
      .eq("integration_name", "google_sheets")
      .maybeSingle();
    setInteg(data);
    setSheets((data?.configuration as any)?.sheets ?? []);
  };
  useEffect(() => {
    void load();
  }, []);

  const persist = async (next: SheetCfg[]) => {
    const payload = {
      integration_name: "google_sheets",
      is_enabled: true,
      status: integ?.status ?? "wymaga_konfiguracji",
      configuration: { ...(integ?.configuration ?? {}), sheets: next },
    };
    const { error } = integ
      ? await supabase.from("integration_settings").update(payload).eq("id", integ.id)
      : await supabase.from("integration_settings").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Zapisano konfigurację arkusza");
    void load();
  };

  const saveSheet = async (s: SheetCfg) => {
    if (!s.label || !s.spreadsheetId) {
      toast.error("Etykieta i Spreadsheet ID są wymagane");
      return;
    }
    const next = sheets.some((x) => x.id === s.id)
      ? sheets.map((x) => (x.id === s.id ? s : x))
      : [...sheets, s];
    await persist(next);
    setEditing(null);
  };

  const removeSheet = async (id: string) => {
    if (!confirm("Usunąć ten arkusz z konfiguracji?")) return;
    await persist(sheets.filter((s) => s.id !== id));
  };

  const sync = async (id: string) => {
    setSyncingId(id);
    try {
      const res: any = await syncFn({ data: { sheetConfigId: id } });
      if (res?.ok) {
        toast.success(`Synchronizacja OK: ${res.imported} nowych, ${res.skipped} pominiętych`);
        onSynced?.();
      } else {
        toast.error(res?.error || "Błąd synchronizacji");
      }
      void load();
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setSyncingId(null);
    }
  };

  const toggleExpand = async (s: SheetCfg) => {
    const next = !expanded[s.id];
    setExpanded((p) => ({ ...p, [s.id]: next }));
    if (next && !previews[s.id]) {
      setPreviews((p) => ({ ...p, [s.id]: { loading: true, header: [], rows: [], total: 0 } }));
      try {
        const res: any = await previewFn({
          data: { spreadsheetId: s.spreadsheetId, range: s.range || "Sheet1!A:Z", limit: 20 },
        });
        setPreviews((p) => ({
          ...p,
          [s.id]: {
            loading: false,
            header: res.header || [],
            rows: res.rows || [],
            total: res.totalRows || 0,
            error: res.ok ? undefined : res.error,
          },
        }));
      } catch (e: any) {
        setPreviews((p) => ({
          ...p,
          [s.id]: {
            loading: false,
            header: [],
            rows: [],
            total: 0,
            error: String(e?.message || e),
          },
        }));
      }
    }
  };

  const statusColor =
    integ?.status === "polaczona"
      ? "default"
      : integ?.status === "blad"
        ? "destructive"
        : "secondary";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              Integracja Google Sheets
              <Badge variant={statusColor as any}>{integ?.status ?? "niepolaczona"}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Ostatnia synchronizacja: {integ?.last_sync_at ? formatDate(integ.last_sync_at) : "—"}
              {integ?.last_error && (
                <span className="text-destructive ml-2">Błąd: {integ.last_error}</span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              <FolderOpen className="mr-2 h-4 w-4" /> Wybierz z Dysku
            </Button>
            <Button size="sm" onClick={() => setEditing(emptySheet())}>
              <Plus className="mr-2 h-4 w-4" /> Dodaj ręcznie
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sheets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak skonfigurowanych arkuszy. Kliknij „Wybierz z Dysku", aby wskazać spreadsheet z
            Twojego Google Drive.
          </p>
        ) : (
          <div className="space-y-2">
            {sheets.map((s) => {
              const isOpen = !!expanded[s.id];
              const pv = previews[s.id];
              return (
                <div key={s.id} className="rounded-md border">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <button
                      onClick={() => void toggleExpand(s)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{s.label}</div>
                        <div className="text-xs text-muted-foreground truncate font-mono">
                          {s.spreadsheetId} · {s.range}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${s.spreadsheetId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={syncingId === s.id}
                        onClick={() => void sync(s.id)}
                      >
                        {syncingId === s.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" /> Synchronizuj
                          </>
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void removeSheet(s.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t bg-muted/30 p-3">
                      {pv?.loading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Wczytuję podgląd…
                        </div>
                      ) : pv?.error ? (
                        <div className="text-sm text-destructive">Błąd: {pv.error}</div>
                      ) : pv ? (
                        <>
                          <div className="text-xs text-muted-foreground mb-2">
                            Podgląd: {pv.rows.length} z {pv.total} wierszy danych
                          </div>
                          <div className="overflow-x-auto rounded border bg-background">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {pv.header.map((h, i) => (
                                    <TableHead key={i} className="text-xs">
                                      {String(h)}
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {pv.rows.length === 0 ? (
                                  <TableRow>
                                    <TableCell
                                      colSpan={Math.max(1, pv.header.length)}
                                      className="text-center text-muted-foreground text-sm py-4"
                                    >
                                      Brak danych
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  pv.rows.map((row, ri) => (
                                    <TableRow key={ri}>
                                      {pv.header.map((_, ci) => (
                                        <TableCell key={ci} className="text-xs">
                                          {String(row[ci] ?? "")}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <DrivePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(f) => {
          setPickerOpen(false);
          setEditing({ ...emptySheet(), label: f.name, spreadsheetId: f.id });
        }}
      />

      <SheetEditDialog
        sheet={editing}
        onClose={() => setEditing(null)}
        onSave={(s) => void saveSheet(s)}
      />
    </Card>
  );
}

function DrivePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (f: { id: string; name: string }) => void;
}) {
  const listFn = useServerFn(listDriveSpreadsheets);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await listFn({ data: { search: q || undefined } });
      if (res.ok) setFiles(res.files);
      else setError(res.error || "Błąd listowania");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (open) void load();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Arkusze na Twoim Google Drive</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="Szukaj po nazwie…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load(search)}
          />
          <Button onClick={() => void load(search)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Szukaj"}
          </Button>
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="max-h-96 overflow-y-auto space-y-1">
          {loading && files.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Wczytuję arkusze…
            </div>
          ) : files.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Brak arkuszy.</div>
          ) : (
            files.map((f) => (
              <button
                key={f.id}
                onClick={() => onPick({ id: f.id, name: f.name })}
                className="w-full text-left rounded border px-3 py-2 hover:bg-accent transition-colors"
              >
                <div className="font-medium truncate">{f.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {f.owners?.[0]?.emailAddress ?? ""} · zmodyfikowano{" "}
                  {f.modifiedTime ? formatDateTime(f.modifiedTime) : "—"}
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SheetEditDialog({
  sheet,
  onClose,
  onSave,
}: {
  sheet: SheetCfg | null;
  onClose: () => void;
  onSave: (s: SheetCfg) => void;
}) {
  const metaFn = useServerFn(getSpreadsheetMeta);
  const previewFn = useServerFn(previewSheetRange);
  const [draft, setDraft] = useState<SheetCfg | null>(sheet);
  const [tabs, setTabs] = useState<{ title: string }[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  useEffect(() => {
    setDraft(sheet);
    setTabs([]);
    setHeaders([]);
  }, [sheet?.id]);

  const loadMeta = async () => {
    if (!draft?.spreadsheetId) return;
    setLoadingMeta(true);
    try {
      const meta: any = await metaFn({ data: { spreadsheetId: draft.spreadsheetId } });
      if (meta.ok) {
        setTabs(meta.sheets.map((s: any) => ({ title: s.title })));
        const firstTab = meta.sheets[0]?.title;
        if (firstTab && (!draft.range || draft.range === "Sheet1!A:Z")) {
          setDraft({ ...draft, range: `${firstTab}!A:Z`, label: draft.label || meta.title });
        }
      } else toast.error(meta.error);
      const pv: any = await previewFn({
        data: { spreadsheetId: draft.spreadsheetId, range: draft.range || "Sheet1!A:Z", limit: 1 },
      });
      if (pv.ok) setHeaders((pv.header || []).map((h: any) => String(h)));
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setLoadingMeta(false);
    }
  };

  useEffect(() => {
    if (draft?.spreadsheetId)
      void loadMeta(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [draft?.spreadsheetId]);

  if (!draft) return null;
  const tabName = (draft.range || "").split("!")[0];

  return (
    <Dialog open={!!sheet} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{sheet?.label ? "Edytuj arkusz" : "Nowy arkusz"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Etykieta *</Label>
            <Input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </div>
          <div>
            <Label>Spreadsheet ID *</Label>
            <Input
              value={draft.spreadsheetId}
              onChange={(e) => setDraft({ ...draft, spreadsheetId: e.target.value })}
              placeholder="1AbC...XYZ"
            />
          </div>
          {tabs.length > 0 && (
            <div>
              <Label>Zakładka</Label>
              <Select
                value={tabName}
                onValueChange={(v) => setDraft({ ...draft, range: `${v}!A:Z` })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tabs.map((t) => (
                    <SelectItem key={t.title} value={t.title}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Zakres</Label>
            <Input
              value={draft.range}
              onChange={(e) => setDraft({ ...draft, range: e.target.value })}
              placeholder="Sheet1!A:Z"
            />
          </div>
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Mapowanie kolumn (nazwa nagłówka)</div>
              {loadingMeta && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {headers.length > 0 && (
              <div className="text-xs text-muted-foreground mb-2">
                Wykryte: {headers.join(", ")}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {COL_KEYS.map((k) => (
                <div key={k}>
                  <Label className="text-xs">{k}</Label>
                  {headers.length > 0 ? (
                    <Select
                      value={draft.columnMap[k] ?? ""}
                      onValueChange={(v) =>
                        setDraft({ ...draft, columnMap: { ...draft.columnMap, [k]: v } })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={draft.columnMap[k] ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          columnMap: { ...draft.columnMap, [k]: e.target.value },
                        })
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onSave(draft)}>Zapisz</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
