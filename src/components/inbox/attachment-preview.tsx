import { useState } from "react";
import {
  Paperclip,
  FileText,
  Image as ImageIcon,
  Download,
  Eye,
  File as FileIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Att = {
  url?: string;
  public_url?: string;
  signed_url?: string;
  path?: string;
  name?: string;
  filename?: string;
  content_type?: string;
  mime_type?: string;
  type?: string;
  size?: number;
};

function pick(a: Att, i: number) {
  const url = a?.url ?? a?.public_url ?? a?.signed_url ?? a?.path ?? "";
  const name = a?.name ?? a?.filename ?? `załącznik-${i + 1}`;
  const mime = (a?.content_type ?? a?.mime_type ?? a?.type ?? "").toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const isImage =
    mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(ext);
  const isPdf = mime === "application/pdf" || ext === "pdf";
  const isText =
    mime.startsWith("text/") || ["txt", "md", "csv", "json", "xml", "html"].includes(ext);
  return { url, name, mime, ext, isImage, isPdf, isText };
}

function fmtSize(n?: number) {
  if (!n || !Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentPreview({ attachments }: { attachments: Att[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  if (!attachments?.length) return null;

  const active = openIdx != null ? pick(attachments[openIdx], openIdx) : null;

  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Załączniki ({attachments.length})
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {attachments.map((a, i) => {
          const { url, name, isImage, isPdf, isText, ext } = pick(a, i);
          const size = fmtSize(a?.size);
          return (
            <div
              key={i}
              className="group relative rounded-lg border bg-card overflow-hidden flex flex-col hover:shadow-md transition-shadow"
            >
              <button
                type="button"
                onClick={() => url && setOpenIdx(i)}
                className="relative aspect-video w-full bg-muted/40 flex items-center justify-center overflow-hidden"
                disabled={!url}
              >
                {isImage && url ? (
                  <img src={url} alt={name} loading="lazy" className="h-full w-full object-cover" />
                ) : isPdf ? (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <FileText className="h-8 w-8" />
                    <span className="text-[10px] font-medium uppercase">PDF</span>
                  </div>
                ) : isText ? (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <FileText className="h-8 w-8" />
                    <span className="text-[10px] font-medium uppercase">{ext || "TXT"}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <FileIcon className="h-8 w-8" />
                    <span className="text-[10px] font-medium uppercase">{ext || "PLIK"}</span>
                  </div>
                )}
                {url && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="h-6 w-6 text-white" />
                  </div>
                )}
              </button>
              <div className="p-2 flex items-center gap-2 min-w-0">
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate" title={name}>
                    {name}
                  </div>
                  {size && <div className="text-[10px] text-muted-foreground">{size}</div>}
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    download={name}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    title="Pobierz"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={openIdx != null} onOpenChange={(o) => !o && setOpenIdx(null)}>
        <DialogContent className="max-w-5xl w-[95vw] p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-sm font-medium truncate flex items-center gap-2">
              {active?.isImage ? (
                <ImageIcon className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span className="truncate">{active?.name}</span>
              {active?.url && (
                <Button asChild size="sm" variant="outline" className="ml-auto">
                  <a href={active.url} target="_blank" rel="noreferrer" download={active.name}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Pobierz
                  </a>
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4">
            {active?.url ? (
              active.isImage ? (
                <img
                  src={active.url}
                  alt={active.name}
                  className="max-h-[75vh] w-full object-contain rounded"
                />
              ) : active.isPdf ? (
                <iframe
                  src={active.url}
                  title={active.name}
                  className="w-full h-[75vh] rounded border"
                />
              ) : (
                <iframe
                  src={active.url}
                  title={active.name}
                  className="w-full h-[75vh] rounded border bg-white"
                />
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
