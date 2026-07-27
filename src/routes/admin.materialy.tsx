import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Upload, ImageIcon, Video as VideoIcon, Download } from "lucide-react";

export const Route = createFileRoute("/admin/materialy")({
  component: MarketingMaterialsPage,
});

type Audience = "klient" | "inwestor" | "posrednik";
type MediaType = "image" | "video";

type Material = {
  id: string;
  title: string;
  description: string | null;
  audience: Audience;
  media_type: MediaType;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "klient", label: "Klient" },
  { value: "inwestor", label: "Inwestor" },
  { value: "posrednik", label: "Pośrednik" },
];

const BUCKET = "marketing-materials";

function formatSize(b: number | null) {
  if (!b) return "";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function MarketingMaterialsPage() {
  const [items, setItems] = useState<Material[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<Audience>("klient");

  // upload form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<Audience>("klient");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("marketing_materials")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Nie udało się pobrać materiałów");
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Material[];
    setItems(list);
    // signed urls (1h)
    const signed: Record<string, string> = {};
    await Promise.all(
      list.map(async (m) => {
        const { data: s } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(m.storage_path, 3600);
        if (s?.signedUrl) signed[m.id] = s.signedUrl;
      }),
    );
    setUrls(signed);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      toast.error("Wybierz przynajmniej jeden plik");
      return;
    }
    setUploading(true);
    let ok = 0;
    let fail = 0;
    try {
      const { data: userData } = await supabase.auth.getUser();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadProgress(`${i + 1}/${files.length} — ${f.name}`);
        try {
          const mediaType: MediaType = f.type.startsWith("video/") ? "video" : "image";
          const ext = f.name.split(".").pop() || "bin";
          const path = `${audience}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, {
            contentType: f.type,
            upsert: false,
          });
          if (upErr) throw upErr;
          const baseTitle = title.trim() || f.name.replace(/\.[^.]+$/, "");
          const finalTitle =
            files.length > 1 && title.trim() ? `${baseTitle} (${i + 1})` : baseTitle;
          const { error: insErr } = await supabase.from("marketing_materials").insert({
            title: finalTitle,
            description: description.trim() || null,
            audience,
            media_type: mediaType,
            storage_path: path,
            mime_type: f.type,
            file_size: f.size,
            uploaded_by: userData.user?.id ?? null,
          });
          if (insErr) throw insErr;
          ok++;
        } catch (err: any) {
          console.error("upload failed", f.name, err);
          fail++;
        }
      }
      if (ok) toast.success(`Wgrano ${ok} plik(ów)${fail ? `, ${fail} błędów` : ""}`);
      if (!ok && fail) toast.error(`Błąd uploadu (${fail})`);
      setTitle("");
      setDescription("");
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  };

  const handleDelete = async (m: Material) => {
    if (!confirm(`Usunąć "${m.title}"?`)) return;
    const { error: stErr } = await supabase.storage.from(BUCKET).remove([m.storage_path]);
    if (stErr) {
      toast.error("Nie udało się usunąć pliku");
      return;
    }
    const { error } = await supabase.from("marketing_materials").delete().eq("id", m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Usunięto");
    await load();
  };

  const filtered = items.filter((i) => i.audience === tab);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Materiały marketingowe</h1>
        <p className="text-muted-foreground text-sm">
          Zdjęcia i filmy podzielone na kategorie: klient, inwestor, pośrednik.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Dodaj materiał
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tytuł (opcjonalnie — przy multi-upload bierze nazwę pliku)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Kategoria</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Opis (opcjonalnie)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Pliki (możesz wybrać wiele — zdjęcia i filmy)</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              {files.length > 0 && (
                <p className="text-xs text-muted-foreground">Wybrano {files.length} plik(ów)</p>
              )}
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <Button type="submit" disabled={uploading || files.length === 0}>
                {uploading
                  ? `Wgrywam... ${uploadProgress}`
                  : `Dodaj ${files.length || ""} materiał(ów)`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Audience)}>
        <TabsList>
          {AUDIENCES.map((a) => {
            const count = items.filter((i) => i.audience === a.value).length;
            return (
              <TabsTrigger key={a.value} value={a.value}>
                {a.label}{" "}
                <Badge variant="secondary" className="ml-2">
                  {count}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
        {AUDIENCES.map((a) => (
          <TabsContent key={a.value} value={a.value} className="mt-4">
            {loading ? (
              <p className="text-muted-foreground">Ładowanie...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground">Brak materiałów w tej kategorii.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((m) => {
                  const url = urls[m.id];
                  return (
                    <Card key={m.id} className="overflow-hidden">
                      <div className="aspect-video bg-black flex items-center justify-center overflow-hidden">
                        {!url ? (
                          <div className="text-muted-foreground">...</div>
                        ) : m.media_type === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt={m.title} className="w-full h-full object-contain" />
                        ) : (
                          <video
                            src={url}
                            controls
                            preload="none"
                            playsInline
                            className="w-full h-full object-contain bg-black"
                          />
                        )}
                      </div>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold truncate">{m.title}</h3>
                            {m.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {m.description}
                              </p>
                            )}
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            {m.media_type === "image" ? (
                              <ImageIcon className="h-3 w-3 mr-1" />
                            ) : (
                              <VideoIcon className="h-3 w-3 mr-1" />
                            )}
                            {formatSize(m.file_size)}
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          {url && (
                            <Button asChild size="sm" variant="outline" className="flex-1">
                              <a href={url} target="_blank" rel="noreferrer" download>
                                <Download className="h-4 w-4 mr-1" /> Pobierz
                              </a>
                            </Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(m)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
