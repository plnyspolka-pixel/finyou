import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { syncGoogleSheet } from "@/lib/sheets.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/labels";

type SheetCfg = {
  id: string;
  label: string;
  spreadsheetId: string;
  range: string;
  columnMap: { phone?: string; first_name?: string; last_name?: string; email?: string; source?: string };
};

const emptySheet = (): SheetCfg => ({
  id: crypto.randomUUID(),
  label: "",
  spreadsheetId: "",
  range: "Sheet1!A:Z",
  columnMap: { phone: "phone", first_name: "first_name", last_name: "last_name", email: "email", source: "source" },
});

export function GoogleSheetsLeadsPanel({ onSynced }: { onSynced?: () => void }) {
  const [integ, setInteg] = useState<any>(null);
  const [sheets, setSheets] = useState<SheetCfg[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SheetCfg | null>(null);
  const syncFn = useServerFn(syncGoogleSheet);

  const load = async () => {
    const { data } = await supabase
      .from("integration_settings")
      .select("*")
      .eq("integration_name", "google_sheets")
      .maybeSingle();
    setInteg(data);
    setSheets((data?.configuration as any)?.sheets ?? []);
  };
  useEffect(() => { void load(); }, []);

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
    if (error) { toast.error(error.message); return; }
    toast.success("Zapisano konfigurację arkusza");
    void load();
  };

  const saveSheet = async (s: SheetCfg) => {
    if (!s.label || !s.spreadsheetId) { toast.error("Etykieta i Spreadsheet ID są wymagane"); return; }
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

  const statusColor = integ?.status === "polaczona" ? "default" : integ?.status === "blad" ? "destructive" : "secondary";

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
              Zaciąganie leadów z arkuszy. Ostatnia synchronizacja: {integ?.last_sync_at ? formatDate(integ.last_sync_at) : "—"}
              {integ?.last_error && <span className="text-destructive ml-2">Błąd: {integ.last_error}</span>}
            </p>
          </div>
          <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setEditing(emptySheet())}>
                <Plus className="mr-2 h-4 w-4" /> Dodaj arkusz
              </Button>
            </DialogTrigger>
            {editing && (
              <DialogContent className="max-w-xl">
                <DialogHeader><DialogTitle>{sheets.some((s) => s.id === editing.id) ? "Edytuj arkusz" : "Nowy arkusz"}</DialogTitle></DialogHeader>
                <div className="grid gap-3">
                  <div><Label>Etykieta *</Label><Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} /></div>
                  <div><Label>Spreadsheet ID *</Label><Input value={editing.spreadsheetId} onChange={(e) => setEditing({ ...editing, spreadsheetId: e.target.value })} placeholder="1AbC...XYZ" /></div>
                  <div><Label>Zakres</Label><Input value={editing.range} onChange={(e) => setEditing({ ...editing, range: e.target.value })} placeholder="Sheet1!A:Z" /></div>
                  <div className="border-t pt-3">
                    <div className="text-sm font-medium mb-2">Mapowanie kolumn (nazwa nagłówka w arkuszu)</div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["phone", "first_name", "last_name", "email", "source"] as const).map((k) => (
                        <div key={k}>
                          <Label className="text-xs">{k}</Label>
                          <Input value={editing.columnMap[k] ?? ""} onChange={(e) => setEditing({ ...editing, columnMap: { ...editing.columnMap, [k]: e.target.value } })} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter><Button onClick={() => void saveSheet(editing)}>Zapisz</Button></DialogFooter>
              </DialogContent>
            )}
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {sheets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak skonfigurowanych arkuszy. Dodaj pierwszy aby uruchomić synchronizację.</p>
        ) : (
          <div className="space-y-2">
            {sheets.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.label}</div>
                  <div className="text-xs text-muted-foreground truncate font-mono">{s.spreadsheetId} · {s.range}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="outline" disabled={syncingId === s.id} onClick={() => void sync(s.id)}>
                    {syncingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="mr-2 h-4 w-4" /> Synchronizuj</>}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => void removeSheet(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
