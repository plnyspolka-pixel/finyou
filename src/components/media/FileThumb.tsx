import { useEffect, useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File as FileIcon,
  Music,
  Video,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { backfillPdfThumbnail } from "@/lib/uploads/unified-upload";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { toDisplayableImageUrl } from "@/lib/heic-preview";

const IMG_EXT = /\.(jpe?g|png|gif|webp|heic|bmp|avif)$/i;
const PDF_EXT = /\.pdf$/i;
const DOC_EXT = /\.(docx?|odt|rtf)$/i;
const XLS_EXT = /\.(xlsx?|ods|csv)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|opus)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|mkv)$/i;

// Buckety w ktorych szukamy sciezek (wszystkie pliki klienta w pliki-klienta, legacy w innych)
const CANDIDATE_BUCKETS = [
  CLIENT_FILES_BUCKET,
  "documents",
  "property-photos",
  "marketing-materials",
  "avatars",
  "ad-creatives",
] as const;

export interface FileThumbProps {
  path: string;
  name?: string | null;
  mimeType?: string | null;
  thumbnailPath?: string | null;
  size?: number | null;
  onClick?: () => void;
  className?: string;
  aspect?: "square" | "video" | "portrait";
  showName?: boolean;
}

async function signPath(path: string): Promise<string | null> {
  for (const b of CANDIDATE_BUCKETS) {
    const { data } = await supabase.storage.from(b).createSignedUrl(path, 3600);
    if (data?.signedUrl) return data.signedUrl;
  }
  return null;
}

function isImage(name: string, mime?: string | null) {
  return (mime && mime.startsWith("image/")) || IMG_EXT.test(name);
}
function isPdf(name: string, mime?: string | null) {
  return mime === "application/pdf" || PDF_EXT.test(name);
}
function isDoc(name: string) {
  return DOC_EXT.test(name);
}
function isXls(name: string) {
  return XLS_EXT.test(name);
}
function isAudio(name: string, mime?: string | null) {
  return (mime && mime.startsWith("audio/")) || AUDIO_EXT.test(name);
}
function isVideo(name: string, mime?: string | null) {
  return (mime && mime.startsWith("video/")) || VIDEO_EXT.test(name);
}

function iconFor(name: string, mime?: string | null) {
  if (isImage(name, mime)) return FileImage;
  if (isPdf(name, mime)) return FileText;
  if (isDoc(name)) return FileText;
  if (isXls(name)) return FileSpreadsheet;
  if (isAudio(name, mime)) return Music;
  if (isVideo(name, mime)) return Video;
  return FileIcon;
}

function badgeFor(name: string, mime?: string | null): string {
  if (isPdf(name, mime)) return "PDF";
  if (isDoc(name)) return "DOC";
  if (isXls(name)) return "XLS";
  if (isAudio(name, mime)) return "AUDIO";
  if (isVideo(name, mime)) return "VIDEO";
  const dot = name.lastIndexOf(".");
  if (dot > 0)
    return name
      .slice(dot + 1)
      .toUpperCase()
      .slice(0, 4);
  return "FILE";
}

export function FileThumb({
  path,
  name,
  mimeType,
  thumbnailPath,
  size,
  onClick,
  className,
  aspect = "video",
  showName = false,
}: FileThumbProps) {
  const displayName = name ?? path.split("/").pop() ?? "plik";
  // Nazwa do detekcji typu pliku — file_name z bazy bywa bez rozszerzenia
  // (załączniki z Messengera: "file-123"), podczas gdy ścieżka w Storage
  // kończy się ".jpg". Bez tego obrazek dostawał szarą ikonę zamiast miniatury.
  const typeName = /\.[a-z0-9]{2,5}$/i.test(displayName) ? displayName : path;
  const [url, setUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  // np. HEIC z iPhone'a — przeglądarka nie wyrenderuje, pokazujemy ikonę
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      // 1. Jesli mamy explicit thumbnail path — uzyj
      if (thumbnailPath) {
        const u = await signPath(thumbnailPath);
        if (!cancelled && u) {
          setThumbUrl(u);
          setBusy(false);
          return;
        }
      }
      // 2. Dla obrazow podpisz oryginal (HEIC konwertujemy w locie do JPEG)
      if (isImage(typeName, mimeType)) {
        const signed = await signPath(path);
        const u = signed ? await toDisplayableImageUrl(signed, typeName) : null;
        if (!cancelled) {
          setUrl(u);
          setBusy(false);
        }
        return;
      }
      // 3. Dla PDF sproboj konwencji `<path>.thumb.png`
      if (isPdf(typeName, mimeType)) {
        const u = await signPath(`${path}.thumb.png`);
        if (!cancelled && u) {
          setThumbUrl(u);
          setBusy(false);
          return;
        }
        // 4. Backfill w tle
        const newThumb = await backfillPdfThumbnail(path);
        if (newThumb) {
          const su = await signPath(newThumb);
          if (!cancelled && su) {
            setThumbUrl(su);
            setBusy(false);
            return;
          }
        }
      }
      if (!cancelled) setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [path, thumbnailPath, mimeType, typeName]);

  const aspectClass =
    aspect === "square" ? "aspect-square" : aspect === "portrait" ? "aspect-[3/4]" : "aspect-video";

  const Icon = iconFor(typeName, mimeType);
  const badge = badgeFor(typeName, mimeType);
  const src = imgFailed ? null : (thumbUrl ?? url);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative block overflow-hidden rounded-lg border border-white/10 bg-slate-900/40 shadow-sm transition hover:border-white/30 hover:shadow-md",
        aspectClass,
        onClick ? "cursor-pointer" : "cursor-default",
        className,
      )}
      title={displayName}
    >
      {busy ? (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-white/60" />
        </div>
      ) : src ? (
        <>
          <img
            src={src}
            alt={displayName}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
          {!isImage(typeName, mimeType) && (
            <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {badge}
            </span>
          )}
        </>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
          <Icon className="h-8 w-8 text-white/70" />
          <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {badge}
          </span>
        </div>
      )}
      {showName && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-[11px] text-white">
          {displayName}
          {size ? ` · ${Math.round(size / 1024)} KB` : ""}
        </span>
      )}
    </button>
  );
}

export default FileThumb;
