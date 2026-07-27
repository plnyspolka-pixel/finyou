import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listGoogleAdDrafts,
  saveGoogleAdDraft,
  getGoogleAdDraft,
  deleteGoogleAdDraft,
  exportGoogleAdCsv,
} from "@/lib/google-ads.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Plus, Pencil, Trash2, Download, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/admin/google-ads/kreator")({
  component: GoogleAdsPage,
});

function GoogleAdsPage() {
  const fetchAll = useServerFn(listGoogleAdDrafts);
  const del = useServerFn(deleteGoogleAdDraft);
  const exportCsv = useServerFn(exportGoogleAdCsv);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["g-drafts"], queryFn: () => fetchAll() });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const onExport = async (id: string) => {
    try {
      const r = await exportCsv({ data: { id } });
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Pobrano CSV — zaimportuj w Google Ads Editor");
      qc.invalidateQueries({ queryKey: ["g-drafts"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6" />
            Kreator Google Ads
          </h1>
          <p className="text-sm text-muted-foreground">
            Twórz kampanie Google Ads i eksportuj do Google Ads Editor.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingId(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nowa kampania
        </Button>
      </div>

      <Card className="border-amber-500/50 bg-amber-500/5">
        <CardContent className="flex gap-3 pt-6">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <strong>Publikacja przez API wymaga Google Ads Developer Token</strong> (proces
            zatwierdzania ~2-4 tygodnie + konto MCC). Tymczasem: stwórz tu kampanię, wyeksportuj do{" "}
            <strong>CSV w formacie Google Ads Editor</strong> i zaimportuj jednym kliknięciem w
            aplikacji Google Ads Editor.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kampanie</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.drafts.length ? (
            <div className="text-sm text-muted-foreground">Brak kampanii.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Budżet</TableHead>
                  <TableHead>Słowa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.drafts.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{d.campaign_type}</Badge>
                    </TableCell>
                    <TableCell>{Number(d.daily_budget_pln).toFixed(2)} PLN</TableCell>
                    <TableCell className="text-xs">
                      {(d.keywords ?? []).length} kw / {(d.headlines ?? []).length} nagł.
                    </TableCell>
                    <TableCell>
                      <Badge variant={d.status === "eksportowana" ? "default" : "secondary"}>
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(d.id);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" onClick={() => onExport(d.id)}>
                        <Download className="h-3 w-3 mr-1" />
                        CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (confirm("Usunąć?")) {
                            await del({ data: { id: d.id } });
                            qc.invalidateQueries({ queryKey: ["g-drafts"] });
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {open && (
        <GoogleDialog
          open={open}
          onOpenChange={setOpen}
          editingId={editingId}
          onSaved={() => qc.invalidateQueries({ queryKey: ["g-drafts"] })}
        />
      )}
    </div>
  );
}

function GoogleDialog({
  open,
  onOpenChange,
  editingId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingId: string | null;
  onSaved: () => void;
}) {
  const save = useServerFn(saveGoogleAdDraft);
  const getOne = useServerFn(getGoogleAdDraft);
  const [form, setForm] = useState<any>({
    name: "",
    campaign_type: "SEARCH",
    daily_budget_pln: 50,
    keywords: [],
    negative_keywords: [],
    headlines: ["", "", ""],
    descriptions: ["", ""],
    final_url: "https://financeyou.pl",
    display_path1: "",
    display_path2: "",
    target_locations: ["Polska"],
    target_languages: ["pl"],
    notes: "",
  });

  useEffect(() => {
    if (editingId)
      getOne({ data: { id: editingId } }).then((r) => {
        if (r.draft) setForm(r.draft);
      });
  }, [editingId, getOne]);

  const onSave = async () => {
    try {
      const payload: any = {
        ...form,
        keywords: (typeof form.keywords === "string" ? form.keywords.split("\n") : form.keywords)
          .map((s: string) => s.trim())
          .filter(Boolean),
        negative_keywords: (typeof form.negative_keywords === "string"
          ? form.negative_keywords.split("\n")
          : form.negative_keywords
        )
          .map((s: string) => s.trim())
          .filter(Boolean),
        headlines: form.headlines.map((s: string) => s.trim()).filter(Boolean),
        descriptions: form.descriptions.map((s: string) => s.trim()).filter(Boolean),
        target_locations:
          typeof form.target_locations === "string"
            ? form.target_locations
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean)
            : form.target_locations,
        target_languages:
          typeof form.target_languages === "string"
            ? form.target_languages
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean)
            : form.target_languages,
      };
      if (editingId) payload.id = editingId;
      await save({ data: payload });
      toast.success("Zapisano");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const setHeadline = (i: number, v: string) => {
    const a = [...form.headlines];
    a[i] = v;
    setForm({ ...form, headlines: a });
  };
  const setDescription = (i: number, v: string) => {
    const a = [...form.descriptions];
    a[i] = v;
    setForm({ ...form, descriptions: a });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kreator kampanii Google Ads</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <Label>Nazwa kampanii</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Typ</Label>
                <Select
                  value={form.campaign_type}
                  onValueChange={(v) => setForm({ ...form, campaign_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEARCH">Wyszukiwarka</SelectItem>
                    <SelectItem value="DISPLAY">Display</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Budżet dzienny (PLN)</Label>
                <Input
                  type="number"
                  value={form.daily_budget_pln}
                  onChange={(e) => setForm({ ...form, daily_budget_pln: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>URL docelowy</Label>
              <Input
                value={form.final_url}
                onChange={(e) => setForm({ ...form, final_url: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Ścieżka 1 (max 15 zn.)</Label>
                <Input
                  maxLength={15}
                  value={form.display_path1 ?? ""}
                  onChange={(e) => setForm({ ...form, display_path1: e.target.value })}
                />
              </div>
              <div>
                <Label>Ścieżka 2 (max 15 zn.)</Label>
                <Input
                  maxLength={15}
                  value={form.display_path2 ?? ""}
                  onChange={(e) => setForm({ ...form, display_path2: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Słowa kluczowe (po jednym w linii, max 200)</Label>
              <Textarea
                rows={6}
                value={Array.isArray(form.keywords) ? form.keywords.join("\n") : form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                placeholder="pożyczka pod zastaw nieruchomości&#10;pożyczka hipoteczna"
              />
            </div>
            <div>
              <Label>Wykluczające słowa kluczowe</Label>
              <Textarea
                rows={3}
                value={
                  Array.isArray(form.negative_keywords)
                    ? form.negative_keywords.join("\n")
                    : form.negative_keywords
                }
                onChange={(e) => setForm({ ...form, negative_keywords: e.target.value })}
                placeholder="darmowa&#10;za darmo"
              />
            </div>
            <div>
              <Label>Lokalizacje (oddziel przecinkiem)</Label>
              <Input
                value={
                  Array.isArray(form.target_locations)
                    ? form.target_locations.join(", ")
                    : form.target_locations
                }
                onChange={(e) => setForm({ ...form, target_locations: e.target.value })}
              />
            </div>
            <div>
              <Label>Notatki</Label>
              <Textarea
                rows={2}
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <Label>Nagłówki (3-15, max 30 zn. każdy)</Label>
              <div className="space-y-1">
                {form.headlines.map((h: string, i: number) => (
                  <div key={i} className="flex gap-1 items-center">
                    <Input
                      maxLength={30}
                      value={h}
                      onChange={(e) => setHeadline(i, e.target.value)}
                      placeholder={`Nagłówek ${i + 1}`}
                    />
                    <span className="text-xs text-muted-foreground w-8">{h.length}/30</span>
                  </div>
                ))}
                {form.headlines.length < 15 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setForm({ ...form, headlines: [...form.headlines, ""] })}
                  >
                    + Nagłówek
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label>Opisy (2-4, max 90 zn. każdy)</Label>
              <div className="space-y-1">
                {form.descriptions.map((d: string, i: number) => (
                  <div key={i} className="flex gap-1 items-center">
                    <Textarea
                      rows={2}
                      maxLength={90}
                      value={d}
                      onChange={(e) => setDescription(i, e.target.value)}
                      placeholder={`Opis ${i + 1}`}
                    />
                    <span className="text-xs text-muted-foreground w-10">{d.length}/90</span>
                  </div>
                ))}
                {form.descriptions.length < 4 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setForm({ ...form, descriptions: [...form.descriptions, ""] })}
                  >
                    + Opis
                  </Button>
                )}
              </div>
            </div>
            <div className="border rounded p-3 bg-background">
              <div className="text-xs text-muted-foreground mb-1">Podgląd SERP</div>
              <div className="text-xs text-green-700">
                Reklama · {form.final_url.replace(/^https?:\/\//, "")}
                {form.display_path1 ? "/" + form.display_path1 : ""}
                {form.display_path2 ? "/" + form.display_path2 : ""}
              </div>
              <div className="text-blue-700 text-base font-medium">
                {form.headlines.filter(Boolean).slice(0, 3).join(" | ") || "Twoje nagłówki"}
              </div>
              <div className="text-sm">
                {form.descriptions.filter(Boolean)[0] || "Twój opis reklamy pojawi się tutaj."}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={onSave}>Zapisz</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
