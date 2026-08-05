import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  suggestPlaceholders,
  listGoogleDocs,
  importGoogleDoc,
  getConnectedGoogleAccount,
} from "@/lib/document-templates.functions";
import { getDocxTemplateDownloadUrl, uploadDocxTemplate } from "@/lib/document-generator.functions";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Plus,
  Sparkles,
  Printer,
  Trash2,
  Pencil,
  Loader2,
  Save,
  FileText,
  Upload,
  Search,
  ExternalLink,
  Download,
  FileUp,
} from "lucide-react";
import { formatDate } from "@/lib/labels";

export const Route = createFileRoute("/admin/dokumenty")({
  component: DokumentyPage,
});

type UseCase = "kreator_umow" | "kreator_compliance" | "kreator_pism_windykacyjnych";

const USE_CASE_OPTIONS: Array<{ value: UseCase; label: string }> = [
  { value: "kreator_umow", label: "Kreator umów" },
  { value: "kreator_compliance", label: "Kreator compliance" },
  { value: "kreator_pism_windykacyjnych", label: "Kreator pism windykacyjnych" },
];
const formatUseCase = (v?: string | null) =>
  USE_CASE_OPTIONS.find((o) => o.value === v)?.label ?? "—";

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  content_html: string;
  placeholders: string[];
  output_format: string;
  use_case: UseCase;
  template_file_path: string | null;
  created_at: string;
  updated_at: string;
};

function extractPlaceholders(html: string): string[] {
  const matches = html.match(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.replace(/[{}\s]/g, ""))));
}

function DokumentyPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("document_templates")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    setTemplates((data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  const newTemplate = (): Template => ({
    id: "",
    name: "",
    description: "",
    category: "",
    content_html: "<p>Treść szablonu… Użyj {{klient.imie}} aby wstawić zmienną.</p>",
    placeholders: [],
    output_format: "pdf",
    use_case: "kreator_umow",
    template_file_path: null,
    created_at: "",
    updated_at: "",
  });

  const remove = async (id: string) => {
    if (!confirm("Usunąć szablon?")) return;
    const { error } = await supabase.from("document_templates").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Usunięto");
      void load();
    }
  };

  const openWithContent = (name: string, html: string) => {
    setEditing({ ...newTemplate(), name, content_html: html });
  };

  const onFilePicked = async (file: File) => {
    if (!file) return;
    const name = file.name.replace(/\.[^.]+$/, "");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["txt", "html", "htm", "md"].includes(ext || "")) {
      toast.error("Obsługiwane formaty: .txt, .html, .md (dla .docx/.pdf użyj Google Docs)");
      return;
    }
    const text = await file.text();
    let html = text;
    if (ext === "txt" || ext === "md") {
      html = text
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
        .join("");
    }
    openWithContent(name, html);
    toast.success("Wczytano plik — uzupełnij dane i zapisz");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Dokumenty — szablony</h1>
          <p className="text-sm text-muted-foreground">
            Twórz szablony z placeholderami; AI pomoże wskazać miejsca do zamiany.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.html,.htm,.md"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFilePicked(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Wgraj plik
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileText className="mr-2 h-4 w-4" /> Importuj z Google Docs
          </Button>
          <Button onClick={() => setEditing(newTemplate())}>
            <Plus className="mr-2 h-4 w-4" /> Nowy szablon
          </Button>
        </div>
      </div>

      {importOpen && (
        <GoogleDocsImportDialog
          onClose={() => setImportOpen(false)}
          onImported={(name, html) => {
            setImportOpen(false);
            openWithContent(name, html);
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lista szablonów ({templates.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Ładowanie…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak szablonów. Dodaj pierwszy.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <Card key={t.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{t.name}</CardTitle>
                      <Badge variant="outline">{t.output_format.toUpperCase()}</Badge>
                    </div>
                    {t.category && <p className="text-xs text-muted-foreground">{t.category}</p>}
                    <Badge variant="secondary" className="mt-1 w-fit text-[10px]">
                      {formatUseCase(t.use_case)}
                    </Badge>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {t.description || "—"}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(t.placeholders ?? []).slice(0, 4).map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px] font-mono">
                          {p}
                        </Badge>
                      ))}
                      {(t.placeholders?.length ?? 0) > 4 && (
                        <Badge variant="secondary" className="text-[10px]">
                          +{t.placeholders.length - 4}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-auto pt-2">
                      Zmodyfikowano: {formatDate(t.updated_at)}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setEditing(t)}
                      >
                        <Pencil className="mr-2 h-3 w-3" />
                        Edytuj
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void remove(t.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <DocxTemplateActions template={t} onChange={load} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <TemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: Template;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [meta, setMeta] = useState({
    name: template.name,
    description: template.description ?? "",
    category: template.category ?? "",
    output_format: template.output_format,
    use_case: (template.use_case ?? "kreator_umow") as UseCase,
  });
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<{ original: string; placeholder: string; reason: string }>
  >([]);
  const suggestFn = useServerFn(suggestPlaceholders);

  const editor = useEditor({
    extensions: [StarterKit],
    content: template.content_html,
  });

  const html = editor?.getHTML() ?? template.content_html;
  const text = editor?.getText() ?? "";
  const placeholders = useMemo(() => extractPlaceholders(html), [html]);

  const save = async () => {
    if (!meta.name) {
      toast.error("Nazwa jest wymagana");
      return;
    }
    setSaving(true);
    const payload = {
      name: meta.name,
      description: meta.description || null,
      category: meta.category || null,
      output_format: meta.output_format,
      use_case: meta.use_case,
      content_html: editor?.getHTML() ?? template.content_html,
      placeholders: extractPlaceholders(editor?.getHTML() ?? template.content_html),
    };
    const { error } = template.id
      ? await supabase.from("document_templates").update(payload).eq("id", template.id)
      : await supabase.from("document_templates").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Zapisano");
      onSaved();
    }
  };

  const askAI = async () => {
    if (!editor) return;
    const content = editor.getText();
    if (content.length < 20) {
      toast.error("Wpisz najpierw treść szablonu (min. 20 znaków)");
      return;
    }
    setAiLoading(true);
    try {
      const res: any = await suggestFn({ data: { content } });
      if (!res?.ok) toast.error(res?.error || "AI niedostępne");
      else {
        setSuggestions(res.placeholders);
        if (res.placeholders.length === 0) toast.info("AI nie znalazło sugestii");
      }
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setAiLoading(false);
    }
  };

  const applySuggestion = (s: { original: string; placeholder: string }) => {
    if (!editor) return;
    const current = editor.getHTML();
    if (!current.includes(s.original)) {
      toast.error("Nie znaleziono oryginalnego fragmentu — pewnie został zmieniony");
      return;
    }
    editor.commands.setContent(current.split(s.original).join(s.placeholder));
    setSuggestions((prev) => prev.filter((x) => x !== s));
    toast.success("Wstawiono placeholder");
  };

  const print = () => {
    const w = window.open("", "_blank");
    if (!w || !editor) return;
    w.document.write(
      `<html><head><title>${meta.name}</title><style>body{font-family:Georgia,serif;max-width:780px;margin:40px auto;padding:0 20px;line-height:1.6;}h1,h2,h3{font-family:system-ui;}</style></head><body><h1>${meta.name}</h1>${editor.getHTML()}</body></html>`,
    );
    w.document.close();
    setTimeout(() => w.print(), 200);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{template.id ? "Edytuj szablon" : "Nowy szablon"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1fr_320px] overflow-y-auto px-1">
          <div className="space-y-3 min-w-0">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nazwa *</Label>
                <Input
                  value={meta.name}
                  onChange={(e) => setMeta({ ...meta, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Kategoria</Label>
                <Input
                  value={meta.category}
                  onChange={(e) => setMeta({ ...meta, category: e.target.value })}
                  placeholder="np. Umowy"
                />
              </div>
            </div>
            <div>
              <Label>Opis</Label>
              <Textarea
                rows={2}
                value={meta.description}
                onChange={(e) => setMeta({ ...meta, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Przeznaczenie szablonu *</Label>
                <Select
                  value={meta.use_case}
                  onValueChange={(v) => setMeta({ ...meta, use_case: v as UseCase })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USE_CASE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Decyduje, w którym kreatorze szablon będzie dostępny.
                </p>
              </div>
              <div>
                <Label>Format wyjściowy</Label>
                <Select
                  value={meta.output_format}
                  onValueChange={(v) => setMeta({ ...meta, output_format: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="docx">DOCX</SelectItem>
                    <SelectItem value="html">HTML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editor && (
              <div className="border rounded-md">
                <div className="flex flex-wrap gap-1 border-b p-2 bg-muted/40">
                  <Button
                    type="button"
                    size="sm"
                    variant={editor.isActive("bold") ? "default" : "ghost"}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={editor.isActive("italic") ? "default" : "ghost"}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                  >
                    <Italic className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={editor.isActive("heading", { level: 2 }) ? "default" : "ghost"}
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  >
                    <Heading2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={editor.isActive("bulletList") ? "default" : "ghost"}
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={editor.isActive("orderedList") ? "default" : "ghost"}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  >
                    <ListOrdered className="h-4 w-4" />
                  </Button>
                </div>
                <EditorContent
                  editor={editor}
                  className="prose prose-sm max-w-none p-4 min-h-[300px] focus:outline-none [&_*]:outline-none"
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Wykryte placeholdery ({placeholders.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {placeholders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Brak. Wpisz np. <code>{"{{klient.imie}}"}</code>
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {placeholders.map((p) => (
                      <Badge key={p} variant="secondary" className="font-mono text-[10px]">
                        {p}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> AI: sugestie
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={aiLoading}
                  onClick={() => void askAI()}
                >
                  {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Analizuj"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {suggestions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Kliknij „Analizuj", aby AI zaproponowało placeholdery.
                  </p>
                ) : (
                  suggestions.map((s, i) => (
                    <div key={i} className="border rounded p-2 space-y-1">
                      <div className="text-xs">
                        „<span className="italic">{s.original}</span>" →{" "}
                        <code className="text-primary">{s.placeholder}</code>
                      </div>
                      <div className="text-[10px] text-muted-foreground">{s.reason}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7"
                        onClick={() => applySuggestion(s)}
                      >
                        Wstaw
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter className="border-t pt-3">
          <Button variant="ghost" onClick={print}>
            <Printer className="mr-2 h-4 w-4" /> Podgląd / Druk
          </Button>
          <Button variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Zapisz szablon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoogleDocsImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (name: string, html: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "mine" | "shared" | "drives">("all");
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<
    Array<{
      id: string;
      name: string;
      modifiedTime: string;
      webViewLink?: string;
      owners?: Array<{ displayName?: string; emailAddress?: string }>;
      driveId?: string;
    }>
  >([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [account, setAccount] = useState<{
    displayName?: string;
    emailAddress?: string;
    photoLink?: string;
  } | null>(null);
  const listFn = useServerFn(listGoogleDocs);
  const importFn = useServerFn(importGoogleDoc);
  const accountFn = useServerFn(getConnectedGoogleAccount);

  const refresh = async (q?: string, s?: typeof scope) => {
    setLoading(true);
    try {
      const res: any = await listFn({ data: { search: q || undefined, scope: s ?? scope } });
      if (!res?.ok) toast.error(res?.error || "Nie udało się pobrać listy");
      else setFiles(res.files || []);
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    void (async () => {
      const r: any = await accountFn({});
      if (r?.ok) setAccount(r.user);
    })();
  }, []);

  const doImport = async (id: string, name: string) => {
    setImportingId(id);
    try {
      const res: any = await importFn({ data: { documentId: id } });
      if (!res?.ok) {
        toast.error(res?.error || "Import nieudany");
        return;
      }
      onImported(res.title || name, res.html);
      toast.success("Zaimportowano z Google Docs");
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setImportingId(null);
    }
  };

  const scopeTabs: Array<{ id: typeof scope; label: string }> = [
    { id: "all", label: "Wszystkie" },
    { id: "mine", label: "Moje" },
    { id: "shared", label: "Udostępnione mi" },
    { id: "drives", label: "Dyski współdzielone" },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Importuj szablon z Google Docs
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            {account?.photoLink && (
              <img src={account.photoLink} alt="" className="h-6 w-6 rounded-full" />
            )}
            <div className="min-w-0">
              <div className="font-medium truncate">{account?.displayName || "Konto Google"}</div>
              <div className="text-muted-foreground truncate">{account?.emailAddress || "—"}</div>
            </div>
          </div>
          <a
            href="/admin/integracje"
            className="shrink-0 underline text-muted-foreground hover:text-foreground"
          >
            Zmień konto
          </a>
        </div>

        <div className="flex flex-wrap gap-1">
          {scopeTabs.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={scope === t.id ? "default" : "outline"}
              onClick={() => {
                setScope(t.id);
                void refresh(search, t.id);
              }}
            >
              {t.label}
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Szukaj po nazwie…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void refresh(search);
              }}
            />
          </div>
          <Button variant="outline" onClick={() => void refresh(search)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Szukaj"}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto border rounded-md divide-y">
          {loading && files.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Ładowanie…
            </div>
          ) : files.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground space-y-2">
              <div>Brak dokumentów w tym zakresie.</div>
              <div className="text-xs">
                Jeśli plik jest w formacie .docx, otwórz go w Google Docs i zapisz jako Dokument
                Google, aby się tu pojawił.
              </div>
            </div>
          ) : (
            files.map((f) => (
              <div key={f.id} className="p-3 flex items-center gap-3 hover:bg-muted/40">
                <FileText className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{f.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {f.owners?.[0]?.displayName || (f.driveId ? "Dysk współdzielony" : "—")} ·{" "}
                    {formatDate(f.modifiedTime)}
                  </div>
                </div>
                {f.webViewLink && (
                  <a
                    href={f.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <Button
                  size="sm"
                  disabled={!!importingId}
                  onClick={() => void doImport(f.id, f.name)}
                >
                  {importingId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Importuj"}
                </Button>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocxTemplateActions({ template, onChange }: { template: Template; onChange: () => void }) {
  const [busy, setBusy] = React.useState<"dl" | "up" | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const _dl = useServerFn(getDocxTemplateDownloadUrl);
  const _up = useServerFn(uploadDocxTemplate);

  const download = async () => {
    setBusy("dl");
    try {
      const r = await _dl({ data: { templateId: template.id } });
      if (!r.url) {
        toast.error(r.reason ?? "Plik niedostępny");
        return;
      }
      window.open(r.url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd pobierania");
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    if (!/\.docx$/i.test(file.name)) {
      toast.error("Wybierz plik .docx");
      return;
    }
    setBusy("up");
    try {
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      await _up({ data: { templateId: template.id, fileName: file.name, base64 } });
      toast.success("Wgrano plik wzoru");
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd uploadu");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex gap-2 pt-1">
      <Button
        size="sm"
        variant="outline"
        className="flex-1"
        disabled={busy !== null}
        onClick={download}
      >
        {busy === "dl" ? (
          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
        ) : (
          <Download className="mr-2 h-3 w-3" />
        )}
        Pobierz .docx
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="flex-1"
        disabled={busy !== null}
        onClick={() => inputRef.current?.click()}
      >
        {busy === "up" ? (
          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
        ) : (
          <FileUp className="mr-2 h-3 w-3" />
        )}
        {template.template_file_path ? "Zamień" : "Wgraj"} .docx
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
    </div>
  );
}
