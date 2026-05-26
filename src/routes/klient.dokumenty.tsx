import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, ExternalLink, FileText, Image as ImageIcon, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/labels";

export const Route = createFileRoute("/klient/dokumenty")({
  component: KlientDokumenty,
});

const docTypeLabels: Record<string, string> = {
  dochod: "Dokumenty dochodowe",
  prawo_wlasnosci: "Prawa do nieruchomości",
  zdjecia_pomieszczen: "Zdjęcia pomieszczeń",
  zdjecia_bryly: "Zdjęcia bryły budynku",
  zdjecia_lokalu: "Zdjęcia lokalu",
  mpzp: "MPZP / warunki zabudowy",
  wypis_rejestru: "Wypis z rejestru gruntów",
  inne: "Inne dokumenty / zdjęcia",
  klient_upload: "Pozostałe",
};

const docTypeOptions = Object.entries(docTypeLabels);

function isImage(name: string) {
  return /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i.test(name);
}

function KlientDokumenty() {
  const { user } = useAuth();
  const [loanId, setLoanId] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<string>("inne");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!user) return;
    const { data: c } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
    if (!c) return;
    const { data: l } = await supabase.from("loan_applications").select("id").eq("client_id", c.id).order("created_at", { ascending: false }).maybeSingle();
    if (!l) return;
    setLoanId(l.id);
    const { data: ds } = await supabase.from("documents").select("*").eq("loan_application_id", l.id).order("created_at", { ascending: false });
    const list = ds ?? [];
    setDocs(list);
    // Sign URLs for images for thumbnails
    const imgs = list.filter((d: any) => d.file_path && isImage(d.file_name ?? ""));
    const next: Record<string, string> = {};
    await Promise.all(imgs.map(async (d: any) => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      if (data?.signedUrl) next[d.id] = data.signedUrl;
    }));
    setUrls(next);
  };
  useEffect(() => { void load(); }, [user]);

  const upload = async (file: File) => {
    if (!loanId || !user) { toast.error("Najpierw utwórz wniosek"); return; }
    setUploading(true);
    const path = `${user.id}/${loanId}/${Date.now()}-${file.name}`;
    const { error: ue } = await supabase.storage.from("documents").upload(path, file);
    if (ue) { toast.error(ue.message); setUploading(false); return; }
    await supabase.from("documents").insert({ loan_application_id: loanId, file_name: file.name, file_path: path, document_type: uploadType, uploaded_by: user.id });
    setUploading(false); toast.success("Dodano"); void load();
  };

  const openDoc = async (d: any) => {
    if (!d.file_path) return;
    const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const removeDoc = async (d: any) => {
    if (!confirm(`Usunąć "${d.file_name}"?`)) return;
    if (d.file_path) await supabase.storage.from("documents").remove([d.file_path]);
    await supabase.from("documents").delete().eq("id", d.id);
    toast.success("Usunięto");
    void load();
  };

  const startEdit = (d: any) => {
    setEditing(d.id);
    setEditName(d.file_name ?? "");
    setEditType(d.document_type ?? "inne");
  };

  const saveEdit = async (d: any) => {
    await supabase.from("documents").update({ file_name: editName, document_type: editType }).eq("id", d.id);
    setEditing(null);
    toast.success("Zapisano");
    void load();
  };

  // Group by type
  const groups: Record<string, any[]> = {};
  docs.forEach((d) => {
    const t = d.document_type ?? "inne";
    if (!groups[t]) groups[t] = [];
    groups[t].push(d);
  });

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dokumenty i zdjęcia</h1>
        <p className="text-sm text-muted-foreground mt-1">Wszystkie pliki załączone do wniosku. Możesz dodawać nowe, zmieniać kategorię, nazwę lub usuwać.</p>
      </div>
      {!loanId ? <p className="text-sm text-muted-foreground">Najpierw rozpocznij wniosek.</p> :
        <>
          <Card>
            <CardHeader><CardTitle>Dodaj plik</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[1fr_220px_auto]">
                <Input ref={fileRef} type="file" />
                <Select value={uploadType} onValueChange={setUploadType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {docTypeOptions.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button disabled={uploading} onClick={() => { const f = fileRef.current?.files?.[0]; if (f) void upload(f); if (fileRef.current) fileRef.current.value = ""; }}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Wyślij"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {docs.length === 0 ? (
            <Card><CardContent className="pt-6 text-sm text-muted-foreground">Brak załączników.</CardContent></Card>
          ) : (
            Object.entries(groups).map(([type, items]) => (
              <Card key={type}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {docTypeLabels[type] ?? type}
                    <Badge variant="secondary">{items.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {items.map((d) => {
                    const img = urls[d.id];
                    const isEdit = editing === d.id;
                    return (
                      <div key={d.id} className="flex items-center gap-3 border rounded-md px-3 py-2 text-sm">
                        <div className="h-12 w-12 shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden">
                          {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : isImage(d.file_name ?? "") ? <ImageIcon className="h-5 w-5 text-muted-foreground" /> : <FileText className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          {isEdit ? (
                            <div className="grid gap-2 md:grid-cols-[1fr_200px]">
                              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                              <Select value={editType} onValueChange={setEditType}>
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {docTypeOptions.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <>
                              <div className="font-medium truncate">{d.file_name}</div>
                              <div className="text-xs text-muted-foreground">{formatDate(d.created_at)}</div>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {isEdit ? (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => void saveEdit(d)}><Check className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => void openDoc(d)} title="Otwórz"><ExternalLink className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => startEdit(d)} title="Edytuj"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => void removeDoc(d)} title="Usuń"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))
          )}
        </>}
    </div>
  );
}
