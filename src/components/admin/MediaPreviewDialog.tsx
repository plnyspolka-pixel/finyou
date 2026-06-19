import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, Image as ImageIcon, Loader2 } from "lucide-react";

type Doc = {
  id: string;
  file_name: string;
  file_path: string | null;
  file_url: string | null;
  document_type: string | null;
  created_at: string;
};

type PreviewItem = {
  key: string;
  name: string;
  url: string;
  kind: "image" | "pdf" | "other";
};

async function signOne(bucket: string, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

function inferKind(name: string): PreviewItem["kind"] {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (/\.(jpe?g|png|webp|gif|heic|bmp|tiff?)$/i.test(n)) return "image";
  return "other";
}

export function MediaPreviewDialog({
  open,
  onOpenChange,
  loanApplicationId,
  photoPaths,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loanApplicationId: string;
  photoPaths: string[];
  title?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<PreviewItem[]>([]);
  const [docs, setDocs] = useState<PreviewItem[]>([]);
  const [lightbox, setLightbox] = useState<PreviewItem | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Photos (property-photos bucket)
      const photoItems: PreviewItem[] = [];
      if (photoPaths.length > 0) {
        const { data } = await supabase.storage
          .from("property-photos")
          .createSignedUrls(photoPaths, 60 * 60);
        (data ?? []).forEach((d, i) => {
          if (d.signedUrl) {
            const name = photoPaths[i].split("/").pop() ?? `photo-${i}`;
            photoItems.push({ key: photoPaths[i], name, url: d.signedUrl, kind: "image" });
          }
        });
      }

      // Documents
      const { data: docRows } = await supabase
        .from("documents")
        .select("id,file_name,file_path,file_url,document_type,created_at")
        .eq("loan_application_id", loanApplicationId)
        .order("created_at", { ascending: false });

      const docItems: PreviewItem[] = [];
      for (const d of (docRows ?? []) as Doc[]) {
        let url = d.file_url ?? null;
        if (!url && d.file_path) url = await signOne("documents", d.file_path);
        if (!url) continue;
        docItems.push({
          key: d.id,
          name: d.file_name || d.file_path?.split("/").pop() || "dokument",
          url,
          kind: inferKind(d.file_name || d.file_path || ""),
        });
      }

      if (!cancelled) {
        setPhotos(photoItems);
        setDocs(docItems);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, loanApplicationId, photoPaths.join("|")]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title ?? "Podgląd dokumentów i zdjęć"}</DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Ładowanie…
            </div>
          )}

          {!loading && (
            <div className="space-y-6">
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon className="h-4 w-4" />
                  <h3 className="font-semibold">Zdjęcia nieruchomości</h3>
                  <Badge variant="secondary">{photos.length}</Badge>
                </div>
                {photos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Brak zdjęć.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {photos.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setLightbox(p)}
                        className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
                      >
                        <img
                          src={p.url}
                          alt={p.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-[10px] text-white truncate">
                          {p.name}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4" />
                  <h3 className="font-semibold">Dokumenty</h3>
                  <Badge variant="secondary">{docs.length}</Badge>
                </div>
                {docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Brak dokumentów.</p>
                ) : (
                  <div className="space-y-4">
                    {docs.map((d) => (
                      <div key={d.key} className="rounded-lg border overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/50">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="text-sm font-medium truncate">{d.name}</span>
                            <Badge variant="outline" className="text-[10px] uppercase">{d.kind}</Badge>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button asChild size="sm" variant="ghost">
                              <a href={d.url} target="_blank" rel="noreferrer" aria-label="Otwórz w nowej karcie">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                            <Button asChild size="sm" variant="ghost">
                              <a href={d.url} download={d.name} aria-label="Pobierz">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          </div>
                        </div>
                        {d.kind === "pdf" && (
                          <iframe
                            src={d.url}
                            title={d.name}
                            className="w-full h-[70vh] bg-white"
                          />
                        )}
                        {d.kind === "image" && (
                          <button
                            type="button"
                            onClick={() => setLightbox(d)}
                            className="block w-full bg-muted"
                          >
                            <img src={d.url} alt={d.name} className="max-h-[60vh] w-full object-contain" loading="lazy" />
                          </button>
                        )}
                        {d.kind === "other" && (
                          <div className="p-4 text-sm text-muted-foreground">
                            Format niepodglądowy — otwórz lub pobierz plik.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox for images */}
      <Dialog open={!!lightbox} onOpenChange={(v) => !v && setLightbox(null)}>
        <DialogContent className="max-w-[95vw] p-2 bg-black/95 border-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{lightbox?.name ?? "Zdjęcie"}</DialogTitle>
          </DialogHeader>
          {lightbox && (
            <img src={lightbox.url} alt={lightbox.name} className="max-h-[88vh] w-auto mx-auto object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
