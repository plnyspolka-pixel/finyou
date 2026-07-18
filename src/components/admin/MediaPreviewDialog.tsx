import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CLIENT_FILES_LABEL } from "@/lib/storage-buckets";
import { signStoragePaths } from "@/lib/property-photos";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, Image as ImageIcon, ImageOff, Loader2, File as FileIcon } from "lucide-react";

type Doc = {
  id: string;
  file_name: string;
  file_path: string | null;
  file_url: string | null;
  document_type: string | null;
  created_at: string;
};

type Kind = "image" | "pdf" | "other";

type MediaItem = {
  key: string;
  name: string;
  /** null = plik jest w bazie, ale nie udało się go rozwiązać w Storage */
  url: string | null;
  kind: Kind;
  source: "photo" | "document";
  docType?: string | null;
};

const isExternalUrl = (s: string) => /^https?:\/\//i.test(s);

function inferKind(name: string): Kind {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (/\.(jpe?g|png|webp|gif|heic|bmp|tiff?|avif)$/i.test(n)) return "image";
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
  const [items, setItems] = useState<MediaItem[]>([]);
  const [active, setActive] = useState<MediaItem | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const { data: docRows } = await supabase
        .from("documents")
        .select("id,file_name,file_path,file_url,document_type,created_at")
        .eq("loan_application_id", loanApplicationId)
        .order("created_at", { ascending: false });
      const docs = (docRows ?? []) as Doc[];

      // Starsze rekordy mają w file_url ścieżkę Storage zamiast pełnego URL-a —
      // jako gotowy URL traktujemy go tylko, gdy zaczyna się od http(s).
      const docStoragePath = (d: Doc): string | null => {
        if (d.file_url && isExternalUrl(d.file_url)) return null;
        return d.file_path || d.file_url || null;
      };

      // Jedno zbiorcze podpisanie wszystkiego (zdjęcia + dokumenty) —
      // z fallbackiem na legacy buckety "documents"/"property-photos".
      const toSign = [
        ...photoPaths.filter((p) => !isExternalUrl(p)),
        ...docs.map(docStoragePath).filter((p): p is string => !!p),
      ];
      const urlByPath = await signStoragePaths(toSign, 60 * 60);

      const all: MediaItem[] = [];

      // Zdjęcia z properties.photos
      const photoSet = new Set(photoPaths);
      photoPaths.forEach((p, i) => {
        const name = p.split("/").pop() ?? `zdjęcie-${i + 1}`;
        all.push({
          key: `photo:${p}`,
          name,
          url: isExternalUrl(p) ? p : urlByPath.get(p) ?? null,
          kind: inferKind(name) === "other" ? "image" : inferKind(name),
          source: "photo",
        });
      });

      // Dokumenty (bez duplikatów zdjęć, które są już w properties.photos)
      for (const d of docs) {
        const path = docStoragePath(d);
        if (path && photoSet.has(path)) continue;
        const url = path ? urlByPath.get(path) ?? null : d.file_url;
        const name = d.file_name || path?.split("/").pop() || "dokument";
        all.push({
          key: `doc:${d.id}`,
          name,
          url,
          kind: inferKind(name),
          source: "document",
          docType: d.document_type,
        });
      }

      if (!cancelled) {
        setItems(all);
        setActive(all.find((it) => it.url) ?? all[0] ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, loanApplicationId, photoPaths.join("|")]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[95vw] max-h-[92vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-3 text-base">
            <span>{title ?? CLIENT_FILES_LABEL}</span>
            <Badge variant="secondary" className="font-normal">
              <ImageIcon className="h-3 w-3 mr-1" /> {items.length}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground p-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Ładowanie…
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Brak załączników.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] flex-1 min-h-0">
            {/* Thumbnails sidebar */}
            <aside className="border-r overflow-y-auto p-2 bg-muted/30">
              <div className="grid grid-cols-2 gap-2">
                {items.map((it) => {
                  const isActive = active?.key === it.key;
                  return (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() => setActive(it)}
                      className={`group relative aspect-square overflow-hidden rounded border bg-background text-left transition ${
                        isActive ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"
                      }`}
                      title={it.name}
                    >
                      {it.url && it.kind === "image" ? (
                        <img src={it.url} alt={it.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex flex-col items-center justify-center gap-1 p-2 bg-muted">
                          {!it.url ? (
                            <ImageOff className="h-8 w-8 text-muted-foreground/60" />
                          ) : it.kind === "pdf" ? (
                            <FileText className="h-8 w-8 text-red-500" />
                          ) : (
                            <FileIcon className="h-8 w-8 text-muted-foreground" />
                          )}
                          <span className="text-[9px] uppercase text-muted-foreground">{it.url ? it.kind : "brak pliku"}</span>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                        <div className="text-[9px] text-white truncate">{it.name}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Main viewer */}
            <main className="flex flex-col min-h-0 overflow-hidden">
              {active && (
                <>
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      {active.kind === "image" ? <ImageIcon className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                      <span className="text-sm font-medium truncate">{active.name}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">{active.kind}</Badge>
                      {active.docType && <Badge variant="outline" className="text-[10px]">{active.docType}</Badge>}
                    </div>
                    {active.url && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button asChild size="sm" variant="ghost">
                          <a href={active.url} target="_blank" rel="noreferrer" aria-label="Otwórz w nowej karcie">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <a href={active.url} download={active.name} aria-label="Pobierz">
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto bg-black/5">
                    {!active.url && (
                      <div className="p-8 text-sm text-muted-foreground text-center">
                        Nie udało się otworzyć pliku — brak obiektu w Storage.
                      </div>
                    )}
                    {active.url && active.kind === "image" && (
                      <img src={active.url} alt={active.name} className="max-h-full max-w-full w-auto mx-auto object-contain" />
                    )}
                    {active.url && active.kind === "pdf" && (
                      <iframe src={active.url} title={active.name} className="w-full h-full min-h-[70vh] bg-white" />
                    )}
                    {active.url && active.kind === "other" && (
                      <div className="p-8 text-sm text-muted-foreground text-center">
                        Format niepodglądowy — otwórz lub pobierz plik.
                      </div>
                    )}
                  </div>
                </>
              )}
            </main>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
