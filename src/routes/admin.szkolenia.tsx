import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/admin/szkolenia")({
  component: SzkoleniaAdmin,
});

function SzkoleniaAdmin() {
  const [videos, setVideos] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("training_videos").select("*").order("sort_order").order("created_at",{ascending:false});
    setVideos(data ?? []);
  };
  useEffect(() => { void load(); }, []);

  const handleSave = async () => {
    if (!title) return toast.error("Tytuł wymagany");
    setUploading(true);
    try {
      let filePath: string | null = null;
      if (file) {
        const path = `videos/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g,"_")}`;
        const { error: upErr } = await supabase.storage.from("training-videos").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        filePath = path;
      }
      const { error } = await supabase.from("training_videos").insert({
        title, description: description || null,
        file_path: filePath, external_url: externalUrl || null,
        is_published: true,
      });
      if (error) throw error;
      toast.success("Dodano materiał");
      setTitle(""); setDescription(""); setExternalUrl(""); setFile(null);
      void load();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setUploading(false); }
  };

  const remove = async (id: string, path: string | null) => {
    if (!confirm("Usunąć materiał?")) return;
    if (path) await supabase.storage.from("training-videos").remove([path]);
    await supabase.from("training_videos").delete().eq("id", id);
    void load();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Akademia inwestora — zarządzanie</h1>
      <Card>
        <CardHeader><CardTitle>Dodaj nowy materiał</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Tytuł" value={title} onChange={(e)=>setTitle(e.target.value)} />
          <Textarea placeholder="Opis (opcjonalnie)" value={description} onChange={(e)=>setDescription(e.target.value)} />
          <Input placeholder="Link YouTube / Vimeo (alternatywa do pliku)" value={externalUrl} onChange={(e)=>setExternalUrl(e.target.value)} />
          <div>
            <label className="text-sm text-muted-foreground">Plik wideo (MP4) — opcjonalnie</label>
            <Input type="file" accept="video/*" onChange={(e)=>setFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button onClick={handleSave} disabled={uploading}>
            <Plus className="mr-2 h-4 w-4"/>{uploading ? "Wgrywanie…" : "Dodaj materiał"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Materiały ({videos.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {videos.map((v) => (
            <div key={v.id} className="flex items-start justify-between gap-3 border rounded-md p-3">
              <div className="flex-1">
                <div className="font-medium">{v.title}</div>
                {v.description && <div className="text-sm text-muted-foreground">{v.description}</div>}
                <div className="flex gap-2 mt-1">
                  {v.file_path && <Badge variant="secondary">Plik</Badge>}
                  {v.external_url && <Badge variant="secondary">Link</Badge>}
                  <Badge variant={v.is_published ? "default" : "outline"}>{v.is_published ? "Publiczny" : "Ukryty"}</Badge>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={()=>void remove(v.id, v.file_path)}>
                <Trash2 className="h-4 w-4"/>
              </Button>
            </div>
          ))}
          {videos.length === 0 && <div className="text-sm text-muted-foreground">Brak materiałów.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
